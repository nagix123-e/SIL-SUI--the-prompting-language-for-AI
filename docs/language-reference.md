# SIL/SUI language reference · v0.5

v0.5 is the canonical indentation-sensitive syntax; v0.1/v0.2 brace syntax and v0.3/v0.4 contracts remain compatible. Natural-language input may be multilingual (including Japanese), but semantic identifiers are normalized to English through a configured adapter and the original language is retained in provenance. A Runner must report an unavailable adapter rather than silently translating or executing input. See [the v0.5 UI layer and continuation specification](../gpt-knowledge/14-v0.5-ui-layers-and-continuation.md) and [the v0.4 bounded-loop specification](../gpt-knowledge/13-v0.4-bounded-loops.md).

## Natural-language prompt form

Free-form prose remains supported. For the highest deterministic coverage, use role labels followed by one value or a bullet list:

`Goal`, `Target`, `Action`, `Inputs`, `Outputs`, `Requirements`, `Preferences`, `Forbidden`, `Verification`, and `On failure`.

Accepted label aliases include `Objective`, `Scope`, `Operation`, `Context`, `Deliverables`, `Constraints`, `Acceptance criteria`, `Checks`, `Recovery`, and `Failure handling`. The role label is authoritative: for example, `unit tests` under `Verification` cannot be misclassified as an input or implementation action.

The English analyzer uses five deterministic stages:

1. split labeled sections, sentences, coordinated action frames, and bullet-list items;
2. apply namespace-specific phrases and normalized lexical variants;
3. compose codebook concepts and variants within the correct semantic role;
4. preserve explicit unmatched details as readable lossless extension references.
5. retain recognized technical names and detected proper nouns as lossless `input` context.

Known names use classified references such as `language.sil`, `platform.ollama`, and `model.qwen3_6`. A model-version suffix is preserved rather than collapsed to its family. Unknown acronym, mixed-case, versioned, or context-position proper nouns use a normalized `context.*` reference. If a curated technology appears under an explicit `Target:` label, it also selects the registered `technology.*` target while remaining present in context.

Numeric parameters retain their value and unit when recognized. Current parameter families include latency and timeout maxima, coverage minima, page sizes, result limits, and retry counts. For example, `latency under 200 ms` becomes `latency.max_200_ms`, while `retry once` becomes `retry.max_1`. These values remain lossless extension references when the finite core codebook does not contain the exact quantity.

### Prompt-block metadata and suggestions

The local interpreter exposes exactly 300 English prompt blocks, including function words such as `to`, `the`, `with`, and `should`, plus 100 curated AI and development terms. Clicking inserts at the textarea's current caret; dragging continues to insert at the drop-derived caret.

Core codebook entries carry a numeric `colorCategory` used by the prompt highlighter. Values are `0` unclassified/black, `1` structure, `2` grammar, `3` verb, `4` noun, `5` data, `6` constraint, `7` logic, `8` verification, and `9` recovery. Namespace mapping assigns all current 10,000 entries; custom or future entries may remain `0` when no existing category is defensible. Longest matching phrases win, and phrases with conflicting category evidence remain black.

The interpreter's optional prompt blocks are authored from the same ten SIL roles. A block records:

- its visible English phrase and inserted text,
- its grammatical or semantic color category,
- the SIL fields in which it is useful, and
- any registered SemanticRef or intentional lossless extension it represents.

Suggestions are deterministic. The scorer prioritizes the active labeled section, the next missing role, cues in the most recent phrase, essential-vocabulary weight, and phrases not already present. It does not call a language model or execute the described task. Blocks are an authoring aid only; ordinary free text remains a first-class input.

## Grammar

```ebnf
Program       = Task ;
Task          = "task", Identifier, "{", { Statement }, "}" ;
Statement     = Field, ":", SemanticRef, [ ";" ] ;
Field         = "goal" | "target" | "action" | "input" | "output"
              | "require" | "prefer" | "forbid" | "verify" | "on_failure" ;
SemanticRef   = Identifier, { ".", Identifier } ;
Identifier    = Letter, { Letter | Digit | "_" } ;
```

