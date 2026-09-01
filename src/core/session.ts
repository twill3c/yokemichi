import { hitsDuringTick } from "./collide";
import type { Level } from "./level";
import { stepShip } from "./motion";
import type { Vec2, WorldConfig } from "./types";

export type SessionStatus = "playing" | "hit" | "cleared";

/** 遊んでいる最中の状態(F-11)。純粋なので、描画も入力も持たない。 */
export interface Session {
  readonly level: Level;
  readonly tick: number;
  readonly ship: Vec2;
  readonly status: SessionStatus;
  readonly hitAtTick: number | null;
}

export function createSession(level: Level, cfg: WorldConfig): Session {
  return {
    level,
    tick: 0,
    ship: level.path[0],
    status: cfg.ticks === 0 ? "cleared" : "playing",
    hitAtTick: null,
  };
}

/**
 * 1 tick 進める(F-11)。
 *
 * `target` は指の位置。離しているあいだは `null` を渡す —— **時間は進むが
 * 自機は動かない**。運動と被弾判定は `replay`(F-09)と同じ関数を通る:
 * 遊んでいるときと検証しているときで規則が違ったら、証明は絵に描いた餅になる。
 */
export function stepSession(s: Session, target: Vec2 | null, cfg: WorldConfig): Session {
  if (s.status !== "playing") return s;

  const next = target === null ? s.ship : stepShip(s.ship, target, cfg);
  const hit = hitsDuringTick(s.ship, next, s.level.bullets, s.tick, cfg);
  const tick = s.tick + 1;

  return {
    level: s.level,
    tick,
    ship: next,
    status: hit ? "hit" : tick >= cfg.ticks ? "cleared" : "playing",
    hitAtTick: hit ? s.tick : null,
  };
}

/**
 * 「避け道」(F-12)—— いまの tick から先の証明経路を切り出す。
 *
 * 返すのは `path` そのものの一部であって、別に引き直した線ではない。
 * **見せている道が、実際に安全だと証明された道と同一である**こと自体が
 * このアプリの主張なので、ここで加工してはいけない。
 */
export function ghostAhead(level: Level, tick: number, span: number): readonly Vec2[] {
  const from = Math.min(Math.max(0, tick), level.path.length - 1);
  return level.path.slice(from, Math.min(level.path.length, from + span + 1));
}
