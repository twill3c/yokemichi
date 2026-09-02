import type { Metadata, Viewport } from "next";

import { COPYRIGHT, FOOTER_ITEMS } from "@/lib/footer";
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
      <body>
        {children}

        {/* fleet: fixed footer。共通規約の 5 項目・この並び・下部固定 */}
        <footer className="site-footer">
          <div className="site-footer__inner">
            <a href={FOOTER_ITEMS[0].href}>{FOOTER_ITEMS[0].label}</a>
            <span className="site-footer__copy">{COPYRIGHT}</span>
            {FOOTER_ITEMS.slice(1).map((i) => (
              <span key={i.href} className="site-footer__item">
                <span className="fsep">・</span>
                <a href={i.href}>{i.label}</a>
              </span>
            ))}
          </div>
        </footer>
      </body>
    </html>
  );
}