Line comments begin with `//`. A single-contract SIL v0.1 file contains one task.

## SIL/SUI bundle documents

The Runner also accepts one source document containing exactly one `task` declaration followed or preceded by one or more named `ui` declarations. This is a **bundle document**: each declaration keeps its own SIL or SUI grammar and version, while the bundle layer resolves their relationships.

```sil
task BuildShogiGame {
  version: 0.2
  goal: feature.add
  target: game.shogi
  action: implement
  input: ui_spec.ShogiGameScreen
  output: game.board.state
  verify: tests.pass
  on_failure: task.abort
  bind: output.game.board.state -> ui.ShogiGameScreen.board
}

ui ShogiGameScreen {
  version: 0.2
  screen: game.shogi
  component: board
  verify: render.complete
  on_failure: task.abort
}

ui PromotionDialog {
  version: 0.2
  screen: dialog.promotion
  component: promotion_choices
  verify: render.complete
  on_failure: task.abort
}
```

Bundle rules:

- exactly one `task` declaration is allowed;
- UI declaration names must be unique;
- `input: ui_spec.Name` must resolve to a bundled `ui Name` declaration. UI references are case-insensitive and treat `_` as a naming-style separator, so `ui_spec.shogi_game_screen` resolves to `ui ShogiGameScreen`;
- a v0.2 `bind` target must resolve to the named v0.2 UI and one of its declared components; and
- no contract is executed merely because the bundle validates.

`sil parse`, `sil validate`, `sil compile`, and `sil format` detect a multi-contract document automatically. The existing single-contract parsers remain strict by design, so callers that directly use `parseSil`, `parseSui`, or `parseV02` should keep passing one declaration at a time.

Alongside `task`, `ui`, and `semantic`, a bundle accepts reusable top-level v0.2 named blocks: `parameter`, `model`, `example`, `token`, `breakpoint`, `a11y`, and `transition`. They are validated with the same structural rules as their nested form and are forwarded in the compiled handoff as shared declarations. A shared `parameter` must declare `type` plus `value`, `source`, or `required`.

### Local contract references

Not every meaningful reference needs a Core entry or a separate semantic declaration. Bundle validation resolves the following as local contract references while preserving their literal spelling:

- `parameter.Name`, `model.Name`, `example.Name`, `token.Name`, `breakpoint.Name`, `a11y.Name`, and `transition.Name` when the matching shared declaration exists;
- `ui.*` values that are declared by a bundled v0.2 UI;
- conventional verification labels ending in `.pass`, `.correct`, `.complete`, `.visible`, `.responsive`, `.no_state_change`, `.matches`, or `.applies`;
- standard deliverables `code.patch` and `test.report`; and
- unregistered `prefer` references, which are non-binding local preferences.

These are reported as `local_contract_reference`, never as Core registration. A v0.2 bundle becomes `executionReady: true` when its required task fields are present. Unregistered precise terms remain in `unregisteredReferences`, make `semanticInteroperable: false`, and produce `continuation: "continue_with_review"`; they do not by themselves stop a static handoff. `executionReady` is still a static contract assessment—not authorization to use tools, modify a repository, or perform the task.

## Unregistered semantic markers

The Runner does not discard a valid SemanticRef merely because core-v0.1 has no matching preset. It preserves the original reference and reports an `unregisteredReferences` entry with one conservative marker:

- `extension.proper_noun` for explicit external names, UI specs, libraries, models, packages, or mixed-case/versioned names;
- `extension.verb` for an unregistered `action`; or
- `extension.noun` for other unregistered domain references.

Markers are generic interpretation metadata, never aliases for a registered preset. They make a literal term available to a downstream agent or repository lookup without inventing meaning or authorizing execution. A structural relation such as `ui_spec.Name` or `bind` must still resolve to a real declaration in the same bundle.

## SUI v0.5 design layers

