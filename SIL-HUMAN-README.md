# Semantic Instruction Language / Semantic UI Language (SIL/SUI) v0.3 — 完全文法・運用ガイド

更新日: 2026-07-26
対象実装: SIL Local Converter / CLI / SIL Runner / SIL Writer GPT
自然言語入力: 多言語（日本語を含む）。意味仕様・識別子は英語へ正規化し、原文言語はprovenanceへ保存。

## 1. SILとは

Semantic Instruction Language（SIL）とSemantic UI Language（SUI）は、AIへ渡す依頼やUI設計を、目的・対象・操作・入力・出力・制約・検証・失敗時動作へ分解する宣言型DSLです。v0.3では4スペースのPython風インデント構文、statement ID、scope、provenance、bundle DAG、Patch、Rule、Data Policy、component graphを追加しました。Python風でもPythonコードではありません。

SILそのものはコードを実行しません。構文が正しいことと、AIへ実行を許可できることは別です。

変換経路は次のとおりです。

```text
English instruction
  -> deterministic analysis
  -> Semantic IR
  -> canonical .sil
  -> quantized SIL / generated prompt / guarded OpenCode handoff
```

Semantic IRが意味上の正本です。

## 2. 最小構文

```sil
task AddLoginScreen {
  goal: feature.add
  target: screen.login
  action: implement
}
```

形式文法は次のとおりです。

```ebnf
Program       = Task ;
Task          = "task", Identifier, "{", { Statement }, "}" ;
Statement     = Field, ":", SemanticRef, [ ";" ] ;
Field         = "goal" | "target" | "action" | "input" | "output"
              | "require" | "prefer" | "forbid" | "verify" | "on_failure" ;
SemanticRef   = Identifier, { ".", Identifier } ;
Identifier    = Letter, { Letter | Digit | "_" } ;
```

### パーサーが強制する規則

- 1ファイルに1つの`task`だけを書きます。
- 開始行は`task Identifier {`だけで構成します。
- 終了の`}`は単独行に置きます。
- `}`の後にはコメントと空行以外を書けません。
- 1つの文は1行で、`field: semantic.reference`形式です。
- 行末セミコロンは任意です。
- `//`以降は行コメントです。
- フィールド名は小文字で、定義済みの10種類だけを使用できます。
- Task IDとSemanticRefの各セグメントはASCII英字で始め、続けてASCII英数字または`_`を使えます。
- SemanticRefのセグメント区切りは`.`です。
- 空白、ハイフン、引用符、配列、関数呼び出し、変数代入はSemanticRefに使えません。
- ソース全体の上限は100,000文字です。
- CRLFはLFへ正規化されます。

### 推奨する正規表記

構文上許容される範囲より狭い、次の書式を推奨します。

- Task ID: `PascalCase`。例: `BuildProductSearch`
- SemanticRef: 小文字`snake_case`セグメント。例: `project.documentation`
- インデント: 半角スペース2個
- 行末セミコロン: 省略
- 1つのSemanticRefに1つの意味だけを持たせる
- フィールドは正規順序で並べる

## 3. 10フィールド

| SIL | 意味 | 個数 | Semantic IR |
| --- | --- | ---: | --- |
| `goal` | 最終的に達成したい状態 | 1 | `goal` |
| `target` | 操作対象の機能・部品・成果物 | 1 | `target` |
| `action` | 対象へ適用する操作 | 1 | `action` |
| `input` | 使用するデータ、ファイル、既存コード、技術コンテキスト | 複数 | `inputs[]` |
| `output` | 生成すべき成果物 | 複数 | `outputs[]` |
| `require` | 必須条件、不変条件、数値上限、網羅範囲 | 複数 | `required[]` |
| `prefer` | 必須ではない設計上の希望 | 複数 | `preferred[]` |
| `forbid` | 禁止する変更・結果・操作 | 複数 | `forbidden[]` |
| `verify` | 成功を観測するテスト・受入条件 | 複数 | `verification[]` |
| `on_failure` | 失敗後の停止・再試行・復旧方針 | 複数 | `failureHandling[]` |

