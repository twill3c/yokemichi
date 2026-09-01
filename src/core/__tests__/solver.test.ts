import { describe, expect, it } from "vitest";

import { minApproachDuringTick } from "@/core/collide";
import {
  gridPoint,
  gridSpacing,
  reachableOffsets,
  solve,
  solveExact,
  validatePath,
} from "@/core/solver";
import type { Bullet, Vec2, WorldConfig } from "@/core/types";
import { dist } from "@/core/vec";
import { WORLD } from "@/core/world";

/**
 * 試験用の世界。本番より粗い格子・短い面にして速く回す。
 * F-07a(格子間隔 < VMAX、斜めまで届く)を**この関数の中で検算する** ——
 * 前提を満たさないフィクスチャは、ソルバーを空にしたまま緑を返す。
 */
function testCfg(over: Partial<WorldConfig> = {}): WorldConfig {
  const c: WorldConfig = { ...WORLD, gridN: 21, maxSpeed: 0.075, ticks: 60, ...over };
  const s = 1 / (c.gridN - 1);
  expect(s).toBeLessThan(c.maxSpeed);
  expect(s * Math.SQRT2).toBeLessThanOrEqual(c.maxSpeed);
  return c;
}

const BUDGET = 50_000_000;

/**
 * ソルバーの振る舞いは**両実装に同じ規格を課す**。
 * 参照実装(素朴版)をテスト専用にすると、ずれても誰も気づかない(HC-065)。
 */
const IMPLS = [
  ["exact", solveExact],
  ["fast", solve],
] as const;

describe("T-002(F-07a): 格子と速度の整合", () => {
  it("本番の WORLD で、静止以外の遷移が実在する(8 近傍 + 静止 = 9)", () => {
    expect(gridSpacing(WORLD)).toBeLessThan(WORLD.maxSpeed);
    const offs = reachableOffsets(WORLD);
    expect(offs).toHaveLength(9);
    // 斜めまで含み、2 マス先は含まない
    expect(offs).toContainEqual({ di: 1, dj: 1 });
    expect(offs).toContainEqual({ di: 0, dj: 0 });
    expect(offs).not.toContainEqual({ di: 2, dj: 0 });
  });

  it("到達可能オフセットは定数表ではなく WORLD から導かれる", () => {
    // 速度を半分にすると斜めが落ちる = 表を書き写していない証拠
    const slow = { ...WORLD, maxSpeed: gridSpacing(WORLD) * 1.1 };
    expect(reachableOffsets(slow)).toHaveLength(5);
    // 速度を格子間隔未満にすると自己ループだけになる(loop_003 で踏んだ穴)
    const stuck = { ...WORLD, maxSpeed: gridSpacing(WORLD) * 0.9 };
    expect(reachableOffsets(stuck)).toHaveLength(1);
  });

  it("格子点は世界の中にあり、両端が 0 と 1 になる", () => {
    const c = testCfg();
    expect(gridPoint(0, 0, c)).toEqual({ x: 0, y: 0 });
    expect(gridPoint(c.gridN - 1, c.gridN - 1, c)).toEqual({ x: 1, y: 1 });
  });
});

describe.each(IMPLS)("T-030(F-07): 素通しの面 [%s]", (_n, solve) => {
  it("弾がなければ解け、経路は T+1 点で、始点は指定の開始点", () => {
    const c = testCfg();
    const start = gridPoint(10, 10, c); // (0.5, 0.5)
    const r = solve([], start, c, BUDGET);
    expect(r.solvable).toBe(true);
    expect(r.exhausted).toBe(false);
    expect(r.path).not.toBeNull();
    expect(r.path!).toHaveLength(c.ticks + 1);
    expect(r.path![0]).toEqual(start);
  });
});

describe.each(IMPLS)("T-030b(F-07, HC-075): 開始点の仮定はその場で例外にする [%s]", (_n, solve) => {
  const c = testCfg();

  it("世界の外から始めようとしたら落ちる", () => {
    expect(() => solve([], { x: -0.1, y: 0.5 }, c, BUDGET)).toThrow(/世界の外/);
  });

  it("格子点でない開始点は落ちる(黙って丸めない)", () => {
    // 丸めて進むと、返した経路の第一歩が実際には VMAX を超えることがある。
    const off = { x: gridSpacing(c) * 0.5, y: 0 };
    expect(() => solve([], off, c, BUDGET)).toThrow(/格子点でない/);
  });
});

