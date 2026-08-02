# Semantic Instruction Language (SIL)

SIL is an experimental prompt DSL and compiler that turns English AI instructions into interoperable, inspectable artifacts:

1. a human-readable `.sil` task,
2. canonical Semantic IR,
3. versioned discrete semantic codes, and
4. a model-independent natural-language prompt, and
5. a guarded OpenCode handoff with a static execution-readiness assessment.

The Semantic IR is the source of truth. Every conversion passes through it, and lossless quantization preserves unknown references instead of silently deleting them.

## MVP capabilities

- Deterministic parser and formatter with line/column syntax errors
- Typed Semantic IR with Zod validation
- Required-field, duplicate, conflict, and unknown-atom diagnostics
- Versioned English dictionary codebook with 10,000 semantic presets (`core-v0.1`)
- Lossless and compact quantization modes
- Quantize/dequantize round trips, including unknown required and forbidden rules
- Deterministic English prompt analyzer with clause, negation, modality, and codebook evidence
- Role-labeled prompt parsing for goals, targets, inputs, outputs, constraints, verification, and recovery
- Compositional list, numeric budget, unit, retry-limit, and lossless extension extraction
- Lossless technical-name context for known AI/development terms, model versions, and unknown proper nouns
- Static execution-readiness scoring with blocker, warning, and predicted-failure explanations
- Guarded OpenCode handoffs that prohibit execution while required parameters are missing
- Generic prompt, Markdown, and JSON generators
- CLI commands for parse, validate, compile, quantize, dequantize, and format
- Local two-column Web converter with evidence, stale-state tracking, validation, copy, and downloads
- No prompt history, arbitrary code execution, or mandatory external AI provider

## Quick start

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed by the development server.

## Local prompt converter

The Web application converts an English prompt to SIL entirely in the browser tab. It does not call an AI API, send network requests, retain prompt history, or execute the resulting DSL.

Each explicit conversion produces:

- editable canonical `.sil`,
- Semantic IR JSON,
- versioned semantic code,
- a generated model-independent prompt, and
- a guarded OpenCode handoff,
- an execution-readiness report with missing fields and clarification questions,
- a static failure forecast explaining cause, likely outcome, and prevention, and
- an ordered evidence report showing matched source text, mechanical defaults, and derived fields.

The interpreter analyzes task descriptions but never performs their requested actions. A syntactically valid task may still be marked **Do not execute** when its target, output, verification, or other execution contract is underspecified. Prompt edits do not silently recompile. The application marks the previous result as stale until **Analyze & convert** is selected again. SIL edits similarly require **Validate & format**. SIL and every compiled artifact can be copied or downloaded locally.

Natural-language input is multilingual in v0.4, including Japanese. The local deterministic analyzer remains English-oriented; non-English input is retained with source-language metadata and requires a configured normalization adapter before English semantic identifiers can be asserted. It is never silently sent to an external service. v0.4 adds bounded `for_each`, `repeat`, and `until` task loops plus SUI `render_each` collection templates; no loop is executable code or host authorization.

### Recommended human prompt pattern

