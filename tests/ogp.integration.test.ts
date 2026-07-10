import { afterEach, describe, expect, it } from "vitest";
import http, { type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";
import type { NowRequest, NowResponse } from "@vercel/node";

import handler from "../api/ogp";

/**
 * api/ogp.ts に対する結合特性テスト（Task 2.2）。
 *
 * Task 2.1（tests/ogp.test.ts）は axios.get を vi.mock で固定HTMLに差し替えた
 * ユニット特性テストのため、axios/jsdom自身のバージョン差異（レスポンスボディの
 * 型・エンコーディング処理など）は検出できない。本テストはNode標準の http で
 * 固定HTMLを返すローカルサーバーを起動し、実際のHTTP通信・実際のjsdomパースを
 * 通してハンドラの入出力を固定する。
 *
 * このファイルでは axios を vi.mock しない（実HTTP・実DOMパースを通すことが目的）。
 * Vitest はテストファイルごとにモジュールを分離するため、tests/ogp.test.ts の
 * vi.mock("axios") はこのファイルには影響しない。
 *
 * 外部ネットワークには一切アクセスせず、127.0.0.1 のエフェメラルポート
 * （server.listen(0) でOSに割り当てさせる）のみを用いる（Requirement 3.5）。
 *
 * 参照:
 *   requirements.md Requirement 1 (1.1, 1.4) / Requirement 3 (3.1, 3.2, 3.5)
 *   design.md「OGP Handler (api/ogp.ts)」「Characterization Suite (tests/)」
 *             「Testing Strategy > Integration Tests」
 *             「Behavior Delta Resolution Policy」（本テストが将来何のために存在するかの背景）
 */

// --- モックres/reqヘルパー ---------------------------------------------------
// tests/ogp.test.ts の MockVercelResponse / CapturedResponse
// （design.md「Service Interface」）と同じ契約をこのファイル内に独立して定義する
// （境界: tests/ogp.test.ts は変更しない／依存しない）。

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
  // ハンドラは NowResponse を要求するが、実際に呼び出すのは status/json/send の
  // みのため、テストに必要な最小限のモックを NowResponse として扱う。
  return { res: mock as unknown as NowResponse, captured: mock.captured };
}

/** req.query.url にローカルサーバーのURLを積んだモックreqを生成する */
function createMockRequest(url: string): NowRequest {
  return { query: { url } } as unknown as NowRequest;
}

// --- ローカルHTTPサーバーヘルパー --------------------------------------------
// 127.0.0.1固定・server.listen(0)によるエフェメラルポート割り当てのみを用い、
// 外部ネットワークには一切アクセスしない（Requirement 3.5）。

let currentServer: http.Server | undefined;

