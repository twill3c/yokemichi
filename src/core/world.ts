import type { Vec2, WorldConfig } from "./types";

/**
 * 世界の定数(SPEC F-01 / F-02 / F-07)。
 *
 * **これらは暫定値である。**難易度の帯(F-10)は余白と隘路の実測で定めることに
 * なっており、その較正の過程でここも動く見込みである(HC-077: 見込みは
 * 見込みと書き、確かめる手段を併記する)。確かめる手段は
 * 「生成実績ゲート T-051 の合格率」と「証明経路の余白の分布」。
 *
 * 単位はすべて正規化座標。`[0,1] × [0,1]` が世界の全域。
 */
export const WORLD: WorldConfig = {
  dt: 1 / 60,
  shipRadius: 0.012,
  bulletRadius: 0.01,
  // F-07a: 格子間隔 1/40 = 0.025 に対し、斜め(0.03536)まで届く値を採る。
  // loop_001 の 0.02 では自分自身以外の格子点へ 1 tick で届かず、
  // ソルバーの遷移が自己ループだけになっていた(loop_003 の SPEC-GAP)。
  maxSpeed: 0.036,
  ticks: 600,
  gridN: 41,
  clearance: 0.006,
};

/** 点が世界の矩形に入っているか(境界は内側)。 */
export function insideWorld(p: Vec2): boolean {
  return p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
}

/** 点を世界の矩形へ押し込む(F-02)。 */
export function clampToWorld(p: Vec2): Vec2 {
  return {
    x: Math.min(1, Math.max(0, p.x)),
    y: Math.min(1, Math.max(0, p.y)),
  };
}
