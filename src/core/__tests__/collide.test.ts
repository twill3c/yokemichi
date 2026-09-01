import { describe, expect, it } from "vitest";

import { closestApproach, hitsDuringTick, minApproachDuringTick } from "@/core/collide";
import { mulberry32 } from "@/core/rng";
import type { Bullet, Vec2 } from "@/core/types";
import { dist } from "@/core/vec";
import { WORLD } from "@/core/world";

/** 被弾の閾値(SPEC F-04)。 */
const HIT = WORLD.shipRadius + WORLD.bulletRadius;

/** 静止した弾を、指定 tick を含む生存区間で作る。 */
function staticBullet(p: Vec2, t0 = 0, t1 = 1000): Bullet {
  return { origin: p, velocity: { x: 0, y: 0 }, t0, t1 };
}

describe("T-005(F-06, F-13): PRNG の決定論", () => {
  // T-014 は乱択で組を作るので、その乱数が再現することが前提になる。
  // 前提を検算せずに乱択テストを書かない(VERIF-FLAKE の予防)。
  it("同じシードは同じ列を返し、違うシードは違う列を返す", () => {
    const a = mulberry32(20260902);
    const b = mulberry32(20260902);
    const c = mulberry32(20260903);
    const seqA = Array.from({ length: 8 }, () => a());
    const seqB = Array.from({ length: 8 }, () => b());
    const seqC = Array.from({ length: 8 }, () => c());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });

  it("値は [0,1) に入る", () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("T-012(F-04): 衝突判定 — 手計算の三例", () => {
  it("静止どうし: 距離がそのまま最近接距離", () => {
    // 自機 (0.5,0.5) 静止、弾 (0.5,0.55) 静止 → 0.05。
    const d = closestApproach(
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.55 },
      { x: 0.5, y: 0.55 },
    );
    expect(d).toBeCloseTo(0.05, 15);
    expect(d).toBeGreaterThan(HIT); // 前提の検算: この例は非被弾側
  });

  it("すれ違い: 最近接は区間の内側で起きる(端点では起きない)", () => {
    // 自機 (0,0) → (0.1,0)、弾 (0.05,0.03) 静止。
    // 相対位置 r0 = (-0.05,-0.03)、相対変位 w = (0.1,0)。
    // s* = -(r0·w)/|w|² = -(-0.005)/0.01 = 0.5(区間の内側)
    // d(0.5) = (0,-0.03) → 0.03
    const a0 = { x: 0, y: 0 };
    const a1 = { x: 0.1, y: 0 };
    const b = { x: 0.05, y: 0.03 };
    const d = closestApproach(a0, a1, b, b);
    expect(d).toBeCloseTo(0.03, 15);
    // 端点の距離は両方ともこれより大きい = 最近接が内側にあることの検算
    expect(dist(a0, b)).toBeGreaterThan(d);
    expect(dist(a1, b)).toBeGreaterThan(d);
    expect(d).toBeGreaterThan(HIT); // 0.03 > 0.022 なので非被弾
  });

  it("かすめる: 閾値をわずかに下回れば被弾", () => {
    // 上と同じ配置で弾を y=0.02 に置く。最近接 0.02 < HIT(0.022)。
    const a0 = { x: 0, y: 0 };
    const a1 = { x: 0.1, y: 0 };
    const b = { x: 0.05, y: 0.02 };
    const d = closestApproach(a0, a1, b, b);
    expect(d).toBeCloseTo(0.02, 15);
    expect(d).toBeLessThan(HIT);
  });

  it("最近接点が区間の外にあるときは端点に丸める", () => {
    // 自機 (0,0) → (0.1,0)、弾 (0.5,0) 静止。s* = 5 → 1 に丸め、d = 0.4。
    const d = closestApproach(
      { x: 0, y: 0 },
      { x: 0.1, y: 0 },
      { x: 0.5, y: 0 },
      { x: 0.5, y: 0 },
    );
    expect(d).toBeCloseTo(0.4, 15);
  });
});

describe("T-013(F-04): tick 間のすり抜け", () => {
  // 自機は静止、弾は 1 tick で自機を貫通する。
  // 端点の距離は両方 0.1 で HIT(0.022)より大きいので、
  // 「tick 時点だけ見る」判定では見逃す配置である。
  const ship = { x: 0.5, y: 0.5 };
  const fast: Bullet = {
    origin: { x: 0.5, y: 0.4 },
    velocity: { x: 0, y: 0.2 },
    t0: 0,
    t1: 10,
  };

  it("前提の検算: 両端では離れている", () => {
    expect(dist(ship, { x: 0.5, y: 0.4 })).toBeCloseTo(0.1, 15);
    expect(dist(ship, { x: 0.5, y: 0.6 })).toBeCloseTo(0.1, 15);
    expect(0.1).toBeGreaterThan(HIT);
  });

  it("それでも被弾と判定する", () => {
    const d = minApproachDuringTick(ship, ship, [fast], 0);
    expect(d).toBeCloseTo(0, 12); // 弾は自機の中心を通る
    expect(hitsDuringTick(ship, ship, [fast], 0, WORLD)).toBe(true);
  });
});

describe("T-015(F-04): 陽性対照 — 端点だけ見る判定は T-013 を見逃す", () => {
  /** わざと壊した判定(テスト専用): 区間の両端しか見ない。 */
  function endpointsOnly(a0: Vec2, a1: Vec2, b0: Vec2, b1: Vec2): number {
    return Math.min(dist(a0, b0), dist(a1, b1));
  }

  const ship = { x: 0.5, y: 0.5 };
  const b0 = { x: 0.5, y: 0.4 };
  const b1 = { x: 0.5, y: 0.6 };

  it("壊した判定は貫通を見逃す(= T-013 が本当に効いている証拠)", () => {
    expect(endpointsOnly(ship, ship, b0, b1)).toBeGreaterThan(HIT);
    expect(closestApproach(ship, ship, b0, b1)).toBeLessThan(HIT);
  });

  it("貫通しない配置では両者は一致する(対照がすり抜け固有であることの確認)", () => {
    // 端点で最近接になる配置(T-012 の 4 例目と同型)では差が出ない。
    const a0 = { x: 0, y: 0 };
    const a1 = { x: 0.1, y: 0 };
    const s = { x: 0.5, y: 0 };
    expect(closestApproach(a0, a1, s, s)).toBeCloseTo(endpointsOnly(a0, a1, s, s), 15);
  });
});

describe("T-014(F-04): 二経路一致 — 閉形式 vs K 分割サンプリング", () => {
  const K = 1000;

  /** 別経路: 区間を K 等分して距離の最小を取る。 */
  function sampledApproach(a0: Vec2, a1: Vec2, b0: Vec2, b1: Vec2): number {
    let best = Infinity;
    for (let k = 0; k <= K; k++) {
      const s = k / K;
      const ax = a0.x + (a1.x - a0.x) * s;
      const ay = a0.y + (a1.y - a0.y) * s;
      const bx = b0.x + (b1.x - b0.x) * s;
      const by = b0.y + (b1.y - b0.y) * s;
      const d = Math.hypot(ax - bx, ay - by);
      if (d < best) best = d;
    }
    return best;
  }

  it("1,000 組で、閉形式は真の最小であり、差は解析的な上界に収まる", () => {
    const rand = mulberry32(20260902);
    const pt = (): Vec2 => ({ x: rand(), y: rand() });

    let maxGap = 0;
    let maxRatio = 0;
    let strictlyBetter = 0;

    for (let i = 0; i < 1000; i++) {
      const a0 = pt();
      const a1 = pt();
      const b0 = pt();
      const b1 = pt();

      const closed = closestApproach(a0, a1, b0, b1);
      const sampled = sampledApproach(a0, a1, b0, b1);

      // (1) 閉形式は真の最小 → サンプリングを上回らない
      expect(closed).toBeLessThanOrEqual(sampled + 1e-12);

      // (2) 上界: |d(s)|² = A(s−s*)² + m² と、最小点までの格子距離 h/2 から
      //     0 ≤ sampled² − closed² ≤ A·(h/2)²(SPEC §4)
      const wx = a1.x - a0.x - (b1.x - b0.x);
      const wy = a1.y - a0.y - (b1.y - b0.y);
      const A = wx * wx + wy * wy;
      const bound = A * (1 / (2 * K)) ** 2;
      expect(sampled ** 2 - closed ** 2).toBeLessThanOrEqual(bound + 1e-12);

      const gap = sampled - closed;
      if (gap > maxGap) maxGap = gap;
      if (bound > 0) maxRatio = Math.max(maxRatio, (sampled ** 2 - closed ** 2) / bound);
      if (gap > 1e-12) strictlyBetter++;
    }

    // (3) 対照の前提: 二つの経路は「実際に違う経路」である。
    //     常に完全一致するなら、この照合は何も検査していない(HC-079)。
    //     実測(2026-09-02): 1,000 組中 718 組で厳密に食い違った。
    expect(strictlyBetter).toBeGreaterThan(0);

    // (4) 上界が緩すぎないこと。届かない上界はいくらでも真になるので、
    //     「実際にほぼ触れている」ことを対で押さえる。
    //     実測(2026-09-02): maxRatio = 0.9952 — 上界はほぼ達成される = 導出は正しい。
    expect(maxRatio).toBeGreaterThan(0.5);

    // 実測(2026-09-02): maxGap = 4.811e-5(最小距離が 1.074e-3 まで詰まる組がある)。
    // 当初 SPEC に書いた 1e-9 は達成不能だった(HC-073)。
    expect(maxGap).toBeLessThan(1e-4);
  });
});

describe("minApproachDuringTick: 弾集合に対する最小(F-07 が使う)", () => {
  it("参加する弾が無ければ Infinity", () => {
    const p = { x: 0.5, y: 0.5 };
    expect(minApproachDuringTick(p, p, [], 0)).toBe(Infinity);
    // 生存区間の外の弾は参加しない
    expect(minApproachDuringTick(p, p, [staticBullet(p, 5, 9)], 0)).toBe(Infinity);
  });

  it("最も近い弾の値を返す", () => {
    const p = { x: 0.5, y: 0.5 };
    const far = staticBullet({ x: 0.5, y: 0.8 });
    const near = staticBullet({ x: 0.5, y: 0.55 });
    expect(minApproachDuringTick(p, p, [far, near], 0)).toBeCloseTo(0.05, 15);
    expect(minApproachDuringTick(p, p, [near, far], 0)).toBeCloseTo(0.05, 15);
  });

  it("hitsDuringTick は閾値 RS+RB で切る", () => {
    const p = { x: 0.5, y: 0.5 };
    // 0.03 離れた弾 → 非被弾、0.02 → 被弾(HIT = 0.022)
    expect(hitsDuringTick(p, p, [staticBullet({ x: 0.5, y: 0.53 })], 0, WORLD)).toBe(false);
    expect(hitsDuringTick(p, p, [staticBullet({ x: 0.5, y: 0.52 })], 0, WORLD)).toBe(true);
  });
});
