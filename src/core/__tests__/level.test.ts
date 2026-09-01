import { describe, expect, it } from "vitest";

import {
  DIFFICULTY,
  bulletLifespan,
  defaultStart,
  expandScript,
  generateLevel,
  replay,
} from "@/core/level";
import { gridPoint, validatePath } from "@/core/solver";
import type { Emit, Vec2, WorldConfig } from "@/core/types";
import { dist } from "@/core/vec";
import { WORLD, insideWorld } from "@/core/world";

function testCfg(over: Partial<WorldConfig> = {}): WorldConfig {
  const c: WorldConfig = { ...WORLD, gridN: 21, maxSpeed: 0.075, ticks: 60, ...over };
  expect((1 / (c.gridN - 1)) * Math.SQRT2).toBeLessThanOrEqual(c.maxSpeed);
  return c;
}

describe("T-020(F-05): パターンの展開", () => {
  const c = testCfg();

  it("line: 等間隔に並び、全弾が同じ速度を持つ", () => {
    const e: Emit = {
      t: 10,
      pattern: { kind: "line", y: 1.0, x0: 0.2, x1: 0.8, count: 4, speed: 0.02, angle: -Math.PI / 2 },
    };
    const bs = expandScript({ emits: [e] }, c);
    expect(bs).toHaveLength(4);
    expect(bs.map((b) => b.origin.x)).toEqual([0.2, 0.4, 0.6000000000000001, 0.8]);
    for (const b of bs) {
      expect(b.origin.y).toBe(1.0);
      expect(b.t0).toBe(10);
      // 角度 -π/2 は真下。速度は (0, -0.02)
      expect(b.velocity.x).toBeCloseTo(0, 15);
      expect(b.velocity.y).toBeCloseTo(-0.02, 15);
    }
  });

  it("line: count=1 は x0 に 1 発だけ(ゼロ除算にならない)", () => {
    const bs = expandScript(
      { emits: [{ t: 0, pattern: { kind: "line", y: 1, x0: 0.3, x1: 0.9, count: 1, speed: 0.02, angle: -Math.PI / 2 } }] },
      c,
    );
    expect(bs).toHaveLength(1);
    expect(bs[0].origin.x).toBe(0.3);
  });

  it("ring: 全周に等角で並び、速さがすべて等しい", () => {
    const bs = expandScript(
      { emits: [{ t: 5, pattern: { kind: "ring", origin: { x: 0.5, y: 0.5 }, count: 8, phase: 0, speed: 0.03 } }] },
      c,
    );
    expect(bs).toHaveLength(8);
    for (const b of bs) {
      expect(b.origin).toEqual({ x: 0.5, y: 0.5 });
      expect(Math.hypot(b.velocity.x, b.velocity.y)).toBeCloseTo(0.03, 15);
    }
    // 隣り合う弾の角度差は 2π/8。最初の弾は phase=0 なので +x 向き。
    expect(bs[0].velocity.x).toBeCloseTo(0.03, 15);
    expect(bs[0].velocity.y).toBeCloseTo(0, 15);
    expect(bs[2].velocity.x).toBeCloseTo(0, 15);
    expect(bs[2].velocity.y).toBeCloseTo(0.03, 15);
  });

  it("fan: 中心角のまわりに spread の幅で開く", () => {
    const bs = expandScript(
      {
        emits: [
          {
            t: 0,
            pattern: {
              kind: "fan",
              origin: { x: 0.5, y: 1 },
              count: 3,
              angle: -Math.PI / 2,
              spread: Math.PI / 2,
              speed: 0.02,
            },
          },
        ],
      },
      c,
    );
    expect(bs).toHaveLength(3);
    const angles = bs.map((b) => Math.atan2(b.velocity.y, b.velocity.x));
    expect(angles[0]).toBeCloseTo(-Math.PI / 2 - Math.PI / 4, 12);
    expect(angles[1]).toBeCloseTo(-Math.PI / 2, 12);
    expect(angles[2]).toBeCloseTo(-Math.PI / 2 + Math.PI / 4, 12);
  });

  it("sweep: 発射 tick がずれ、角度が端から端へ回る", () => {
    const bs = expandScript(
      {
        emits: [
          {
            t: 4,
            pattern: {
              kind: "sweep",
              origin: { x: 0, y: 1 },
              count: 5,
              interval: 3,
              angleFrom: -Math.PI / 2,
              angleTo: 0,
              speed: 0.02,
            },
          },
        ],
      },
      c,
    );
    expect(bs).toHaveLength(5);
    expect(bs.map((b) => b.t0)).toEqual([4, 7, 10, 13, 16]);
    const angles = bs.map((b) => Math.atan2(b.velocity.y, b.velocity.x));
    expect(angles[0]).toBeCloseTo(-Math.PI / 2, 12);
    expect(angles[4]).toBeCloseTo(0, 12);
  });
});

