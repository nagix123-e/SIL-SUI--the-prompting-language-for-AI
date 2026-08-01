# Semantic Instruction Language v0.1 — Legacy Compatibility Specification

> New Writer output is SIL/SUI v0.4. This file documents v0.1 input compatibility only; use `13-v0.4-bounded-loops.md` for loop-enabled canonical output and `12-v0.3-pythonic-contracts.md` for the shared contract model.

## Purpose

Semantic Instruction Language (SIL) is a declarative DSL that decomposes an English instruction into semantic units suitable for AI systems. SIL does not execute programs. It explicitly represents the task goal, target, action, inputs, outputs, constraints, prohibitions, verification criteria, and failure handling.

Semantic IR is the source of truth. English source instructions, Human DSL, quantized codes, and generated prompts are converted through the IR.

v0.1 itself remains English-identifier-only. v0.3 accepts multilingual natural-language source and preserves original-language provenance before normalizing identifiers to English.

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

Write one `task` per file. Text after `//` is treated as a line comment.

The opening declaration, each statement, and the closing brace occupy separate lines. A statement may end in one optional semicolon. Content after the closing brace is invalid. Source is limited to 100,000 characters.

## Fields

| Field | Meaning | Cardinality |
| --- | --- | --- |
| `goal` | Desired state or outcome | One |
| `target` | Entity or artifact being acted upon | One |
| `action` | Operation performed on the target | One |
| `input` | Input, source material, or data used by the task | Many |
| `output` | Deliverable produced by the task | Many |
| `require` | Mandatory constraint | Many |
| `prefer` | Non-mandatory preference | Many |
| `forbid` | Prohibited result or operation | Many |
| `verify` | Completion criterion or validation method | Many |
| `on_failure` | Required behavior after failure | One or more |

`goal` and `on_failure` are required for every generated task. Concrete requests should normally include `target` and `action`. Do not repeat a single-valued field. When the source does not state a recovery policy, append the registered safe default `on_failure: task.abort`. When it does state one, preserve it and add `task.abort` only if the stated policy does not already stop unsafe continuation.

## Canonical field order

The formatter emits fields in this order:

1. `goal`
2. `target`
3. `action`
4. `input`
5. `output`
6. `require`
7. `prefer`
8. `forbid`
9. `verify`
10. `on_failure`

Repeated fields retain their input order when doing so does not change meaning.

## Naming rules

- Parser-valid Task IDs use ASCII letters, digits, and underscores and begin with a letter. Use PascalCase canonically, such as `CreateStudySets`.
- Build SemanticRefs from lowercase English snake_case segments separated by periods, such as `knowledge_files.en_es`.
- Make `goal` outcome-oriented, such as `feature.add`, `content.summarize`, or `knowledge_set.generate`.
- Make `target` noun-oriented, such as `screen.login` or `language_learning.sets`.
- Make `action` operation-oriented, such as `implement`, `generate`, or `classify`.
- Use `instruction.request` only as a last resort when the target truly cannot be identified.
- Prefer a specific unregistered SemanticRef over losing meaning when the codebook lacks a concept.

## Core codebook contract

Core v0.1 is an English-only, deterministic codebook with exactly 10,000 active entries. Each of the ten SIL namespaces contains exactly 1,000 entries. A registered entry has a unique ID, SemanticRef key, namespace-prefixed code, English description, English aliases, version, and status.

The target and input namespaces reserve paired entries for 100 curated AI and development technologies. Their code ranges are `T90000`–`T90099` and `I90000`–`I90099`. The full mapping is in `core-v0.1.json`.

Codebook membership must be checked, not inferred from a plausible name. Unregistered references remain valid SIL and are preserved by lossless quantization, but they must not be presented as registered presets.

## Valid example

```sil
task CreateLanguageLearningSets {
  goal: knowledge_set.generate
  target: language_learning.sets
  action: generate

  input: app.languages.available
  input: knowledge_files.en_es

  output: knowledge_sets.complete

  require: language_pair.en_es
  require: coverage.exhaustive
  require: source.knowledge_files_use

  forbid: source.content.invent

  verify: supported_languages.covered
  verify: knowledge_sets.no_missing_combination
  on_failure: task.abort
}
```

Some references in this example may be unregistered. Their specificity is intentional: replacing them with a generic reference would lose meaning.

## Disallowed syntax

- Strings, arrays, function calls, or variable assignments
- Executable JavaScript, Python, shell, or other program code
- Fields outside the ten v0.1 fields, such as `priority` or `context`
- Empty SemanticRefs
- Identifiers containing spaces or hyphens
- Multiple tasks in one file

Decompose information that SIL cannot represent directly into precise SemanticRefs under the existing fields. Put any necessary explanation in a warning outside the SIL code block.
