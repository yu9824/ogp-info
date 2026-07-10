# Implementation Plan

> 中核制約: **依存bump（Task 3）より前に特性テスト（Task 2）を作成し、現行ライブラリ版で緑（ベースライン）にする**。以降の更新は同一テストで振る舞い一致を機械検証する。Vitest は Node 18+ 必須のため、ベースライン検証は Node 22 上で実施する（Node 14 では実行しない）。

- [x] 1. Foundation: テスト実行基盤の用意
- [x] 1.1 型検査・テストランナー設定を導入する
  - `strict: true`・`noEmit`（型検査用）で jsdom 互換（CJS前提）の TypeScript 設定を新設する
  - Node 環境で `tests/` を対象とするテストランナー設定を新設する
  - 依存に Vitest を追加し、`test`（テスト実行）・`typecheck`（型検査）の実行コマンドを用意する
  - Observable: 単一コマンドでテストランナーが起動し、テスト収集まで到達する（`typecheck` の緑化は型移行後のため本タスクでは要求しない）
  - _Requirements: 3.4_
  - _Boundary: Characterization Suite_

- [x] 2. Core: 特性テストの作成（現行ライブラリ版でベースライン確立）
- [x] 2.1 (P) ハンドラのユニット特性テストを作成する
  - HTTP取得をモックし、固定HTMLからの抽出範囲（`head > meta[property]` のみ）・キー変換（`og:` 除去・trim）・`content` 欠落時の値 `null` を固定する
  - `url` 未指定・配列（複数指定）・空文字でそれぞれ 400・プレーンテキスト `error` を固定する
  - 取得が失敗（例外）した場合に 400・`error` を固定し、成功時は JSON 応答であることを固定する
  - Observable: 現行の OGP Handler に対しユニット特性テストが緑になり、更新前の入出力がベースラインとして固定される
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.1, 3.2, 3.5_
  - _Boundary: Characterization Suite (unit tests)_

- [x] 2.2 (P) ローカルHTTP結合の特性テストを作成する
  - 標準ライブラリのHTTPサーバで固定HTMLを返すローカルエンドポイントを立て、実HTTP取得・実DOMパースを通したハンドラ出力を固定する（HTTP取得ライブラリ自身の本文取り扱い＝responseType/エンコーディングの版差を捉える）
  - サーバが 500/非HTML を返す、または接続不可の場合に 400・`error` を固定する
  - 外部サイトへ実アクセスせず localhost 限定で完結させる
  - Observable: 現行ライブラリ版でローカル結合テストが緑になり、HTTP取得の版差ベースラインが確立される
  - _Requirements: 1.1, 1.4, 3.1, 3.2, 3.5_
  - _Boundary: Characterization Suite (integration tests)_

- [x] 2.3 (P) CORS設定のアサートテストを作成する
  - プラットフォーム設定において `/api/ogp` に `Access-Control-Allow-Origin: *` が対応することをアサートする（稼働サーバ不要）
  - Observable: CORS設定テストが緑になり、CORS挙動が設定レベルで固定される
  - _Requirements: 1.5, 3.2_
  - _Boundary: Characterization Suite (config test)_

- [x] 2.4 (P) フロントのURL組立特性テストを作成する
  - フロントのスクリプトを**非改変のまま** DOM 環境へ読み込み、入力値から `/api/ogp?url=<入力値>` を組み立てて新規タブで開く挙動（`_blank`）を固定する
  - Observable: フロント特性テストが緑になり、UI操作→遷移の挙動が固定される（機構が過剰と判明した場合はURL組立ロジックの最小ユニット検証へ縮退してよい）
  - _Requirements: 1.6, 3.2_
  - _Boundary: Characterization Suite (frontend test)_

- [ ] 3. Core: ランタイム・依存の最新化と型移行
- [ ] 3.1 対象ランタイムと依存バージョンを更新する
  - 対象ランタイムを現行LTS（Node 22 系、DOMパーサ要件を満たす 22.13 以上）に宣言する
  - Vercel実行環境の依存を現行メジャー（v5系）へ、HTTP取得・DOMパース・TypeScript を最新安定版へ更新して依存解決する
  - Observable: 依存マニフェスト／ロックが更新され、新バージョンで依存解決が成功する
  - _Requirements: 2.1, 2.2, 2.3_
  - _Boundary: Dependency Manifest_
  - _Depends: 2.1, 2.2, 2.3, 2.4_

