# Semantic Instruction Language (SIL)

SIL is an experimental prompt DSL and compiler that turns Japanese or English AI instructions into four interoperable forms:

1. a human-readable `.sil` task,
2. canonical Semantic IR,
3. versioned discrete semantic codes, and
4. a model-independent natural-language prompt.

The Semantic IR is the source of truth. Every conversion passes through it, and lossless quantization preserves unknown references instead of silently deleting them.

## MVP capabilities

- Deterministic parser and formatter with line/column syntax errors
- Typed Semantic IR with Zod validation
- Required-field, duplicate, conflict, and unknown-atom diagnostics
- Versioned dictionary codebook (`core-v0.1`)
- Lossless and compact quantization modes
- Quantize/dequantize round trips, including unknown required and forbidden rules
- Rule-based Japanese and English source adapter
- Generic prompt, Markdown, and JSON generators
- CLI commands for parse, validate, compile, quantize, dequantize, and format
- Responsive three-pane Web compiler with confidence and diagnostics
- No prompt history, arbitrary code execution, or mandatory external AI provider

## Quick start

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed by the development server.

## CLI

```bash
npm run cli -- parse examples/add-authentication.sil
npm run cli -- validate examples/add-authentication.sil
npm run cli -- compile examples/instruction-ja.txt
npm run cli -- compile examples/instruction-ja.txt --json
npm run cli -- quantize examples/add-authentication.sil
npm run cli -- quantize examples/add-authentication.sil --compact
npm run cli -- dequantize '@0.1|G12|T044|A01|R08|X01'
npm run cli -- format examples/build-search.sil
```

Use `-` instead of a path to read standard input.

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

## Repository map

```text
apps/cli                 command-line interface
app                      Web compiler
packages/semantic-ir     shared types and schemas
packages/parser          parser, AST, IR conversion, formatter
packages/codebook        versioned semantic atom registry
packages/validator       structural and semantic diagnostics
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
- Source input is limited to 100,000 characters.
- External LLM use is optional and is intentionally not part of this MVP.
- Confidence is a rule-based review aid, not a guarantee of semantic equivalence.
- Compact mode may omit unknown optional atoms, but unknown required and forbidden atoms are always retained.

See [the language reference](docs/language-reference.md) for grammar and diagnostics.
