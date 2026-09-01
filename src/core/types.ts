// 型の正本。SPEC.md §2 の F-01〜F-08 に対応する。
// N-01: このディレクトリは純関数のみ。React / DOM / Node API に依存しない。

/** 正規化座標 `[0,1] × [0,1]` 上の点(F-01)。 */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/**
 * 弾(F-03)。位置は tick の関数で、**自機の状態に依存しない(open-loop)**。
 * この制約は F-07 の証明が成り立つための前提であり、破ると
 * 時空グリッドの状態が「位置 × 時刻」で閉じなくなる(SPEC §5)。
 */
export interface Bullet {
  /** 生成 tick `t0` における位置。 */
  readonly origin: Vec2;
  /** 1 tick あたりの変位。 */
  readonly velocity: Vec2;
  /** 出現 tick(この tick から存在する)。 */
  readonly t0: number;
  /** 消滅 tick(この tick には存在しない)。生存区間は `[t0, t1)`。 */
  readonly t1: number;
}

/**
 * 弾幕のパターン(F-05)。角度はラジアンで、`0` が `+x`、正の向きが `+y` へ回る。
 * **どのパターンも自機を参照しない** —— open-loop であることが F-07 の前提である。
 */
export type Pattern =
  /** 直線斉射: `x0 … x1` に `count` 発を等間隔で並べ、同じ向きへ撃つ。 */
  | {
      readonly kind: "line";
      readonly y: number;
      readonly x0: number;
      readonly x1: number;
      readonly count: number;
      readonly speed: number;
      readonly angle: number;
    }
  /** 扇状拡散: `angle` を中心に `spread` の幅で `count` 発。 */
  | {
      readonly kind: "fan";
      readonly origin: Vec2;
      readonly count: number;
      readonly angle: number;
      readonly spread: number;
      readonly speed: number;
    }
  /** 円形拡散: 全周に `count` 発を等角で。 */
  | {
      readonly kind: "ring";
      readonly origin: Vec2;
      readonly count: number;
      readonly phase: number;
      readonly speed: number;
    }
  /** 掃射: `interval` tick ごとに 1 発、角度が `angleFrom` から `angleTo` へ回る。 */
  | {
      readonly kind: "sweep";
      readonly origin: Vec2;
      readonly count: number;
      readonly interval: number;
      readonly angleFrom: number;
      readonly angleTo: number;
      readonly speed: number;
    };

/** 発射イベント。`t` は最初の弾が現れる tick。 */
export interface Emit {
  readonly t: number;
  readonly pattern: Pattern;
}

/** 面の弾幕。**生成時に確定し、実行中は変化しない**(F-05)。 */
export interface Script {
  readonly emits: readonly Emit[];
}

/** 1 tick のあいだに一点がたどる線分(F-04)。 */
export interface Segment {
  readonly a: Vec2;
  readonly b: Vec2;
}

/** 世界の定数(F-01 / F-02 / F-07)。 */
export interface WorldConfig {
  /** 1 tick の実時間(秒)。描画と入力の刻み。 */
  readonly dt: number;
  /** 自機の半径。 */
  readonly shipRadius: number;
  /** 弾の半径。 */
  readonly bulletRadius: number;
  /** 自機が 1 tick に進める最大距離。 */
  readonly maxSpeed: number;
  /** 1 面の長さ(tick 数)。`t = 0 … ticks` を生き延びればクリア。 */
  readonly ticks: number;
  /** ソルバーの位置格子の一辺の分割数(格子点は `gridN × gridN` 個)。 */
  readonly gridN: number;
  /** 証明に要求する余白(F-07 のクリアランス `C`)。 */
  readonly clearance: number;
}
