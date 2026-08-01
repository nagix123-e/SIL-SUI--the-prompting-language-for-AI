# Validation, Execution Readiness, Failure Forecasting, and CLI

## Structural validation

Validation can report:

- `invalid-ir` error for Semantic IR schema violations;
- `missing-goal` error;
- `missing-target` warning;
- `missing-action` warning;
- `duplicate-singleton` warning for repeated goal, target, or action;
- `duplicate-reference` warning for repeated array references;
- `unknown-reference` warning for a reference absent from the selected namespace;
- `version-mismatch` error;
- `conflicting-reference` error when the same reference is both required and forbidden.

Unknown references remain valid syntax and are preserved by lossless quantization. A task is structurally valid when no error diagnostic exists.

## Readiness is separate

Never infer execution authorization from `valid:true` or exit code zero.

The coding-agent readiness profile adds blockers only for conditions that make a bounded interpretation unsafe:

- missing or fallback goal;
- missing or generic target;
- missing action;
- invalid SIL;
- a core semantic decoding gap when it prevents shared interpretation.

It adds review warnings for:

- missing output or verification (carry them as pending deliverable/evidence, never invent them);
- missing input context;
- no requirement, preference, or prohibition;
- missing failure handling;
- a defaulted action;
- a precise but unregistered core reference that needs a shared definition.

The score is:

```text
clamp(100 - blockers * 18 - warnings * 7, 0, 100)
```

Status:

- `blocked`: one or more blockers;
- `review`: no blocker and one or more warnings;
- `ready`: no blocker and no warning.

`safeToExecute` is true only when blockers are zero. Even then, the result is a complete static contract, not an execution request. `continuation` tells a receiving agent whether it may keep working under a separately authorized host session: `blocked`, `continue_with_review`, or `continue`.

## Predicted failures

Readiness gaps map to these forecasts:

| Gap | Failure |
| --- | --- |
| missing/generic target | wrong scope |
| missing output | undefined deliverable |
| missing verification | false success |
| missing input | invented context |
| missing constraints | unbounded change |
| missing failure handling | partial state |
| unknown core reference | semantic decoding gap |

Each gap should state the reason, likely failure, resolution, and a short clarification question.

## Guarded OpenCode handoff

When blocked, the handoff says:

```text
Workflow: STOP FOR SPECIFICATION
```

It forbids task execution, tool calls, repository inspection, file edits, and implementation-resource allocation. The downstream response protocol is:

```text
SIL_READINESS_BLOCKED
```

The downstream agent should explain the blocking gap and ask only blocking clarification questions.

When the status is `review`, it instead uses `SIL_CONTINUE_WITH_REVIEW`: do not stop merely because an output, verification rule, precise extension, or optional context is absent. Continue only when the host has separately authorized the work; preserve each gap as an assumption or pending verification and never claim missing evidence exists.

## CLI commands

```text
sil parse <task.sil>
sil validate <task.sil>
sil compile <instruction.txt|task.sil> [--json|--raw-prompt]
sil quantize <task.sil> [--compact]
sil dequantize <code|file.sq>
sil format <task.sil>
sil codebook stats
sil codebook search <query> [--namespace <name>] [--limit <count>] [--offset <count>]
```

Use `-` to read source from stdin. `--json` and `--raw-prompt` apply only to compile and are alternatives. `--compact` applies only to quantize.

`compile` emits the guarded handoff by default. `--raw-prompt` intentionally bypasses that presentation layer and should be used only when the user explicitly requests the unguarded model-independent prompt.

## Quantization

The header is `@<codebook-version>`. Registered atoms use their exact codes. Lossless extensions use Base64URL tokens:

```text
~d task ID
~g goal
~t target
~a action
~i input
~o output
~r require
~p prefer
~x forbid
~v verify
~f on_failure
```

Lossless mode preserves every unknown reference. Compact mode may omit unknown optional atoms, but always preserves unknown `require` and `forbid` references. Never guess a quantized code.