The converter accepts prose, but labeled fields are more deterministic. Use one task and one responsibility per line:

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
Forbidden:
- expose internal inventory costs
- modify the checkout API
Verification:
- unit tests pass
- integration tests pass
- pagination order is stable
On failure:
- roll back changes
- preserve diagnostics
- retry once, then abort
```

The Web interpreter includes this guide, a full template loader, and live role coverage. Exact quantities such as `200 ms`, percentages, page sizes, result limits, and retry counts are preserved as deterministic semantic parameters. Known technical names such as `SIL`, `Ollama`, `OpenCode`, and `Qwen3.6` are retained as context inputs. Detected but unregistered proper nouns are retained as `context.*` lossless references instead of being discarded or replaced with a weak preset.

### Scratch-style prompt blocks

The English prompt editor includes a collapsible, independently scrollable block sidebar that occupies one third of the editor when open. Its 300-block vocabulary includes 100 curated AI, model, language, framework, database, platform, and development-tool terms. Blocks are color-coded by grammatical or semantic use: structure, grammar and function words, action verbs, target nouns, input/output data, constraints, logic, verification, and recovery.

- Click a block to insert it at the textarea's current caret (or replace the current selection).
- Drag a block into the textarea to insert it at the drop caret.
- Type or edit freely without using any block.
- Search the complete block catalog by word, SIL role, or semantic reference.
- Review context-scored suggestions based on the active labeled section, recent phrase, missing SIL roles, and phrases already present.

Each block stores its relevant SIL field plus a registered codebook reference or an explicit lossless-extension marker. This keeps the UI vocabulary and compiler behavior aligned without pretending that open-ended phrases belong to the finite core codebook.

The prompt editor also colorizes recognized text without replacing the textarea. It uses longest-match phrase detection across the 300 blocks and all 10,000 core codebook entries; punctuated model versions such as `Qwen3.6` remain one match. Unmatched or category-ambiguous text remains black. Every codebook entry stores a numeric `colorCategory`: `0` unclassified, `1` structure, `2` grammar, `3` verb, `4` noun, `5` data, `6` constraint, `7` logic, `8` verification, and `9` recovery. The current core assigns all 10,000 entries to categories `3`–`9` from their SIL namespace.

## CLI

```bash
npm run cli -- parse examples/add-authentication.sil
npm run cli -- validate examples/add-authentication.sil
npm run cli -- compile examples/instruction-en.txt
npm run cli -- compile examples/instruction-en.txt --json
npm run cli -- compile examples/instruction-en.txt --raw-prompt
npm run cli -- quantize examples/add-authentication.sil
npm run cli -- quantize examples/add-authentication.sil --compact
npm run cli -- dequantize '@0.1|G12|T044|A01|R08|X01'
npm run cli -- format examples/build-search.sil
npm run cli -- validate examples/shogi-game.bundle.sil
npm run cli -- codebook stats
npm run cli -- codebook search 'product search' --namespace target --limit 10
```

Use `-` instead of a path to read standard input.

`validate` reports both structural validity (`valid`) and execution readiness (`executionReady`). They are intentionally different. `compile` emits the guarded OpenCode handoff by default; use `--raw-prompt` only when the unguarded model-independent prompt is explicitly needed.

## Portable MCP distribution

The repository can produce a GitHub-release-ready ZIP that any **MCP-capable** AI agent can connect to. It contains the CLI, codebook, standard local MCP server, and setup instructions; the receiving computer runs `npm ci` once after extraction.

```bash
npm run mcp:kit
```

The artifact is written to `releases/sil-sui-mcp-kit-v0.4.1.zip`. On the receiving computer, extract it and run:

```bash
cd sil-sui-mcp-kit-v0.4.1
npm ci
npm run mcp -- init
npm run mcp -- serve
```

This starts a token-protected Streamable HTTP MCP endpoint at `http://127.0.0.1:8765/mcp`, so multiple local agents can share one compiler. `npm run mcp -- config http` prints the standard connection object to paste into an agent's MCP settings. `npm run mcp -- config stdio` prints the fallback for agents that support only process-launched MCP. The server accepts inline source only and never executes a task described by SIL/SUI. See [portable-mcp/README.md](portable-mcp/README.md).

One `.sil` source may also be a SIL/SUI bundle: one `task` plus multiple named `ui` declarations. The CLI validates each declaration and resolves `ui_spec.Name` inputs and v0.2 `bind` targets across the complete document, so related game screens and dialogs no longer need separate input files.

## SIL syntax

```sil
task BuildSearch {
  goal: feature.add
  target: product.search
  action: implement
  input: user.query
  output: product.list
  require: response.fast
  forbid: secret.expose
  verify: tests.pass
}
```

The equivalent quantized form begins with an explicit codebook version:

```text
@0.1|~d:QnVpbGRTZWFyY2g|G12|T204|A01|I18|O31|R07|X01|V03
```

Tokens prefixed with `~` are lossless extension tokens. They retain the task ID or a semantic reference that is not yet in the codebook.

## Codebook

The core codebook contains exactly 10,000 active English semantic presets: 1,000 entries for each SIL namespace. Its target and input namespaces reserve paired stable entries for 100 common AI and software-development technologies while retaining the 10,000-entry total. Existing v0.1 token assignments remain stable. Runtime entries and the portable JSON file are produced from the same deterministic catalog.

```bash
npm run codebook:generate
npm run codebook:check
```

Use `sil codebook search` to discover canonical keys before creating an extension reference. Search accepts an optional namespace plus pagination through `--limit` and `--offset`.

## Repository map

```text
apps/cli                 command-line interface
app                      Web compiler
packages/semantic-ir     shared types and schemas
packages/parser          parser, AST, IR conversion, formatter
packages/codebook        versioned semantic atom registry
packages/validator       structural and semantic diagnostics
packages/readiness       execution-readiness gaps and static failure forecasts
packages/quantizer       code encoding and decoding
packages/prompt-generator prompt output formats
packages/compiler        shared compilation facade
codebooks                portable JSON codebooks
examples                 sample natural language and SIL tasks
tests                    parser and round-trip tests
```

## Validation

```bash
npm test
npm run typecheck -- --incremental false
npm run build
```

## Design boundaries

- The DSL is data and is never executed.
- Structural validity is not execution authorization. Readiness is assessed separately as `blocked`, `review`, or `ready`.
- A blocked OpenCode handoff explicitly forbids tools, repository inspection, edits, and implementation work until its clarification questions are answered.
- Source input is limited to 100,000 characters.
- External LLM use is optional and is intentionally not part of this MVP.
- The local Web converter does not persist prompts and makes no application-level network request.
- v0.3 accepts multilingual source text while keeping original-language provenance and reporting adapter unavailability rather than silently inventing a translation.
- Conversion evidence is the primary review surface; confidence is an evidence-coverage aid, not a guarantee of equivalence.
- Compact mode may omit unknown optional atoms, but unknown required and forbidden atoms are always retained.

See [the language reference](docs/language-reference.md) for grammar and diagnostics.
