import { describe, expect, it } from "vitest";

import { minApproachToSegments } from "@/core/collide";
import { DIFFICULTY, defaultStart, expandScript, generateLevel } from "@/core/level";
import { measureLevel, safeAreaSeries } from "@/core/measure";
import { bulletSegmentsAt } from "@/core/motion";
import { gridPoint } from "@/core/solver";
import type { Emit, WorldConfig } from "@/core/types";
import { WORLD } from "@/core/world";

function testCfg(over: Partial<WorldConfig> = {}): WorldConfig {
  const c: WorldConfig = { ...WORLD, gridN: 21, maxSpeed: 0.075, ticks: 60, ...over };
  expect((1 / (c.gridN - 1)) * Math.SQRT2).toBeLessThanOrEqual(c.maxSpeed);
  return c;
}

describe("T-050(F-10): 立てる面積の測り方", () => {
  const c = testCfg({ ticks: 40 });

  /** 枝刈りなしの素朴な数え方(照合の基準)。 */
  function naiveSeries(bullets: Parameters<typeof safeAreaSeries>[0], cfg: WorldConfig) {
    const hit = cfg.shipRadius + cfg.bulletRadius;
    const out: number[] = [];
    for (let t = 0; t < cfg.ticks; t++) {
      const segs = bulletSegmentsAt(bullets, t);
      let safe = 0;
      for (let j = 0; j < cfg.gridN; j++)
        for (let i = 0; i < cfg.gridN; i++) {
          const p = gridPoint(i, j, cfg);
          if (minApproachToSegments(p, p, segs) >= hit) safe++;
        }
      out.push(safe / (cfg.gridN * cfg.gridN));
    }
    return out;
  }

  const emits: Emit[] = [
    { t: 0, pattern: { kind: "line", y: -0.05, x0: 0, x1: 1, count: 12, speed: 0.02, angle: Math.PI / 2 } },
    { t: 8, pattern: { kind: "ring", origin: { x: 0.4, y: 0.3 }, count: 10, phase: 0.2, speed: 0.018 } },
    { t: 16, pattern: { kind: "fan", origin: { x: 0.7, y: -0.05 }, count: 9, angle: Math.PI / 2, spread: 1.2, speed: 0.022 } },
  ];
  const bullets = expandScript({ emits }, c);

  it("枝刈り版と素朴版が完全に一致する(二実装照合)", () => {
    const fast = safeAreaSeries(bullets, c);
    const naive = naiveSeries(bullets, c);
    expect(fast).toHaveLength(c.ticks);
    for (let t = 0; t < c.ticks; t++) expect(fast[t]).toBeCloseTo(naive[t], 12);
  });

  it("対照の前提: 系列は一定でない(全 tick 同じ値なら照合は無情報)", () => {
    const naive = naiveSeries(bullets, c);
    expect(new Set(naive).size).toBeGreaterThan(3);
    // 弾が届いていない tick は 1.0 になる(それ自体は正常)。
    // 対照として要るのは「危険が実際に生じる tick が在る」ことのほう。
    expect(Math.min(...naive)).toBeLessThan(1);
  });

  it("弾を増やすと立てる面積は減る(向きが正しい)", () => {
    const dense = expandScript(
      {
        emits: [
          ...emits,
          { t: 4, pattern: { kind: "line", y: -0.05, x0: 0, x1: 1, count: 16, speed: 0.02, angle: Math.PI / 2 } },
          { t: 20, pattern: { kind: "ring", origin: { x: 0.5, y: 0.6 }, count: 14, phase: 0, speed: 0.02 } },
        ],
      },
      c,
    );
    expect(dense.length).toBeGreaterThan(bullets.length);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(safeAreaSeries(dense, c))).toBeLessThan(mean(safeAreaSeries(bullets, c)));
  });
});

describe("T-050b(F-10): 捨てた二つの指標が、なぜ使えないのか", () => {
  // SPEC の当初案(余白・隘路の最小)は、どちらも**構造上その値にしかならない**。
  // 捨てた主張を引用として残し、実装が今もそう振る舞うことを検査で固定する。
  const c = testCfg({ ticks: 60 });

  it("余白の最小はクリアランスに張り付く —— ソルバーがそこで打ち切るから", () => {
    const g = generateLevel(DIFFICULTY.hard, 5, c, 60);
    const lv = g.level!;
    const m = measureLevel(lv.bullets, lv.path, defaultStart(c), c);
    // 下限は構造から言える: 経路は必ずクリアランス以上を保っている
    expect(m.margin).toBeGreaterThanOrEqual(c.clearance - 1e-12);
    // そして実際、その下限の近くに居る(難度を刻む量にはならない)
    expect(m.margin).toBeLessThan(c.clearance * 3);
  });

  it("隘路の最小は 0 ではない —— F-06a は「各 tick に安全な点が無い」とは言っていない", () => {
    const g = generateLevel(DIFFICULTY.hard, 5, c, 60);
    const lv = g.level!;
    const m = measureLevel(lv.bullets, lv.path, defaultStart(c), c);

    // 当初「F-06a により恒等的に 0 になる」と構造から断定したが、**誤りだった**。
    // F-06a が要求するのは「**全 tick を通して**生き延びる点が無い」ことである。
    // 各 tick を見れば安全な点は多数あり、死ぬ点が tick ごとに入れ替わるだけでよい。
    expect(m.safeAreaMin).toBeGreaterThan(0);

    // 本番設定での実測(2026-09-02・各難度 40 種): 隘路の最小は
    // 易 0.800–0.890 / 並 0.770–0.845 / 難 0.690–0.805 で、
    // 中央値の順序は正しいが**重なりが 0.035–0.045 あり難度を分けない**。
    // だから F-10 の指標には採らなかった(採ったのは同じ系列の平均)。
    expect(m.safeAreaMin).toBeLessThan(m.safeAreaMean);
  });

  it("到達可能の最小も、素直に取ると開始点の 1 マスになる", () => {
    const g = generateLevel(DIFFICULTY.hard, 5, c, 60);
    const lv = g.level!;
    const m = measureLevel(lv.bullets, lv.path, defaultStart(c), c);
    const cells = c.gridN * c.gridN;
    // t=0 の到達集合は開始点だけ。面の性質ではなく初期条件を測ってしまう
    expect(m.reachMin).toBeCloseTo(1 / cells, 12);
    // 助走を除いた版はそれより大きい(面の性質を測れている)
    expect(m.reachMinWarm).toBeGreaterThan(m.reachMin);
  });
});
