import { describe, expect, it } from "vitest";

import { bulletAt, bulletSegment, isActiveOverTick, stepShip } from "@/core/motion";
import type { Bullet } from "@/core/types";
import { WORLD, insideWorld } from "@/core/world";
import { dist } from "@/core/vec";

const EPS = 1e-12;

describe("T-010(F-02): 自機の運動", () => {
  it("目標が VMAX より遠いとき、ちょうど VMAX だけ目標へ近づく", () => {
    const p = { x: 0.2, y: 0.2 };
    // (0.6, 0.6) までの距離は 0.4√2 ≈ 0.5657 で、VMAX(0.02)より遠い。
    // 前提を検算する(HC-004: 導出前提をテスト内で確かめる)。
    const target = { x: 0.6, y: 0.6 };
    expect(dist(p, target)).toBeGreaterThan(WORLD.maxSpeed);

    const q = stepShip(p, target, WORLD);
    expect(dist(p, q)).toBeCloseTo(WORLD.maxSpeed, 12);
    // 進んだ向きは目標への向きと同じ = 残距離がちょうど VMAX だけ縮む
    expect(dist(q, target)).toBeCloseTo(dist(p, target) - WORLD.maxSpeed, 12);
  });

  it("目標が VMAX 以内なら、その tick で目標に到達する", () => {
    const p = { x: 0.5, y: 0.5 };
    const target = { x: 0.5 + WORLD.maxSpeed * 0.5, y: 0.5 };
    expect(dist(p, target)).toBeLessThanOrEqual(WORLD.maxSpeed);

    const q = stepShip(p, target, WORLD);
    // F-07 の遷移「格子点へ 1 tick で正確に到達する」はこの性質に乗っている
    expect(q.x).toBeCloseTo(target.x, 15);
    expect(q.y).toBeCloseTo(target.y, 15);
  });

  it("目標が同じ点なら動かない(ゼロ除算にならない)", () => {
    const p = { x: 0.3, y: 0.7 };
    const q = stepShip(p, p, WORLD);
    expect(q.x).toBe(p.x);
    expect(q.y).toBe(p.y);
  });

  it("世界の外を指しても外へ出ない(目標を先に矩形へ押し込む)", () => {
    const p = { x: 0.01, y: 0.5 };
    const q = stepShip(p, { x: -5, y: 0.5 }, WORLD);
    expect(insideWorld(q)).toBe(true);
    // 押し込んだ目標(0, 0.5)までの距離 0.01 は VMAX 以内なので、そこに着く
    expect(q.x).toBeCloseTo(0, 15);
    expect(q.y).toBeCloseTo(0.5, 15);
  });

  it("矩形は凸: 内側の点から内側の目標へ進む限り、結果は常に内側", () => {
    // 端・角・中央を総当たりで確かめる(最後のクランプが不要であることの根拠)
    const coords = [0, 0.001, 0.5, 0.999, 1];
    for (const px of coords)
      for (const py of coords)
        for (const tx of coords)
          for (const ty of coords) {
            const q = stepShip({ x: px, y: py }, { x: tx, y: ty }, WORLD);
            expect(insideWorld(q)).toBe(true);
          }
  });
});

describe("T-011(F-03): 弾の位置", () => {
  // 生存区間 [10, 13) の弾。t=10 で (0.2,0.3)、1 tick ごとに (+0.05,+0.10)。
  const b: Bullet = {
    origin: { x: 0.2, y: 0.3 },
    velocity: { x: 0.05, y: 0.1 },
    t0: 10,
    t1: 13,
  };

  it("生存区間の内では等速直線に動く", () => {
    expect(bulletAt(b, 10)).toEqual({ x: 0.2, y: 0.3 });
    const p12 = bulletAt(b, 12);
    expect(p12).not.toBeNull();
    expect(p12!.x).toBeCloseTo(0.2 + 0.05 * 2, 15);
    expect(p12!.y).toBeCloseTo(0.3 + 0.1 * 2, 15);
  });

  it("生存区間の外では存在しない(t1 の tick には居ない)", () => {
    expect(bulletAt(b, 9)).toBeNull();
    expect(bulletAt(b, 13)).toBeNull();
  });

  it("区間 [t, t+1] に参加するのは t0 ≤ t < t1 の弾だけ", () => {
    expect(isActiveOverTick(b, 9)).toBe(false);
    expect(isActiveOverTick(b, 10)).toBe(true);
    expect(isActiveOverTick(b, 12)).toBe(true); // 最後の生存 tick
    expect(isActiveOverTick(b, 13)).toBe(false);
  });

  it("区間の終端は消滅 tick を越えても外挿する(保守側の丸め・F-04)", () => {
    // t=12 は最後の生存 tick。終端 t=13 に弾は「居ない」が、
    // 区間 [12,13] の判定では外挿した位置を使う。
    expect(bulletAt(b, 13)).toBeNull();
    const [s0, s1] = bulletSegment(b, 12);
    expect(s0.x).toBeCloseTo(0.2 + 0.05 * 2, 15);
    expect(s1.x).toBeCloseTo(0.2 + 0.05 * 3, 15);
    expect(s1.y).toBeCloseTo(0.3 + 0.1 * 3, 15);
  });

  it("区間の始点は bulletAt と一致する", () => {
    for (const t of [10, 11, 12]) {
      const [s0] = bulletSegment(b, t);
      const at = bulletAt(b, t)!;
      expect(Math.abs(s0.x - at.x)).toBeLessThan(EPS);
      expect(Math.abs(s0.y - at.y)).toBeLessThan(EPS);
    }
  });
});
