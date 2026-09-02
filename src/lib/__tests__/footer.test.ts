import { describe, expect, it } from "vitest";

import { COPYRIGHT, FOOTER_ITEMS, REPO } from "@/lib/footer";

describe("T-080(F-16): フリート共通のフッタ規約", () => {
  it("5 項目・この並び", () => {
    expect(FOOTER_ITEMS.map((i) => i.label)).toEqual([
      "MIT License",
      "GitHub",
      "避け道の歩き方",
      "避け道 設計図",
      "App Menu",
    ]);
  });

  it("文言が規約で固定された 3 項目は、行き先も規約どおり", () => {
    // 「どれかのリンクが github.com を向いている」では足りない ——
    // MIT License の行き先も github.com なので、GitHub 項目が別ホストに化けても通る(HC-098)。
    const by = (label: string) => FOOTER_ITEMS.find((i) => i.label === label)!.href;
    expect(by("MIT License")).toBe(`${REPO}/blob/main/LICENSE`);
    expect(by("GitHub")).toBe(REPO);
    expect(by("App Menu")).toBe("https://app-menu-amber.vercel.app");
  });

  it("解説 2 本はアーティファクトを指し、README や SPEC の代用ではない", () => {
    for (const label of ["避け道の歩き方", "避け道 設計図"]) {
      const href = FOOTER_ITEMS.find((i) => i.label === label)!.href;
      expect(href).toMatch(/^https:\/\/claude\.ai\/code\/artifact\/[0-9a-f-]{36}$/);
    }
  });

  it("解説 2 本は別のアーティファクトである", () => {
    const ids = FOOTER_ITEMS.filter((i) => i.href.includes("/artifact/")).map((i) => i.href);
    expect(new Set(ids).size).toBe(2);
  });

  it("著作権表示はリンク文言に含めない", () => {
    expect(COPYRIGHT).toBe("© 2026 坂田哲朗");
    for (const i of FOOTER_ITEMS) {
      expect(i.label).not.toContain("©");
      expect(i.label).not.toContain("坂田");
    }
  });

  it("すべて絶対 URL で、末尾に余計な / を付けない", () => {
    for (const i of FOOTER_ITEMS) {
      expect(i.href).toMatch(/^https:\/\//);
      expect(i.href.endsWith("/")).toBe(false);
    }
  });
});
