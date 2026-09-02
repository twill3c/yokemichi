import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { stripComments, stripCommentsAndStrings, violationsIn } from "./boundary-rule";

const CORE = "src/core";

/** `src/core` の実装ファイル(テストは除く)。 */
function coreFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "__tests__") continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".ts")) out.push(p);
    }
  };
  walk(CORE);
  return out.sort();
}

describe("T-090(N-01): core の境界を実際に検査する", () => {
  // SPEC は長らく検証方法に「eslint 境界」と書いていたが、**そんな規則は無かった**。
  // 名指しした手段が実在するかは、書いた本人が確かめる(HC-077)。

  it("走査対象が空でなく、実在するモジュールを全部見ている", () => {
    const files = coreFiles();
    // 空の集合に対する「違反 0 件」は何も言っていない
    expect(files.length).toBeGreaterThanOrEqual(8);
    const names = files.map((f) => f.replace(/\\/g, "/"));
    for (const m of ["collide", "level", "measure", "motion", "rng", "session", "solver", "types", "vec", "world"]) {
      expect(names).toContain(`${CORE}/${m}.ts`);
    }
  });

  it("実データ(実装ファイル本体)で違反 0 件 —— 陰性対照", () => {
    for (const f of coreFiles()) {
      const v = violationsIn(readFileSync(f, "utf8"));
      expect(v, `${f} に違反: ${v.join(" / ")}`).toEqual([]);
    }
  });

  it("陽性対照: コードとして書けば、どの禁止も捕まる", () => {
    const bad: [string, string][] = [
      ["乱数", "export const x = Math.random();"],
      ["時刻", "export const x = Date.now();"],
      ["日付", "export const x = new Date();"],
      ["react", 'import { useState } from "react";'],
      ["next", 'import Link from "next/link";'],
      ["node", 'import { readFileSync } from "node:fs";'],
      ["DOM(document)", "export function f() { return document.body; }"],
      ["DOM(window)", "export function f() { return window.innerWidth; }"],
      ["DOM(localStorage)", "export function f() { return localStorage.getItem('k'); }"],
    ];
    for (const [label, src] of bad) {
      expect(violationsIn(src), `${label} を見逃した`).not.toEqual([]);
    }
  });

  it("陰性対照: 同じ語をコメントや文字列で**言及**しても撃たない", () => {
    // これが効かないと、rng.ts の「N-01 により core は Math.random() を呼ばない」
    // という一文だけで検査が赤くなる。禁止語の検査は
    // 「引用・言及」と「使用・依存」を分けること(HC-074)。
    const ok = [
      "// N-01 により core は Math.random() を呼ばない",
      "/* Date.now() は使わない。時刻は注入する */",
      'export const NOTE = "react を import しない";',
      "/** window や document には触れない。 */\nexport const K = 1;",
      "// import { readFileSync } from \"node:fs\"; ← これは書かない",
    ];
    for (const src of ok) {
      expect(violationsIn(src), `言及を違反と誤判定: ${src}`).toEqual([]);
    }
  });

  it("対照の前提: 除去器そのものが、コードを消してしまっていない", () => {
    // コメントと文字列を全部消す実装なら、上の陽性対照も通らなくなる。
    // 「消しすぎていない」ことを、除去器の出力で直接押さえる。
    const src = '// Math.random\nexport const a = 1; /* window */ const b = "document";';
    const stripped = stripCommentsAndStrings(src);
    expect(stripped).toContain("export const a = 1;");
    expect(stripped).not.toContain("Math.random");
    expect(stripped).not.toContain("window");
    expect(stripped).not.toContain("document");
  });
});

describe("T-091(N-05): 出荷時のランタイム依存", () => {
  it("dependencies は react / react-dom / next の 3 つだけ", () => {
    // 「next build が通ること」ではこれを検証できない —— 何を足しても通る。
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(Object.keys(pkg.dependencies).sort()).toEqual(["next", "react", "react-dom"]);
  });

  it("静的エクスポートの設定が、コメントアウトされずに入っている", () => {
    const cfg = stripComments(readFileSync("next.config.ts", "utf8"));
    expect(cfg).toMatch(/output:\s*["']export["']/);
  });
});
