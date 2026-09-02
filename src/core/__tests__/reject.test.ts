import { describe, expect, it } from "vitest";

import { DIFFICULTY, type Difficulty, generateLevel } from "@/core/level";
import { WORLD } from "@/core/world";

/**
 * T-045(F-08): **出荷する難度でも**「解けないので棄却」の経路を通る。
 *
 * T-044 は極端に濃い難度で経路の存在を示すが、それは「出荷する面でも通るか」を
 * 言わない。ここは本番の `DIFFICULTY` と本番の `WORLD` で、実際に弾かれる種を名指しする。
 *
 * **試行上限は必ず 1 にする。**上限を上げると最初の成功で止まるので、
 * `rejections.unsolvable` は「解けない率」ではなく「最初の成功までに外した回数」になる。
 * 採用率が 96〜98% あるため、その読み方だとほぼ常に 0 が返り、
 * **機構が発火していないように見える**(loop_005 / loop_008 で実際にそう報告した)。
 *
 * 実測(2026-09-02・本番設定・試行上限 1):
 *
 * | 難度 | 標本 | 解けずに棄却 | 率 |
 * |---|---|---|---|
 * | 難 | 120 種 | 20 / 68 / 101 / 114 | 3.3% |
 * | 並 | 200 種 | 199 | 0.5% |
 * | 易 | 200 種 | なし | 0% |
 *
 * 種を名指ししているので、`randomScript` を変えるとこのテストは落ちる。
 * **それが正しい** —— 生成の中身が変わったら、率を測り直すべきである。
 */
const CASES: [string, Difficulty, number][] = [
  ["難", DIFFICULTY.hard, 20],
  ["難", DIFFICULTY.hard, 68],
  ["難", DIFFICULTY.hard, 114],
  ["並", DIFFICULTY.normal, 199],
];

describe("T-045(F-08): 出荷する難度でも解けない面は弾かれる", () => {
  it.each(CASES)("%s の種 %i は「解けない」として弾かれる", (_label, d, seed) => {
    const g = generateLevel(d, seed, WORLD, 1);
    expect(g.level).toBeNull();
    expect(g.rejections.unsolvable).toBe(1);
    // 自明で弾かれたのではない(棄却の理由を取り違えない)
    expect(g.rejections.trivial).toBe(0);
  });

  it("対照: 隣の種は採用される —— その難度が丸ごと解けないのではない", () => {
    const g = generateLevel(DIFFICULTY.hard, 21, WORLD, 1);
    expect(g.level).not.toBeNull();
    expect(g.rejections.unsolvable).toBe(0);
  });

  it("対照: 易では 200 種で一度も起きない —— 難度によって率が違う", () => {
    // 全数を回すと遅いので、易で弾かれない種を数点だけ確かめる。
    // 「どの難度でも起きる」なら、上の名指しは難度の性質を示していない。
    for (const seed of [20, 68, 114, 199]) {
      const g = generateLevel(DIFFICULTY.easy, seed, WORLD, 1);
      expect(g.rejections.unsolvable).toBe(0);
    }
  });
});
