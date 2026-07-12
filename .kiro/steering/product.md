# Product Overview

任意のWebページのURLを渡すと、そのページのOGP（Open Graph Protocol）メタタグを抽出してJSONで返すサーバーレスAPI。あわせて、ブラウザからURLを入力して結果を確認できる軽量な静的フロントエンドを提供する。

主な利用者は、リンクプレビュー生成やメタ情報取得を必要とする開発者、およびOGP設定を手早く確認したい制作者。

## Core Capabilities

- **OGP抽出API**: `GET /api/ogp?url=<対象URL>` で対象ページを取得し、`<head>` 内の `og:*` メタタグを `{ property: content }` 形式のJSONで返す
- **プレフィックス正規化**: `og:` プレフィックスを除去したキー（例: `og:title` → `title`）で返却する
- **CORS対応**: `Access-Control-Allow-Origin: *` を付与し、ブラウザやフロントエンドから直接呼び出せる
- **確認用UI**: URLを入力して結果を別タブで開くだけの最小構成のWebフォーム

## Target Use Cases

- リンクカード／プレビュー生成のためのメタ情報取得
- 自サイトのOGP設定が正しく出力されているかの目視確認
- 他サービスへ組み込むためのOGP取得バックエンド

## Value Proposition

依存を最小限に抑えた単一エンドポイントで、OGP取得という単機能を手軽にセルフホストできる。Vercelへそのままデプロイ可能で、ローカルはDockerで再現できる。

---
_Focus on patterns and purpose, not exhaustive feature lists_
