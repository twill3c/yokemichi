import { describe, expect, it } from "vitest";

import { closestApproach } from "@/core/collide";
import { mulberry32 } from "@/core/rng";
import { gridPoint, solve, solveExact } from "@/core/solver";
import type { Bullet, Vec2, WorldConfig } from "@/core/types";
import { dist } from "@/core/vec";
import { WORLD } from "@/core/world";

function testCfg(over: Partial<WorldConfig> = {}): WorldConfig {
  const c: WorldConfig = { ...WORLD, gridN: 21, maxSpeed: 0.075, ticks: 60, ...over };
  const s = 1 / (c.gridN - 1);
  expect(s * Math.SQRT2).toBeLessThanOrEqual(c.maxSpeed);
  return c;
}

const BUDGET = 50_000_000;

describe("T-035(N-03): 枝刈りの上界そのものを検証する", () => {
  // 高速版が捨ててよい弾の条件:
  //   closestApproach(a0,a1,b0,b1) >= dist(a0,b0) - |Δa| - |Δb|
  // なので dist(a0,b0) >= need + |Δa| + |Δb| なら、その弾は
  // 「危険(< need)」の判定を変えられない。**この不等式が実装の根拠**なので、
  // 実装を照合する前に不等式そのものを測る。
  const need = WORLD.shipRadius + WORLD.bulletRadius + WORLD.clearance;

  it("下界の不等式が乱択 20,000 組で破れない", () => {
    const rand = mulberry32(20260902);
    const pt = (): Vec2 => ({ x: rand() * 1.2 - 0.1, y: rand() * 1.2 - 0.1 });
    for (let k = 0; k < 20000; k++) {
      const a0 = pt();
      const a1 = pt();
      const b0 = pt();
      const b1 = pt();
      const lower = dist(a0, b0) - dist(a0, a1) - dist(b0, b1);
      expect(closestApproach(a0, a1, b0, b1)).toBeGreaterThanOrEqual(lower - 1e-12);
    }
  });

  it("下界に等号が立つ配置が実在する(緩すぎる不等式ではない)", () => {
    // 乱択では下界に届かない —— 実測(2026-09-02)で最も近い組でも隔たり 3.18e-4。
    // 等号が立つのは**相対運動が一直線に、互いへ向かって進む**ときだけなので、
    // 乱数に探させず解析的に構成する。
    // a: (0,0)→(0.1,0)、b: (0.5,0)→(0.4,0)
    //   |a0−b0| = 0.5、|Δa| = |Δb| = 0.1 → 下界 = 0.3
    //   相対位置 r0 = (−0.5,0)、相対変位 w = (0.2,0) → s* は 1 に丸められ |r0+w| = 0.3
    const a0 = { x: 0, y: 0 };
    const a1 = { x: 0.1, y: 0 };
    const b0 = { x: 0.5, y: 0 };
    const b1 = { x: 0.4, y: 0 };
    const lower = dist(a0, b0) - dist(a0, a1) - dist(b0, b1);
    expect(lower).toBeCloseTo(0.3, 15);
    expect(closestApproach(a0, a1, b0, b1)).toBeCloseTo(lower, 15);
  });

  it("捨ててよい条件を満たす弾は、実際に need 未満にならない", () => {
    const rand = mulberry32(7);
    let dropped = 0;
    for (let k = 0; k < 20000; k++) {
      const a0 = { x: rand(), y: rand() };
      const a1 = { x: a0.x + (rand() - 0.5) * 2 * WORLD.maxSpeed, y: a0.y };
      const b0 = { x: rand() * 2 - 0.5, y: rand() * 2 - 0.5 };
      const b1 = { x: b0.x + (rand() - 0.5) * 0.06, y: b0.y + (rand() - 0.5) * 0.06 };
      if (dist(a0, b0) < need + dist(a0, a1) + dist(b0, b1)) continue;
      dropped++;
      expect(closestApproach(a0, a1, b0, b1)).toBeGreaterThanOrEqual(need);
    }
    // 対照の前提: 実際に「捨ててよい」と判定された組が十分ある
    expect(dropped).toBeGreaterThan(1000);
  });

  it("境界のすぐ内側には、本当に危険な弾が居る(上界が過大でない)", () => {
    // 自機は静止、弾は need よりわずかに近い位置に静止 → 危険。
    // これが無ければ「捨ててよい条件」はいくらでも広げられてしまう。
    const a = { x: 0.5, y: 0.5 };
    const b = { x: 0.5 + need * 0.99, y: 0.5 };
    expect(dist(a, b)).toBeLessThan(need);
    expect(closestApproach(a, a, b, b)).toBeLessThan(need);
  });
});

