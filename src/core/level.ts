import { closestApproach, hitsDuringTick } from "./collide";
import { bulletSegment, isActiveOverTick, stepShip } from "./motion";
import { type Rng, mulberry32 } from "./rng";
import { gridPoint, gridSpacing, solve } from "./solver";
import type { Bullet, Emit, Pattern, Script, Vec2, WorldConfig } from "./types";
import { dist } from "./vec";

/**
 * 弾の寿命(F-05a)。
 *
 * 世界は一辺 1 の正方形なので直径は `√2`。凸集合の中の線分は直径より長くなれない
 * ので、`√2` を超えて直進した点は必ず外に出ている。**定数で決め打たず、
 * 世界の大きさから導く** —— 世界を変えたときに寿命だけ古いままにならない。
 */
export function bulletLifespan(speed: number): number {
  return Math.ceil(Math.SQRT2 / speed) + 1;
}

/**
 * 面の開始点。中央やや下の格子点(必ず格子に乗る)。
 *
 * **`y` は画面の下向き**(canvas と同じ)なので、`0.9` が画面の下である(F-11a)。
 */
export function defaultStart(cfg: WorldConfig): Vec2 {
  const s = gridSpacing(cfg);
  return gridPoint(Math.round(0.5 / s), Math.round(0.9 / s), cfg);
}

/**
 * その一点に留まり続けて生き延びられる格子点の数(F-06a)。
 *
 * 0 なら「どこに立っていてもいつか当たる」= 動かなければ抜けられない面である。
 *
 * 全格子点 × 全 tick を素直に回すと重いので、**弾ごとに近傍の格子点だけを消す**。
 * `|g − b0| ≥ RS + RB + |Δb|` の点は下界からこの弾では死なないので、
 * 走査から外しても**結果は厳密に同じ**である(solver の枝刈りと同じ根拠)。
 */
export function stationarySurvivors(
  bullets: readonly Bullet[],
  cfg: WorldConfig,
): number {
  const n = cfg.gridN;
  const s = gridSpacing(cfg);
  const hit = cfg.shipRadius + cfg.bulletRadius;
  const alive = new Uint8Array(n * n).fill(1);
  let count = n * n;

  for (let t = 0; t < cfg.ticks && count > 0; t++) {
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
          if (!alive[idx]) continue;
          const g = gridPoint(i, j, cfg);
          if (closestApproach(g, g, a, c) < hit) {
            alive[idx] = 0;
            count--;
          }
        }
      }
    }
  }
  return count;
}

function shoot(origin: Vec2, angle: number, speed: number, t0: number): Bullet {
  return {
    origin,
    velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
    t0,
    t1: t0 + bulletLifespan(speed),
  };
}

/** 発射イベント 1 件を弾に開く。 */
function expandEmit(e: Emit): Bullet[] {
  const p: Pattern = e.pattern;
  const out: Bullet[] = [];
  switch (p.kind) {
    case "line": {
      for (let k = 0; k < p.count; k++) {
        // count が 1 のときは x0 に 1 発(ゼロ除算にしない)
        const u = p.count === 1 ? 0 : k / (p.count - 1);
        out.push(shoot({ x: p.x0 + (p.x1 - p.x0) * u, y: p.y }, p.angle, p.speed, e.t));
      }
      return out;
    }
    case "fan": {
      for (let k = 0; k < p.count; k++) {
        const u = p.count === 1 ? 0.5 : k / (p.count - 1);
        out.push(shoot(p.origin, p.angle + p.spread * (u - 0.5), p.speed, e.t));
      }
      return out;
    }
    case "ring": {
      for (let k = 0; k < p.count; k++) {
        out.push(shoot(p.origin, p.phase + (2 * Math.PI * k) / p.count, p.speed, e.t));
      }
      return out;
    }
    case "sweep": {
      for (let k = 0; k < p.count; k++) {
        const u = p.count === 1 ? 0 : k / (p.count - 1);
        const angle = p.angleFrom + (p.angleTo - p.angleFrom) * u;
        out.push(shoot(p.origin, angle, p.speed, e.t + k * p.interval));
      }
      return out;
    }
  }
}

