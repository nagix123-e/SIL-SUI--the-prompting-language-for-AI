import type {
  SemanticIR,
  SourceLocation,
  StatementKind,
  TaskAst,
} from "../../semantic-ir/src/index";

export type SemanticRef = string;
export type ExecutionResultStatus = "completed" | "partial" | "failed" | "blocked";
export type ExecutionPhase = "compile" | "preflight" | "action" | "evidence_collection" | "postcondition_validation" | "failure_handling" | "finalization";
export type EvidenceStatus = "satisfied" | "unmet" | "unavailable";
export type EvidenceSource = "tool" | "test" | "artifact" | "capability" | "agent" | "adapter" | "runtime" | "system" | "external_response" | "derived";
export type StackValueType = "boolean" | "number" | "string" | "object" | "null" | "semantic_ref" | "evidence" | "action_request" | "unknown";

export interface ExecutionEvidence {
  id?: string;
  reference: SemanticRef;
  status: EvidenceStatus;
  source: EvidenceSource;
  detail?: string;
  numericValue?: number;
  documented?: boolean;
  value?: unknown;
  valueType?: string;
  available?: boolean;
  unavailableReason?: string;
  provenance?: string[];
  metadata?: Record<string, unknown>;
}

export type CapabilityValue = boolean | "unknown";

export interface CapabilityAssessment {
  reference: SemanticRef;
  available: boolean | "unknown";
  detail?: string;
}

export interface TrackedCondition {
  id: string;
  field: "output" | "require" | "prefer" | "forbid" | "verify";
  index: number;
  ref: SemanticRef;
  sourceLocation?: SourceLocation;
}

export interface FailureRule {
  id: string;
  index: number;
  ref: SemanticRef;
  sourceLocation?: SourceLocation;
}

export interface TaskSourceMap {
  task?: SourceLocation;
  fields: Record<string, SourceLocation | undefined>;
}

export interface NormalizedTask {
  id: string;
  goal?: SemanticRef;
  target?: SemanticRef;
  action?: SemanticRef;
  inputs: SemanticRef[];
  outputs: TrackedCondition[];
  requires: TrackedCondition[];
  prefers: TrackedCondition[];
  forbids: TrackedCondition[];
  verifies: TrackedCondition[];
  onFailure: FailureRule[];
  sourceMap: TaskSourceMap;
}

export interface InstructionSource {
  field?: StatementKind | "task";
  fieldIndex?: number;
  semanticRef?: SemanticRef;
  sourceLocation?: SourceLocation;
  normalizedNodeId?: string;
}

export interface PushRefInstruction { op: "PUSH_REF"; ref: SemanticRef; }
export interface PushLiteralInstruction { op: "PUSH_LITERAL"; value: unknown; valueType: Exclude<StackValueType, "semantic_ref" | "evidence" | "action_request">; }
export interface ResolveRefInstruction { op: "RESOLVE_REF"; }
export interface PopInstruction { op: "POP"; }
export interface DupInstruction { op: "DUP"; }
export interface OperatorInstruction { op: "EQ" | "NEQ" | "GT" | "GTE" | "LT" | "LTE" | "AND" | "OR" | "NOT" | "EXISTS" | "CONTAINS"; }
export interface BeginTaskInstruction { op: "BEGIN_TASK"; taskId: string; }
export interface CheckCapabilityInstruction { op: "CHECK_CAPABILITY"; conditionId: string; ref: SemanticRef; }
export interface BuildActionRequestInstruction { op: "BUILD_ACTION_REQUEST"; inputCount: number; }
export interface ExecuteActionInstruction { op: "EXECUTE_ACTION"; }
export interface CaptureActionResultInstruction { op: "CAPTURE_ACTION_RESULT"; }
export interface CaptureEvidenceInstruction { op: "CAPTURE_EVIDENCE"; }
export interface CheckConditionInstruction { op: "CHECK_OUTPUT" | "CHECK_REQUIRE" | "CHECK_PREFER" | "CHECK_FORBID" | "CHECK_VERIFY"; condition: TrackedCondition; }
export interface ApplyOnFailureInstruction { op: "APPLY_ON_FAILURE"; rules: FailureRule[]; }
export interface FinalizeResultInstruction { op: "FINALIZE_RESULT"; }
export interface EndTaskInstruction { op: "END_TASK"; }

export type RpnInstruction =
  | PushRefInstruction | PushLiteralInstruction | ResolveRefInstruction | PopInstruction | DupInstruction | OperatorInstruction
  | BeginTaskInstruction | CheckCapabilityInstruction | BuildActionRequestInstruction | ExecuteActionInstruction
  | CaptureActionResultInstruction | CaptureEvidenceInstruction | CheckConditionInstruction | ApplyOnFailureInstruction
  | FinalizeResultInstruction | EndTaskInstruction;

export interface RpnProgram {
  version: 1;
  taskId: string;
  instructions: readonly RpnInstruction[];
  sourceMap: Readonly<Record<number, InstructionSource>>;
  metadata: { compilerVersion: string; createdFrom: "sil"; };
}

