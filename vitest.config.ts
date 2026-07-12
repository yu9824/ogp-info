import { defineConfig } from "vitest/config";

// 特性テスト（tests/ 配下）をNode環境で実行するための設定。
// tests/ にテストファイルが1件もない状態でも単一コマンドでの起動・収集を
// 確認できるよう、passWithNoTests を有効にしている。
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    passWithNoTests: true,
  },
});
