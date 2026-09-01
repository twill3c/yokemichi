import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    // tsconfig の paths("@/*" → "./src/*")を vitest にも適用する
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/core/**/*.ts"],
      // 型だけのモジュールは実行時に消えるので、include に残すと 0% と
      // 数えられて正しい実装がゲートを落とす(loop_001 の VERIF-FALSE)。
      // ここに足してよいのは **値を一つも輸出しないファイル**だけ。
      // 判定は `npx tsc --noEmit` ではなく、そのファイルが `export const` /
      // `export function` を持たないことを目視で確かめる。
      // テストファイル自身は分母から外す。テストは常に 100% 近くになるので、
      // 混ぜると**実装が増えるほどゲートが薄まる**(loop_002 の VERIF-GAP)。
      // 効いていることは、カバレッジ表に __tests__ の行が出ないことで確かめる。
      exclude: ["src/core/types.ts", "src/core/**/__tests__/**"],
      // SPEC §4: src/core は lines/functions/statements ≥ 90%, branches ≥ 85%
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 85,
      },
    },
  },
});