/** スクリプトを弾の集合に開く(F-05)。純関数なので何度呼んでも同じ。 */
export function expandScript(script: Script, _cfg: WorldConfig): Bullet[] {
  return script.emits.flatMap(expandEmit);
}

export interface ReplayResult {
  /** `T` tick を被弾せずに走り切ったか。 */
  readonly survived: boolean;
  /** 実際にたどった位置(長さは入力と同じ)。 */
  readonly positions: readonly Vec2[];
  /** 被弾した tick(生存したなら `null`)。 */
  readonly hitAtTick: number | null;
}

/**
 * 経路を**目標点の列としてエンジンで実行する**(F-09)。
 *
 * ソルバーは格子の上で経路を構成するが、こちらは `stepShip` と被弾判定という
 * 実際の運動モデルを回す。両者が同じ点列に着くことが、
 * 「証明された経路はそのまま実行できる」ことの実地の確認になる(SPEC §4)。
 *
 * 被弾しても最後まで走らせる —— どの tick で当たったかを返すため。
 */
export function replay(
  targets: readonly Vec2[],
  bullets: readonly Bullet[],
  cfg: WorldConfig,
): ReplayResult {
  const positions: Vec2[] = [targets[0]];
  let hitAtTick: number | null = null;
  let p = targets[0];

  for (let t = 0; t + 1 < targets.length; t++) {
    const q = stepShip(p, targets[t + 1], cfg);
    if (hitAtTick === null && hitsDuringTick(p, q, bullets, t, cfg)) hitAtTick = t;
    positions.push(q);
    p = q;
  }
  return { survived: hitAtTick === null, positions, hitAtTick };
}

/** 難度パラメータ(F-06)。帯の較正は F-10 の仕事で、ここは生成の入力に過ぎない。 */
export interface Difficulty {
  readonly emits: number;
  readonly countMin: number;
  readonly countMax: number;
  readonly speedMin: number;
  readonly speedMax: number;
}

/**
 * 難度の三段(実測 2026-09-02 で較正)。
 *
 * F-06a を「どの一点に留まっても死ぬ」へ強めた結果、**弾が薄いと面が作れなくなった** ——
 * 留まれる場所を無くすには盤面を覆う必要があるからである。したがって
 * 「易」は弾を減らすのではなく**遅くする**ことで易しくしている。
 *
 * 本番設定での実測(6 種・試行上限 30):
 *
 * | 難度 | 成功 | 平均試行 | 証明経路が動く tick | 経路長 | 1 面 |
 * |---|---|---|---|---|---|
 * | 易 | 6/6 | 2.2 | 82 | 2.31 | 1.1 秒 |
 * | 並 | 6/6 | 1.0 | 110 | 2.98 | 0.86 秒 |
 * | 難 | 6/6 | 1.0 | 195 | 5.31 | 0.97 秒 |
 */
export const DIFFICULTY: Record<"easy" | "normal" | "hard", Difficulty> = {
  easy: { emits: 30, countMin: 8, countMax: 14, speedMin: 0.01, speedMax: 0.018 },
  normal: { emits: 40, countMin: 10, countMax: 18, speedMin: 0.014, speedMax: 0.026 },
  hard: { emits: 55, countMin: 12, countMax: 22, speedMin: 0.018, speedMax: 0.034 },
};

export interface Level {
  readonly script: Script;
  readonly bullets: readonly Bullet[];
  /** F-07 が証明した安全経路。 */
  readonly path: readonly Vec2[];
  readonly seed: number;
}

/**
 * 生成の結果。**面が作れなかったときも棄却の内訳を返す** ——
 * 数えた値が失敗時に消える計器は、いちばん知りたいときに何も言わない(HC-126)。
 */
export interface GenerateResult {
  readonly level: Level | null;
  /** 使った試行回数。 */
  readonly attempts: number;
  /** 棄却の内訳。**ゲートが実際に何かを弾いているか**を外から測るために返す。 */
  readonly rejections: { readonly unsolvable: number; readonly trivial: number };
}

function pick(rng: Rng, lo: number, hi: number): number {
  return lo + rng() * (hi - lo);
}

