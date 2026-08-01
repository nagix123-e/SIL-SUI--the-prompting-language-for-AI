import type { SemanticIR, TaskAst } from "../../semantic-ir/src/index";
import {
  compileRpnProgram,
  executeRpnProgram,
  normalizeTask,
  type ActionAdapterResult,
  type CapabilityAssessment,
  type CapabilityValue,
  type ConditionResult,
  type ExecutionEvidence,
  type ExecutionResultStatus,
  type FailureApplication,
  type VmTraceEntry,
} from "./rpn-vm";

export type {
  ActionAdapterResult,
  ActionRequest,
  CapabilityAssessment,
  CapabilityValue,
  ConditionResult,
  EvidenceSource,
  EvidenceStatus,
  ExecutionEvidence,
  ExecutionPhase,
  ExecutionResultStatus,
  FailureApplication,
  FailureRule,
  InstructionSource,
  NormalizedTask,
  RpnInstruction,
  RpnProgram,
  RpnProgramValidation,
  StackEntry,
  StackValueType,
  TrackedCondition,
  VmDiagnostic,
  VmExecutionContext,
  VmExecutionResult,
  VmTraceEntry,
} from "./rpn-vm";
export { compileRpnProgram, executeRpnProgram, normalizeTask, validateRpnProgram } from "./rpn-vm";

export interface PostconditionResult {
  field: "output" | "require" | "verify";
  reference: string;
  status: "met" | "unmet" | "unavailable";
  evidence: ExecutionEvidence[];
  reason?: string;
}

export interface ExecutionResultAssessment {
  status: ExecutionResultStatus;
  /** Static readiness remains deliberately separate from this runtime result. */
  readiness?: { status: string; score: number };
  postconditions: PostconditionResult[];
  /** Includes every non-met condition, including prefer/forbid records. */
  unmetReferences: string[];
  capabilityChecks: CapabilityAssessment[];
  failurePhase: "none" | "pre_execution" | "post_execution";
  triggeredOnFailure: string[];
  diagnostics: string[];
  conditionResults: ConditionResult[];
  failureApplications: FailureApplication[];
  executionEngine: "rpn-vm";
  programVersion: 1;
  trace?: VmTraceEntry[];
  evidence: ExecutionEvidence[];
}

export interface AssessExecutionResultOptions {
  evidence: readonly ExecutionEvidence[];
  /** Exact SemanticRef capability map for environment-dependent requirements. */
  capabilities?: Readonly<Record<string, CapabilityValue>>;
  diagnostics?: readonly string[];
  readiness?: { status: string; score: number };
  /** Optional approved adapter; its self-report alone never satisfies a condition. */
  actionAdapter?: { execute(request: { taskId: string; goal: string; target: string; action: string; inputs: string[] }): ActionAdapterResult; };
  debug?: boolean;
  /** Optional parser output preserves exact source locations in VM diagnostics. */
  ast?: TaskAst;
}

function evidenceFor(reference: string, evidence: readonly ExecutionEvidence[]): ExecutionEvidence[] {
  return evidence.filter((item) => item.reference === reference);
}

/**
 * Public compatibility adapter. Execution now always goes through the normalized
 * RPN program, static validator, and typed stack VM before this legacy-shaped
 * assessment is returned.
 */
export function assessExecutionResult(ir: SemanticIR, options: AssessExecutionResultOptions): ExecutionResultAssessment {
  const program = compileRpnProgram(normalizeTask(ir, options.ast));
  const vm = executeRpnProgram(program, options);
  const postconditions: PostconditionResult[] = vm.conditions.flatMap((condition) => {
    if (condition.field !== "output" && condition.field !== "require" && condition.field !== "verify") return [];
    return [{
      field: condition.field,
      reference: condition.ref,
      status: condition.status === "met" ? "met" : condition.status === "unknown" ? "unavailable" : "unmet",
      evidence: evidenceFor(condition.ref, vm.evidence),
      reason: condition.reason,
    }];
  });
  return {
    status: vm.status,
    readiness: vm.readiness,
    postconditions,
    unmetReferences: vm.unmetReferences,
    capabilityChecks: vm.capabilityChecks,
    failurePhase: vm.failurePhase,
    triggeredOnFailure: vm.failureApplications.map((application) => application.rule),
    diagnostics: vm.diagnostics.map((item) => item.message),
    conditionResults: vm.conditions,
    failureApplications: vm.failureApplications,
    executionEngine: vm.executionEngine,
    programVersion: vm.programVersion,
    trace: vm.trace,
    evidence: vm.evidence,
  };
}
