import { WORLD } from "@/core/world";

// loop_001 の足場。ゲーム本体(F-11 / F-12)は後続ループで載せる。
// ここで WORLD を読んでいるのは、静的エクスポートの経路に core が
// 実際に乗ることを build で確かめるため(HC-062: テストが緑でも出荷物は作れない)。
export default function Home() {
  return (
    <main>
      <h1>避け道</h1>
      <p className="lede">
        抜けられることを証明した弾幕だけを配る、一本指の避けゲー。
        出題する面はすべて、被弾せずに終端へ届く経路が実在することを
        時空グリッド上の探索で確かめてから配られる。
      </p>
      <p className="lede">
        いまは足場だけ。1 面は {WORLD.ticks} tick(
        {(WORLD.ticks * WORLD.dt).toFixed(0)} 秒)、格子は {WORLD.gridN} ×{" "}
        {WORLD.gridN}。
      </p>
    </main>
  );
}
