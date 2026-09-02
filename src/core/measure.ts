import { closestApproach, minApproachToSegments } from "./collide";
import { bulletSegment, bulletSegmentsAt, isActiveOverTick } from "./motion";
import { gridPoint, solve } from "./solver";
import type { Bullet, Vec2, WorldConfig } from "./types";
import { dist } from "./vec";

/**
 * 面の手ごわさを測る(F-10)。
 *
 * **どれも「証明できたこと」ではなく「どれだけ余裕があるか」を測る量**である。
 * 難度の帯はここで得た分布から決める —— 体感でも設定値でもなく、面そのものから。
 */
export interface LevelMeasure {
  /**
   * 余白。証明経路上での「最近接距離 −(自機+弾の半径)」の最小値。
   * ソルバーがクリアランス `C` を要求しているので必ず `C` 以上になる。
   * **`C` に張り付いているほど、その経路はぎりぎりを通っている。**
   */
  readonly margin: number;
  /**
   * 隘路(留まれる場所)。各 tick で「そこに静止していれば当たらない」格子点の割合の最小値。
   * 盤面がどれだけ覆われるかを測る。F-06a により **0 に達する tick が必ず在る**ので、
   * この最小値は常に 0 —— 代わりに下の `safeAreaMean` を見る。
   */
  readonly safeAreaMin: number;
  /** 上の平均。面全体でどれだけ「立っていられる」かを表す。 */
  readonly safeAreaMean: number;
  /**
   * 隘路(居られる場所)。各 tick で**到達可能**な格子点の割合の最小値。
   * 経路の途中でどれだけ追い詰められるかを表す。
   */
  readonly reachMin: number;
  /** 証明経路が実際に位置を変えた tick の数。動かずに済む面ほど小さい。 */
  readonly movedTicks: number;
  /** 証明経路の総移動距離。 */
  readonly pathLength: number;
  /** 余白の平均(最小だけだと 1 tick の運に左右される)。 */
  readonly marginMean: number;
  /**
   * 到達可能な格子点の割合の最小。**ただし波面が広がりきる前を除く** ——
   * `t = 0` の到達集合は開始点の 1 マスなので、素直に最小を取ると
   * どの面でも `1/格子数` になり、面の性質を何も測らない。
   */
  readonly reachMinWarm: number;
}

/** 波面が広がりきるまでの助走(tick)。`reachMinWarm` はここから先だけを見る。 */
export const REACH_WARMUP = 60;

/**
 * 各 tick で静止していられる格子点の割合(F-10 の「安全な格子点」)。
 *
 * 全格子点 × 全弾を舐めず、**弾ごとに近傍の格子点だけを消す**。
 * `|g − b0| ≥ RS + RB + |Δb|` の点はその弾では死なないので、
 * 走査から外しても結果は厳密に同じ(ソルバーの枝刈りと同じ下界)。
 */
export function safeAreaSeries(bullets: readonly Bullet[], cfg: WorldConfig): number[] {
  const n = cfg.gridN;
  const s = 1 / (n - 1);
  const hit = cfg.shipRadius + cfg.bulletRadius;
  const cells = n * n;
  const dead = new Uint8Array(cells);
  const out: number[] = [];

  for (let t = 0; t < cfg.ticks; t++) {
    dead.fill(0);
    let n_dead = 0;
    for (const b of bullets) {
      if (!isActiveOverTick(b, t)) continue;
      const [a, c] = bulletSegment(b, t);
      const r = hit + dist(a, c);
      const i0 = Math.max(0, Math.ceil((a.x - r) / s));
      const i1 = Math.min(n - 1, Math.floor((a.x + r) / s));
      const j0 = Math.max(0, Math.ceil((a.y - r) / s));
      const j1 = Math.min(n - 1, Math.floor((a.y + r) / s));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const idx = j * n + i;
          if (dead[idx]) continue;
          const g = gridPoint(i, j, cfg);
          if (closestApproach(g, g, a, c) < hit) {
            dead[idx] = 1;
            n_dead++;
          }
        }
      }
    }
    out.push((cells - n_dead) / cells);
  }
  return out;
}

export function measureLevel(
  bullets: readonly Bullet[],
  path: readonly Vec2[],
  start: Vec2,
  cfg: WorldConfig,
  budget = 50_000_000,
): LevelMeasure {
  const hit = cfg.shipRadius + cfg.bulletRadius;

  // 余白 —— 証明経路をなぞり直して測る
  let margin = Infinity;
  let marginSum = 0;
  let marginN = 0;
  let movedTicks = 0;
  let pathLength = 0;
  for (let t = 0; t + 1 < path.length; t++) {
    const d = dist(path[t], path[t + 1]);
    pathLength += d;
    if (d > 1e-12) movedTicks++;
    const approach = minApproachToSegments(
      path[t],
      path[t + 1],
      bulletSegmentsAt(bullets, t),
    );
    // 弾が一つも生きていない tick は Infinity になる。余白の平均に混ぜると
    // 「静かな面ほど余裕がある」と読めてしまうので、有限の tick だけを平均する。
    if (Number.isFinite(approach)) {
      margin = Math.min(margin, approach - hit);
      marginSum += approach - hit;
      marginN++;
    }
  }

  const area = safeAreaSeries(bullets, cfg);

  // 居られる場所 —— ソルバーの各層の到達集合をそのまま覗く
  const cells = cfg.gridN * cfg.gridN;
  let reachMin = 1;
  let reachMinWarm = 1;
  solve(bullets, start, cfg, budget, {
    onLayer: (t, r) => {
      let live = 0;
      for (let k = 0; k < cells; k++) if (r[k]) live++;
      const frac = live / cells;
      reachMin = Math.min(reachMin, frac);
      if (t >= REACH_WARMUP) reachMinWarm = Math.min(reachMinWarm, frac);
    },
  });

  return {
    margin,
    marginMean: marginN === 0 ? Infinity : marginSum / marginN,
    safeAreaMin: Math.min(...area),
    safeAreaMean: area.reduce((a, b) => a + b, 0) / area.length,
    reachMin,
    reachMinWarm,
    movedTicks,
    pathLength,
  };
}
