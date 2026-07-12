# Gap Analysis: legacy-modernization

作成日: 2026-07-09 / 対象要件: `.kiro/specs/legacy-modernization/requirements.md`

## 1. 現状調査（Current State）

### コード資産と構成
- **API**: [api/ogp.ts](../../../api/ogp.ts) — 単一ファイル・単一ハンドラ（`export default async function`）。補助関数 `getUrlParameter` / `isValidUrlParameter` / `errorResponce` に分割。状態・データストアなし。
- **フロント**: [public/index.html](../../../public/index.html) / [public/script.js](../../../public/script.js) / [public/style.css](../../../public/style.css) — ビルドレス。`script.js` は入力欄 `#target-url` の値で `/api/ogp?url=<入力値>` を別タブで開くだけ（APIをfetchしない）。
- **プラットフォーム設定**: [vercel.json](../../../vercel.json) — `/api/ogp` の GET ルートに `Access-Control-Allow-Origin: *` を付与。
- **開発環境**: [docker/](../../../docker/) — `node:14.18.2-stretch` ベースのローカル開発専用コンテナ（vim・vercel CLI をグローバル導入）。本番はVercelサーバーレスで不使用。
- **依存**: [package.json](../../../package.json) — `engines.node: 14.x`、`@vercel/node ^1.7.4`、`axios ^0.24.0`、`jsdom ^16.7.0`、`typescript ^4.5.4`。

### 現行の観測可能な振る舞い（特性テストで固定すべき基準）
- 有効な `url` → 対象HTML取得 → `<head> > meta[property]` を抽出 → キー = `property.trim().replace("og:", "")`、値 = `getAttribute("content")` → HTTP 200・`application/json` でJSON返却。
- `.replace("og:", "")` は**非アンカー・最初の1回のみ置換**（`og:title`→`title`）。この癖も保存対象。
- `content` 属性が無い場合、値は `null` としてJSONに入る。
- `url` 未指定 / 配列 / **空文字**（`!url` により falsy）→ HTTP 400・プレーンテキスト `error`。
- 取得・パース失敗（例外）→ catch → HTTP 400・プレーンテキスト `error`。
- CORS ヘッダは `vercel.json` によりプラットフォーム層で付与（コード側では設定しない）。

### 規約
- TypeScript（APIハンドラ）／ Vanilla JS（フロント）。コメントは日本語。
- 1ファイル＝1エンドポイント。ファイル名がURLパス。関数は camelCase、ハンドラは無名 `export default`。
- **テスト・tsconfig.json・.github/ は現状すべて存在しない。**

## 2. 要件→資産マップ（Requirement-to-Asset Map）

| 要件 | 関連資産 | ギャップ | 分類 |
|---|---|---|---|
| R1 動作不変 | `api/ogp.ts`, `vercel.json`, `public/*` | 振る舞いを固定する基準（テスト）が無い | Missing |
| R2 ランタイム・依存の最新化 | `package.json`, `api/ogp.ts` | Node 14→22、`@vercel/node` v1→**v5**、axios 0.24→1.15、jsdom 16→29、TS 4.5→5.x。`NowRequest/NowResponse`→`VercelRequest/VercelResponse` | Constraint |
| R2 tsconfig | （無し） | `tsconfig.json` が存在しない | Missing |
| R3 特性テスト | （無し） | テストランナー・ネットワークモック・ハンドラ呼び出し土台が無い | Missing |
| R4 Docker廃止 | `docker/`, `README.md` | ディレクトリ削除＋READMEの手順差し替え | Constraint |
| R5 Dependabot | （無し） | `.github/dependabot.yml` が無い | Missing |
| R6 CI | （無し） | `.github/workflows/` が無い | Missing |

## 3. 外部依存の調査結果（2026-07 時点）