export interface StackEntry {
  value: unknown;
  valueType: StackValueType;
  provenance?: string[];
  sourceInstruction: number;
}

export interface ConditionResult {
  id: string;
  field: TrackedCondition["field"];
  index: number;
  ref: SemanticRef;
  status: "met" | "unmet" | "unknown" | "error";
  evidenceIds: string[];
  instructionIndex: number;
  phase: ExecutionPhase;
  reason?: string;
  sourceLocation?: SourceLocation;
}

export interface FailureApplication {
  rule: SemanticRef;
  triggeredByConditionId?: string;
  triggeredByInstruction: number;
  originalPhase: ExecutionPhase;
  handlerSucceeded: boolean;
  reason?: string;
}

export interface VmTraceEntry {
  instructionIndex: number;
  opcode: string;
  phase: ExecutionPhase;
  stackDepthBefore: number;
  stackDepthAfter: number;
  conditionId?: string;
  semanticRef?: SemanticRef;
  outcome?: string;
}

export interface VmDiagnostic {
  code: string;
  message: string;
  phase: ExecutionPhase;
  instructionIndex?: number;
  opcode?: string;
  stackDepth?: number;
  relatedField?: string;
  relatedRef?: SemanticRef;
  sourceLocation?: SourceLocation;
}

export interface RpnProgramValidation {
  valid: boolean;
  diagnostics: VmDiagnostic[];
  maxStackDepth: number;
}

export interface ActionRequest {
  taskId: string;
  goal: SemanticRef;
  target: SemanticRef;
  action: SemanticRef;
  inputs: SemanticRef[];
}

export interface ActionAdapterResult {
  success: boolean;
  detail?: string;
  evidence?: readonly ExecutionEvidence[];
}

export interface VmExecutionContext {
  evidence: readonly ExecutionEvidence[];
  capabilities?: Readonly<Record<string, CapabilityValue>>;
  diagnostics?: readonly string[];
  readiness?: { status: string; score: number };
  actionAdapter?: { execute(request: ActionRequest): ActionAdapterResult; };
  failureHandler?: (application: Omit<FailureApplication, "handlerSucceeded">) => boolean;
  debug?: boolean;
  maxInstructions?: number;
  maxStackDepth?: number;
}

export interface VmExecutionResult {
  status: ExecutionResultStatus;
  readiness?: { status: string; score: number };
  conditions: ConditionResult[];
  unmetReferences: string[];
  capabilityChecks: CapabilityAssessment[];
  failureApplications: FailureApplication[];
  failurePhase: "none" | "pre_execution" | "post_execution";
  diagnostics: VmDiagnostic[];
  evidence: ExecutionEvidence[];
  trace?: VmTraceEntry[];
  executionEngine: "rpn-vm";
  programVersion: 1;
}

const CONDITION_FIELDS: Array<TrackedCondition["field"]> = ["output", "require", "prefer", "forbid", "verify"];
const capabilityDependent = /^(?:platform|tool|model|environment|token_usage)\./u;
const tokenUsagePresent = "token_usage.present";
const captureIfAvailable = "token_usage.capture_if_available";

const CONDITION_OPCODE: Record<TrackedCondition["field"], CheckConditionInstruction["op"]> = {
  output: "CHECK_OUTPUT",
  require: "CHECK_REQUIRE",
  prefer: "CHECK_PREFER",
  forbid: "CHECK_FORBID",
  verify: "CHECK_VERIFY",
};

const PHASE_BY_OPCODE: Record<RpnInstruction["op"], ExecutionPhase> = {
  BEGIN_TASK: "compile", PUSH_REF: "preflight", PUSH_LITERAL: "preflight", RESOLVE_REF: "postcondition_validation",
  POP: "preflight", DUP: "preflight", EQ: "preflight", NEQ: "preflight", GT: "preflight", GTE: "preflight", LT: "preflight", LTE: "preflight",
  AND: "preflight", OR: "preflight", NOT: "preflight", EXISTS: "preflight", CONTAINS: "preflight",
  CHECK_CAPABILITY: "preflight", BUILD_ACTION_REQUEST: "action", EXECUTE_ACTION: "action", CAPTURE_ACTION_RESULT: "evidence_collection",
  CAPTURE_EVIDENCE: "evidence_collection", CHECK_OUTPUT: "postcondition_validation", CHECK_REQUIRE: "postcondition_validation",
  CHECK_PREFER: "postcondition_validation", CHECK_FORBID: "postcondition_validation", CHECK_VERIFY: "postcondition_validation",
  APPLY_ON_FAILURE: "failure_handling", FINALIZE_RESULT: "finalization", END_TASK: "finalization",
};

const PHASE_ORDER: Record<ExecutionPhase, number> = {
  compile: 0, preflight: 1, action: 2, evidence_collection: 3, postcondition_validation: 4, failure_handling: 5, finalization: 6,
};

function locationsFor(ast?: TaskAst): Record<string, SourceLocation | undefined> {
  const locations: Record<string, SourceLocation | undefined> = {};
  if (!ast) return locations;
  const counters = new Map<string, number>();
  for (const statement of ast.statements) {
    const index = counters.get(statement.kind) ?? 0;
    counters.set(statement.kind, index + 1);
    locations[`${statement.kind}:${index}`] = statement.location;
  }
  locations.task = ast.location;
  return locations;
}

