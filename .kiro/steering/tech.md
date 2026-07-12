# Technology Stack

## Architecture

Vercelのサーバーレスファンクション（`api/`）＋静的アセット（`public/`）で構成される。バックエンドは単一のHTTPハンドラで完結し、状態やデータストアを持たない。フロントエンドはビルド工程のない素のHTML/CSS/JSで、APIをフェッチせずURLを組み立てて別タブで開くだけの薄い作りになっている。

## Core Technologies

- **Language**: TypeScript（APIハンドラ）／ Vanilla JavaScript（フロントエンド）
- **Platform**: Vercel Serverless Functions（`@vercel/node`）
- **Runtime**: Node.js 14.x（`package.json` の `engines` で固定）

## Key Libraries

- **axios**: 対象URLのHTML取得
- **jsdom**: 取得したHTMLをパースし `head > meta` を走査
- 追加の依存は最小限に保つ方針。HTTP取得とDOMパース以外はライブラリを増やさない

## Development Standards

### Type Safety
TypeScriptで記述する。Vercelの型（`NowRequest` / `NowResponse`）を用い、クエリパラメータは配列や未定義を含みうる前提でバリデーションしてから扱う。

### Error Handling
外部URL取得やパースの失敗は握りつぶさず、`errorResponce` に集約してHTTPステータス（不正入力・取得失敗は `400`）で返す。成功時は `200` + JSON。

### Comments / Language
コード内のコメントとドキュメントは日本語で記述する（既存コードの慣習）。

## Development Environment

### Required Tools
- Node.js 14系、npm
- Vercel CLI（デプロイ／ローカル実行）
- Docker（ローカル開発環境の再現。`docker/` にビルド・実行スクリプト）

### Common Commands
```bash
# Docker image build: sh docker/build.sh
# Docker run (port 3000): sh docker/run.sh
# コンテナ内: npm install / vercel dev などでローカル起動
```

## Key Technical Decisions

- **単一責務のエンドポイント**: OGP取得のみに絞り、汎用メタタグ取得へ広げない（`property` 属性かつ `og:` 系のみ対象）
- **ビルドレス・フロントエンド**: UIはバンドラを導入せず、静的ファイルのまま配信する
- **セルフホスト前提のDocker**: 実行環境をDockerとVercelの双方で再現できるようにする

---
_Document standards and patterns, not every dependency_