/** 指定したリクエストリスナーで127.0.0.1のエフェメラルポートにサーバーを起動する */
function startServer(listener: RequestListener): Promise<{ baseUrl: string }> {
  const server = http.createServer(listener);
  currentServer = server;
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo | null;
      if (address === null) {
        reject(new Error("failed to obtain ephemeral port"));
        return;
      }
      resolve({ baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

// 各テスト後に起動したサーバーを確実にcloseし、ハンドルリークでVitestプロセスが
// ハングすることを防ぐ。
afterEach(async () => {
  if (currentServer) {
    await closeServer(currentServer);
    currentServer = undefined;
  }
});

describe("OGP Handler (api/ogp.ts) 結合特性テスト（実HTTP・実axios・実jsdom）", () => {
  describe("正常系: 実HTTP取得・実DOMパースを通した抽出（1.1）", () => {
    it("ローカルサーバーが返す固定HTML（マルチバイト文字・null contentを含む）から、実axios・実jsdomを通してog:メタを抽出する", async () => {
      const html = `<!DOCTYPE html>
<html>
<head>
<meta property="og:title" content="結合テストタイトル">
<meta property="og:type" content="website">
<meta property="fb:app_id" content="1234567890">
<meta property="og:image">
<meta name="description" content="propertyを持たないため対象外">
</head>
<body>
<h1>Integration</h1>
</body>
</html>`;
      const { baseUrl } = await startServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
      });

      const { res, captured } = createMockResponse();
      const req = createMockRequest(`${baseUrl}/fixture`);
      await handler(req, res);

      // 実HTTP経由でもUnit特性テスト（ogp.test.ts）と同一のキー変換・null保持結果を
      // 得ることを固定する（axiosの本文取り扱い＝エンコーディング処理の版差を検出する
      // ためのベースライン）。
      expect(captured.statusCode).toBe(200);
      expect(captured.jsonBody).toEqual({
        title: "結合テストタイトル",
        type: "website",
        "fb:app_id": "1234567890",
        image: null,
      });
      expect(captured.textBody).toBeUndefined();
    });
  });

  describe("異常系: 取得失敗（1.4）", () => {
    it("ローカルサーバーが500を返す場合、axiosのdefault validateStatusにより例外化され400・プレーンテキストerrorになる", async () => {
      const { baseUrl } = await startServer((_req, res) => {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal Server Error");
      });

      const { res, captured } = createMockResponse();
      const req = createMockRequest(`${baseUrl}/fails`);
      await handler(req, res);

      expect(captured.statusCode).toBe(400);
      expect(captured.textBody).toBe("error");
      expect(captured.jsonBody).toBeUndefined();
    });

    it("接続不可（誰も listen していないローカルポート）の場合、ECONNREFUSED経由で400・プレーンテキストerrorになる", async () => {
      // サーバーを起動してエフェメラルポートを確保した直後にcloseし、
      // 「誰も listen していないローカルポート」を用意する（外部ネットワークには
      // アクセスしない、Requirement 3.5）。
      const { baseUrl } = await startServer((_req, res) => {
        res.writeHead(200);
        res.end("unused");
      });
      await closeServer(currentServer!);
      currentServer = undefined;

      const { res, captured } = createMockResponse();
      const req = createMockRequest(`${baseUrl}/unreachable`);
      await handler(req, res);

      expect(captured.statusCode).toBe(400);
      expect(captured.textBody).toBe("error");
      expect(captured.jsonBody).toBeUndefined();
    });
  });

  describe("実測記録: 非HTMLレスポンス（2xx）の実際の挙動 — 現行実装では400にならない", () => {
    // 実装方針の仮説検証: axios@0.24.0 はデフォルトで `transitional.forcedJSONParsing`
    // が有効であり、Content-Typeに関係なく文字列レスポンスに対し常にJSON.parseを
    // 試みる（node_modules/axios/lib/defaults.js の transformResponse を確認済み）。
    // 成功すればresponse.dataは文字列ではなくオブジェクト/配列/数値になる。
    //
    // 仮説: new JSDOM(オブジェクト) が文字列を期待して例外を投げ、400になるのでは？
    //
    // 実測結果（scratchpadでのローカルhttp＋実axios＋実jsdom実験、および下記テストで
    // 再現・固定): 例外は発生しない。jsdom@16.7.0 は非文字列入力を
    // String(data) で強制的に文字列化してからHTML5パーサーに渡す
    // （node_modules/jsdom/lib/api.js の normalizeHTML を確認済み）。HTML5パーサーは
    // 仕様上どんな文字列も寛容にパースするため例外を投げず、`head > meta[property]`
    // が0件の空オブジェクト {} を伴う200が返る。
    //
    // 同様に、プレーンテキスト・空ボディ・不正なUTF-8バイト列のバイナリでも
    // （scratchpadでの実験で）例外は発生せず200・{}になることを確認した。
    // → 現行実装には「非HTMLボディ（2xxステータス）を理由に400を返す経路」が
    //   存在しない。400になるのは非2xxステータスまたは接続失敗のみである。
    //   この結果は tasks.md の想定（500/非HTMLで400）と異なるため、
    //   推測でテストを書かず実測のみを固定する（詳細はCONCERNS参照）。
    it("サーバーがContent-Type: application/jsonで有効なJSONオブジェクトを返す場合、forced JSON parsingでresponse.dataがオブジェクト化され、jsdomは例外を投げずに200・空オブジェクトを返す", async () => {
      const { baseUrl } = await startServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ not: "html" }));
      });

      const { res, captured } = createMockResponse();
      const req = createMockRequest(`${baseUrl}/json-not-html`);
      await handler(req, res);

      expect(captured.statusCode).toBe(200);
      expect(captured.jsonBody).toEqual({});
      expect(captured.textBody).toBeUndefined();
    });

    it("サーバーがJSONとしてparse不能なプレーンテキストを返す場合も、jsdomは例外を投げずに200・空オブジェクトを返す", async () => {
      const { baseUrl } = await startServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("this is not html and not valid json either");
      });

      const { res, captured } = createMockResponse();
      const req = createMockRequest(`${baseUrl}/plain-text-not-html`);
      await handler(req, res);

      expect(captured.statusCode).toBe(200);
      expect(captured.jsonBody).toEqual({});
      expect(captured.textBody).toBeUndefined();
    });
  });
});
