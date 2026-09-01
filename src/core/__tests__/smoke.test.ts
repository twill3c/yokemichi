import { describe, expect, it } from "vitest";

import { WORLD, insideWorld } from "@/core/world";

// T-001(F-15): vitest が core の関数を import して実行できる。
// あわせて WORLD の定数が SPEC F-01 / F-02 の前提を満たすことを確かめる。
// これは「値がこの数であること」ではなく「値どうしの関係」を見る不変量なので、
// 定数を調整しても意味を保つ(HC-016: 件数・数値を裸の定数で固定しない)。
describe("T-001 スモーク: world", () => {
  it("WORLD の定数が SPEC F-01 / F-02 の前提を満たす", () => {
    // 半径・速度は正
    expect(WORLD.shipRadius).toBeGreaterThan(0);
    expect(WORLD.bulletRadius).toBeGreaterThan(0);
    expect(WORLD.maxSpeed).toBeGreaterThan(0);

    // 自機は世界の中に収まる大きさである(直径 < 世界の一辺 = 1)
    expect(WORLD.shipRadius * 2).toBeLessThan(1);

    // 1 tick の移動は世界を横断しない。横断できてしまうと
    // 「格子点へ 1 tick で到達する」という F-07 の遷移が意味を失う。
    expect(WORLD.maxSpeed).toBeLessThan(1);

    // クリアランスは非負(0 なら「ぎりぎり通れる」を許す)
    expect(WORLD.clearance).toBeGreaterThanOrEqual(0);

    // 面の長さと格子は 2 以上(1 だと経路も格子も退化する)
    expect(WORLD.ticks).toBeGreaterThanOrEqual(2);
    expect(WORLD.gridN).toBeGreaterThanOrEqual(2);
  });

  it("insideWorld が矩形の内外を判定する", () => {
    expect(insideWorld({ x: 0.5, y: 0.5 })).toBe(true);
    expect(insideWorld({ x: 0, y: 0 })).toBe(true); // 境界は内側
    expect(insideWorld({ x: 1, y: 1 })).toBe(true);
    expect(insideWorld({ x: -0.001, y: 0.5 })).toBe(false);
    expect(insideWorld({ x: 0.5, y: 1.001 })).toBe(false);
  });
});
