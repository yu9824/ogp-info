import { beforeEach, describe, expect, it, vi } from "vitest";
import axios, { type AxiosResponse } from "axios";
import type { NowRequest, NowResponse } from "@vercel/node";

import handler from "../api/ogp";

/**
 * api/ogp.ts に対するユニット特性テスト（Task 2.1）。
 *
 * 目的: 依存・ランタイムの更新（Task 3）に着手する前に、現行実装
 * （api/ogp.ts、本テストでは変更しない）の観測可能な入出力をベースライン
 * として固定する。ここで固定した期待値がそのまま更新後の振る舞いオラクル
 * になる。
 *
 * 参照:
 *   requirements.md Requirement 1 (1.1-1.4) / Requirement 3 (3.1, 3.2, 3.5)
 *   design.md「OGP Handler (api/ogp.ts)」「Characterization Suite (tests/)」
 *             「Testing Strategy > Unit Tests」
 */

// axios モジュール全体をモックし、axios.get の戻り値をテストケースごとに
// 固定する。外部ネットワークへは一切アクセスしない（Requirement 3.5）。
vi.mock("axios");

// --- テスト用モックの型・生成ヘルパー -------------------------------------
// design.md「Service Interface」の MockVercelResponse / CapturedResponse を
// そのままテストの型ヒントとして採用する。

interface MockVercelResponse {
  status(code: number): this;
  json(body: unknown): void;
  send(body: string): void;
}

interface CapturedResponse {
  statusCode?: number;
  jsonBody?: Record<string, string | null>;
  textBody?: string;
}

/** status().json() / status().send() のチェーン呼び出しを記録するモックres */
class MockResponse implements MockVercelResponse {
  readonly captured: CapturedResponse = {};

  status(code: number): this {
    this.captured.statusCode = code;
    return this;
  }

  json(body: Record<string, string | null>): void {
    this.captured.jsonBody = body;
  }

  send(body: string): void {
    this.captured.textBody = body;
  }
}

function createMockResponse(): {
  res: NowResponse;
  captured: CapturedResponse;
} {
  const mock = new MockResponse();
  // ハンドラは NowResponse（ServerResponseを拡張した型）を要求するが、
  // 実際に呼び出すのは status/json/send のみのため、テストに必要な
  // 最小限のモックを NowResponse として扱う（unknown経由のキャストは
  // テストコードに限定して許容する）。
  return { res: mock as unknown as NowResponse, captured: mock.captured };
}

/**
 * req.query.url を模したモックreqを生成する。
 * url を渡さない場合は、クエリに url キー自体が存在しない状態
 * （未指定）を再現する。
 */
function createMockRequest(url?: string | string[]): NowRequest {
  const query: Record<string, string | string[]> =
    url === undefined ? {} : { url };
  return { query } as unknown as NowRequest;
}

