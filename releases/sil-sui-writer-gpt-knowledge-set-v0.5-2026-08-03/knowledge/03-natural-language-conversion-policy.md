# English Instruction-to-SIL Conversion Policy

## Conversion procedure

1. Detect the source language or read an explicit locale. Accept multilingual input, including Japanese, and retain the source text and locale in provenance.
2. Map the final state requested by the user to `goal`.
3. Map the entity being acted upon to `target`.
4. Map the operation to `action`.
5. Enumerate explicit files, resources, data, existing code, and user-provided values as `input`.
6. Enumerate requested deliverables as `output`.
7. Decompose words such as "must," "all," "only," and "preserve" into `require` references.
8. Decompose words such as "should," "prefer," and "if possible" into `prefer` references.
9. Decompose words such as "must not," "do not," and "never" into `forbid` references.
10. Map acceptance criteria, tests, and comparison methods to `verify`.
11. Map rollback, stop, retry, escalation, or continuation behavior to `on_failure`; if none is stated, append `on_failure: task.abort`.
12. Inspect the result for omissions, ambiguity, unregistered atoms, conflicts, assumptions, and a non-empty `on_failure` field.
13. Preserve known technologies, model versions, and detected proper nouns as input context.

## Mandatory failure policy

Every generated SIL task must contain at least one `on_failure` statement. This is a completion rule, not a request for extra clarification. Preserve an explicit source policy such as rollback, retry, escalation, or diagnostics. If the source has no such policy, use the registered conservative default:

```sil
on_failure: task.abort
```

Do not omit the field merely because the task is documentation-only, analysis-only, or non-executing. `task.abort` means to stop the eventual downstream handoff when its task fails; it does not cause the SIL Writer to execute or abort anything.

## Preserve instruction strength

Do not change the force of the English instruction.

- must, required -> `require`
- should, preferably -> `prefer`
- must not, never, do not -> `forbid`
- all, every, each -> an explicit coverage `require`
- only -> both a scope constraint and any necessary prohibition

Do not absorb "all" into a generic action such as `generate`. Preserve exhaustive coverage through an independent requirement and an observable verification statement.

## Keep targets specific

Do not use `instruction.request` when the target can be understood.

- "Create every possible knowledge set for language learning"
  - goal: `knowledge_set.generate`
  - target: `language_learning.sets`
  - action: `generate`
- "Update the login screen"
  - goal: use the most accurate outcome atom for the requested change
  - target: `screen.login`
  - action: `modify`

## Preserve source resources

Represent attachments, Knowledge, existing code, databases, and current configuration as inputs.

- "Based on the EN-to-ES knowledge files" -> `input: knowledge_files.en_es`
- "Use the languages currently available in this app" -> `input: app.languages.available`
- "Use the attached specification" -> `input: attachment.specification`

Never claim that a resource was read when its existence or contents could not be verified. Warn when access is unavailable.

## Handle ambiguity

If the semantic core is clear, create reasonable atoms and report only the assumptions that matter. If missing information would materially change the result, ask up to three short questions before producing SIL.

Clarification is required when, for example:

- "Create everything" does not identify whether scope means language pairs, artifact formats, difficulty levels, topics, or their combinations.
- Multiple output formats are possible and the choice materially changes the deliverable.
- The instruction depends on a Knowledge file that cannot be identified.

When a question is unnecessary, choose the smallest safe interpretation without silently adding requirements.

## Multilingual normalization

Normalize English phrasings that express the same meaning to the same atom.

- "Add a login screen" -> `feature.add` + `screen.login` + `implement`
- "Do not hardcode secrets" -> `forbid: secret.hardcode`
- "Create every combination" -> `require: coverage.exhaustive`

Task IDs and SemanticRefs are always English. Preserve `originalSourceLanguage`, use `normalizedSemanticLanguage: "en"`, and use `outputIdentifierLanguage: "en"`. Do not send source text to an external translation service without an explicitly configured and permitted adapter. When no adapter is available, report that normalization is unavailable rather than inventing a translation.

## Structured labels

Prefer labeled prompts. Accepted families include Goal/Objective/Outcome, Target/Scope/Component, Action/Operation, Inputs/Context, Outputs/Deliverables, Requirements/Constraints, Preferences, Forbidden/Prohibitions, Verification/Checks/Acceptance criteria, and On failure/Recovery. Treat the label as authoritative for ordinary candidates. Preserve unmatched labeled content as a precise extension instead of deleting it.

## Technical and proper-name context

Preserve known names through their classified input references. Examples: `SIL -> language.sil`, `Ollama -> platform.ollama`, `OpenCode -> tool.opencode`, and `Qwen3.6 -> model.qwen3_6`. Preserve unknown names such as `AcmeCloud` as `context.acmecloud`. When a curated term appears under an explicit Target label, use its registered `technology.*` target and retain its input context.

For guide, tutorial, manual, documentation, or instruction creation requests, use `documentation.create`, `project.documentation`, and `documentation.artifact` when those meanings match. Named technologies remain inputs, not the documentation target.

## Use the codebook accurately

Core v0.1 provides 10,000 deterministic English presets, with exactly 1,000 entries in each SIL namespace. Search the actual registry before claiming that an atom is registered or before emitting a quantized code. If a concept is absent, preserve it as a specific unregistered SemanticRef rather than replacing it with a generic registered atom.

## Do not invent information

- Do not add facts that are absent from the instruction or available Knowledge.
- Do not invent a list of supported values that you have not inspected.
- Do not guess codebook IDs or quantized codes.
- Do not assign high confidence without evidence.
- Do not treat the presence of `goal`, `target`, and `action` as proof of semantic preservation.
