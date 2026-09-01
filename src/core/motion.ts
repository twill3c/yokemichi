import type { Bullet, Segment, Vec2, WorldConfig } from "./types";
import { add, dist, scale, sub } from "./vec";
import { clampToWorld } from "./world";

/**
 * 自機の 1 tick(F-02)。
 *
 * 目標点を**先に**世界の矩形へ押し込み、そこへ向かって最大 `maxSpeed` だけ進む。
 * 矩形は凸なので、内側の点から内側の点へ向かう限り結果も内側に入る ——
 * だから最後にもう一度クランプする必要はない(T-010 の総当たりで確かめている)。
 *
 * 目標までの距離が `maxSpeed` 以下なら**その tick で正確に到達する**。
 * F-07 の「格子点へ 1 tick で遷移する」はこの性質に乗っているので、
 * ここを緩めるとソルバーの証明が実行可能でなくなる。
 */
export function stepShip(p: Vec2, target: Vec2, cfg: WorldConfig): Vec2 {
  const q = clampToWorld(target);
  const d = dist(p, q);
  if (d <= cfg.maxSpeed) return q;
  return add(p, scale(sub(q, p), cfg.maxSpeed / d));
}

/** 弾が tick `t` に存在するか(生存区間は `[t0, t1)`)。 */
export function existsAt(b: Bullet, t: number): boolean {
  return t >= b.t0 && t < b.t1;
}

/** 弾の位置。存在しない tick では `null`(F-03)。 */
export function bulletAt(b: Bullet, t: number): Vec2 | null {
  if (!existsAt(b, t)) return null;
  return extrapolate(b, t);
}

/** 生存区間を無視して軌道を延長した位置。区間の終端を作るために使う。 */
function extrapolate(b: Bullet, t: number): Vec2 {
  return add(b.origin, scale(b.velocity, t - b.t0));
}

/**
 * 区間 `[t, t+1]` の判定にこの弾が参加するか(F-04)。
 * 始点 `t` に存在することだけを条件とする。
 */
export function isActiveOverTick(b: Bullet, t: number): boolean {
  return existsAt(b, t);
}

/**
 * 区間 `[t, t+1]` における弾の線分(F-04)。
 *
 * 終端は**消滅 tick を越えても外挿する**。弾を実際よりわずかに長く危険と見なす
 * 保守側の丸めで、N-03 の片側誤り(安全と言い過ぎない)と同じ向きに倒れる。
 */
export function bulletSegment(b: Bullet, t: number): [Vec2, Vec2] {
  return [extrapolate(b, t), extrapolate(b, t + 1)];
}

/**
 * tick `t` の区間に参加する弾の線分をまとめて作る(F-04)。
 *
 * ソルバーは同じ tick の中で何千という辺を調べるので、この計算を辺ごとに
 * 繰り返さず一度だけ行う。**判定そのものは共有したまま、外に出せる計算だけを
 * 外に出す**ための関数であり、意味は `bulletSegment` の繰り返しと同一である。
 */
export function bulletSegmentsAt(bullets: readonly Bullet[], t: number): Segment[] {
  const segs: Segment[] = [];
  for (const b of bullets) {
    if (!isActiveOverTick(b, t)) continue;
    const [a, c] = bulletSegment(b, t);
    segs.push({ a, b: c });
  }
  return segs;
}