`goal`はSemantic IRの必須フィールドです。`target`と`action`は構文上省略できますが、具体的な実行依頼では通常必要です。

`goal`、`target`、`action`を重複させると、最初の値だけが採用され、`duplicate-singleton`警告が出ます。複数値フィールドの同一参照重複は`duplicate-reference`警告です。

### 正規フィールド順序

```text
goal
target
action
input
output
require
prefer
forbid
verify
on_failure
```

フォーマッターは必ずこの順序で出力します。複数値は元の意味順を維持します。

## 4. SemanticRefの設計

SemanticRefは自然言語の文章ではなく、意味を分解した安定参照です。

```sil
require: response.fast
require: input.validate
forbid: change.breaking
verify: tests.pass
```

複数の独立した意味を1つへ詰め込まないでください。

```text
Bad:  fast_secure_search_with_tests
Good: response.fast + security.safe + tests.pass
```

必須条件、希望、禁止、検証を混同しません。

```text
must / required / preserve       -> require
should / preferably / if possible -> prefer
must not / never / do not        -> forbid
test / confirm / verify          -> verify
all / every / each               -> coverage requirement + observable verification
```

## 5. Core v0.1コードブック

Core v0.1は英語のみの決定的コードブックです。

- 総数: 10,000 active entries
- 10 namespaceそれぞれ: 1,000 entries
- version: `0.1`
- 各entry: `id`, `namespace`, `key`, `code`, `description`, `aliases`, `colorCategory`, `version`, `status`
- 既存コード割当は同じv0.1内で安定

コードprefix:

| Namespace | Prefix |
| --- | --- |
| goal | `G` |
| target | `T` |
| action | `A` |
| input | `I` |
| output | `O` |
| require | `R` |
| prefer | `P` |
| forbid | `X` |
| verify | `V` |
| on_failure | `F` |

AI・開発系の主要100語は、対象用`T90000`〜`T90099`とコンテキスト入力用`I90000`〜`I90099`のペアで登録されています。SIL、Ollama、OpenCode、Qwen、Qwen3.6、GPT、Claude、Gemini、Llama、MCP、TypeScript、Python、React、Docker、GitHub、PostgreSQL、JSONなどを含みます。

登録済みかどうかは、見た目から推測せずコードブック検索で確認します。

```bash
npm run cli -- codebook search 'Ollama' --namespace input --limit 10
npm run cli -- codebook search 'project documentation' --namespace target --limit 10
```

## 6. 未登録参照と損失なし拡張

登録語彙で表現できない意味を、弱い既存プリセットへ無理に置き換えてはいけません。具体的な未登録SemanticRefを使用します。

```sil
goal: knowledge_set.generate
target: language_learning.sets
input: attachment.product_specification
require: coverage.exhaustive
```

未登録参照は構文エラーではありません。validatorは`unknown-reference`警告を出し、lossless quantizationは拡張tokenとして保持します。

ただし、`goal`、`target`、`action`の未登録参照は受信側との共有意味が保証されないため、execution readinessでは追加確認対象になります。

## 7. 人間向け英語プロンプト文型

自由文も受け付けますが、最も安定する形式はラベル付きです。

```text
Goal: Add paginated product search.
Target: Product search endpoint in the catalog service.
Action: Implement.
Inputs:
- text query
- category filter
- page size
- cursor
Outputs:
- paginated product list
- next cursor
Requirements:
- validate all inputs
- keep response latency under 200 ms
- preserve backward compatibility
Preferences:
- keep the change minimal and modular
Forbidden:
- expose internal inventory costs
- modify the checkout API
Verification:
- unit tests pass
- integration tests pass
- pagination order is stable
- response latency stays under 200 ms
On failure:
- roll back changes
- preserve diagnostics
- retry once, then abort
```

