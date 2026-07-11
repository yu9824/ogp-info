# Requirements Document

## Introduction

ogp-info（OGP抽出のサーバーレスAPI＋確認用の静的フロントエンド）は、実行環境と依存が全面的にレガシー化している。Node.js 14.x（EOL）を固定し、`@vercel/node` v1系・非推奨のリクエスト/レスポンス型・`axios` 0.x など旧世代の依存に依存しており、依存更新の自動監視（Dependabot）も、振る舞いを固定する自動テストも存在しない。加えて `docker/` にはEOLベースのローカル開発専用コンテナが残っている。

本スペックは、**外部から見た動作を一切変えないまま**、ランタイム・依存を現行LTS水準まで最新化し、既存コードをリファクタリングし、Docker を廃止し、Dependabot と CI（特性テストの自動実行）で継続的に保守可能な状態へ移行することを目的とする。主な受益者は本プロジェクトのメンテナ（開発者本人）であり、API 利用者・フロントエンド利用者から見た振る舞いは更新の前後で同一でなければならない。

「動作不変」の具体的な基準は、更新前の実装の入出力を固定した特性テスト（characterization test）によって定義・検証される。

## Boundary Context

- **In scope**:
  - `GET /api/ogp` の振る舞いを保存したままのランタイム・依存の最新化とリファクタリング
  - 更新前の入出力を固定する特性テストの整備
  - `docker/` の廃止とローカル開発手順の一本化（ドキュメント更新を含む）
  - Dependabot 設定の追加による依存の継続監視
  - CI（GitHub Actions）による特性テストの自動実行（Dependabot の更新PRを含む）
- **Out of scope**:
  - OGP 抽出機能の拡張（対象メタタグの追加、`og:` 系以外の汎用メタタグ対応など）
  - API のインターフェース変更・新規エンドポイント追加・レスポンス形式の変更
  - フロントエンドの機能追加・UI 刷新・ビルド工程の導入
  - 本番デプロイ先（Vercel サーバーレス）の変更
- **Adjacent expectations**:
  - 本番実行環境は引き続き Vercel サーバーレスであることを前提とし、その挙動（ルーティング・CORS）は変更しない
  - ローカル開発は Node バージョンマネージャ ＋ Vercel CLI（`vercel dev`）を前提とする

## Requirements

### Requirement 1: 外部から見た動作の不変性（振る舞い保存）

**Objective:** As an API 利用者 / フロントエンド利用者, I want 最新化の前後で API とフロントエンドの振る舞いが完全に同一であること, so that 依存や実行環境の刷新による影響を受けずに従来どおり利用できる

#### Acceptance Criteria

1. When 有効な `url` クエリを付与して `GET /api/ogp` を呼び出す, the OGP API shall 更新前と同一の JSON オブジェクト（`property` 属性を trim し `og:` を除去したキーと、対応する `content` 値の写像）を HTTP 200・`application/json` で返す
2. When 対象ページの `<head> > meta` に `property` 属性を持つ要素が存在する, the OGP API shall それらの要素のみを抽出対象とし、更新前と同一の抽出範囲・同一のキー変換で結果を構成する
3. If `url` クエリが未指定である、または複数指定（配列）である, then the OGP API shall 更新前と同一に HTTP 400・プレーンテキスト `error` を返す
4. If 対象 URL の取得またはパースに失敗する, then the OGP API shall 更新前と同一に HTTP 400・プレーンテキスト `error` を返す
5. The OGP API shall すべての `/api/ogp` 応答に更新前と同一の CORS ヘッダ（`Access-Control-Allow-Origin: *`）を付与する
6. The 確認用フロントエンド shall 更新前と同一の操作手順・表示・遷移（入力欄の URL を用いて `/api/ogp?url=<入力値>` を別タブで開く）を提供する
7. While ランタイム・依存・コード構造を変更する, the システム shall 上記1〜6の観測可能な振る舞いを一切変更しない

### Requirement 2: ランタイム・依存の最新化とリファクタリング

**Objective:** As a メンテナ, I want ランタイムと依存を現行 LTS 水準まで引き上げ、既存コードを整理すること, so that セキュリティ更新と保守を継続でき、レガシー環境から脱却できる

