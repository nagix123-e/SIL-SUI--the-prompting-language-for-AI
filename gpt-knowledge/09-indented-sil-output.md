# SIL/SUI v0.4 Canonical Layout Rule

## Required layout

Every new SIL/SUI contract written by the SIL Writer GPT uses this readable v0.4 layout:

- Put `task TaskName:` on its own line.
- Indent every nested declaration by exactly four ASCII spaces.
- Do not use a closing brace.
- Never use tabs for indentation.
- Keep the canonical field order. A blank line may separate meaningful field groups, but never separates a field name from its reference.

```sil
task CreateGuide:
    version: 0.4
    goal: documentation.create
    target: project.documentation
    action: documentation.create

    input: language.sil
    output: documentation.artifact

    require: documentation.complete
    verify: documentation.complete
    on_failure: task.abort
```

## Formatting constraints

The indentation rule applies to every default SIL/SUI response, JSON-adjacent block, corrected block, and example. In v0.4 indentation is syntax, not presentation. Format after semantic conversion without changing statement IDs, field order, scopes, provenance, or SemanticRefs. Brace syntax is only a legacy output mode requested explicitly.