### 認識するラベル別名

| SIL field | Accepted labels |
| --- | --- |
| goal | `Goal`, `Objective`, `Outcome` |
| target | `Target`, `Scope`, `Component` |
| action | `Action`, `Operation` |
| input | `Input`, `Inputs`, `Context` |
| output | `Output`, `Outputs`, `Deliverable`, `Deliverables` |
| require | `Requirement`, `Requirements`, `Constraint`, `Constraints` |
| prefer | `Preference`, `Preferences`, `Preferred` |
| forbid | `Forbidden`, `Prohibition`, `Prohibitions`, `Do not` |
| verify | `Verification`, `Verify`, `Checks`, `Acceptance criteria` |
| on_failure | `On failure`, `Failure handling`, `Recovery` |

ラベルは大文字小文字を区別しません。`#`〜`###`のMarkdown headingも許容します。複数値には`-`、`*`、`+`、番号付きリストを使えます。非リストの複数値は改行、`;`、`,`、文脈上の`and`で分割されます。

`goal`、`target`、`action`セクションで複数項目を書いた場合は最初の1項目だけが対象です。

## 8. 自然言語入力の境界

- v0.3の自然言語入力は多言語であり、日本語も受け付けます。ローカルの決定論的adapterが対応する範囲は英語意味仕様へ変換し、未対応または低信頼の文は`adapter_unavailable`として残します。
- 原文を無断で外部翻訳サービスへ送信しません。原文言語、正規化言語、出力識別子言語はprovenance/metadataで分離します。
- SILソース自体は自然言語判定を通らず、ASCII識別子として直接parseできます。
- 1プロンプトには1目的を推奨します。
- 数値には単位を書きます。例: `under 200 ms`, `coverage at least 90 percent`。
- 製品名・モデル名・版番号は正確に書きます。例: `Ollama`, `OpenCode`, `Qwen3.6`。

## 9. 決定的な英語変換規則

変換はLLM推論ではなく、セクション、語形正規化、否定scope、phrase rules、parameter rules、コードブック合成、固有名詞検出を組み合わせます。

### 9.1 Goal

| English cue | SIL |
| --- | --- |
| summarize / summarise | `content.summarize` |
| classify | `content.classify` |
| fix / repair / resolve a bug, defect, issue | `bug.fix` |
| add / build / create / implement | `feature.add` |
| create/write/generate/produce/build a guide, tutorial, manual, documentation, instructions | `documentation.create` |

### 9.2 Target

| English cue | SIL |
| --- | --- |
| login screen/page/form/view | `screen.login` |
| user authentication / auth / login | `user.authentication` |
| product search | `product.search` |
| API endpoint / endpoint | `api.endpoint` |
| project documentation / docs | `project.documentation` |
| guide / tutorial / manual / documentation / instructions | `project.documentation` |

裸の`API`より明示的なdocumentation targetが優先されます。

### 9.3 Action

| English cue | SIL |
| --- | --- |
| update / modify / edit / change / fix | `modify` |
| delete / remove | `delete` |
| add / build / create / implement | `implement` |
| create a guide/documentation artifact | `documentation.create` |

### 9.4 Input

| English cue | SIL |
| --- | --- |
| user/search/text query | `user.query` |
| email address | `user.email` |
| password | `user.password` |
| category filter | `category.filter` |
| page size | `pagination.page_size` |
| pagination/starting cursor | `pagination.cursor` |
| repository/repo/source files | `repository.files` |

技術名と固有名詞もinputコンテキストとして追加されます。詳細は「固有名詞・技術語」を参照してください。

### 9.5 Output

| English cue | SIL |
| --- | --- |
| product list / list of products | `product.list` |
| authenticated session | `auth.session` |
| next cursor | `pagination.next_cursor` |
| code patch / changed files | `code.patch` |
| test/verification report | `test.report` |
| guide/tutorial/manual/documentation/instructions | `documentation.artifact` |