#### Acceptance Criteria

1. The プロジェクト shall 対象ランタイムとして現行 LTS（Node.js 22 系）を宣言する
2. The プロジェクト shall Vercel サーバーレス実行環境の依存を現行メジャー（`@vercel/node` v5 系）へ更新する
3. The プロジェクト shall HTTP 取得・DOM パース・TypeScript を含む主要依存を最新の安定版へ更新する
4. Where 更新対象に非推奨の API・型が含まれる, the プロジェクト shall それらを現行の推奨 API・型へ移行する
5. When コードをリファクタリングする, the プロジェクト shall 既存の関数分割方針（入力取得・検証・本処理・エラー応答の分離）を維持し、外部から見た振る舞いを変えない
6. While 依存・ランタイムを更新する, the プロジェクト shall Requirement 1 の振る舞い不変性を維持する

### Requirement 3: 特性テストによる動作保証

**Objective:** As a メンテナ, I want 更新前の入出力を固定する特性テストを持つこと, so that 最新化やその後の依存更新で振る舞いが変わっていないことを自動で確認できる

#### Acceptance Criteria

1. Before ランタイム・依存の更新を行う, the 開発プロセス shall 更新前の実装に対する特性テストのベースラインを確立する
2. The テストスイート shall 成功応答・入力不正時のエラー・取得/パース失敗時のエラー・抽出範囲・キー変換・CORS 挙動を代表する入出力を固定する
3. When 特性テストを実行する, the テストスイート shall 更新前後で観測可能な振る舞いが一致することを検証し、不一致がある場合は失敗する
4. The テストスイート shall 単一のコマンドで実行可能である
5. Where 外部ネットワーク取得を伴う振る舞いを検証する, the テストスイート shall 外部サイトへの実アクセスに依存せず再現可能な形で検証する

### Requirement 4: Docker の廃止とローカル開発手順の一本化

**Objective:** As a メンテナ, I want ローカル開発専用の Docker を廃止し開発手順を一本化すること, so that EOL ベースイメージの保守負担をなくし、開発環境をシンプルに保てる

#### Acceptance Criteria

1. The プロジェクト shall `docker/` ディレクトリおよびそれに付随するファイル・参照を削除する
2. When 開発者がドキュメントに従ってローカル環境を構築する, the ドキュメント shall Docker を用いずに開発・ローカル実行できる手順（Node バージョンマネージャ ＋ Vercel CLI）を示す
3. The プロジェクト shall Docker 廃止に伴い、更新前を参照するドキュメント（README 等）を新しい開発手順へ更新する
4. While Docker を廃止する, the プロジェクト shall 本番（Vercel サーバーレス）のデプロイ挙動を変更しない

### Requirement 5: Dependabot による依存の継続監視

**Objective:** As a メンテナ, I want Dependabot で依存更新を自動監視すること, so that 再びレガシー化する前に更新を継続的に取り込める

#### Acceptance Criteria

1. The リポジトリ shall Dependabot 設定を備え、npm 依存の更新を継続的に監視する
2. When 監視対象の依存に新しいバージョンが公開される, the Dependabot shall 更新用のプルリクエストを自動作成する
3. Where CI ワークフローが依存（GitHub Actions 等）を持つ, the Dependabot shall それらのエコシステムも監視対象に含める
4. The Dependabot 設定 shall 監視対象エコシステムと更新頻度を明示する

### Requirement 6: CI による特性テストの自動検証

**Objective:** As a メンテナ, I want CI で特性テストを自動実行すること, so that 依存更新（Dependabot の PR を含む）ごとに動作不変を自動で担保できる

#### Acceptance Criteria

1. When プルリクエストが作成・更新される, the CI ワークフロー shall 特性テストを自動実行する
2. When Dependabot が更新プルリクエストを作成する, the CI ワークフロー shall 当該 PR に対しても特性テストを自動実行する
3. If 特性テストが失敗する, then the CI ワークフロー shall 当該実行を失敗として報告する
4. The CI ワークフロー shall Requirement 2 で宣言した対象ランタイム（Node.js 22 系）上でテストを実行する