- [ ] 3.2 ハンドラを現行型へ移行し strict 対応する
  - 非推奨のリクエスト/レスポンス型を現行型へ置換し、旧式キャストを整理する
  - `strict` 有効化で顕在化する null 型（属性取得）を、`property` 属性の存在保証を根拠とした**非null断言で解消し、実行時挙動は一切変えない**（`og:` 置換の癖・`null` 保持・エラー挙動を保存）
  - 既存の関数分割（入力取得・検証・本処理・エラー応答）を維持する
  - Observable: ハンドラが現行型でコンパイル可能になり、型検査（`typecheck`）が緑になる
  - _Requirements: 2.4, 2.5, 2.6, 1.7_
  - _Boundary: OGP Handler_
  - _Depends: 3.1_

- [ ] 3.3 更新後のベースライン再検証と版差解消（Integration）
  - 全特性テスト（ユニット・ローカル結合・CORS・フロント）を Node 22・新依存で再実行し、更新前と一致（緑）することを確認する
  - 差分検出時は Behavior Delta Resolution Policy に従い、HTTP取得/パースのオプションで**旧挙動を明示復元**する（復元不能な差分は要件衝突として要件フェーズへ差し戻す）
  - Observable: `typecheck` と全特性テストが Node 22・新依存で緑になり、外部から見た振る舞いが更新前と同一であることが確定する
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.6, 3.3_
  - _Boundary: OGP Handler, Characterization Suite_
  - _Depends: 3.2, 2.1, 2.2, 2.3, 2.4_

- [ ] 4. Docker廃止と開発手順の更新
- [ ] 4.1 (P) ローカル開発用コンテナを廃止する
  - ローカル開発専用の Docker 一式を削除し、デプロイ除外設定から Docker への参照を除去する（CI関連ファイルの除外は維持）
  - Observable: Docker 関連ファイルが存在せず、本番（Vercel）デプロイ対象・挙動が更新前と不変である
  - _Requirements: 4.1, 4.4_
  - _Boundary: Docker (削除), Deploy Ignore Config_

- [ ] 4.2 (P) ローカル開発ドキュメントを一本化する
  - README の Docker 手順を削除し、Node バージョンマネージャ＋ローカル実行（`vercel dev`）＋テスト実行によるDocker非依存の手順へ差し替える
  - Observable: README に Docker を用いない開発・ローカル実行・テスト手順が記載される
  - _Requirements: 4.2, 4.3_
  - _Boundary: README_

- [ ] 5. 継続的更新の自動化（Dependabot・CI）
- [ ] 5.1 (P) 依存の継続監視を設定する
  - npm 依存と CI（GitHub Actions）依存の両エコシステムを対象に、更新頻度を明示した Dependabot 設定を追加し、更新PRが自動作成される状態にする
  - Observable: Dependabot 設定が存在し、監視対象エコシステム（npm・github-actions）と更新頻度が明示される（github-actions 監視は 5.2 のワークフローと対で機能する）
  - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - _Boundary: Dependabot Config_

- [ ] 5.2 (P) CIで特性テストを自動実行する
  - プルリクエスト（Dependabot の更新PRを含む）と main への push で、Node 22 上で依存インストール→型検査→特性テストを実行し、失敗時にチェックを落とすワークフローを追加する
  - シークレット不要のため安全なイベント（`pull_request`）を用い、権限は最小に絞る（`pull_request_target` は使わない）
  - Observable: ワークフローが存在し、PR上で特性テストが Node 22 で自動実行され、テスト失敗時にチェックが赤になる
  - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - _Boundary: CI Workflow_
  - _Depends: 3.3_

## Implementation Notes

- Task 2.2: 現行実装（axios@0.24.0 + jsdom@16.7.0）では非HTML(2xx)レスポンスは例外を投げず200+`{}`になる（400になるのは非2xxステータスと接続失敗のみ）。axiosのforced JSON parsingは失敗時に例外化せず元文字列へサイレントフォールバックし、jsdomのnormalizeHTMLは非文字列入力を`String()`で強制文字列化してからパースするため例外が発生しない。tasks.mdの「非HTMLで400」という記述は現行実装の実際の挙動と異なるため、`tests/ogp.integration.test.ts`は推測でテストを書かず実測（200+`{}`）をベースラインとして固定した。Task 3.1/3.3: 依存更新後にこの挙動が変化しテストが赤くなった場合はBehavior Delta Resolution Policyに従うこと（期待値を新ライブラリの挙動に合わせて黙って書き換えない）。
- Task 2.3: プロジェクト直下に `.claude/settings.json`（未追跡）がサブエージェントのBash権限承認に伴うハーネス側の副産物として出現することを確認した（このkiro-impl実行セッション開始前には存在せず、`git log --all`にも履歴なし）。いずれのタスクの成果物でもなく、コミットは常に選択的staging（明示パス指定）のみを行うため意図せず混入することはない。以降のタスクレビューでは、このファイルの存在自体を境界違反として扱わないこと（実際のタスク境界はspec上のdeliverableのみで判定する）。