describe("T-036(F-07, HC-065): 素朴版と高速版の二実装照合", () => {
  const c = testCfg({ ticks: 40 });
  const start = gridPoint(10, 4, c);

  /** 種を変えた降雨。弾が世界中に散らばるので枝刈りが効く。 */
  function rain(seed: number, n: number): Bullet[] {
    const rand = mulberry32(seed);
    const out: Bullet[] = [];
    for (let k = 0; k < n; k++) {
      const t0 = Math.floor(rand() * c.ticks);
      out.push({
        origin: { x: rand(), y: 1.02 },
        velocity: { x: (rand() - 0.5) * 0.01, y: -0.01 - rand() * 0.02 },
        t0,
        t1: t0 + 120,
      });
    }
    return out;
  }

  /** 全域が危険になる瞬間を作る敷き詰め(T-031 と同型)。**解けない標本**。 */
  function carpet(): Bullet[] {
    const d = 0.0375;
    const out: Bullet[] = [];
    for (let i = 0; i * d <= 1 + d; i++) {
      for (let j = 0; j * d <= 1 + d; j++) {
        out.push({ origin: { x: i * d, y: j * d }, velocity: { x: 0, y: 0 }, t0: 5, t1: 6 });
      }
    }
    return out;
  }

  const cases: [string, Bullet[]][] = [
    ["弾ゼロ", []],
    ["降雨 40", rain(1, 40)],
    ["降雨 120", rain(2, 120)],
    ["降雨 300", rain(3, 300)],
    ["敷き詰め(解けない)", carpet()],
  ];

  it.each(cases)("%s: 結論・辺の本数・各層の到達集合・経路がすべて一致する", (_name, bullets) => {
    const layersA: string[] = [];
    const layersB: string[] = [];
    const digest = (a: Uint8Array) => a.join("");

    const a = solveExact(bullets, start, c, BUDGET, {
      onLayer: (_t, r) => layersA.push(digest(r)),
    });
    const b = solve(bullets, start, c, BUDGET, {
      onLayer: (_t, r) => layersB.push(digest(r)),
    });

    // 結論
    expect(b.solvable).toBe(a.solvable);
    expect(b.exhausted).toBe(a.exhausted);
    // 経路(結論だけを比べる照合は、別の理由で同じ結論に着いた実装を通す)
    expect(b.path).toEqual(a.path);
    // 経路の途中 —— 各 tick でどこに居られたかまで一致すること
    expect(layersB).toEqual(layersA);
    expect(layersA.length).toBeGreaterThan(0);
    // 辺の評価順序も同じなので、辺の本数は完全一致する
    expect(b.edgesEvaluated).toBe(a.edgesEvaluated);
  });

  it("対照の前提: 解ける面と解けない面の両方が含まれている", () => {
    // すべて同じ結論の標本で照合しても、片方が定数を返していても一致してしまう。
    const outcomes = cases.map(([, bullets]) => solve(bullets, start, c, BUDGET).solvable);
    expect(new Set(outcomes).size).toBe(2);
  });
});

describe("T-037(N-06): 枝刈りが実際に効いていることを測る", () => {
  const c = testCfg({ ticks: 40 });
  const start = gridPoint(10, 4, c);
  const rand = mulberry32(11);
  const bullets: Bullet[] = [];
  for (let k = 0; k < 200; k++) {
    const t0 = Math.floor(rand() * 20);
    bullets.push({
      origin: { x: rand(), y: 1.02 },
      velocity: { x: (rand() - 0.5) * 0.01, y: -0.01 - rand() * 0.02 },
      t0,
      t1: t0 + 200,
    });
  }

  it("同じ結論に、桁違いに少ない弾との比較で到達する", () => {
    const a = solveExact(bullets, start, c, BUDGET);
    const b = solve(bullets, start, c, BUDGET);

    expect(b.solvable).toBe(a.solvable);
    expect(b.edgesEvaluated).toBe(a.edgesEvaluated);

    // 枝刈りが効いていなければ両者は同じ回数だけ弾を見る = 照合は無情報になる。
    // 実測(2026-09-02)を書き換えずに済むよう、比で主張する。
    expect(a.bulletChecks).toBeGreaterThan(0);
    expect(b.bulletChecks).toBeLessThan(a.bulletChecks / 5);
  });
});
