# Semantic IR, Semantic Atoms, and Quantization

## Semantic IR

Human DSL is normalized into the following IR:

```ts
interface SemanticIR {
  version: string;
  taskId: string;
  goal?: string;
  target?: string;
  action?: string;
  inputs: string[];
  outputs: string[];
  required: string[];
  preferred: string[];
  forbidden: string[];
  verification: string[];
  failureHandling: string[];
  metadata?: {
    sourceLanguage?: "en";
    confidence?: number;
    warnings?: string[];
  };
}
```

English is the only supported natural-language source. When `sourceLanguage` is present, its only valid value is `"en"`.

## DSL-to-IR mapping

| DSL | IR |
| --- | --- |
| `task Name` | `taskId: "Name"` |
| `goal` | `goal` |
| `target` | `target` |
| `action` | `action` |
| `input` | `inputs[]` |
| `output` | `outputs[]` |
| `require` | `required[]` |
| `prefer` | `preferred[]` |
| `forbid` | `forbidden[]` |
| `verify` | `verification[]` |
| `on_failure` | `failureHandling[]` |

Emit an empty array when a repeatable field has no values. Omit a single-valued field when it is absent.

## Semantic atom principles

Each Semantic Atom represents one meaning. Do not combine unrelated meanings in one reference.

- Poor: `fast_secure_search_with_tests`
- Better: `response.fast`, `security.safe`, and `tests.pass`

Keep mandatory constraints distinct from prohibitions.

- "Preserve existing behavior" -> `require: existing.behavior.preserve`
- "Do not introduce a breaking change" -> `forbid: change.breaking`

Never omit an explicit requirement or prohibition. When merging synonyms, do not weaken their instruction strength.

## Core v0.1 registry

Core v0.1 contains exactly 10,000 deterministic, active, English-only presets. The registry allocates exactly 1,000 entries to each namespace:

| Namespace | Entries | Purpose |
| --- | ---: | --- |
| `goal` | 1,000 | Desired outcomes |
| `target` | 1,000 | Entities and artifacts |
| `action` | 1,000 | Operations |
| `input` | 1,000 | Inputs and source material |
| `output` | 1,000 | Deliverables |
| `require` | 1,000 | Mandatory constraints |
| `prefer` | 1,000 | Preferences |
| `forbid` | 1,000 | Prohibitions |
| `verify` | 1,000 | Completion checks |
| `on_failure` | 1,000 | Failure behavior |

The generated catalog is deterministic: the same version and catalog definitions produce the same ordered entries and codes. Seed entries retain their established codes, and generated entries receive stable namespace-prefixed codes. Every key, alias, and description is English-only.

One hundred curated AI/development terms are registered in pairs: a `technology.*` target and a classified input context such as `language.sil`, `platform.ollama`, `tool.opencode`, or `model.qwen3_6`. Exact codes must still be read from the bundled registry.

Representative registered atoms include:

### Goal

- `feature.add` — add a product feature
- `bug.fix` — fix a defect
- `content.summarize` — summarize content
- `content.classify` — classify content

### Action

- `implement`
- `modify`
- `delete`

### Target

- `screen.login`
- `user.authentication`
- `product.search`
- `api.endpoint`
- `project.documentation`

### Input and output

- `user.query`, `user.email`, `user.password`
- `product.list`, `auth.session`

### Required

- `response.fast`
- `existing.behavior.preserve`
- `password.hash`
- `input.validate`
- `error.safe`
- `ui.responsive`

### Preferred

- `code.simple`

### Forbidden

- `secret.expose`
- `change.breaking`
- `secret.hardcode`
- `password.plaintext_store`

### Verification and failure handling

- `login.success`
- `invalid_credentials.reject`
- `tests.pass`
- `transaction.rollback`

The registry is too large to reproduce in instructions. Use codebook lookup or search when membership matters. Never infer registration or a quantized code from a familiar-looking SemanticRef.

## Unregistered atoms

If no registered atom expresses the required meaning, create a precise unregistered reference. Examples:

- `goal: knowledge_set.generate`
- `target: language_learning.sets`
- `input: knowledge_files.en_es`
- `require: coverage.exhaustive`

An unregistered atom is not a syntax error. Lossless quantization preserves it as an extension token. Do not call it registered, and list it in warnings when the distinction affects the user.

## Quantized codes

The format is `@<version>|<token>|<token>`. A registered atom uses its codebook code. An unregistered atom uses a lossless extension token beginning with `~` when preservation is required.

Never guess an ID or code. When the user requests a quantized code, use only values obtained from the actual codebook. Preserve unknown concepts as extension tokens or state that the compiler must generate the code.

Lossless extension markers are `~g`, `~t`, `~a`, `~i`, `~o`, `~r`, `~p`, `~x`, `~v`, and `~f`; `~d` stores the Task ID. Compact mode may omit unknown optional atoms but still preserves unknown requirements and prohibitions.
