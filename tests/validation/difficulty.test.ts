import { beforeAll, describe, expect, it } from "vitest";

import { DIFFICULTY, type Difficulty, defaultStart, generateLevel, replay } from "@/core/level";
import { safeAreaSeries } from "@/core/measure";
import { validatePath } from "@/core/solver";
import { WORLD } from "@/core/world";

/**
 * T-051(F-08 / F-10 / N-04): 生成実績と難度の帯。
 *
 * 本番設定で 1 面あたり約 1 秒かかるので、ここで回すのは**各難度 20 種**である。
 * 帯そのものの較正は**各難度 60 種**で測った(2026-09-02)。
 * 数を絞っていることは SPEC にも書いてある —— 黙って削らない。
 */
const SEEDS = 20;

/** 並と難を分ける敷居。実測 2026-09-02: 難の最大 0.9068 / 並の最小 0.9173 の中点。 */
const HARD_LINE = 0.912;

interface Sample {
  readonly area: number[];
  readonly attempts: number[];
}

function run(d: Difficulty): Sample {
  const start = defaultStart(WORLD);
  const area: number[] = [];
  const attempts: number[] = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const g = generateLevel(d, seed, WORLD, 30);
    attempts.push(g.attempts);
    expect(g.level, `seed ${seed} で面が作れなかった`).not.toBeNull();
    const lv = g.level!;

    // 出荷保証: 証明経路が不変量を満たし、エンジンで再生しても生存する
    expect(validatePath(lv.path, lv.bullets, WORLD).ok).toBe(true);
    const r = replay(lv.path, lv.bullets, WORLD);
    expect(r.survived).toBe(true);

    const s = safeAreaSeries(lv.bullets, WORLD);
    area.push(s.reduce((a, b) => a + b, 0) / s.length);
  }
  return { area, attempts };
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

describe("T-051(F-08, F-10, N-04): 生成実績と難度の帯", () => {
  // 生成は describe の本体でなく beforeAll で回す。collect 中に assert が落ちると
  // 「テストが失敗した」ではなく「スイートを収集できなかった」として報告され、
  // 何が起きたのかが読めなくなる(loop_001 以来、赤の見分けで何度か迷った)。
  let easy!: Sample;
  let normal!: Sample;
  let hard!: Sample;

  beforeAll(() => {
    easy = run(DIFFICULTY.easy);
    normal = run(DIFFICULTY.normal);
    hard = run(DIFFICULTY.hard);
  }, 2_400_000);

  it("全数が試行上限内に生成でき、全数が再生検証を通る", () => {
    // 上の run() の中で assert 済み。ここでは標本が空でないことを固定する。
    expect(easy.area).toHaveLength(SEEDS);
    expect(normal.area).toHaveLength(SEEDS);
    expect(hard.area).toHaveLength(SEEDS);
    for (const s of [easy, normal, hard]) {
      expect(Math.max(...s.attempts)).toBeLessThanOrEqual(30);
    }
  });

  it("立てる面積の中央値が 易 > 並 > 難 の順に並ぶ", () => {
    const m = (s: Sample) => pct(s.area, 0.5);
    expect(m(easy)).toBeGreaterThan(m(normal));
    expect(m(normal)).toBeGreaterThan(m(hard));
  });

  it("並と難は個々の面でも分かれる(実測で隙間 0.0105)", () => {
    // ここだけは 1 面ごとに判定できる。境界は分布の隙間の中点に置いた。
    expect(Math.max(...hard.area)).toBeLessThan(HARD_LINE);
    expect(Math.min(...normal.area)).toBeGreaterThan(HARD_LINE);
    expect(Math.min(...easy.area)).toBeGreaterThan(HARD_LINE);
  });

  it("易と並は分布としてしか分かれない —— p10 と p90 で言う", () => {
    // n=60 の実測で重なり幅 0.0020。**個々の面では分離しない。**
    // n=25 のときは分離して見えたが、それは小標本の産物だった(HC-124)。
    expect(pct(easy.area, 0.1)).toBeGreaterThan(pct(normal.area, 0.9));
    expect(pct(normal.area, 0.1)).toBeGreaterThan(pct(hard.area, 0.9));
  });

  it("対照の前提: 三つの標本は実際に違う値の集まりである", () => {
    // 同じ分布を三度測っているだけなら、上の順序は何も言っていない。
    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    for (const s of [easy, normal, hard]) expect(spread(s.area)).toBeGreaterThan(0.002);
    expect(pct(easy.area, 0.5) - pct(hard.area, 0.5)).toBeGreaterThan(0.02);
  });
});
