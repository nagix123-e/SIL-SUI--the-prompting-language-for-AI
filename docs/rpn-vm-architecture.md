# SIL Runner RPN VM architecture

SIL syntax and parser behavior remain unchanged. Runtime assessment now follows this internal path:

```text
SemanticIR / parsed task
→ NormalizedTask
→ immutable RpnProgram (version 1)
→ static validation
→ typed stack VM
→ compatibility-shaped execution result
```

`normalizeTask` assigns stable IDs to repeated conditions, for example `require:0` and `verify:1`. `compileRpnProgram` preserves the SIL field-group order and emits a plain JSON program with a source map for every instruction.

The validator rejects unsupported versions, malformed operands, unknown opcodes, stack underflow/type errors, duplicate condition IDs, missing action/finalization/end instructions, absent failure handling, invalid phase order, post-terminal instructions, and non-empty final stacks. Invalid programs are blocked and never run.

The VM receives evidence and approved capability/action adapters through an explicit context. It never evaluates generated JavaScript, accesses arbitrary reference properties, or accepts agent self-report as postcondition evidence. Each output, require, prefer, forbid, and verify produces a separate condition record. Numeric evidence is required for `token_usage.present`; documented absence is accepted only by `token_usage.capture_if_available`.

`assessExecutionResult` remains the public compatibility entry point. It now compiles and validates the RPN program before executing it. It returns the former result fields plus `conditionResults`, captured evidence, failure applications, execution-engine/version metadata, and optional debug trace data. Callers such as the CLI pass the parsed AST through the optional `ast` field to retain exact source locations in VM diagnostics.

The previous direct evidence aggregation path has been removed from normal execution; it is represented by the VM's evidence resolver instead.
