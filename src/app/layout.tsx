import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "避け道 — yokemichi",
  description:
    "抜けられることを証明した弾幕だけを配る、一本指の避けゲー。時空グリッド上の探索で安全経路を先に見つけてから出題する。",
};

// F-11: ポインタ / タッチ専用。指で機体を動かすので、二本指の拡大縮小で
// 盤面が動かないように初期倍率を固定する。
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