New `ui` contracts can record six explicit, non-executable layers: `design` for tokens and visual foundations, `responsive` for breakpoints and reflow, `accessibility` for keyboard/semantics/contrast, `navigation` for route and dialog behavior, `binding` for explicit UI-to-state correspondence, and `data` for view-model and field shape. The Runner returns a `uiDesignProfiles` advisory report for each UI. A missing layer produces a review warning only; a bounded static UI does not become invalid merely because a layer is irrelevant.

### Portable semantic definitions

For a material domain term that needs to carry the same meaning to another Runner, use a v0.2 `semantic` block. It provides a portable extension manifest while keeping a clear distinction from the Core codebook. A semantic block may be nested in a `task` or `ui`, or be a top-level declaration shared by the entire bundle.

```sil
semantic CheckmateDetection {
  reference: shogi.checkmate.detect
  kind: domain_rule
  meaning: Determine whether the side to move is in check with no legal move that removes the check.
  scope: bundle
}
```

Every semantic definition requires an exact `reference`, a `kind` (`proper_noun`, `verb`, `noun`, `domain_rule`, or `data_model`), a human-readable `meaning`, and a `scope` of `bundle` or `contract`. Bundle validation emits `semanticInteroperable: true` only when every unregistered task reference is either explicitly declared or resolved as a structural UI reference. It never upgrades a declared extension into a Core registration or execution authorization.

### Evidence-backed enrichment

For complex domains, a host may explicitly allow semantic enrichment from `repository`, `user`, or `web` evidence. The Runner records the source instead of treating the recovered term as Core codebook knowledge. A permitted Web result requires an HTTPS URL and resolves a reference as `web_resolved_extension`; repository or user evidence resolves it as `evidence_resolved_extension`.

```bash
sil validate game.bundle.sil \
  --allow-web-enrichment \
  --semantic-evidence-json '[
    {
      "reference":"domain.rule.example",
      "meaning":"Precise, source-backed meaning of the rule.",
      "source":"web",
      "url":"https://authoritative.example/rules"
    }
  ]'
```

When evidence is absent, `researchRequests` lists the unresolved references and generic research questions. A network-capable host can pass these requests to `enrichSilSuiBundle`; the host is responsible for obtaining permission, choosing a search provider, and returning source-bearing evidence. The Runner never makes unaudited network requests itself, never fabricates citations, and never equates Web evidence with Core registration.

## Cardinality

`goal`, `target`, and `action` are single-value fields. When repeated, the compiler retains the first and emits a diagnostic. All other fields may repeat and preserve source order.

`goal` is required for a valid Semantic IR. Missing `target` or `action` is a warning because some abstract instruction classes do not need both.

## Canonical field mapping

| SIL field | Semantic IR field | Codebook namespace |
| --- | --- | --- |
| `goal` | `goal` | `goal` |
| `target` | `target` | `target` |
| `action` | `action` | `action` |
| `input` | `inputs` | `input` |
| `output` | `outputs` | `output` |
| `require` | `required` | `require` |
| `prefer` | `preferred` | `prefer` |
| `forbid` | `forbidden` | `forbid` |
| `verify` | `verification` | `verify` |
| `on_failure` | `failureHandling` | `on_failure` |

## Quantized format

```text
@<codebook-version>|<token>|<token>|...
```

Registered meanings use codebook tokens such as `G12`, `A01`, and `X01`. Lossless extension tokens use URL-safe base64:

- `~d:<value>` task identifier
- `~g`, `~t`, `~a` goal, target, and action
- `~i`, `~o` inputs and outputs
- `~r`, `~p`, `~x` requirements, preferences, and prohibitions
- `~v`, `~f` verification and failure handling

Codebook version mismatches are errors. Unknown codebook tokens are reported and never interpreted speculatively.

Core v0.1 contains 10,000 deterministic English presets, divided evenly across the ten namespaces. The target namespace includes 100 curated technology entries with stable `T90000`–`T90099` codes, mirrored by classified context entries `I90000`–`I90099` in the input namespace. Existing seed tokens remain stable. Use `sil codebook search <query>` to discover registered keys and codes rather than guessing them.