function tracked(field: TrackedCondition["field"], values: readonly string[], locations: Record<string, SourceLocation | undefined>): TrackedCondition[] {
  return values.map((ref, index) => ({ id: `${field}:${index}`, field, index, ref, sourceLocation: locations[`${field}:${index}`] }));
}

/** Converts the existing parsed/IR shape into an execution-only typed model. */
export function normalizeTask(ir: SemanticIR, ast?: TaskAst): NormalizedTask {
  const locations = locationsFor(ast);
  return {
    id: ir.taskId,
    goal: ir.goal,
    target: ir.target,
    action: ir.action,
    inputs: [...ir.inputs],
    outputs: tracked("output", ir.outputs, locations),
    requires: tracked("require", ir.required, locations),
    prefers: tracked("prefer", ir.preferred, locations),
    forbids: tracked("forbid", ir.forbidden, locations),
    verifies: tracked("verify", ir.verification, locations),
    onFailure: ir.failureHandling.map((ref, index) => ({ id: `on_failure:${index}`, index, ref, sourceLocation: locations[`on_failure:${index}`] })),
    sourceMap: { task: locations.task, fields: locations },
  };
}

/** Compiles only normalized semantics; no capabilities, evidence, or adapters are read here. */
export function compileRpnProgram(task: NormalizedTask): RpnProgram {
  const instructions: RpnInstruction[] = [];
  const sourceMap: Record<number, InstructionSource> = {};
  const emit = (instruction: RpnInstruction, source: InstructionSource = {}): void => {
    sourceMap[instructions.length] = source;
    instructions.push(instruction);
  };

  emit({ op: "BEGIN_TASK", taskId: task.id }, { field: "task", semanticRef: task.id, sourceLocation: task.sourceMap.task, normalizedNodeId: "task" });
  for (const condition of task.requires) {
    if (capabilityDependent.test(condition.ref)) {
      emit({ op: "PUSH_REF", ref: condition.ref }, { field: condition.field, fieldIndex: condition.index, semanticRef: condition.ref, sourceLocation: condition.sourceLocation, normalizedNodeId: condition.id });
      emit({ op: "CHECK_CAPABILITY", conditionId: condition.id, ref: condition.ref }, { field: condition.field, fieldIndex: condition.index, semanticRef: condition.ref, sourceLocation: condition.sourceLocation, normalizedNodeId: condition.id });
    }
  }
  if (task.goal && task.target && task.action) {
    emit({ op: "PUSH_REF", ref: task.goal }, { field: "goal", semanticRef: task.goal, sourceLocation: task.sourceMap.fields["goal:0"], normalizedNodeId: "goal" });
    emit({ op: "PUSH_REF", ref: task.target }, { field: "target", semanticRef: task.target, sourceLocation: task.sourceMap.fields["target:0"], normalizedNodeId: "target" });
    emit({ op: "PUSH_REF", ref: task.action }, { field: "action", semanticRef: task.action, sourceLocation: task.sourceMap.fields["action:0"], normalizedNodeId: "action" });
    for (let index = 0; index < task.inputs.length; index += 1) {
      const ref = task.inputs[index] ?? "";
      emit({ op: "PUSH_REF", ref }, { field: "input", fieldIndex: index, semanticRef: ref, sourceLocation: task.sourceMap.fields[`input:${index}`], normalizedNodeId: `input:${index}` });
    }
    emit({ op: "BUILD_ACTION_REQUEST", inputCount: task.inputs.length }, { field: "action", semanticRef: task.action, normalizedNodeId: "action-request" });
    emit({ op: "EXECUTE_ACTION" }, { field: "action", semanticRef: task.action, normalizedNodeId: "action-execution" });
    emit({ op: "CAPTURE_ACTION_RESULT" }, { field: "action", semanticRef: task.action, normalizedNodeId: "action-result" });
    emit({ op: "CAPTURE_EVIDENCE" }, { field: "action", semanticRef: task.action, normalizedNodeId: "evidence" });
  }
  const conditions = [...task.outputs, ...task.requires, ...task.prefers, ...task.forbids, ...task.verifies];
  for (const condition of conditions) {
    emit({ op: "PUSH_REF", ref: condition.ref }, { field: condition.field, fieldIndex: condition.index, semanticRef: condition.ref, sourceLocation: condition.sourceLocation, normalizedNodeId: condition.id });
    emit({ op: "RESOLVE_REF" }, { field: condition.field, fieldIndex: condition.index, semanticRef: condition.ref, sourceLocation: condition.sourceLocation, normalizedNodeId: condition.id });
    emit({ op: CONDITION_OPCODE[condition.field], condition }, { field: condition.field, fieldIndex: condition.index, semanticRef: condition.ref, sourceLocation: condition.sourceLocation, normalizedNodeId: condition.id });
  }
  emit({ op: "APPLY_ON_FAILURE", rules: task.onFailure }, { field: "on_failure", normalizedNodeId: "on_failure" });
  emit({ op: "FINALIZE_RESULT" }, { field: "task", normalizedNodeId: "finalize" });
  emit({ op: "END_TASK" }, { field: "task", normalizedNodeId: "end" });
  return Object.freeze({ version: 1, taskId: task.id, instructions: Object.freeze(instructions), sourceMap: Object.freeze(sourceMap), metadata: Object.freeze({ compilerVersion: "rpn-vm-1", createdFrom: "sil" }) });
}

