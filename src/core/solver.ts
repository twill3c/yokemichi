import { minApproachToSegments } from "./collide";
import { bulletSegment, bulletSegmentsAt, isActiveOverTick } from "./motion";
import type { Bullet, Segment, Vec2, WorldConfig } from "./types";
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
  /** 実際に評価した辺の本数。**両実装で一致する**(評価する辺の集合と順序が同じため)。 */
  readonly edgesEvaluated: number;
  /** 弾との比較(`closestApproach`)を呼んだ回数。枝刈りが効いているかを測る量。 */
  readonly bulletChecks: number;
  /** 予算切れで打ち切ったか。**`solvable === false` の理由を区別するための旗**。 */
  readonly exhausted: boolean;
}

export interface SolveOptions {
  /** 各 tick の到達集合を覗く(二実装照合で経路の途中まで比べるため)。 */
  readonly onLayer?: (t: number, reachable: Uint8Array) => void;
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
export function solveExact(
  bullets: readonly Bullet[],
  start: Vec2,
  cfg: WorldConfig,
  budget: number,
  opts: SolveOptions = {},
): SolveResult {
  return search(start, cfg, budget, exactOracle(bullets, cfg), opts);
}

/**
 * ソルバー(高速版・N-06)。**判定は `solveExact` と厳密に同じ**で、
 * 明らかに遠い弾を比較から外すだけである(`prunedOracle`)。
 *
 * 二実装照合(T-036)が比べているのは**辺の安全判定**であって、
 * 層の掃き出しや経路の復元ではない —— そこは両者が同じ `search` を通る。
 * 掃き出しと復元の正しさは、両実装に同じ規格を課した T-030〜T-034 が見る。
 */
export function solve(
  bullets: readonly Bullet[],
  start: Vec2,
  cfg: WorldConfig,
  budget: number,
  opts: SolveOptions = {},
): SolveResult {
  return search(start, cfg, budget, prunedOracle(bullets, cfg), opts);
}

/**
 * 辺の安全判定を供給するもの。`solveExact` と `solve` の違いはここだけにある。
 */
interface SafetyOracle {
  /** tick `t` の準備(弾の線分を作る・空間の索引を張る)。 */
  begin(t: number): void;
  /** 格子点 `(i, j)` から `to` への辺が、いま準備した tick で安全か。 */
  safe(i: number, j: number, from: Vec2, to: Vec2): boolean;
  /** `closestApproach` を呼んだ回数。 */
  checks: number;
}

/** 全弾を舐める素朴な判定。これが正しさの基準になる。 */
function exactOracle(bullets: readonly Bullet[], cfg: WorldConfig): SafetyOracle {
  const need = cfg.shipRadius + cfg.bulletRadius + cfg.clearance;
  let segs: readonly Segment[] = [];
  return {
    checks: 0,
    begin(t) {
      segs = bulletSegmentsAt(bullets, t);
    },
    safe(_i, _j, from, to) {
      this.checks += segs.length;
      return minApproachToSegments(from, to, segs) >= need;
    },
  };
}

/**
 * 空間で絞り込んでから舐める判定。**近似ではない。**
 *
 * 相対運動の下界
 *
 * ```
 * closestApproach(a0,a1,b0,b1) ≥ |a0 − b0| − |a1 − a0| − |b1 − b0|
 * ```
 *
 * より、`|a0 − b0| ≥ need + VMAX + |Δb|` を満たす弾は最近接距離を `need` 未満に
 * できない。したがってそれらを比較から外しても、**「安全か否か」の判定は変わらない**
 * (最近接距離の**値**は変わりうるので、値が要る `validatePath` では使わない)。
 *
 * 半径は弾ごとに `need + VMAX + |Δb|` を採る。全弾の最大速度で一律に取ると、
 * 速い弾が一つ混ざっただけで絞り込みが効かなくなる。
 */
function prunedOracle(bullets: readonly Bullet[], cfg: WorldConfig): SafetyOracle {
  const n = cfg.gridN;
  const s = gridSpacing(cfg);
  const need = cfg.shipRadius + cfg.bulletRadius + cfg.clearance;
  const lists: Segment[][] = Array.from({ length: n * n }, () => []);
  return {
    checks: 0,
    begin(t) {
      for (const l of lists) l.length = 0;
      for (const b of bullets) {
        if (!isActiveOverTick(b, t)) continue;
        const [a, c] = bulletSegment(b, t);
        const seg = { a, b: c };
        const r = need + cfg.maxSpeed + dist(a, c);
        const i0 = Math.max(0, Math.ceil((a.x - r) / s));
        const i1 = Math.min(n - 1, Math.floor((a.x + r) / s));
        const j0 = Math.max(0, Math.ceil((a.y - r) / s));
        const j1 = Math.min(n - 1, Math.floor((a.y + r) / s));
        for (let j = j0; j <= j1; j++) {
          const dy = j * s - a.y;
          for (let i = i0; i <= i1; i++) {
            const dx = i * s - a.x;
            if (dx * dx + dy * dy <= r * r) lists[j * n + i].push(seg);
          }
        }
      }
    },
    safe(i, j, from, to) {
      const near = lists[j * n + i];
      this.checks += near.length;
      return minApproachToSegments(from, to, near) >= need;
    },
  };
}

/** 層ごとの掃き出しと経路の復元。両実装で共有する。 */
function search(
  start: Vec2,
  cfg: WorldConfig,
  budget: number,
  oracle: SafetyOracle,
  opts: SolveOptions,
): SolveResult {
  const n = cfg.gridN;
  const cells = n * n;
  const s = gridSpacing(cfg);
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

  const stop = (exhausted: boolean): SolveResult => ({
    solvable: false,
    path: null,
    edgesEvaluated: edges,
    bulletChecks: oracle.checks,
    exhausted,
  });

  opts.onLayer?.(0, cur);

  for (let t = 0; t < cfg.ticks; t++) {
    oracle.begin(t);
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

        if (edges >= budget) return stop(true);
        edges++;

        if (oracle.safe(i, j, from, gridPoint(ni, nj, cfg))) {
          next[nc] = 1;
          parent[(t + 1) * cells + nc] = c;
          any = true;
        }
      }
    }

    if (!any) {
      // どこへも進めない = この面は(この格子の上では)抜けられない。
      // 予算は余っているので、これは**証明された不可**である。
      return stop(false);
    }
    cur = next;
    opts.onLayer?.(t + 1, cur);
  }

  let end = -1;
  for (let c = 0; c < cells; c++) {
    if (cur[c]) {
      end = c;
      break;
    }
  }
  /* c8 ignore next 1 -- 層が空なら上の !any で返っているので到達しない */
  if (end < 0) return stop(false);

  const path: Vec2[] = new Array(cfg.ticks + 1);
  let c = end;
  for (let t = cfg.ticks; t >= 0; t--) {
    const i = c % n;
    path[t] = gridPoint(i, (c - i) / n, cfg);
    if (t > 0) c = parent[t * cells + c];
  }
  return {
    solvable: true,
    path,
    edgesEvaluated: edges,
    bulletChecks: oracle.checks,
    exhausted: false,
  };
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
