# Project Structure

## Organization Philosophy

役割ごとにトップレベルディレクトリを分けるレイヤー型。「APIロジック（`api/`）」「配信する静的資産（`public/`）」「開発環境（`docker/`）」を明確に分離し、ルート直下にはプラットフォーム設定ファイルを置く。

## Directory Patterns

### Serverless API
**Location**: `api/`
**Purpose**: Vercelのサーバーレスファンクション。1ファイル＝1エンドポイントとし、`export default` でHTTPハンドラを公開する
**Example**: `api/ogp.ts` が `/api/ogp` に対応

### Static Frontend
**Location**: `public/`
**Purpose**: ビルドなしでそのまま配信するHTML/CSS/JS
**Example**: `index.html` / `style.css` / `script.js`

### Local Dev Environment
**Location**: `docker/`
**Purpose**: 開発環境を再現するためのDockerfileとシェルスクリプト。設定値は `_config.sh` に集約し、`build.sh` / `run.sh` から `source` する
**Example**: `sh docker/build.sh` → `sh docker/run.sh`

### Platform Config (root)
**Purpose**: `vercel.json`（ルーティング・CORSヘッダ）、`package.json`、`.vercelignore` などデプロイ／依存の設定はルート直下に置く

## Naming Conventions

- **API files**: 小文字・エンドポイント名そのまま（例: `ogp.ts`）。ファイル名がURLパスになる
- **Functions**: `camelCase`。ハンドラ本体は無名の `export default`、補助関数は動詞始まりの命名（`getUrlParameter`, `errorResponce`）
- **Shell scripts**: 用途を表す動詞（`build.sh`, `run.sh`）、共有設定は `_` 始まり（`_config.sh`）

## Code Organization Principles

- **ハンドラは分解する**: 入力の取得・検証（`getUrlParameter` / `isValidUrlParameter`）、本処理、エラー応答（`errorResponce`）を小さな関数に分け、`default` ハンドラはそれらを組み立てるだけにする
- **エラー応答を一本化**: 失敗パスは共通のエラー関数へ集約し、レスポンス形式を揃える
- **フロントとAPIの結合を薄く**: フロントエンドはAPIのURLを組み立てるだけで、レスポンス形式に強く依存しない

---
_Document patterns, not file trees. New files following patterns shouldn't require updates_