function diagnostic(program: RpnProgram, instructionIndex: number | undefined, phase: ExecutionPhase, code: string, message: string, extras: Partial<VmDiagnostic> = {}): VmDiagnostic {
  const source = instructionIndex === undefined ? undefined : program.sourceMap[instructionIndex];
  return { code, message, phase, instructionIndex, opcode: instructionIndex === undefined ? undefined : (program.instructions[instructionIndex] as { op?: string } | undefined)?.op, stackDepth: extras.stackDepth, relatedField: extras.relatedField ?? source?.field, relatedRef: extras.relatedRef ?? source?.semanticRef, sourceLocation: extras.sourceLocation ?? source?.sourceLocation };
}

function isInstruction(value: unknown): value is { op: string } {
  return Boolean(value && typeof value === "object" && typeof (value as { op?: unknown }).op === "string");
}

function expectedTypes(op: string): StackValueType[] | undefined {
  if (op === "RESOLVE_REF") return ["semantic_ref"];
  if (op === "CHECK_CAPABILITY") return ["semantic_ref"];
  if (["CHECK_OUTPUT", "CHECK_REQUIRE", "CHECK_PREFER", "CHECK_FORBID", "CHECK_VERIFY"].includes(op)) return ["evidence"];
  if (op === "BUILD_ACTION_REQUEST") return undefined;
  if (op === "EXECUTE_ACTION") return ["action_request"];
  if (op === "CAPTURE_ACTION_RESULT") return ["object"];
  if (["GT", "GTE", "LT", "LTE"].includes(op)) return ["number", "number"];
  if (["AND", "OR"].includes(op)) return ["boolean", "boolean"];
  if (op === "NOT") return ["boolean"];
  if (op === "CONTAINS") return ["string", "string"];
  return undefined;
}

function popCount(instruction: { op: string; inputCount?: unknown }): number {
  if (instruction.op === "BUILD_ACTION_REQUEST") return typeof instruction.inputCount === "number" && Number.isInteger(instruction.inputCount) && instruction.inputCount >= 0 ? instruction.inputCount + 3 : Number.NaN;
  if (["RESOLVE_REF", "POP", "NOT", "EXISTS", "CAPTURE_ACTION_RESULT", "CHECK_CAPABILITY", "CHECK_OUTPUT", "CHECK_REQUIRE", "CHECK_PREFER", "CHECK_FORBID", "CHECK_VERIFY"].includes(instruction.op)) return 1;
  if (["EQ", "NEQ", "GT", "GTE", "LT", "LTE", "AND", "OR", "CONTAINS"].includes(instruction.op)) return 2;
  if (instruction.op === "EXECUTE_ACTION") return 1;
  return 0;
}

function pushTypes(instruction: { op: string; valueType?: unknown }): StackValueType[] {
  if (instruction.op === "PUSH_REF") return ["semantic_ref"];
  if (instruction.op === "PUSH_LITERAL" && typeof instruction.valueType === "string") return [instruction.valueType as Exclude<StackValueType, "semantic_ref" | "evidence" | "action_request">];
  if (instruction.op === "RESOLVE_REF") return ["evidence"];
  if (instruction.op === "DUP") return ["unknown"];
  if (instruction.op === "BUILD_ACTION_REQUEST") return ["action_request"];
  if (instruction.op === "EXECUTE_ACTION") return ["object"];
  if (["EQ", "NEQ", "GT", "GTE", "LT", "LTE", "AND", "OR", "NOT", "EXISTS", "CONTAINS"].includes(instruction.op)) return ["boolean"];
  return [];
}

const KNOWN_OPS = new Set<string>([
  "PUSH_REF", "PUSH_LITERAL", "RESOLVE_REF", "POP", "DUP", "EQ", "NEQ", "GT", "GTE", "LT", "LTE", "AND", "OR", "NOT", "EXISTS", "CONTAINS",
  "BEGIN_TASK", "CHECK_CAPABILITY", "BUILD_ACTION_REQUEST", "EXECUTE_ACTION", "CAPTURE_ACTION_RESULT", "CAPTURE_EVIDENCE", "CHECK_OUTPUT", "CHECK_REQUIRE", "CHECK_PREFER", "CHECK_FORBID", "CHECK_VERIFY", "APPLY_ON_FAILURE", "FINALIZE_RESULT", "END_TASK",
]);