### 9.6 Requirement

| English cue | SIL |
| --- | --- |
| preserve existing behavior / without breaking existing behavior | `existing.behavior.preserve` |
| responsive UI/layout/design | `ui.responsive` |
| fast response / low latency | `response.fast` |
| validate input/email/password/query/payload/request | `input.validate` |
| hash passwords | `password.hash` |
| safe errors | `error.safe` |
| backward compatibility | `existing.behavior.preserve` |
| type-safe / strict types | `type.safety` |
| preserve existing schema | `schema.preserve` |

### 9.7 Preference

| English cue | SIL |
| --- | --- |
| simple code/implementation/solution | `code.simple` |
| minimal/smallest change, patch, diff | `change.minimal` |
| modular design/architecture/code | `architecture.modular` |

### 9.8 Forbidden

| English cue | SIL |
| --- | --- |
| do not expose secrets | `secret.expose` |
| do not hardcode secrets | `secret.hardcode` |
| no breaking changes | `change.breaking` |
| do not store plaintext passwords | `password.plaintext_store` |
| do not modify checkout API/endpoint | `checkout_api.modify` |
| do not modify unrelated files | `unrelated_files.modify` |
| do not add a new dependency | `dependency.add` |

### 9.9 Verification

| English cue | SIL |
| --- | --- |
| tests/test suite pass | `tests.pass` |
| successful login / login succeeds | `login.success` |
| reject invalid credentials | `invalid_credentials.reject` |
| unit tests | `unit_tests.pass` |
| integration tests | `integration_tests.pass` |
| build passes | `build.pass` |
| typecheck passes | `typecheck.pass` |
| lint passes / no lint errors | `lint.pass` |
| stable pagination order | `pagination.order_stable` |

### 9.10 On failure

| English cue | SIL |
| --- | --- |
| roll back transaction | `transaction.rollback` |
| roll back/revert changes, patch, work | `change.rollback` |
| preserve diagnostics / keep logs | `diagnostics.preserve` |
| abort / stop / halt / do not continue | `task.abort` |

## 10. 数値parameter rules

認識した数値はSemanticRefへ機械的に埋め込みます。小数点は`_`へ変換します。

| Pattern example | Result |
| --- | --- |
| `latency under 200 ms` | `require: latency.max_200_ms`および文脈により`verify` |
| `response latency at most 1.5 seconds` | `latency.max_1_5_seconds` |
| `timeout within 30 seconds` | `require: timeout.max_30_seconds` |
| `coverage at least 90 percent` | `verify: coverage.min_90_percent` |
| `200 ms latency budget` | `verify: latency.max_200_ms` |
| `page size 50` | `input: pagination.page_size_50` |
| `return at most 20 results` | `require: result.max_20_result` |
| `retry 2 times` | `on_failure: retry.max_2` |
| `retry once` / `allow one retry` | `on_failure: retry.max_1` |

時間単位は`ms`、`seconds`、`minutes`へ正規化されます。

## 11. 否定とscope

`do not`, `does not`, `must not`, `should not`, `never`, `without`, `avoid`, `prevent`, `forbid`, `no`, `not`は、同じ節の肯定規則を抑制します。

```text
Do not add authentication.
```

この文から肯定の`feature.add`や`user.authentication`を選びません。

```text
Fix login without tests.
```

この文から`verify: tests.pass`を追加しません。

節境界は`. ! ? ;`、改行、調整接続の`and / but / then / while`、一部のcommaで判定されます。異なる節のconceptとoperationを誤って組み合わせないようにします。

## 12. コードブック合成

生成された汎用presetは、同一節にconceptとvariantの全構成語がある場合だけ候補になります。

```text
Create an encrypted account service.
```

```sil
goal: account.create
target: account.service
action: account.create
require: account.encrypted
```

部分一致やsubstring一致だけでは選びません。`author`から`auth`を、`contest`から`test`を、`breakfast`から`fast`を取り出しません。goal/actionはtarget conceptとの整合性が高い候補を優先します。