describe.each(IMPLS)("T-031(F-07): 陽性対照 — 全域が危険になる瞬間 [%s]", (_n, solve) => {
  // 弾を格子状に敷き詰めて、世界のどこにも安全な点が無い tick を作る。
  // 生存が目的の面なので、「壁」は通せんぼでは足りない ——
  // 避ける場所が一つも無くなる瞬間が要る。
  const c = testCfg({ ticks: 10 });
  const need = c.shipRadius + c.bulletRadius + c.clearance;
  const d = 0.0375; // 最遠点までの距離は d√2/2 = 0.0265 < 0.028

  const carpet: Bullet[] = [];
  for (let i = 0; i * d <= 1 + d; i++) {
    for (let j = 0; j * d <= 1 + d; j++) {
      carpet.push({
        origin: { x: i * d, y: j * d },
        velocity: { x: 0, y: 0 },
        t0: 5,
        t1: 6, // 区間 [5,6] にだけ参加する
      });
    }
  }

  it("対照の前提: この配置には安全な点が一つも無い", () => {
    // 主張したい性質(全域被覆)をフィクスチャ自身に対して確かめる(HC-079)。
    // 格子点をすべて調べ、最悪でも need 未満に弾がいることを見る。
    let worst = 0;
    for (let i = 0; i < c.gridN; i++) {
      for (let j = 0; j < c.gridN; j++) {
        const p = gridPoint(i, j, c);
        worst = Math.max(worst, minApproachDuringTick(p, p, carpet, 5));
      }
    }
    expect(worst).toBeLessThan(need);
    expect(carpet.length).toBeGreaterThan(100);
  });

  it("ソルバーは solvable=false を返す(予算切れではなく証明済みの不可)", () => {
    const r = solve(carpet, gridPoint(10, 10, c), c, BUDGET);
    expect(r.solvable).toBe(false);
    expect(r.exhausted).toBe(false);
    expect(r.path).toBeNull();
  });

  it("同じ配置から弾を間引くと解ける(対照が配置固有であることの確認)", () => {
    // 半分に間引けば間隔 0.075 → 最遠点 0.053 > need なので安全な点が生まれる。
    const sparse = carpet.filter((_, k) => k % 2 === 0 && k % 4 !== 2);
    const r = solve(sparse, gridPoint(10, 10, c), c, BUDGET);
    expect(r.solvable).toBe(true);
  });
});

describe.each(IMPLS)("T-032(F-07): 隙間が一つだけある壁 [%s]", (_n, solve) => {
  // 上から下りてくる弾の列。隙間は x = 0.5 の一箇所だけ。
  // 壁は世界の**外**(y < 0)まで下り切るので、最後には必ず自機より下に居る。
  //
  // 主張と含意(HC-123): 壁の線に対する自機の上下(符号)は t=0 で「下」、
  // t=T で「上」になる ⇒ どこかで符号が変わる。符号が変わる tick では自機と
  // 壁の線が交差しており、そこで隙間の外に居れば余白違反になる
  // ⇒ **符号が変わる tick の自機は隙間の中に居る**。これが検査できる形の主張である。
  //
  // (最初は「隙間を抜けて上へ出るしかない」と書いたが、隙間を x 固定で開けたため
  //  隙間は恒久的な縦の通路になり、居座るだけでやり過ごせた —— loop_003 の VERIF-FALSE)
  const c = testCfg({ ticks: 60 });
  const GAP_X = 0.5;
  const GAP_HALF = 0.06;
  const Y0 = 1.1; // 世界の外(上)から始める → 開始点によらず自機は壁の下
  const VY = -1.3 / 60; // t=60 で y = -0.2(世界の外・下)
  const wallY = (t: number) => Y0 + VY * t;

  const wall: Bullet[] = [];
  for (let i = 0; i * 0.03 <= 1; i++) {
    const x = i * 0.03;
    if (Math.abs(x - GAP_X) < GAP_HALF) continue;
    wall.push({ origin: { x, y: Y0 }, velocity: { x: 0, y: VY }, t0: 0, t1: 1000 });
  }

  it("前提の検算: 壁は世界の外まで下り切り、隙間以外に通り道が無い", () => {
    expect(wallY(0)).toBeGreaterThan(1); // 開始時は世界の上(誰の上にも居る)
    expect(wallY(c.ticks)).toBeLessThan(0); // 終了時は世界の下(誰の下にも居る)
    // 隙間の外では、弾の間隔 0.03 が必要余白 0.028 の 2 倍(0.056)より狭い
    expect(0.03).toBeLessThan(2 * (c.shipRadius + c.bulletRadius + c.clearance));
    expect(wall.length).toBeGreaterThan(20);
  });

  it("解け、壁の線を横切る tick では必ず隙間の中に居る", () => {
    const start = gridPoint(10, 4, c); // (0.5, 0.2)
    const r = solve(wall, start, c, BUDGET);
    expect(r.solvable).toBe(true);
    const path = r.path!;

    const above = path.map((p, t) => p.y > wallY(t));
    // 含意の前提: 最初は壁より下、最後は壁より上
    expect(above[0]).toBe(false);
    expect(above[above.length - 1]).toBe(true);

    const crossings: number[] = [];
    for (let t = 0; t + 1 < above.length; t++) {
      if (above[t] !== above[t + 1]) crossings.push(t);
    }
    // 符号が変わる tick が実在する(対照が空でないことの確認)
    expect(crossings.length).toBeGreaterThan(0);

    for (const t of crossings) {
      expect(Math.abs(path[t].x - GAP_X)).toBeLessThanOrEqual(GAP_HALF);
      expect(Math.abs(path[t + 1].x - GAP_X)).toBeLessThanOrEqual(GAP_HALF);
    }
  });

  it("陽性対照: 隙間を塞ぐと解けなくなる", () => {
    // 隙間の分の弾を足すと、壁が全幅を覆って通り抜けられない。
    // 「隙間があるから解けた」ことの確認であって、単に解けやすい面ではない。
    const sealed = [...wall];
    for (let i = 0; i * 0.03 <= 1; i++) {
      const x = i * 0.03;
      if (Math.abs(x - GAP_X) < GAP_HALF) {
        sealed.push({ origin: { x, y: Y0 }, velocity: { x: 0, y: VY }, t0: 0, t1: 1000 });
      }
    }
    expect(sealed.length).toBeGreaterThan(wall.length);
    const r = solve(sealed, gridPoint(10, 4, c), c, BUDGET);
    expect(r.solvable).toBe(false);
    expect(r.exhausted).toBe(false);
  });
});