/** Validates serializable bytecode without invoking a resolver or adapter. */
export function validateRpnProgram(program: RpnProgram): RpnProgramValidation {
  const diagnostics: VmDiagnostic[] = [];
  if (program.version !== 1) return { valid: false, maxStackDepth: 0, diagnostics: [diagnostic(program, undefined, "compile", "unsupported-program-version", `Unsupported RPN program version "${String(program.version)}".`)] };
  const stack: StackValueType[] = [];
  const conditionIds = new Set<string>();
  let maxStackDepth = 0;
  let previousPhase = -1;
  let sawAction = false;
  let sawFinalize = false;
  let sawEnd = false;
  let sawFailureRules = false;

  for (let index = 0; index < program.instructions.length; index += 1) {
    const raw = program.instructions[index] as unknown;
    if (!isInstruction(raw)) {
      diagnostics.push(diagnostic(program, index, "compile", "invalid-instruction", "Instruction must be an object with an opcode."));
      continue;
    }
    if (!KNOWN_OPS.has(raw.op)) {
      diagnostics.push(diagnostic(program, index, "compile", "unknown-opcode", `Unknown opcode "${raw.op}".`));
      continue;
    }
    const instruction = raw as RpnInstruction & { inputCount?: unknown; condition?: Partial<TrackedCondition>; rules?: unknown };
    const phase = PHASE_BY_OPCODE[instruction.op];
    if (sawEnd) diagnostics.push(diagnostic(program, index, phase, "instruction-after-end", "Instructions cannot appear after END_TASK."));
    if (PHASE_ORDER[phase] < previousPhase && instruction.op !== "PUSH_LITERAL" && instruction.op !== "PUSH_REF") diagnostics.push(diagnostic(program, index, phase, "invalid-phase-transition", `Opcode ${instruction.op} cannot move from a later phase back to ${phase}.`));
    previousPhase = Math.max(previousPhase, PHASE_ORDER[phase]);
    if ((instruction.op === "PUSH_REF" && !(typeof (instruction as PushRefInstruction).ref === "string" && (instruction as PushRefInstruction).ref.length)) || (instruction.op === "PUSH_LITERAL" && !["boolean", "number", "string", "object", "null", "unknown"].includes(String((instruction as PushLiteralInstruction).valueType)))) {
      diagnostics.push(diagnostic(program, index, phase, "invalid-operand", `Opcode ${instruction.op} has an invalid operand.`));
    }
    const pops = popCount(instruction);
    if (!Number.isFinite(pops)) diagnostics.push(diagnostic(program, index, phase, "invalid-operand", "BUILD_ACTION_REQUEST requires a non-negative integer inputCount."));
    else if (stack.length < pops) diagnostics.push(diagnostic(program, index, phase, "stack-underflow", `${instruction.op} requires ${pops} stack value(s), found ${stack.length}.`, { stackDepth: stack.length }));
    else {
      const expected = expectedTypes(instruction.op);
      if (expected) {
        const actual = stack.slice(stack.length - expected.length);
        if (actual.some((value, offset) => value !== "unknown" && value !== expected[offset])) diagnostics.push(diagnostic(program, index, phase, "stack-type", `${instruction.op} received incompatible operand types.`, { stackDepth: stack.length }));
      }
      if (instruction.op === "BUILD_ACTION_REQUEST" && stack.slice(stack.length - pops).some((type) => type !== "semantic_ref" && type !== "unknown")) diagnostics.push(diagnostic(program, index, phase, "stack-type", "BUILD_ACTION_REQUEST accepts only semantic references.", { stackDepth: stack.length }));
      stack.splice(Math.max(0, stack.length - pops), pops);
    }
    if (instruction.op === "DUP" && stack.length) stack.push(stack.at(-1) ?? "unknown");
    else stack.push(...pushTypes(instruction));
    maxStackDepth = Math.max(maxStackDepth, stack.length);
    if (instruction.op.startsWith("CHECK_") && instruction.op !== "CHECK_CAPABILITY") {
      const condition = instruction.condition;
      if (!condition?.id || !condition.field || !condition.ref) diagnostics.push(diagnostic(program, index, phase, "invalid-condition", "Condition check requires an id, field, and semantic reference."));
      else {
        if (conditionIds.has(condition.id)) diagnostics.push(diagnostic(program, index, phase, "duplicate-condition-id", `Duplicate condition id "${condition.id}".`));
        conditionIds.add(condition.id);
        if (!program.sourceMap[index]) diagnostics.push(diagnostic(program, index, phase, "missing-source-map", `Condition "${condition.id}" has no source map entry.`));
      }
    }
    if (instruction.op === "BUILD_ACTION_REQUEST") sawAction = true;
    if (instruction.op === "APPLY_ON_FAILURE" && Array.isArray(instruction.rules) && instruction.rules.length) sawFailureRules = true;
    if (instruction.op === "FINALIZE_RESULT") sawFinalize = true;
    if (instruction.op === "END_TASK") sawEnd = true;
  }
  if (program.instructions[0]?.op !== "BEGIN_TASK") diagnostics.push(diagnostic(program, 0, "compile", "missing-begin", "Program must begin with BEGIN_TASK."));
  if (!sawAction) diagnostics.push(diagnostic(program, undefined, "compile", "missing-action", "Program has no action request instruction."));
  if (!sawFailureRules) diagnostics.push(diagnostic(program, undefined, "compile", "missing-on-failure", "Program has no on_failure behavior."));
  if (!sawFinalize) diagnostics.push(diagnostic(program, undefined, "compile", "missing-finalization", "Program has no FINALIZE_RESULT instruction."));
  if (!sawEnd || program.instructions.at(-1)?.op !== "END_TASK") diagnostics.push(diagnostic(program, undefined, "compile", "missing-end", "Program must end with END_TASK."));
  if (stack.length) diagnostics.push(diagnostic(program, undefined, "compile", "invalid-final-stack", `Program leaves ${stack.length} stack value(s).`, { stackDepth: stack.length }));
  return { valid: diagnostics.length === 0, diagnostics, maxStackDepth };
}

