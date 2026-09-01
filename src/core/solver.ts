import { minApproachToSegments } from "./collide";
import { bulletSegmentsAt } from "./motion";
import type { Bullet, Vec2, WorldConfig } from "./types";
import { dist } from "./vec";
import { insideWorld } from "./world";

/** 格子上の 1 tick の移動(格子単位)。 */
export interface Offset {
  readonly di: number;
  readonly dj: number;
}

export interface SolveResult {
  /** 安全経路の**存在が証明できた**か。予算切れのときは false になるが証明ではない。 */
  readonly solvable: boolean;
  /** 証明できた経路(長さ `ticks + 1`)。証明できなければ `null`。 */
  readonly path: readonly Vec2[] | null;
  /** 実際に評価した辺の本数。 */
  readonly edgesEvaluated: number;
  /** 予算切れで打ち切ったか。**`solvable === false` の理由を区別するための旗**。 */
  readonly exhausted: boolean;
}

export type PathViolation = "length" | "outside" | "step" | "clearance";

export interface PathCheck {
  readonly ok: boolean;
  readonly violation: PathViolation | null;
  /** 違反が起きた tick(無ければ `null`)。 */
  readonly atTick: number | null;
  /** 経路上で最大の 1 tick 移動距離。 */
  readonly maxStep: number;
  /** 経路上で最小の最近接距離(弾が一つも無ければ `Infinity`)。 */
  readonly minApproach: number;
}

/** 格子の間隔。`gridN` 個の点が `0 … 1` を等分する。 */
export function gridSpacing(cfg: WorldConfig): number {
  return 1 / (cfg.gridN - 1);
}

/** 格子点の座標。両端はちょうど 0 と 1 になる。 */
export function gridPoint(i: number, j: number, cfg: WorldConfig): Vec2 {
  const s = gridSpacing(cfg);
  return { x: i * s, y: j * s };
}

/**
 * 1 tick で到達できる格子オフセット(F-07a)。
 *
 * **定数表を書かず、必ず `cfg` から導く。**格子間隔と `VMAX` の関係が変われば
 * 遷移も変わるべきで、表を書き写すと片方だけ動いたときに黙って壊れる。
 * 判定は `≤ VMAX` の等号込み —— `stepShip` が「距離 `VMAX` 以下ならその tick で
 * 正確に到達する」と定めているので、ここが緩むと証明が実行不能になる。
 */
export function reachableOffsets(cfg: WorldConfig): Offset[] {
  const s = gridSpacing(cfg);
  const r = Math.floor(cfg.maxSpeed / s);
  const offs: Offset[] = [];
  for (let di = -r; di <= r; di++) {
    for (let dj = -r; dj <= r; dj++) {
      if (Math.hypot(di, dj) * s <= cfg.maxSpeed) offs.push({ di, dj });
    }
  }
  return offs;
}

/**
 * 時空グリッド上の到達可能性探索(F-07)。
 *
 * 遷移は `t → t+1` にしか無いので、待ち行列は要らない —— 層ごとに
 * 「いまどの格子点に居られるか」の集合を前へ押し出すだけでよい。
 *
 * 返す経路は、各点が実在の座標で、各区間が `VMAX` 以内かつ
 * クリアランス `C` 込みで安全である。したがって **そのままエンジンで
 * 実行できて生存する**(SPEC §4 の健全性論証)。逆向きの保証は無い ——
 * 格子に乗らない経路で抜けられる面を「解けない」と言うことはある(N-03)。
 */