## 13. 固有名詞・技術語

### 既知の100技術語

100語のcurated catalogは、大文字小文字を考慮した最長一致で認識します。長い表記を優先するため、`Qwen3.6`を`Qwen3`と`.6`へ分割しません。

```text
SIL       -> input: language.sil
ollama    -> input: platform.ollama
OpenCode  -> input: tool.opencode
Qwen3.6   -> input: model.qwen3_6
TypeScript -> input: language.typescript
```

版番号を含むモデル名は版番号込みの参照として保持します。

明示的な`Target:`セクション内に既知技術名がある場合は、登録済み`technology.*` targetにもなり、同時にinputコンテキストへ残ります。

```text
Target: Ollama
```

```sil
target: technology.ollama
input: platform.ollama
```

### 未登録固有名詞

次を固有名詞候補として検出します。

- 2文字以上の大文字acronym
- `OpenCode`, `TypeScript`, `NovaSDK`のようなmixed case
- `Model4`, `Qwen3.6`のようなversioned name
- `on`, `using`, `with`, `via`, `for`, `in`, `from`の後にあるTitleCase name

未知語は損失なし`context.*`へ変換します。

```text
AcmeCloud -> input: context.acmecloud
NovaSDK   -> input: context.novasdk
```

`Goal`, `Target`, `API`など、構造ラベルまたは一般的な技術略語の一部は誤検出防止のため除外します。`Go`のような短い名称は正しい大文字小文字のときだけ技術名として扱います。

## 14. 構造化入力と候補選択

- ラベル付きsection内の通常候補は、そのsectionと同じSIL fieldだけが採用されます。
- section一致候補には強い優先度が付きます。
- 未解釈のsection itemは`extension.<meaningful_words>`として損失なし保持されます。
- guide/documentation成果物と固有名詞コンテキストは、`Goal:`文中に書かれていても捨てない特別なcross-field enrichmentです。
- `goal`、`target`、`action`は最高順位の1候補だけを採用します。
- 複数値fieldでは同一値と重複spanを除外し、source orderを維持します。
- 通常の複数値fieldは最大8候補、inputは技術コンテキストを保持するため最大64候補です。

自然言語から確かな候補が見つからない場合の機械的fallback:

```text
goal   -> task.execute
target -> instruction.request
action -> implement
```

fallbackは変換を成立させるための仮値であり、execution readinessでは未指定扱いになります。

## 15. Validator

主な診断:

| Code | Severity | Meaning |
| --- | --- | --- |
| `missing-goal` | error | goalがない |
| `missing-target` | warning | targetがない |
| `missing-action` | warning | actionがない |
| `duplicate-singleton` | warning | goal/target/action重複 |
| `duplicate-reference` | warning | 複数値の同一参照重複 |
| `unknown-reference` | warning | コードブック未登録。lossless保持可能 |
| `version-mismatch` | error | IRとコードブックversion不一致 |
| `conflicting-reference` | error | 同一参照がrequireとforbidの両方にある |
| `invalid-ir` | error | Semantic IR schema違反 |

errorが1件でもあると`valid: false`です。warningだけなら構造上はvalidです。

## 16. Execution readiness

`valid: true`は実行許可ではありません。coding-agent readinessは次を別途確認します。

### Blocker

- goalなし、または`task.execute`等のfallback
- targetなし、または`instruction.request`等のgeneric target
- actionなし
- outputなし
- verifyなし
- validation error
- 場合により共有解釈できないcore goal/target/action

### Warning

- inputなし
- require / prefer / forbidがすべてない
- on_failureなし
- default action
- 精密だが未登録のcore reference

scoreは`100 - blocker数*18 - warning数*7`を0〜100へclampします。

| Status | 条件 |
| --- | --- |
| `blocked` | blockerが1件以上 |
| `review` | blockerなし、warningあり |
| `ready` | blocker、warningともになし |