function observable(evidence: readonly ExecutionEvidence[]): ExecutionEvidence[] { return evidence.filter((item) => item.source !== "agent"); }

function evidenceId(item: ExecutionEvidence, index: number): string { return item.id ?? `evidence:${index}:${item.reference}`; }

function evaluateCondition(condition: TrackedCondition, evidence: readonly ExecutionEvidence[], instructionIndex: number): ConditionResult {
  const usable = observable(evidence);
  const ids = evidence.map(evidenceId);
  let status: ConditionResult["status"];
  let reason: string | undefined;
  if (condition.ref === tokenUsagePresent) {
    status = usable.some((item) => item.status === "satisfied" && Number.isFinite(item.numericValue)) ? "met" : usable.some((item) => item.status === "unavailable") ? "unknown" : "unmet";
    if (status !== "met") reason = "Numeric token usage evidence is required; unavailable, estimated, or self-reported usage is not present evidence.";
  } else if (condition.ref === captureIfAvailable) {
    status = usable.some((item) => item.status === "satisfied") || usable.some((item) => item.status === "unavailable" && item.documented) ? "met" : "unmet";
    if (status !== "met") reason = "Token usage was unavailable without documented unavailability.";
  } else if (condition.field === "forbid") {
    status = usable.some((item) => item.status === "satisfied") ? "unmet" : usable.some((item) => item.status === "unavailable") ? "unknown" : "met";
    if (status === "unmet") reason = "Forbidden condition was observed in execution evidence.";
    if (status === "unknown") reason = "Forbidden condition could not be evaluated because evidence was unavailable.";
  } else {
    status = usable.some((item) => item.status === "satisfied") ? "met" : usable.some((item) => item.status === "unavailable") ? "unknown" : "unmet";
    if (status !== "met") reason = evidence.some((item) => item.source === "agent") && !usable.length ? "Agent self-report is not sufficient evidence." : status === "unknown" ? "Required evidence was unavailable." : "No satisfactory observable evidence was supplied.";
  }
  return { id: condition.id, field: condition.field, index: condition.index, ref: condition.ref, status, evidenceIds: ids, instructionIndex, phase: "postcondition_validation", reason, sourceLocation: condition.sourceLocation };
}

function valueType(value: unknown): StackValueType {
  if (value === null) return "null";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  if (typeof value === "object") return "object";
  return "unknown";
}

function comparison(op: OperatorInstruction["op"], values: StackEntry[]): StackEntry {
  const left = values[0]; const right = values[1];
  const unknown = values.some((entry) => entry.valueType === "unknown");
  if (unknown) return { value: undefined, valueType: "unknown", sourceInstruction: right?.sourceInstruction ?? 0 };
  const result = op === "EQ" ? left?.value === right?.value : op === "NEQ" ? left?.value !== right?.value : op === "GT" ? Number(left?.value) > Number(right?.value) : op === "GTE" ? Number(left?.value) >= Number(right?.value) : op === "LT" ? Number(left?.value) < Number(right?.value) : op === "LTE" ? Number(left?.value) <= Number(right?.value) : op === "AND" ? left?.value === true && right?.value === true : op === "OR" ? left?.value === true || right?.value === true : op === "CONTAINS" ? String(left?.value).includes(String(right?.value)) : false;
  return { value: result, valueType: "boolean", sourceInstruction: right?.sourceInstruction ?? 0 };
}

function runtimeDiagnostic(program: RpnProgram, instructionIndex: number, phase: ExecutionPhase, code: string, message: string, stack: readonly StackEntry[]): VmDiagnostic {
  return diagnostic(program, instructionIndex, phase, code, message, { stackDepth: stack.length });
}