- **Vercel ランタイム**: `nodejs24.x / nodejs22.x / nodejs20.x` をサポート。Node 22 LTS はGA、デフォルトは最新LTS。ランタイムは `nodejs22.x` 指定（正確なマイナーはVercelが管理）。
- **@vercel/node**: 最新 **v5.8.22**（`engines.node` 制約なし）。要件の「v3系」は古い記述で、**「現行メジャー」= v5** が正。型は `VercelRequest/VercelResponse`（`Now*` は非推奨エイリアス）。移行はimport/型注釈の差し替えのみで済む見込み。devDependencyとして型と `vercel dev` に用いる（本番実行はVercelが提供）。
- **jsdom**: 最新 **v29.1.1**、`type: "commonjs"`、`engines.node: "^20.19.0 || ^22.13.0 || >=24.0.0"`。
  - **Node 22 を選ぶ場合、22.13 以上が必須**（`engines.node` のピンで担保）。
  - CommonJS のままなので、TSが `require` へ変換する現行の `import { JSDOM } from "jsdom"` はそのまま動作する見込み。
  - **Node 24 では** 依存チェーン（lru-cache の top-level await）により `require()` が失敗する既知問題あり。**Node 22 を選ぶことで回避**できる。
- **axios**: 最新 **1.15.1**。0.24→1.x の破壊的変更のうち、本コードに関係し得るのは主にparamsシリアライズ・ヘッダ形状・内部export廃止。**本コードは `axios.get(<完全URL文字列>)` ＋ `response.data` のみ**でparams/interceptor/内部exportを使わないため影響は限定的。ただしデフォルト `responseType: 'json'` のHTML応答時の挙動（JSONパース失敗→文字列フォールバック）が0.24と1.xで一致するかは**テストで固定して確認**すべき。

## 4. 実装アプローチ（Options）

### Option A: 現行構成を保った現状最新化（in-place）【推奨】
既存の単一ファイル・単一ハンドラ構成を維持したまま、型移行・依存bump・engines更新を行い、tsconfig・テスト・.github を追加する。
- ✅ 「動作不変」を最優先する本要件と最も整合。差分が小さく検証しやすい。
- ✅ 既存の関数分割方針（R2.5）をそのまま踏襲できる。
- ❌ jsdom/axios のメジャー跨ぎに伴う挙動差は残るため、特性テストによる担保が前提。

### Option B: 全面書き換え（新規実装）
ハンドラを再設計し、axios→ネイティブ`fetch`、jsdom→軽量パーサ（cheerio等）へ置換。
- ✅ 依存を削減できる。
- ❌ **`fetch`/軽量パーサはエンコーディング・リダイレクト・パース挙動が微妙に異なり、「動作不変」を破るリスクが高い**。本要件では非推奨。

### Option C: 段階実装（フェーズ分割 — Option A の実行順序）【推奨する進め方】
1. **ベースライン確立**: 現行コードに対し特性テストを整備し、スナップショットを取得（R3.1）。
2. **最新化**: engines・依存・型を一括更新し、特性テストで振る舞い一致を確認（R1/R2）。
3. **周辺整備**: Docker削除＋README更新（R4）、Dependabot（R5）、CI（R6）。
- ✅ 「更新前後の一致」を機械的に担保しながら進められる。ロールバックも容易。
- ❌ フェーズ間の順序管理が必要（tasksで表現）。

## 5. 工数・リスク（Effort / Risk）

| 領域 | Effort | Risk | 根拠 |
|---|---|---|---|
| 型移行＋依存bump＋engines更新 | S | Medium | 差分は小。ただしjsdom/axiosメジャー跨ぎの挙動差が唯一の注意点 |
| 特性テスト＋テスト基盤 | M | Medium | 新規土台（ランナー・ハンドラ呼び出し・ネットワークモック）をゼロから構築 |
| tsconfig 追加 | S | Low | @vercel/node v5 前提の標準的な設定 |
| Docker削除＋ドキュメント | S | Low | ディレクトリ削除とREADME差し替えのみ |
| Dependabot | S | Low | 定型の `dependabot.yml`（npm＋github-actions） |
| CI（GitHub Actions） | S | Low‑Medium | Node 22でテスト実行。Dependabot PRでの実行権限設定に留意 |

**全体**: S–M（実コードが極小のため、主コストはテスト基盤とCI整備）。最大リスクは「依存メジャー跨ぎ × 動作不変」で、**bump前に特性テストのベースラインを取ること（Option C の順序）で緩和**。

## 6. 設計フェーズへの申し送り