`safeToExecute`はblockerが0のときだけtrueですが、`ready`でも人間reviewなしの自動実行命令ではありません。

不足から予測するfailure mode:

- wrong scope
- undefined deliverable
- false success
- invented context
- unbounded change
- partial state
- semantic decoding gap

blocked handoffは`Execution authorized: NO`とし、下流agentへtool利用、repository調査、編集、実装を禁止します。返答protocolは`SIL_READINESS_BLOCKED`です。

## 17. Quantized SIL

形式:

```text
@<codebook-version>|<token>|<token>|...
```

lossless modeはTask IDを`~d:<base64url>`で保持します。未登録参照のmarker:

| Field | Marker |
| --- | --- |
| goal | `~g:` |
| target | `~t:` |
| action | `~a:` |
| input | `~i:` |
| output | `~o:` |
| require | `~r:` |
| prefer | `~p:` |
| forbid | `~x:` |
| verify | `~v:` |
| on_failure | `~f:` |

`lossless`はすべての未登録参照を保持します。`compact`は未登録の任意参照を省略できますが、`require`と`forbid`は常に保持します。

dequantize時はversion一致が必須です。未知codeと未知extension markerは警告され、推測解釈されません。

## 18. Prompt color categoryと300ブロック

| Number | Category |
| ---: | --- |
| 0 | unclassified / black |
| 1 | structure |
| 2 | grammar |
| 3 | verb |
| 4 | noun |
| 5 | data |
| 6 | constraint |
| 7 | logic |
| 8 | verification |
| 9 | recovery |

Core 10,000 entriesはすべて3〜9へ分類済みです。判定できないcustom phraseは0のままです。

local interpreterには300個のSIL-aware blockがあります。内訳はstructure、function words、verbs、nouns、data、constraints、logic、verification、recovery、および100個のAI／開発用語です。

- click: textareaの現在caretまたはselectionへ挿入
- drag: drop位置から求めたcaretへ挿入
- blockなしの自由入力も可能
- 最長phrase一致で色付け
- semantic categoryが競合するphraseは黒
- sidebar suggestionはactive section、未入力role、直近phrase、既出phraseから決定

## 19. CLI

```bash
npm run cli -- parse task.sil
npm run cli -- validate task.sil
npm run cli -- compile instruction.txt
npm run cli -- compile instruction.txt --json
npm run cli -- compile instruction.txt --raw-prompt
npm run cli -- quantize task.sil
npm run cli -- quantize task.sil --compact
npm run cli -- dequantize '@0.1|...'
npm run cli -- format task.sil
npm run cli -- codebook stats
npm run cli -- codebook search 'query' --namespace input --limit 20 --offset 0
```

`-`をinput pathにするとstdinを読みます。`validate`のexit code 0は構造validを示すだけで、`executionReady`を別途確認する必要があります。`compile`は既定でguarded OpenCode handoffを出力します。

## 20. 完成例

English prompt:

```text
Goal: Create a guide on how to implement SIL on Ollama with Qwen3.6.
Target: Project documentation.
Action: Create.
Inputs:
- SIL
- Ollama
- Qwen3.6
Outputs:
- implementation guide
Requirements:
- preserve every SIL example exactly
Forbidden:
- invent unsupported syntax
Verification:
- every example validates
On failure:
- preserve diagnostics
- stop
```

Canonical SIL:

```sil
task ProjectDocumentationTask {
  goal: documentation.create
  target: project.documentation
  action: documentation.create
  input: language.sil
  input: platform.ollama
  input: model.qwen3_6
  output: documentation.artifact
  require: example.preserve
  forbid: syntax.unsupported_invent
  verify: example.validated
  on_failure: diagnostics.preserve
  on_failure: task.abort
}
```

未登録参照が含まれる場合でも、具体性を失わせずlosslessに保持します。登録済みであるとの主張やquantized codeの手書き推測は行わず、実際のコードブックとcompilerで確認してください。
