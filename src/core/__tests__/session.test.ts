import { describe, expect, it } from "vitest";

import { DIFFICULTY, type Level, defaultStart, expandScript, generateLevel } from "@/core/level";
import { createSession, ghostAhead, stepSession } from "@/core/session";
import type { Emit, Vec2, WorldConfig } from "@/core/types";
import { dist } from "@/core/vec";
import { WORLD } from "@/core/world";

function testCfg(over: Partial<WorldConfig> = {}): WorldConfig {
  const c: WorldConfig = { ...WORLD, gridN: 21, maxSpeed: 0.075, ticks: 60, ...over };
  expect((1 / (c.gridN - 1)) * Math.SQRT2).toBeLessThanOrEqual(c.maxSpeed);
  return c;
}

/** 弾の無い面を手で組む(セッションの運びだけを見るため)。 */
function emptyLevel(cfg: WorldConfig): Level {
  const start = defaultStart(cfg);
  return {
    script: { emits: [] },
    bullets: [],
    path: new Array<Vec2>(cfg.ticks + 1).fill(start),
    seed: 0,
  };
}

describe("T-060(F-11): ドラッグ入力", () => {
  const c = testCfg({ ticks: 10 });

  it("自機は指の位置を追い、1 tick の移動は VMAX を超えない", () => {
    let s = createSession(emptyLevel(c), c);
    expect(s.ship).toEqual(defaultStart(c));

    const target = { x: 0.9, y: 0.9 };
    const before = s.ship;
    s = stepSession(s, target, c);
    expect(dist(before, s.ship)).toBeCloseTo(c.maxSpeed, 12);
    expect(s.tick).toBe(1);
    expect(s.status).toBe("playing");
  });

  it("指を離している(target が null)あいだは動かない", () => {
    let s = createSession(emptyLevel(c), c);
    const before = s.ship;
    s = stepSession(s, null, c);
    expect(s.ship).toEqual(before);
    expect(s.tick).toBe(1); // 時間は進む
  });

  it("被弾したら状態が hit になり、以後は進まない", () => {
    // 開始点を真上から貫く弾を 1 発だけ置く。
    const start = defaultStart(c);
    const emits: Emit[] = [
      {
        t: 0,
        pattern: { kind: "line", y: start.y + 0.3, x0: start.x, x1: start.x, count: 1, speed: 0.05, angle: -Math.PI / 2 },
      },
    ];
    const bullets = expandScript({ emits }, c);
    const lv: Level = { ...emptyLevel(c), bullets };

    let s = createSession(lv, c);
    for (let k = 0; k < c.ticks; k++) s = stepSession(s, null, c);
    expect(s.status).toBe("hit");
    expect(s.hitAtTick).not.toBeNull();

    // 前提の検算: 弾は本当に開始点を通る配置である
    expect(s.hitAtTick).toBeLessThan(c.ticks);

    const frozen = stepSession(s, { x: 0.9, y: 0.9 }, c);
    expect(frozen).toEqual(s);
  });
});

describe("T-061(F-11): クリア", () => {
  const c = testCfg({ ticks: 8 });

  it("T tick まで走り切ると cleared になる", () => {
    let s = createSession(emptyLevel(c), c);
    for (let k = 0; k < c.ticks; k++) {
      expect(s.status).toBe("playing");
      s = stepSession(s, null, c);
    }
    expect(s.tick).toBe(c.ticks);
    expect(s.status).toBe("cleared");
    // クリア後も進まない
    expect(stepSession(s, null, c)).toEqual(s);
  });
});

describe("T-062(F-12): 避け道(証明経路のゴースト)", () => {
  const c = testCfg({ ticks: 60 });

  it("いまの tick から先の証明経路を切り出す", () => {
    const lv = generateLevel(DIFFICULTY.hard, 3, c, 60).level!;
    const g = ghostAhead(lv, 10, 5);
    expect(g).toHaveLength(6); // 現在地 + 先 5 点
    expect(g[0]).toEqual(lv.path[10]);
    expect(g[5]).toEqual(lv.path[15]);
  });

  it("終端では残りだけを返す(はみ出さない)", () => {
    const lv = generateLevel(DIFFICULTY.hard, 3, c, 60).level!;
    const g = ghostAhead(lv, c.ticks - 2, 10);
    expect(g).toHaveLength(3);
    expect(g[2]).toEqual(lv.path[c.ticks]);
    expect(ghostAhead(lv, c.ticks, 10)).toHaveLength(1);
  });

  it("ゴーストは実際に安全な道である(飾りではない)", () => {
    // 表示する点列が証明経路そのものであることを、経路の側から確かめる。
    const lv = generateLevel(DIFFICULTY.hard, 3, c, 60).level!;
    const g = ghostAhead(lv, 0, c.ticks);
    expect(g).toEqual(lv.path);
  });
});