### 推奨ターゲット
- Node.js **22 系**（`nodejs22.x`／`engines.node` は jsdom 要件を満たす `>=22.13.0` 相当でピン）。
- `@vercel/node` **v5系**（要件の「v3系」表記は現行メジャー=v5へ読み替え。**要件の括弧書き修正を推奨**）。
- `axios` 1.15.x、`jsdom` 29.x、`typescript` 5.x。
- **axios・jsdom は据え置き（fetch/cheerioへ置換しない）**＝動作不変を優先。

### 決定が必要な事項（設計で確定）
- テストランナーの選定（TS/ESM 親和性から **Vitest** が有力候補、Jest も可）。
- 単一 `export default` ハンドラの単体テスト方法（モックの `req`/`res` を渡して invoke し、JSON・ステータス・エラー本文を検証）。
- ネットワーク非依存化の方式（`axios.get` をモックし固定HTMLを返す）で R3.5 を満たす。
- **CORS（`vercel.json`）の検証方法**: プラットフォーム層のため単体テストで直接検証できない。設定ファイルの不変性チェック or 軽量な統合確認のどちらにするか。
- `engines.node` のピン戦略（`22.x` だと jsdom の `>=22.13.0` を保証できない点に注意）。

### Research Needed（設計/実装で解消）
1. `@vercel/node` v5 のハンドラ/型シグネチャ確認と、`vercel dev`・ビルドに `tsconfig.json` が必須かの確認。
2. axios 1.15.x が HTML応答で 0.24 と同一の `response.data`（既定 responseType 挙動）を返すか — テストで固定。
3. jsdom 29 の `querySelectorAll("head > meta")` ＋ `getAttribute` 挙動が v16 と一致するか — テストで固定。
4. Dependabot PR に対する CI 実行の権限・シークレット設定（GitHub Actions の `pull_request` 対 `pull_request_target` 等）。

---

## 7. 設計合成（Design Synthesis）2026-07-09

### Generalization
- R1（動作不変）は横断的な不変条件であり、R2（最新化）・R5/R6（継続更新）はいずれも R1 を破らないことが成立条件。**特性テストスイートを「振る舞いオラクル」として一度設計し、R1 の定義・R3 の担保・R6 の自動検証を単一の仕組みで満たす**（重複を作らない）。

### Build vs. Adopt
- **HTTP取得・DOMパースは axios＋jsdom を据え置き（Adopt/維持）**。`fetch`・cheerio 等への置換は Reject（エンコーディング/リダイレクト/パース挙動が変わり R1 を破る）。
- **テストランナーは Vitest を採用（Adopt）**。TS/ESMをそのまま実行でき、単一コマンド（R3.4）・モジュールモック（R3.5）を標準装備。Jest も可だが TS/ESM 設定が重いため非採用。
- **ネットワーク非依存化は2層**（Adopt）: ①`axios.get` をモックしてハンドラの変換ロジックを検証、②ローカル `http` サーバ（Node標準・新規依存なし）へ実 axios で接続し、axios自身の本文取り扱い（responseType/エンコーディング）の版差も固定。②は外部サイトへアクセスしないため R3.5 を満たす。
- **Dependabot・CI はプラットフォーム標準を採用**（GitHub 公式 `dependabot.yml` / GitHub Actions）。

### Simplification
- ハンドラは**単一ファイル `api/ogp.ts` を維持**し、内部関数分割（`getUrlParameter`/`isValidUrlParameter`/`errorResponce`）もそのまま。新たな抽象層・モジュール分割は導入しない（R2.5）。
- **CORS（R1.5）は `vercel.json` の設定不変で担保**。ハンドラは CORS を扱わないため、稼働サーバを立てずに `vercel.json` のマッピングをアサートする軽量な設定テストで固定する。
- テスト用フィクスチャ（HTML）は小さいためファイル分離せずテスト内インラインを許容。

### 重要な実装制約（振る舞い保存のためのガード）
- `strict: true` 有効化により `getAttribute("property").trim()` が null 可能性で型エラーになり得るが、`property` 属性の存在は `filter(hasAttribute("property"))` で保証済み。**非null断言等で解消し、実行時挙動は一切変えない**。
- 保存すべき現行の癖（実装で「改善」してはならない）: `.replace("og:", "")` の非アンカー・最初の1回のみ置換 / `content` 欠落時の値 `null` / 空文字URLの 400 / エラー本文はプレーンテキスト `error`。
