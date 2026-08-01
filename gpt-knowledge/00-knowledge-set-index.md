# SIL Writer GPT Knowledge Set — Index

Version: SIL/SUI v0.4 (with SIL/SUI v0.1-v0.3 input compatibility)
Knowledge build: 2026-07-26
Natural-language source: multilingual, normalized to English semantic identifiers

This Knowledge set is for a GPT that converts multilingual instructions into Semantic Instruction Language and Semantic UI Language. SIL/SUI are declarative data and never execute the described task.

## Recommended upload order

1. Use `SYSTEM-INSTRUCTIONS.txt` as the GPT Instructions.
2. Upload all files in `knowledge/` as Knowledge.
3. Upload `data/core-v0.1.json` when exact preset registration or quantized codes must be verified.

## Reading order

1. `01-sil-language-specification.md` — formal grammar, fields, cardinality, naming, disallowed syntax.
2. `02-semantic-ir-and-atoms.md` — IR mapping, semantic atoms, codebook, extension references, quantization.
3. `03-natural-language-conversion-policy.md` — English decomposition, force, scope, ambiguity, Knowledge handling.
4. `04-sil-examples.md` — correct and incorrect conversion examples.
5. `05-quality-and-output-rules.md` — pre-output checks and response format.
6. `06-technical-terms-and-proper-nouns.md` — 100 curated AI/development terms, model versions, unknown proper nouns.
7. `07-readiness-validation-and-cli.md` — validator, readiness, failure forecast, guarded handoff, CLI.
8. `08-deterministic-conversion-rule-inventory.md` — structured labels, built-in phrase mappings, numeric parameters, negation, selection.
9. `09-indented-sil-output.md` — v0.4 four-space canonical layout and legacy display compatibility.
10. `10-sui-language-specification.md` — SUI grammar, UI fields, conversion rules, and SIL/SUI composition.
11. `11-v0.2-typed-contracts-and-ui-bindings.md` — typed parameters, portable semantic extensions, data models, code example declarations, design tokens, breakpoints, accessibility, transitions, and SIL/SUI bindings.
12. `12-v0.3-pythonic-contracts.md` — v0.3 compatibility syntax, lexer, IR statements, scope, lifecycle, DAG, Patch, Rule, Data Policy, SUI graph, multilingual provenance, and migration.
13. `13-v0.4-bounded-loops.md` — canonical bounded task loops and declarative SUI collection rendering.

## Authority

- The language and IR specification define syntax and field meaning.
- `core-v0.1.json` is the authority for registered keys and codes.
- A plausible-looking SemanticRef is not proof of registration.
- Precise unregistered references are permitted and must be preserved losslessly.
- Structural validity is not execution authorization.

## Scope of this set

This set contains all current SIL/SUI grammar, deterministic multilingual-to-English conversion rules, technical/proper-name behavior, validation and readiness rules, quantization rules, response policy, examples, and the full 10,000-entry Core v0.1 codebook. The v0.1-v0.3 files document compatibility; `13-v0.4-bounded-loops.md` governs loop-enabled new output.