function pickInt(rng: Rng, lo: number, hi: number): number {
  return Math.floor(pick(rng, lo, hi + 1 - 1e-9));
}

/** 難度とシードから 1 本のスクリプトを引く。**自機を参照しない**(F-03)。 */
function randomScript(rng: Rng, d: Difficulty, cfg: WorldConfig): Script {
  const emits: Emit[] = [];
  for (let k = 0; k < d.emits; k++) {
    // 発射は面の前半に寄せる。終盤に撃った弾は誰も避けずに済んでしまう。
    const t = Math.floor(pick(rng, 0, cfg.ticks * 0.8));
    const count = pickInt(rng, d.countMin, d.countMax);
    const speed = pick(rng, d.speedMin, d.speedMax);
    const kind = pickInt(rng, 0, 3);
    // F-11a: y は画面の下向き。弾は上(y < 0)から現れ、+π/2 = 真下へ降りる。
    const DOWN = Math.PI / 2;
    if (kind === 0) {
      emits.push({
        t,
        pattern: { kind: "line", y: -0.05, x0: pick(rng, -0.1, 0.4), x1: pick(rng, 0.6, 1.1), count, speed, angle: DOWN + pick(rng, -0.3, 0.3) },
      });
    } else if (kind === 1) {
      emits.push({
        t,
        pattern: { kind: "fan", origin: { x: pick(rng, 0, 1), y: -0.05 }, count, angle: DOWN, spread: pick(rng, 0.4, 1.6), speed },
      });
    } else if (kind === 2) {
      emits.push({
        t,
        pattern: { kind: "ring", origin: { x: pick(rng, 0.15, 0.85), y: pick(rng, 0.05, 0.5) }, count, phase: pick(rng, 0, Math.PI), speed },
      });
    } else {
      emits.push({
        t,
        pattern: { kind: "sweep", origin: { x: pick(rng, -0.05, 1.05), y: -0.05 }, count, interval: pickInt(rng, 2, 8), angleFrom: DOWN - pick(rng, 0.3, 1.0), angleTo: DOWN + pick(rng, 0.3, 1.0), speed },
      });
    }
  }
  return { emits };
}

/**
 * 面を作る(F-06 / F-08 / F-06a)。
 *
 * 引いたスクリプトを F-07 に掛け、**安全経路の存在が証明できたものだけ**を返す。
 * さらに F-06a の非自明性 —— 開始点に留まる経路では生き延びられないこと ——
 * を再生器で確かめ、留まって抜けられる面は棄却する。
 *
 * 証明された経路が再生で生存しないことは**起こりえない**(SPEC §4)。
 * 起きたら健全性の論証が壊れているので、黙って棄却せず例外にする(HC-075)。
 */
export function generateLevel(
  d: Difficulty,
  seed: number,
  cfg: WorldConfig,
  maxAttempts: number,
  budget = 50_000_000,
): GenerateResult {
  const rng = mulberry32(seed);
  const start = defaultStart(cfg);
  const rejections = { unsolvable: 0, trivial: 0 };
  let attempt = 0;

  for (attempt = 1; attempt <= maxAttempts; attempt++) {
    const script = randomScript(rng, d, cfg);
    const bullets = expandScript(script, cfg);

    const r = solve(bullets, start, cfg, budget);
    if (!r.solvable || r.path === null) {
      rejections.unsolvable++;
      continue;
    }

    const forward = replay(r.path, bullets, cfg);
    // この throw はカバレッジに現れない。**通すには健全性の論証を壊すしかない**ので、
    // 意図して未到達のまま残す(覆い隠さず、報告に出るままにしておく)。
    if (!forward.survived) {
      throw new Error(
        `証明された経路が再生で被弾した(tick ${forward.hitAtTick})。健全性の論証が壊れている`,
      );
    }

    // F-06a: どこか一点に立っていれば抜けられる面は、避けゲームとして成立しない
    if (stationarySurvivors(bullets, cfg) > 0) {
      rejections.trivial++;
      continue;
    }

    return { level: { script, bullets, path: r.path, seed }, attempts: attempt, rejections };
  }
  return { level: null, attempts: maxAttempts, rejections };
}
