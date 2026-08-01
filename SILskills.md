---
name: sil-sui-runner
description: Parse, validate, format, migrate, inspect, graph, patch, quantify, and safely hand off SIL/SUI v0.1-v0.3 contracts.
---

# SIL/SUI Runner Skill v0.3

Use this skill for SIL/SUI contracts, conversion, validation, formatting, migration, dependency/component graph inspection, Patch review, and post-execution evidence assessment.

SIL/SUI are declarative data. They are never executable Python and never grant tool, filesystem, network, or external-action permission. A valid contract, high readiness, or `execution_authorized: true` declaration is not host authorization.

## Version and syntax policy

- Read v0.1 and v0.2 brace syntax without changing its meaning.
- Write v0.3 by default: `task Name:` / `ui Name:` / `bundle Name:`, four spaces per level, and `#` comments.
- Reject tabs, non-four-space indentation, executable Python syntax, assignments, calls, imports, control flow, and `eval`/`exec`.
- v0.1/v0.2 output is legacy-only. Warn before any lossy conversion.
- Core codebook v0.1 remains authoritative for Core registration and quantized codes.

## v0.3 contract rules

Use `goal`, `target`, `action`, `input`, `output`, `require`, `prefer`, `forbid`, `verify`, and `on_failure` for task intent. Preserve repeated fields as structured statements with stable ID, scope, source order, and provenance.

Use `on reference:` for scope, named requirement IDs such as `require REQ_PASSWORD_HASH:`, `depends_on`, `flow`, `sequence`, and `parallel` for explicit task ordering, and nested SUI `component` blocks for ownership.

Use `parameter`, `model`/`field`, `verification`, `rule`, and `data_policy` for typed values, schema, verification method/evidence, permissions, and data handling. Do not hide values, units, conditions, or schemas in one SemanticRef.

## Validation and readiness

Report separately:

- syntax validity;
- unresolved vs Core-registered vs declared-extension references;
- dependency and component graphs;
- verification status;
- readiness dimensions; and
- declared execution authorization versus actual host authorization.

Reject unknown dependencies, duplicate/self/cyclic dependencies, invalid sequence/parallel blocks, duplicate contracts/components, invalid scope, and invalid Patch targets. Never claim an unexecuted verification passed.

## Patch

Support `add`, `remove`, `replace`, `move`, `change_scope`, `change_force`, `reorder`, `add_dependency`, and `remove_dependency`. Target only stable task/UI/component/statement IDs. Apply patches to a copy, revalidate all affected graphs and policies, and retain the original unchanged if any step fails.

## Multilingual input

Accept multilingual source, including Japanese. Retain `originalSourceLanguage`, normalize semantic meaning and identifiers to English, and retain `normalizedSemanticLanguage: en` / `outputIdentifierLanguage: en`. Do not use external translation or LLM services without explicit host configuration and permission. Preserve unknown proper nouns as extensions rather than guessing translations.

## CLI

Run from the repository containing `apps/cli/src/index.ts`:

```bash
npm run cli -- parse contract.sil
npm run cli -- validate contract.sil
npm run cli -- format contract.sil
npm run cli -- migrate legacy.sil
npm run cli -- graph bundle.sil
npm run cli -- inspect contract.sil
npm run cli -- readiness contract.sil
npm run cli -- patch contract.sil --patch patch.json --dry-run
npm run cli -- quantize contract.sil
npm run cli -- assess-result task.sil --evidence evidence.json
```

Quantization projects only the task semantic subset. Keep the v0.3 source or JSON IR for scope, provenance, lifecycle, graph, SUI, and Patch information.
