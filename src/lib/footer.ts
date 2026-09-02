/**
 * フリート共通のフッタ規約(F-16)。
 *
 * ```
 * MIT License © 2026 坂田哲朗 ・ GitHub ・ 避け道の歩き方 ・ 避け道 設計図 ・ App Menu
 * ```
 *
 * 規約で決まっているのは**並びと項目数**であって、3・4 番目の文言は
 * 各アプリの和名と固有の動詞を温存してよい。
 *
 * - 区切りの「・」は**文字として置く**。CSS の `::before` で描くと `innerText` に出ず、
 *   検品器から見えなくなる
 * - `© 2026 坂田哲朗` は MIT License の直後・GitHub の前に、**リンク文言の外**の地の文として置く
 */
export const REPO = "https://github.com/twill3c/yokemichi";

export interface FooterItem {
  readonly label: string;
  readonly href: string;
}

export const FOOTER_ITEMS: readonly FooterItem[] = [
  { label: "MIT License", href: `${REPO}/blob/main/LICENSE` },
  { label: "GitHub", href: REPO },
  {
    label: "避け道の歩き方",
    href: "https://claude.ai/code/artifact/fa0bea5a-e2ed-4fd4-95d1-1bc5825fec44",
  },
  {
    label: "避け道 設計図",
    href: "https://claude.ai/code/artifact/f7346175-d5d4-4905-b5d8-43a6cd3db152",
  },
  { label: "App Menu", href: "https://app-menu-amber.vercel.app" },
];

export const COPYRIGHT = "© 2026 坂田哲朗";