describe.each(IMPLS)("T-033(F-07, N-02): 予算 [%s]", (_n, solve) => {
  it("予算 0 なら即座に返り、解けないが「証明した」とは言わない", () => {
    const c = testCfg();
    const r = solve([], gridPoint(10, 10, c), c, 0);
    expect(r.solvable).toBe(false);
    expect(r.exhausted).toBe(true);
    expect(r.path).toBeNull();
    expect(r.edgesEvaluated).toBe(0);
  });

  it("予算を使い切ると exhausted になり、解けた場合は予算内に収まっている", () => {
    const c = testCfg();
    const tight = solve([], gridPoint(10, 10, c), c, 100);
    expect(tight.exhausted).toBe(true);
    expect(tight.solvable).toBe(false);

    const ok = solve([], gridPoint(10, 10, c), c, BUDGET);
    expect(ok.exhausted).toBe(false);
    expect(ok.edgesEvaluated).toBeGreaterThan(0);
    expect(ok.edgesEvaluated).toBeLessThanOrEqual(BUDGET);
  });
});

describe.each(IMPLS)("T-034(F-07, N-03): 返された経路の不変量 [%s]", (_n, solve) => {
  const c = testCfg({ ticks: 40 });
  const bullets: Bullet[] = [
    { origin: { x: 0.2, y: 0.9 }, velocity: { x: 0.005, y: -0.02 }, t0: 0, t1: 1000 },
    { origin: { x: 0.8, y: 0.9 }, velocity: { x: -0.005, y: -0.02 }, t0: 5, t1: 1000 },
    { origin: { x: 0.5, y: 1.0 }, velocity: { x: 0, y: -0.025 }, t0: 10, t1: 1000 },
  ];

  it("各 tick の移動は VMAX 以内、余白は RS+RB+C 以上", () => {
    const start = gridPoint(10, 4, c);
    const r = solve(bullets, start, c, BUDGET);
    expect(r.solvable).toBe(true);

    const v = validatePath(r.path!, bullets, c);
    expect(v.ok).toBe(true);
    expect(v.maxStep).toBeLessThanOrEqual(c.maxSpeed + 1e-12);
    expect(v.minApproach).toBeGreaterThanOrEqual(
      c.shipRadius + c.bulletRadius + c.clearance - 1e-12,
    );
  });

  it("陽性対照: 経路を 1 点だけずらすと不変量が落ちる", () => {
    const start = gridPoint(10, 4, c);
    const r = solve(bullets, start, c, BUDGET);
    const broken: Vec2[] = [...r.path!];
    // 中ほどの 1 点を遠くへ飛ばす → 移動距離が VMAX を超える
    broken[20] = { x: 0.05, y: 0.95 };
    expect(dist(r.path![19], broken[20])).toBeGreaterThan(c.maxSpeed);

    const v = validatePath(broken, bullets, c);
    expect(v.ok).toBe(false);
    expect(v.violation).toBe("step");
  });

  it("陽性対照: 長さ違いと世界の外は、それぞれの違反として落ちる", () => {
    const short = [gridPoint(10, 4, c), gridPoint(10, 5, c)];
    expect(validatePath(short, [], c).violation).toBe("length");

    // 世界の外へ一点だけ飛ばすと、先に「移動距離」の違反として落ちる。
    // 「外に居る」だけを見せるには、経路全体を外へ平行移動して移動距離を 0 にする。
    const outside: Vec2[] = [];
    for (let t = 0; t <= c.ticks; t++) outside.push({ x: 0.5, y: -0.005 });
    const v = validatePath(outside, [], c);
    expect(v.maxStep).toBe(0); // 移動の違反ではないことの検算
    expect(v.violation).toBe("outside");
    expect(v.atTick).toBe(0);
  });

  it("陽性対照: 弾に触れる経路は余白違反として落ちる", () => {
    // 弾 3 の軌道上に居座る経路を手で作る(壁抜けではなく余白の検査)
    const sitting: Vec2[] = [];
    for (let t = 0; t <= c.ticks; t++) {
      sitting.push({ x: 0.5, y: 1.0 - 0.025 * Math.max(0, t - 10) });
    }
    const v = validatePath(sitting, bullets, c);
    expect(v.ok).toBe(false);
    expect(v.violation).toBe("clearance");
  });
});
