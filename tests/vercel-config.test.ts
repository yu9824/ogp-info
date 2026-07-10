import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * vercel.json に対する設定特性テスト（Task 2.3）。
 *
 * 目的: 本番実行環境（Vercelサーバーレス）のルーティング/CORS設定は
 * 本スペックの対象外であり、vercel.json 自体は変更しない
 * （design.md「Out of Boundary」）。一方で Requirement 1.5 は
 * 「すべての /api/ogp 応答に更新前と同一の CORS ヘッダ
 * （Access-Control-Allow-Origin: *）を付与する」ことを求めており、
 * これは vercel.json の設定内容に由来する。
 *
 * 本テストは稼働中のサーバーを一切起動せず、vercel.json をファイルシステムから
 * 読み込んでその静的な内容のみを検証することで、CORS設定が設定ファイル
 * レベルで固定されていることをアサートする（Requirement 3.2）。
 *
 * 参照:
 *   requirements.md Requirement 1 (1.5) / Requirement 3 (3.2)
 *   design.md「Characterization Suite (tests/)」
 *             「Testing Strategy > Config / Frontend Tests」
 *             「Out of Boundary」（vercel.json のルーティング/CORS定義は変更対象外）
 */

// vercel.json のうち本テストが参照するフィールドのみを最小限に型付けする。
interface VercelRoute {
  src?: string;
  methods?: string[];
  dest?: string;
  headers?: Record<string, string>;
}

interface VercelConfig {
  routes?: VercelRoute[];
}

/** プロジェクトルートの vercel.json を読み込みパースする（稼働サーバ不要）。 */
function loadVercelConfig(): VercelConfig {
  const path = join(__dirname, "..", "vercel.json");
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as VercelConfig;
}

describe("vercel.json 設定特性テスト（稼働サーバ不要）", () => {
  it("/api/ogp 宛のルートに Access-Control-Allow-Origin: * が設定されている（1.5, 3.2）", () => {
    const config = loadVercelConfig();

    const ogpRoute = config.routes?.find(
      (route) => route.src === "/api/ogp" || route.dest === "/api/ogp"
    );

    // エントリ自体が見つからない場合に原因が分かるよう、存在確認を独立してアサートする
    expect(ogpRoute).toBeDefined();
    expect(ogpRoute?.headers?.["Access-Control-Allow-Origin"]).toBe("*");
  });
});
