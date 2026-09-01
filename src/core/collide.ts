import { bulletSegment, isActiveOverTick } from "./motion";
import type { Bullet, Vec2, WorldConfig } from "./types";
import { dot, len, len2, sub } from "./vec";

/**
 * 二つの線分を**同じ時間で**たどる二点の最近接距離(F-04)。
 *
 * これは線分どうしの最短距離ではない。`s ∈ [0,1]` を共有の媒介変数として
 * `a(s)` と `b(s)` の距離を最小化する —— 両者が同じ tick を等速で動くからである。
 *
 * 相対位置は `d(s) = r0 + w·s`(`r0 = a0 − b0`、`w` は 1 tick の相対変位)。
 * `|d(s)|²` は `s` の二次式なので、頂点 `s* = −(r0·w)/|w|²` を `[0,1]` に丸めれば
 * 最小が閉形式で出る。`|w| = 0`(相対的に静止)のときは `s = 0` で一定。
 *
 * この閉形式は tick の内側で起きる接近を取りこぼさない ——
 * すなわち 1 tick で自機を貫通する弾も被弾になる(T-013)。
 */
export function closestApproach(a0: Vec2, a1: Vec2, b0: Vec2, b1: Vec2): number {
  const r0 = sub(a0, b0);
  const w = sub(sub(a1, a0), sub(b1, b0));
  const a = len2(w);
  if (a === 0) return len(r0);
  const s = Math.min(1, Math.max(0, -dot(r0, w) / a));
  return len({ x: r0.x + w.x * s, y: r0.y + w.y * s });
}

/**
 * 区間 `[t, t+1]` における、自機と全弾との最近接距離の最小(F-04 / F-07)。
 * 参加する弾が無ければ `Infinity`。
 *
 * 被弾判定(閾値 `RS + RB`)とソルバーの通行判定(閾値 `RS + RB + C`)は、
 * どちらもこの一つの量に別の閾値を当てるだけである。**同じ量を使うことが、
 * 証明された経路が実際に実行できることの根拠**になっている(SPEC §4)。
 */
export function minApproachDuringTick(
  shipFrom: Vec2,
  shipTo: Vec2,
  bullets: readonly Bullet[],
  t: number,
): number {
  let best = Infinity;
  for (const b of bullets) {
    if (!isActiveOverTick(b, t)) continue;
    const [b0, b1] = bulletSegment(b, t);
    const d = closestApproach(shipFrom, shipTo, b0, b1);
    if (d < best) best = d;
  }
  return best;
}

/** 区間 `[t, t+1]` で被弾するか(閾値 `RS + RB`)。 */
export function hitsDuringTick(
  shipFrom: Vec2,
  shipTo: Vec2,
  bullets: readonly Bullet[],
  t: number,
  cfg: WorldConfig,
): boolean {
  return (
    minApproachDuringTick(shipFrom, shipTo, bullets, t) <
    cfg.shipRadius + cfg.bulletRadius
  );
}
