import Game from "@/components/Game";

export default function Home() {
  return (
    <main>
      <h1>避け道</h1>
      <p className="lede">
        抜けられることを<strong>証明した</strong>弾幕だけを配る、一本指の避けゲー。
        出題する面はすべて、被弾せずに終端へ届く経路が実在することを
        時空グリッド上の探索で確かめてから配られます。死ぬのは腕のせいであって、面のせいではありません。
      </p>
      <Game />
    </main>
  );
}
