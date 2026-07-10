import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";

/**
 * public/script.js に対するフロント特性テスト（Task 2.4）。
 *
 * 目的: 確認用フロントエンド（本スペックでは変更対象外・非改変）の操作手順・
 * 遷移が更新前後で同一であることを固定する。public/script.js は一切書き換え
 * ず、そのソースをそのまま jsdom の window へ読み込んで実行し、グローバル
 * 関数 get_ogp() 呼び出し時の window.open 呼び出し引数を検証することで、
 * 「入力欄のURLを用いて /api/ogp?url=<入力値> を別タブで開く」という
 * Requirement 1.6 の振る舞いを固定する。
 *
 * script.js のURL組み立てロジックをこのテストファイル内に書き写して独自に
 * 再実装した上で検証する、ということはしない。あくまで script.js 自身の
 * ソースを実行した結果（window.open の呼び出され方）のみを観測する
 * （design.md「frontend.test.ts」の実装方針・Implementation Notesに従う）。
 *
 * 参照:
 *   requirements.md Requirement 1 (1.6) / Requirement 3 (3.2)
 *   design.md「Characterization Suite (tests/)」frontend.test.ts の説明
 *             「Testing Strategy > Config / Frontend Tests」
 *             「Implementation Notes」（フロントテストは script.js を関数として
 *             評価する必要があるため、jsdom window へ読み込む方式を採る）
 */

// public/script.js は本タスクの境界外であり非改変。ここではソースを文字列と
// して読み込むのみで、ロジックの書き写し・再実装は行わない。
const SCRIPT_PATH = join(__dirname, "..", "public", "script.js");
const SCRIPT_SOURCE = readFileSync(SCRIPT_PATH, "utf-8");

/**
 * id="target-url" の <input>（public/index.html の該当構造を模した最小限の
 * フィクスチャ）を含む jsdom 環境を生成し、public/script.js のソースを
 * <script> 要素として挿入・実行する。
 *
 * runScripts: "dangerously" を指定しているため、document に接続されたイン
 * ラインの <script> 要素は同期的に評価され、呼び出し元に戻った時点で
 * script.js が定義するグローバル関数 get_ogp が dom.window 上に生えている。
 */
function createDomWithScript(): JSDOM {
  const dom = new JSDOM(
    `<!DOCTYPE html>
<html>
<head></head>
<body>
  <input type="url" id="target-url">
</body>
</html>`,
    { runScripts: "dangerously", url: "http://localhost/" }
  );

  const scriptEl = dom.window.document.createElement("script");
  scriptEl.textContent = SCRIPT_SOURCE;
  dom.window.document.head.appendChild(scriptEl);

  return dom;
}

describe("public/script.js フロント特性テスト（非改変のソースをjsdomで実行）", () => {
  it("入力欄のURLから /api/ogp?url=<入力値> を組み立て、window.open を _blank で呼ぶ（1.6）", () => {
    const dom = createDomWithScript();
    const input = dom.window.document.getElementById(
      "target-url"
    ) as HTMLInputElement;
    input.value = "https://example.com/";

    // script.js非改変のまま window.open のみをスタブし、呼び出し引数を観測する。
    const openSpy = vi.fn();
    dom.window.open = openSpy;

    dom.window.get_ogp();

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith(
      "/api/ogp?url=https://example.com/",
      "_blank"
    );
  });

  it("入力値をencodeURIComponent等でエスケープせず、単純な文字列結合でURLへ連結する現状の挙動を固定する", () => {
    const dom = createDomWithScript();
    const input = dom.window.document.getElementById(
      "target-url"
    ) as HTMLInputElement;
    // encodeURIComponentを適用するなら%エンコードされるはずの文字
    // （空白・&・#・マルチバイト文字）をあえて含める。
    const rawInput = "https://example.com/?q=あ いう&x=1#frag";
    input.value = rawInput;

    const openSpy = vi.fn();
    dom.window.open = openSpy;

    dom.window.get_ogp();

    // エスケープなしの単純結合であるため、"&"や空白、マルチバイト文字が
    // そのままクエリ文字列に混入する。この「改善しない」挙動自体を固定する。
    expect(openSpy).toHaveBeenCalledWith(`/api/ogp?url=${rawInput}`, "_blank");
  });

  it("get_ogp はグローバル関数として定義され、index.htmlのonsubmit=\"get_ogp()\"から呼び出し可能な形で公開される", () => {
    const dom = createDomWithScript();

    expect(typeof dom.window.get_ogp).toBe("function");
  });
});