export function solve(
  bullets: readonly Bullet[],
  start: Vec2,
  cfg: WorldConfig,
  budget: number,
): SolveResult {
  const n = cfg.gridN;
  const cells = n * n;
  const s = gridSpacing(cfg);
  const need = cfg.shipRadius + cfg.bulletRadius + cfg.clearance;
  const offsets = reachableOffsets(cfg);

  const si = Math.round(start.x / s);
  const sj = Math.round(start.y / s);
  if (si < 0 || si >= n || sj < 0 || sj >= n) {
    throw new Error(`開始点が世界の外にある: ${JSON.stringify(start)}`);
  }
  // 開始点は格子点でなければならない。ずれたまま進むと、返した経路の第一歩が
  // 実際には VMAX を超えることがある —— 仮定はその場で例外にする(HC-075)。
  if (dist(start, gridPoint(si, sj, cfg)) > 1e-9) {
    throw new Error(`開始点が格子点でない: ${JSON.stringify(start)}`);
  }

  const parent = new Int32Array(cells * (cfg.ticks + 1)).fill(-1);
  let cur = new Uint8Array(cells);
  cur[sj * n + si] = 1;
  let edges = 0;

  const exhaust = (): SolveResult => ({
    solvable: false,
    path: null,
    edgesEvaluated: edges,
    exhausted: true,
  });

  for (let t = 0; t < cfg.ticks; t++) {
    const segs = bulletSegmentsAt(bullets, t);
    const next = new Uint8Array(cells);
    let any = false;

    for (let c = 0; c < cells; c++) {
      if (!cur[c]) continue;
      const i = c % n;
      const j = (c - i) / n;
      const from = gridPoint(i, j, cfg);

      for (const o of offsets) {
        const ni = i + o.di;
        const nj = j + o.dj;
        if (ni < 0 || ni >= n || nj < 0 || nj >= n) continue;
        const nc = nj * n + ni;
        if (next[nc]) continue; // 先に着いた経路を使う(決定論・F-13)

        if (edges >= budget) return exhaust();
        edges++;

        if (minApproachToSegments(from, gridPoint(ni, nj, cfg), segs) >= need) {
          next[nc] = 1;
          parent[(t + 1) * cells + nc] = c;
          any = true;
        }
      }
    }

    if (!any) {
      // どこへも進めない = この面は(この格子の上では)抜けられない。
      // 予算は余っているので、これは**証明された不可**である。
      return { solvable: false, path: null, edgesEvaluated: edges, exhausted: false };
    }
    cur = next;
  }

  let end = -1;
  for (let c = 0; c < cells; c++) {
    if (cur[c]) {
      end = c;
      break;
    }
  }
  /* c8 ignore next 3 -- 層が空なら上の !any で返っているので到達しない */
  if (end < 0) {
    return { solvable: false, path: null, edgesEvaluated: edges, exhausted: false };
  }

  const path: Vec2[] = new Array(cfg.ticks + 1);
  let c = end;
  for (let t = cfg.ticks; t >= 0; t--) {
    const i = c % n;
    path[t] = gridPoint(i, (c - i) / n, cfg);
    if (t > 0) c = parent[t * cells + c];
  }
  return { solvable: true, path, edgesEvaluated: edges, exhausted: false };
}

/**
 * 経路が F-07 の不変量を満たすかを、探索とは別の経路で確かめる(T-034)。
 *
 * ソルバーは格子と幅優先で経路を**構成**するが、こちらは出来上がった点列を
 * 直接なぞって測るだけである。判定式(`minApproachToSegments`)は共有するが、
 * 経路の作り方は共有しない。
 */
export function validatePath(
  path: readonly Vec2[],
  bullets: readonly Bullet[],
  cfg: WorldConfig,
): PathCheck {
  const need = cfg.shipRadius + cfg.bulletRadius + cfg.clearance;
  let maxStep = 0;
  let minApproach = Infinity;
  let violation: PathViolation | null = null;
  let atTick: number | null = null;

  const fail = (v: PathViolation, t: number | null) => {
    if (violation === null) {
      violation = v;
      atTick = t;
    }
  };

  if (path.length !== cfg.ticks + 1) fail("length", null);

  for (let t = 0; t < path.length; t++) {
    if (!insideWorld(path[t])) fail("outside", t);
    if (t + 1 >= path.length) break;

    const step = dist(path[t], path[t + 1]);
    if (step > maxStep) maxStep = step;
    if (step > cfg.maxSpeed + 1e-12) fail("step", t);

    const d = minApproachToSegments(
      path[t],
      path[t + 1],
      bulletSegmentsAt(bullets, t),
    );
    if (d < minApproach) minApproach = d;
    if (d < need) fail("clearance", t);
  }

  return { ok: violation === null, violation, atTick, maxStep, minApproach };
}
