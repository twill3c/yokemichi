/**
 * N-01 の境界規則(検査の本体)。
 *
 * **判定規則は検査器の中に埋めない。**別モジュールに切り出して、
 * 壊し方ごとの陽性対照つきで単体で試す —— そうしないと、規則が壊れたときに
 * 誰も気づかない(hanshoku-atlas の footer-rule と同じ流儀)。
 *
 * 禁止語の検査でいちばん危ないのは、**「引用・言及」を「使用・依存」と取り違える**
 * ことである(HC-074)。`rng.ts` には「N-01 により core は `Math.random()` を
 * 呼ばない」という一文があり、素朴な grep はこれを違反として撃つ。
 * だから走査の前にコメントと文字列を落とす。
 */

/** コメントだけを取り除く(文字列は残す)。import の行き先を見るために使う。 */
export function stripComments(src: string): string {
  return scan(src, { strings: false });
}

/** コメントと文字列の中身を取り除く。識別子の**使用**を見るために使う。 */
export function stripCommentsAndStrings(src: string): string {
  return scan(src, { strings: true });
}

function scan(src: string, opts: { strings: boolean }): string {
  let out = "";
  let i = 0;
  const keep = (c: string) => (c === "\n" ? "\n" : " ");

  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];

    if (c === "/" && d === "/") {
      while (i < src.length && src[i] !== "\n") out += keep(src[i++]);
      continue;
    }
    if (c === "/" && d === "*") {
      out += "  ";
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) out += keep(src[i++]);
      out += "  ";
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += quote;
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\") {
          out += opts.strings ? "  " : src.slice(i, i + 2);
          i += 2;
          continue;
        }
        out += opts.strings ? keep(src[i]) : src[i];
        i++;
      }
      out += quote;
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * `src/core` が読んでよいのは `src/core` の中だけ、という許可制の規則。
 * 禁止一覧ではなく許可制にするのは、**知らない依存が増えたときに黙って通らない**ため。
 */
const ALLOWED_IMPORT = /^(\.{1,2}\/|@\/core\/)/;

/** コードとして書かれていたら違反になる、外の世界への手がかり。 */
const FORBIDDEN_USES: [string, RegExp][] = [
  ["Math.random", /\bMath\s*\.\s*random\s*\(/],
  ["Date.now", /\bDate\s*\.\s*now\s*\(/],
  ["new Date", /\bnew\s+Date\s*\(/],
  ["document", /\bdocument\s*\./],
  ["window", /\bwindow\s*\./],
  ["localStorage", /\blocalStorage\s*\./],
  ["navigator", /\bnavigator\s*\./],
  ["process", /\bprocess\s*\./],
  ["require", /\brequire\s*\(/],
];

/** 1 ファイルぶんの違反を返す(空配列なら適合)。 */
export function violationsIn(src: string): string[] {
  const out: string[] = [];

  const forImports = stripComments(src);
  const specRe = /\bfrom\s*["']([^"']+)["']|^\s*import\s+["']([^"']+)["']/gm;
  for (const m of forImports.matchAll(specRe)) {
    const spec = m[1] ?? m[2];
    if (!ALLOWED_IMPORT.test(spec)) out.push(`core の外を import している: ${spec}`);
  }

  const forUses = stripCommentsAndStrings(src);
  for (const [label, re] of FORBIDDEN_USES) {
    if (re.test(forUses)) out.push(`外の世界に触れている: ${label}`);
  }
  return out;
}