/** Runs only validated RPN. The VM has no dynamic property access or generated code path. */
export function executeRpnProgram(program: RpnProgram, context: VmExecutionContext): VmExecutionResult {
  const validation = validateRpnProgram(program);
  if (!validation.valid) return { status: "blocked", readiness: context.readiness, conditions: [], unmetReferences: [], capabilityChecks: [], failureApplications: [], failurePhase: "pre_execution", diagnostics: validation.diagnostics, evidence: [...context.evidence], trace: context.debug ? [] : undefined, executionEngine: "rpn-vm", programVersion: 1 };
  const maxInstructions = context.maxInstructions ?? 10_000;
  const maxStackDepth = context.maxStackDepth ?? 256;
  if (program.instructions.length > maxInstructions || validation.maxStackDepth > maxStackDepth) {
    const code = program.instructions.length > maxInstructions ? "instruction-limit" : "stack-limit";
    const message = code === "instruction-limit" ? `Program exceeds the ${maxInstructions} instruction limit.` : `Program exceeds the ${maxStackDepth} stack-depth limit.`;
    return { status: "blocked", readiness: context.readiness, conditions: [], unmetReferences: [], capabilityChecks: [], failureApplications: [], failurePhase: "pre_execution", diagnostics: [diagnostic(program, undefined, "compile", code, message)], evidence: [...context.evidence], trace: context.debug ? [] : undefined, executionEngine: "rpn-vm", programVersion: 1 };
  }
  const evidence = [...context.evidence];
  const evidenceByRef = new Map<string, ExecutionEvidence[]>();
  const registerEvidence = (item: ExecutionEvidence): void => { const current = evidenceByRef.get(item.reference) ?? []; current.push(item); evidenceByRef.set(item.reference, current); };
  evidence.forEach(registerEvidence);
  const stack: StackEntry[] = [];
  const conditions: ConditionResult[] = [];
  const capabilities: CapabilityAssessment[] = [];
  const failureApplications: FailureApplication[] = [];
  const diagnostics: VmDiagnostic[] = (context.diagnostics ?? []).map((message) => ({ code: "runtime-diagnostic", message, phase: "evidence_collection" }));
  const trace: VmTraceEntry[] | undefined = context.debug ? [] : undefined;
  let phase: ExecutionPhase = "compile";
  let actionFailed = false;
  let handlerFailed = false;
  let preflightBlocked = false;
  let applyingFailure = false;

  const pop = (instructionIndex: number, expected?: StackValueType): StackEntry | undefined => {
    const entry = stack.pop();
    if (!entry) { diagnostics.push(runtimeDiagnostic(program, instructionIndex, phase, "stack-underflow", "Runtime stack underflow.", stack)); return undefined; }
    if (expected && entry.valueType !== expected && entry.valueType !== "unknown") { diagnostics.push(runtimeDiagnostic(program, instructionIndex, phase, "stack-type", `Expected ${expected}, received ${entry.valueType}.`, stack)); return undefined; }
    return entry;
  };

  for (let ip = 0; ip < program.instructions.length; ip += 1) {
    const instruction = program.instructions[ip];
    phase = PHASE_BY_OPCODE[instruction.op];
    const before = stack.length;
    let outcome: string | undefined;
    if (preflightBlocked && instruction.op !== "FINALIZE_RESULT" && instruction.op !== "END_TASK") {
      trace?.push({ instructionIndex: ip, opcode: instruction.op, phase, stackDepthBefore: before, stackDepthAfter: stack.length, conditionId: "condition" in instruction ? instruction.condition.id : undefined, semanticRef: "ref" in instruction ? instruction.ref : "condition" in instruction ? instruction.condition.ref : undefined, outcome: "skipped-after-preflight-block" });
      continue;
    }
    try {
      switch (instruction.op) {
        case "BEGIN_TASK": break;
        case "PUSH_REF": stack.push({ value: instruction.ref, valueType: "semantic_ref", sourceInstruction: ip }); break;
        case "PUSH_LITERAL": stack.push({ value: instruction.value, valueType: instruction.valueType, sourceInstruction: ip }); break;
        case "POP": pop(ip); break;
        case "DUP": { const entry = stack.at(-1); if (!entry) diagnostics.push(runtimeDiagnostic(program, ip, phase, "stack-underflow", "DUP requires one stack value.", stack)); else stack.push({ ...entry, sourceInstruction: ip }); break; }
        case "RESOLVE_REF": { const ref = pop(ip, "semantic_ref"); if (ref) stack.push({ value: { reference: String(ref.value), evidence: evidenceByRef.get(String(ref.value)) ?? [] }, valueType: "evidence", provenance: [String(ref.value)], sourceInstruction: ip }); break; }
        case "EQ": case "NEQ": case "GT": case "GTE": case "LT": case "LTE": case "AND": case "OR": case "CONTAINS": { const right = pop(ip); const left = pop(ip); if (left && right) stack.push(comparison(instruction.op, [left, right])); break; }
        case "NOT": { const entry = pop(ip, "boolean"); if (entry) stack.push(entry.valueType === "unknown" ? { value: undefined, valueType: "unknown", sourceInstruction: ip } : { value: entry.value !== true, valueType: "boolean", sourceInstruction: ip }); break; }
        case "EXISTS": { const entry = pop(ip); if (entry) stack.push({ value: entry.valueType !== "unknown" && entry.value !== null && entry.value !== undefined, valueType: "boolean", sourceInstruction: ip }); break; }
        case "CHECK_CAPABILITY": { const reference = pop(ip, "semantic_ref"); if (!reference) break; const ref = String(reference.value); const available = context.capabilities?.[ref] ?? "unknown"; capabilities.push({ reference: ref, available }); if (available === false && ref !== captureIfAvailable) { preflightBlocked = true; diagnostics.push(diagnostic(program, ip, phase, "capability-unavailable", `Capability unavailable: ${ref}`)); outcome = "blocked"; } break; }
        case "BUILD_ACTION_REQUEST": { const values = stack.splice(Math.max(0, stack.length - instruction.inputCount - 3), instruction.inputCount + 3); if (values.length !== instruction.inputCount + 3 || values.some((entry) => entry.valueType !== "semantic_ref")) diagnostics.push(runtimeDiagnostic(program, ip, phase, "stack-type", "Action request requires goal, target, action, and semantic input references.", stack)); else stack.push({ value: { taskId: program.taskId, goal: String(values[0]?.value), target: String(values[1]?.value), action: String(values[2]?.value), inputs: values.slice(3).map((entry) => String(entry.value)) } satisfies ActionRequest, valueType: "action_request", sourceInstruction: ip }); break; }
        case "EXECUTE_ACTION": { const request = pop(ip, "action_request"); if (!request) break; const result = context.actionAdapter?.execute(request.value as ActionRequest) ?? { success: true }; if (!result.success) { actionFailed = true; diagnostics.push(diagnostic(program, ip, phase, "action-failed", result.detail ?? "Action adapter reported failure.")); outcome = "failed"; } for (const item of result.evidence ?? []) { evidence.push(item); registerEvidence(item); } stack.push({ value: result, valueType: "object", sourceInstruction: ip }); break; }
        case "CAPTURE_ACTION_RESULT": pop(ip, "object"); break;
        case "CAPTURE_EVIDENCE": break;
        case "CHECK_OUTPUT": case "CHECK_REQUIRE": case "CHECK_PREFER": case "CHECK_FORBID": case "CHECK_VERIFY": { const resolved = pop(ip, "evidence"); if (!resolved) break; const detail = resolved.value as { evidence: ExecutionEvidence[] }; const result = evaluateCondition(instruction.condition, detail.evidence, ip); conditions.push(result); if (result.status !== "met") { diagnostics.push(diagnostic(program, ip, phase, "condition-unmet", `${result.ref}: ${result.reason ?? result.status}`, { relatedField: result.field, relatedRef: result.ref, sourceLocation: result.sourceLocation })); outcome = result.status; } break; }
        case "APPLY_ON_FAILURE": { const failures = conditions.filter((condition) => condition.status !== "met" && condition.field !== "prefer"); if ((actionFailed || failures.length) && !applyingFailure) { applyingFailure = true; for (const rule of instruction.rules) { const trigger = failures[0]; const partial: Omit<FailureApplication, "handlerSucceeded"> = { rule: rule.ref, triggeredByConditionId: trigger?.id, triggeredByInstruction: ip, originalPhase: actionFailed ? "action" : "postcondition_validation", reason: actionFailed ? "Action failure" : trigger?.reason }; const handlerSucceeded = context.failureHandler?.(partial) ?? true; failureApplications.push({ ...partial, handlerSucceeded }); if (!handlerSucceeded) { handlerFailed = true; diagnostics.push(diagnostic(program, ip, "failure_handling", "failure-handler-error", `Failure handler "${rule.ref}" did not complete.`, { relatedRef: rule.ref, sourceLocation: rule.sourceLocation })); } } applyingFailure = false; } break; }
        case "FINALIZE_RESULT": break;
        case "END_TASK": break;
      }
    } catch (error) {
      diagnostics.push(diagnostic(program, ip, phase, "vm-error", error instanceof Error ? error.message : "Unknown VM error."));
      actionFailed = true;
      outcome = "error";
    }
    if (stack.length > maxStackDepth) { diagnostics.push(runtimeDiagnostic(program, ip, phase, "stack-limit", `Runtime stack exceeded ${maxStackDepth}.`, stack)); actionFailed = true; }
    trace?.push({ instructionIndex: ip, opcode: instruction.op, phase, stackDepthBefore: before, stackDepthAfter: stack.length, conditionId: "condition" in instruction ? instruction.condition.id : undefined, semanticRef: "ref" in instruction ? instruction.ref : "condition" in instruction ? instruction.condition.ref : undefined, outcome });
  }
  const mandatoryUnmet = conditions.filter((condition) => ["output", "require", "verify"].includes(condition.field) && condition.status !== "met");
  const fatalForbid = conditions.some((condition) => condition.field === "forbid" && condition.status === "unmet");
  const unmetReferences = conditions.filter((condition) => condition.status !== "met").map((condition) => condition.ref);
  const status: ExecutionResultStatus = preflightBlocked ? "blocked" : actionFailed || handlerFailed || fatalForbid ? "failed" : mandatoryUnmet.length ? "partial" : "completed";
  const failurePhase = preflightBlocked ? "pre_execution" : status === "completed" ? "none" : "post_execution";
  return { status, readiness: context.readiness, conditions, unmetReferences, capabilityChecks: capabilities, failureApplications, failurePhase, diagnostics, evidence, trace, executionEngine: "rpn-vm", programVersion: 1 };
}