describe("T-022(F-05a): 弾の寿命は世界の大きさから導く", () => {
  it("寿命ぶん進んだ弾は、どこから出発しても世界の外に居る", () => {
    // 世界の直径は √2。凸集合の中の線分は直径より長くなれないので、
    // √2 を超えて直進した点は必ず外に出ている。
    for (const speed of [0.005, 0.02, 0.05]) {
      const life = bulletLifespan(speed);
      expect(life * speed).toBeGreaterThanOrEqual(Math.SQRT2);
      // 最も長く世界に留まる出発点・向き(対角線)で確かめる
      const p = { x: 0, y: 0 };
      const k = life;
      const q: Vec2 = {
        x: p.x + (speed * k) / Math.SQRT2,
        y: p.y + (speed * k) / Math.SQRT2,
      };
      expect(insideWorld(q)).toBe(false);
    }
  });
});

describe("T-021(F-05, F-03): スクリプトは実行中に変化しない", () => {
  const c = testCfg();
  const script = {
    emits: [
      { t: 0, pattern: { kind: "ring", origin: { x: 0.5, y: 0.5 }, count: 6, phase: 0.3, speed: 0.02 } },
      { t: 7, pattern: { kind: "line", y: 1, x0: 0, x1: 1, count: 5, speed: 0.03, angle: -Math.PI / 2 } },
    ] as Emit[],
  };

  it("同じスクリプトを二度展開すると同一の弾集合になる", () => {
    expect(expandScript(script, c)).toEqual(expandScript(script, c));
  });

  it("弾は自機に依存しない —— 展開に自機の情報が要らない", () => {
    // 型の上で自機を渡せないことが open-loop(F-03)の担保である。
    // ここでは同じ tick を二度評価しても弾集合が変わらないことを見る。
    const bs = expandScript(script, c);
    const at = (t: number) => bs.filter((b) => t >= b.t0 && t < b.t1).length;
    expect(at(10)).toBe(at(10));
    expect(at(0)).toBe(6);
  });
});

describe("T-040(F-06, F-08, F-13): 生成器", () => {
  const c = testCfg({ ticks: 60 });

  it("面が返り、証明経路が不変量を満たす", () => {
    const lv = generateLevel(DIFFICULTY.hard, 1234, c, 40).level;
    expect(lv).not.toBeNull();
    expect(lv!.path).toHaveLength(c.ticks + 1);
    expect(lv!.path[0]).toEqual(defaultStart(c));
    const v = validatePath(lv!.path, lv!.bullets, c);
    expect(v.ok).toBe(true);
  });

  it("同一シードは同一の面(スクリプト・弾・経路すべて)", () => {
    const a = generateLevel(DIFFICULTY.hard, 99, c, 40);
    const b = generateLevel(DIFFICULTY.hard, 99, c, 40);
    expect(b).toEqual(a);
  });

  it("別シードは別の面(生成が種に依っていることの確認)", () => {
    const a = generateLevel(DIFFICULTY.hard, 99, c, 40).level;
    const b = generateLevel(DIFFICULTY.hard, 100, c, 40).level;
    expect(b!.script).not.toEqual(a!.script);
  });
});

