# SIL language reference · v0.1

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

Line comments begin with `//`. A file contains one task in v0.1.

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

## Diagnostics

The validator reports:

- syntax errors with line and column,
- missing goals, targets, or actions,
- duplicate singleton fields or semantic references,
- unknown references,
- codebook/IR version mismatches, and
- a reference that is both required and forbidden.

Warnings do not block output. Errors mark a compilation invalid while keeping inspection data available when safe.