/** axios.get の解決値（responce.data にHTML文字列を積む）を組み立てる */
function resolvedHtml(html: string): AxiosResponse<string> {
  return { data: html } as AxiosResponse<string>;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("OGP Handler (api/ogp.ts) 特性テスト", () => {
  describe("正常系: OGP抽出", () => {
    it("head > meta[property] のみを抽出対象とし、og:除去・trimしたキーで値を返す（1.1, 1.2）", async () => {
      const html = `<!DOCTYPE html>
<html>
<head>
<meta property="og:title" content="サンプルタイトル">
<meta property="og:type" content="website">
<meta property="fb:app_id" content="1234567890">
<meta property="  og:site_name  " content="サイト名">
<meta property="og:og:nested" content="入れ子のog接頭辞">
<meta name="description" content="propertyを持たないため対象外">
</head>
<body>
<h1>Sample</h1>
</body>
</html>`;
      vi.mocked(axios.get).mockResolvedValueOnce(resolvedHtml(html));

      const { res, captured } = createMockResponse();
      const req = createMockRequest("https://example.com/");
      await handler(req, res);

      expect(captured.statusCode).toBe(200);
      expect(captured.jsonBody).toEqual({
        title: "サンプルタイトル",
        type: "website",
        // "og:"を含まないpropertyはそのままキーになる
        "fb:app_id": "1234567890",
        // "  og:site_name  " は trim 後に "og:site_name" となり、og: 除去で "site_name"
        site_name: "サイト名",
        // "og:og:nested" は非正規表現の置換のため最初の1回だけ og: が除去され、
        // 2つ目の "og:" は残って "og:nested" になる
        "og:nested": "入れ子のog接頭辞",
      });
      // property属性を持たないmeta（description）はキーとして含まれない
      expect(Object.keys(captured.jsonBody ?? {})).toHaveLength(5);
    });

    it("propertyはあるがcontent属性がないmetaは値がnullになる（1.1）", async () => {
      const html = `<!DOCTYPE html>
<html>
<head>
<meta property="og:image">
</head>
<body></body>
</html>`;
      vi.mocked(axios.get).mockResolvedValueOnce(resolvedHtml(html));

      const { res, captured } = createMockResponse();
      const req = createMockRequest("https://example.com/no-content");
      await handler(req, res);

      expect(captured.statusCode).toBe(200);
      expect(captured.jsonBody).toEqual({ image: null });
    });

    it("head の外（body）にある property 付き meta は抽出対象外（抽出範囲の境界）", async () => {
      const html = `<!DOCTYPE html>
<html>
<head>
<meta property="og:title" content="ヘッド内のタイトル">
</head>
<body>
<meta property="og:hidden" content="body内のため対象外">
</body>
</html>`;
      vi.mocked(axios.get).mockResolvedValueOnce(resolvedHtml(html));

      const { res, captured } = createMockResponse();
      const req = createMockRequest("https://example.com/body-meta");
      await handler(req, res);

      expect(captured.statusCode).toBe(200);
      expect(captured.jsonBody).toEqual({ title: "ヘッド内のタイトル" });
      expect(captured.jsonBody).not.toHaveProperty("hidden");
    });

    it("成功時は res.json が呼ばれ、res.send は呼ばれない（1.1, JSON応答であることの固定）", async () => {
      const html = `<head><meta property="og:title" content="タイトル"></head>`;
      vi.mocked(axios.get).mockResolvedValueOnce(resolvedHtml(html));

      const { res, captured } = createMockResponse();
      const targetUrl = "https://example.com/json-check";
      const req = createMockRequest(targetUrl);
      await handler(req, res);

      // ハンドラが取得対象として渡したurlそのものをaxios.getへ渡していることも併せて固定する
      expect(axios.get).toHaveBeenCalledTimes(1);
      expect(axios.get).toHaveBeenCalledWith(targetUrl);
      expect(captured.statusCode).toBe(200);
      expect(captured.jsonBody).toEqual({ title: "タイトル" });
      expect(captured.textBody).toBeUndefined();
    });
  });

  describe("異常系: 入力不正（400・プレーンテキストerror）", () => {
    it("urlクエリが未指定の場合は400・プレーンテキストerrorを返す（1.3）", async () => {
      const { res, captured } = createMockResponse();
      const req = createMockRequest(undefined);
      await handler(req, res);

      expect(captured.statusCode).toBe(400);
      expect(captured.textBody).toBe("error");
      expect(captured.jsonBody).toBeUndefined();
      // 入力検証で弾かれ、取得処理には進まないことも固定する
      expect(axios.get).not.toHaveBeenCalled();
    });

    it("urlクエリが配列（同名クエリの複数指定）の場合は400・プレーンテキストerrorを返す（1.3）", async () => {
      const { res, captured } = createMockResponse();
      const req = createMockRequest([
        "https://a.example.com/",
        "https://b.example.com/",
      ]);
      await handler(req, res);

      expect(captured.statusCode).toBe(400);
      expect(captured.textBody).toBe("error");
      expect(captured.jsonBody).toBeUndefined();
      expect(axios.get).not.toHaveBeenCalled();
    });

    it("urlクエリが空文字の場合は400・プレーンテキストerrorを返す（1.3, isValidUrlParameterは通過するがハンドラのfalsy判定で捕捉される経路）", async () => {
      const { res, captured } = createMockResponse();
      const req = createMockRequest("");
      await handler(req, res);

      expect(captured.statusCode).toBe(400);
      expect(captured.textBody).toBe("error");
      expect(captured.jsonBody).toBeUndefined();
      expect(axios.get).not.toHaveBeenCalled();
    });
  });

  describe("異常系: 取得失敗（400・プレーンテキストerror）", () => {
    it("axios.get が例外を投げた場合は400・プレーンテキストerrorを返す（1.4）", async () => {
      vi.mocked(axios.get).mockRejectedValueOnce(new Error("network error"));

      const { res, captured } = createMockResponse();
      const req = createMockRequest("https://example.com/unreachable");
      await handler(req, res);

      expect(captured.statusCode).toBe(400);
      expect(captured.textBody).toBe("error");
      expect(captured.jsonBody).toBeUndefined();
    });
  });
});