## Diagnostics

The validator reports:

- syntax errors with line and column,
- missing goals, targets, or actions,
- duplicate singleton fields or semantic references,
- unknown references,
- codebook/IR version mismatches, and
- a reference that is both required and forbidden.

Warnings do not block output. Errors mark a compilation invalid while keeping inspection data available when safe.

## Validity and execution readiness

SIL separates two questions that must not be conflated:

- **Validity** asks whether the source can be parsed and represented safely as Semantic IR.
- **Execution readiness** asks whether a coding agent has enough explicit information to act without inventing scope, deliverables, or success criteria.

A task may therefore be `valid: true` and `executionReady: false`. Validity never authorizes execution.

Readiness uses three statuses:

| Status | Meaning |
| --- | --- |
| `blocked` | One or more execution-critical fields are missing, generic, invalid, or unresolved. Do not execute. |
| `review` | No blocker is present, but optional context is missing and should be reviewed. |
| `ready` | The static coding-agent contract is complete. This is still an analysis result, not an execution request. |

The coding-agent readiness profile treats the following as blockers when applicable:

- a missing or generic `goal`, `target`, or `action`,
- a generic target such as `instruction.request`,
- an unknown core reference that prevents reliable decoding,
- no declared `output`,
- no declared `verify` condition, or
- invalid SIL diagnostics.

Missing `input`, constraints (`require` or `forbid`), and `on_failure` handling are warnings. Each reported gap includes why it matters, the likely failure it causes, a suggested resolution, and a clarification question.

The static failure forecast can report wrong-scope changes, undefined deliverables, false success, invented context, unbounded changes, partial state, and semantic decoding gaps. Producing this forecast does not execute the task or inspect a target repository.

## CLI handoff contract

`sil validate` returns structural diagnostics plus `executionReady` and the full readiness assessment. A zero exit code means structurally valid SIL; callers must inspect `executionReady` before treating it as actionable.

`sil compile` emits a guarded OpenCode handoff by default. When readiness is blocked, it lists the missing interpretation-critical information, asks only required clarification questions, and requires `SIL_READINESS_BLOCKED` without calling tools or claiming completion. Missing deliverables, verification, optional context, or precise unregistered extensions produce `CONTINUE WITH REVIEW` instead: they remain explicit assumptions or pending verification and do not force a clarification-only stop. In either case, SIL itself never authorizes tools or external actions; the host must grant that permission separately. `sil compile --raw-prompt` retains access to the unguarded model-independent prompt for explicit low-level use.

## Non-executing phase orchestration

For v0.3/v0.4/v0.5 bundles, `sil orchestrate` creates a machine-readable phase report without running the described work. It keeps the declarative contract separate from observed runtime state and prevents an unproven earlier phase from automatically stopping unrelated work.

```bash
sil orchestrate delivery.sil --mode discover --workspace . --report phase-report.json
```

Modes are `discover`, `repair`, `implement`, `verify`, and `release`. The command itself is always non-executing. `--workspace` performs only four read-only existence checks (`workspace.accessible`, `repository.package_json`, `repository.git`, and `repository.readme`); MCP clients instead provide already-observed facts through `observations`.

Each phase is returned as `not_started`, `discovering`, `implementing`, `verifying`, `completed`, `partial`, `blocked`, or `deferred`. Missing evidence becomes a discovery request and yields `partial`, not a bundle-wide abort. A dependency is ordering-only by default; mark a task with `dependency_kind: hard` only when its incomplete ledger entry must prevent that particular phase from proceeding. `soft`, `evidence`, and `release` dependencies are recorded as deferrals. Release mode always requires separate host authorization.

The output includes a phase ledger, evidence provenance, hard blockers, and deferred references. It is observed state, not SIL/SUI source: do not copy it into a contract as self-authored proof.