describe("T-041(F-06, N-02): 試行上限", () => {
  it("試行 0 なら明示的に失敗を返す", () => {
    const c = testCfg();
    expect(generateLevel(DIFFICULTY.normal, 1, c, 0).level).toBeNull();
  });
});

describe("T-042(F-09, HC-065): 再生検証", () => {
  const c = testCfg({ ticks: 60 });

  it("証明経路を運動モデルで実行すると、生存し、点列まで一致する", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const lv = generateLevel(DIFFICULTY.hard, seed, c, 60).level;
      expect(lv).not.toBeNull();
      const r = replay(lv!.path, lv!.bullets, c);
      expect(r.survived).toBe(true);
      // 結論(生存)だけでなく経路も比べる。格子上の構成と運動モデルの実行が
      // 同じ点列に着くことが、証明が実行可能であることの確認になる。
      expect(r.positions).toHaveLength(lv!.path.length);
      for (let t = 0; t < r.positions.length; t++) {
        expect(dist(r.positions[t], lv!.path[t])).toBeLessThan(1e-12);
      }
    }
  });
});

describe("T-043(F-06a, F-09): 陽性対照 — 再生器は本当に被弾を見ている", () => {
  const c = testCfg({ ticks: 60 });

  it("開始点に留まる経路は必ず被弾する(非自明性ゲートが保証する前提)", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const lv = generateLevel(DIFFICULTY.hard, seed, c, 60).level;
      const still = new Array(c.ticks + 1).fill(defaultStart(c));
      const r = replay(still, lv!.bullets, c);
      // これが survived=true になるなら、その面は「じっとしていれば抜けられる」
      // 面か、再生器が被弾を見ていないかのどちらかである。
      expect(r.survived).toBe(false);
      expect(r.hitAtTick).not.toBeNull();
    }
  });

  it("非自明性は生成器のゲートであって偶然ではない", () => {
    // 上のケースが緑なのは、ゲートが弾いているからか、たまたま全部が
    // 非自明だったからか —— **生成器自身が数えた棄却の内訳**で区別する。
    // trivial が常に 0 なら、このゲートは掛かっていないのと同じである(HC-079)。
    // 難度は normal を使う。easy は**この試験設定でだけ**厳しすぎて
    // (面が 60 tick と短く、弾が開始点まで届かないので大半が自明)
    // 12 種のうち 5 種が 60 試行を使い切る。本番設定では easy も 5/5 で通る
    // (実測 2026-09-02: 平均 2.4 試行)。
    let trivial = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const g = generateLevel(DIFFICULTY.normal, seed, c, 60);
      expect(g.level).not.toBeNull();
      trivial += g.rejections.trivial;
    }
    expect(trivial).toBeGreaterThan(0);
  });
});

describe("T-044(F-08): 生成器が「解けない面」を弾く経路を実際に通る", () => {
  // 実測(2026-09-02)では、易・並・難のどの難度でも `解けないので棄却` は
  // **0 件**だった。ソルバー単体が不可能面を弾くことは T-031/T-032 が示すが、
  // それだけでは「生成器がその経路を通る」ことの実証にならない ——
  // 目玉が緑のまま素通りしていないかを、極端な難度で確かめる。
  const c = testCfg({ ticks: 60 });

  it("極端に濃い難度では、解けないという理由の棄却が実際に起きる", () => {
    const brutal = { emits: 40, countMin: 20, countMax: 30, speedMin: 0.02, speedMax: 0.05 };
    let unsolvable = 0;
    let produced = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const g = generateLevel(brutal, seed, c, 25);
      if (g.level) produced++;
      unsolvable += g.rejections.unsolvable;
    }
    // ここが 0 なら、生成器は「解けない面を捨てる」経路を一度も通っていない
    expect(unsolvable).toBeGreaterThan(0);
    // 対照の前提: 濃すぎて何も作れない設定ではない(全滅なら上の主張は空になる)
    expect(produced).toBeGreaterThan(0);
  });
});
