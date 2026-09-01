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
