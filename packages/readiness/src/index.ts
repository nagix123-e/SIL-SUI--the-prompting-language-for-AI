import { findEntry } from "../../codebook/src/index";
import type { Codebook, Diagnostic, SemanticIR, StatementKind } from "../../semantic-ir/src/index";

export type ReadinessStatus = "blocked" | "review" | "ready";
export type ReadinessSeverity = "blocker" | "warning";
/**
 * Whether a receiving agent can continue its normal workflow without turning
 * the contract review into a clarification-only dead end. This is deliberately
 * separate from host authorization: SIL never grants permission to use tools.
 */
export type ContinuationStatus = "blocked" | "continue_with_review" | "continue";

export interface EvidenceLike {
  field: "task" | StatementKind;
  value: string;
  kind: "matched" | "default" | "derived";
}

export interface ReadinessGap {
  code: string;
  field: string;
  severity: ReadinessSeverity;
  title: string;
  reason: string;
  likelyFailure: string;
  resolution: string;
  question: string;
}

export interface FailureForecast {
  code: string;
  severity: "high" | "medium";
  title: string;
  why: string;
  likelyOutcome: string;
  preventedBy: string[];
}

export interface ReadinessAssessment {
  profile: "coding-agent";
  status: ReadinessStatus;
  score: number;
  safeToExecute: boolean;
  continuation: ContinuationStatus;
  canContinue: boolean;
  summary: string;
  blockers: number;
  warnings: number;
  gaps: ReadinessGap[];
  failures: FailureForecast[];
  requiredQuestions: string[];
}

const genericReferences = new Set(["task.execute", "instruction.request"]);

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function addGap(gaps: ReadinessGap[], gap: ReadinessGap): void {
  if (!gaps.some((item) => item.code === gap.code)) gaps.push(gap);
}

function isDefaulted(evidence: readonly EvidenceLike[], field: StatementKind): boolean {
  return evidence.some((item) => item.field === field && item.kind === "default");
}

function unknownCoreReference(ir: SemanticIR, codebook: Codebook, field: "goal" | "target" | "action"): boolean {
  const reference = ir[field];
  return Boolean(reference && !findEntry(codebook, field, reference));
}

function failureForecasts(gaps: readonly ReadinessGap[]): FailureForecast[] {
  const gapCodes = new Set(gaps.map((gap) => gap.code));
  const failures: FailureForecast[] = [];

  if (gapCodes.has("generic-target") || gapCodes.has("missing-target")) {
    failures.push({
      code: "wrong-scope",
      severity: "high",
      title: "The agent chooses an arbitrary implementation scope",
      why: "The target identifies only a generic instruction request, not a repository component, feature, file set, or interface.",
      likelyOutcome: "Qwen may inspect or modify unrelated files, or respond with a generic explanation instead of a usable change.",
      preventedBy: ["A concrete target", "Repository or component boundaries", "Explicit files that may or may not change"],
    });
  }

  if (gapCodes.has("missing-output")) {
    failures.push({
      code: "undefined-deliverable",
      severity: "high",
      title: "Completion is declared without a defined deliverable",
      why: "No output states whether the task should produce code, a patch, a report, a command result, or another artifact.",
      likelyOutcome: "The model can stop after planning, produce the wrong artifact type, or make a change that cannot be evaluated.",
      preventedBy: ["Expected artifact type", "Destination or format", "Completion boundary"],
    });
  }

  if (gapCodes.has("missing-verification")) {
    failures.push({
      code: "false-success",
      severity: "high",
      title: "The agent can report success without evidence",
      why: "No verification rule defines tests, checks, observable behavior, or acceptance criteria.",
      likelyOutcome: "A plausible-looking implementation may be returned even when it does not build, pass tests, or satisfy the intended behavior.",
      preventedBy: ["A concrete test or check", "Observable acceptance criteria", "Required evidence in the final response"],
    });
  }

  if (gapCodes.has("missing-input")) {
    failures.push({
      code: "invented-context",
      severity: "medium",
      title: "Missing context is replaced with model assumptions",
      why: "The task does not identify the request data, repository context, files, examples, or other inputs available to the agent.",
      likelyOutcome: "Qwen may guess APIs, data shapes, tool availability, framework conventions, or user intent.",
      preventedBy: ["Named inputs", "Relevant repository context", "Examples or existing behavior"],
    });
  }

  if (gapCodes.has("missing-constraints")) {
    failures.push({
      code: "unbounded-change",
      severity: "medium",
      title: "The implementation can expand beyond the intended boundary",
      why: "No requirements or prohibitions protect compatibility, security, style, performance, or existing behavior.",
      likelyOutcome: "The agent may introduce broad refactors, regressions, insecure defaults, or incompatible interfaces.",
      preventedBy: ["Required invariants", "Forbidden changes", "Compatibility and security boundaries"],
    });
  }

  if (gapCodes.has("missing-failure-handling")) {
    failures.push({
      code: "partial-state",
      severity: "medium",
      title: "Failure can leave partial work without a recovery policy",
      why: "No on_failure rule says whether to stop, retry, roll back, preserve diagnostics, or ask for clarification.",
      likelyOutcome: "OpenCode may keep retrying, leave partially edited files, or hide the reason the task could not be completed.",
      preventedBy: ["Stop or rollback behavior", "Retry limit", "Required diagnostic reporting"],
    });
  }

  if (gapCodes.has("unknown-core-reference")) {
    failures.push({
      code: "semantic-decoding-gap",
      severity: "high",
      title: "The receiving model cannot reliably decode a core SIL reference",
      why: "At least one goal, target, or action is not registered in the selected codebook and has no guaranteed shared meaning.",
      likelyOutcome: "The model may interpret the reference literally, ignore it, or assign a different meaning than the compiler intended.",
      preventedBy: ["A registered preset", "A precise extension definition", "A generated natural-language contract"],
    });
  }

  return failures;
}

export function assessReadiness(
  ir: SemanticIR,
  codebook: Codebook,
  diagnostics: readonly Diagnostic[] = [],
  evidence: readonly EvidenceLike[] = [],
): ReadinessAssessment {
  const gaps: ReadinessGap[] = [];

  if (!ir.goal) {
    addGap(gaps, {
      code: "missing-goal",
      field: "goal",
      severity: "blocker",
      title: "No concrete objective",
      reason: "The SIL task does not declare what outcome should be achieved.",
      likelyFailure: "The agent cannot choose a stable completion condition.",
      resolution: "Declare one concrete goal preset or a precisely defined extension reference.",
      question: "What exact outcome must be achieved?",
    });
  } else if (genericReferences.has(ir.goal) || isDefaulted(evidence, "goal")) {
    addGap(gaps, {
      code: "generic-goal",
      field: "goal",
      severity: "blocker",
      title: "Objective came from a fallback",
      reason: `The goal "${ir.goal}" does not describe the requested outcome with enough specificity.`,
      likelyFailure: "The agent may optimize for a generic task rather than the user's actual objective.",
      resolution: "Replace the fallback with a matched goal and preserve any unmatched objective as a clarification.",
      question: "What user-visible or repository-visible outcome defines success?",
    });
  }

  if (!ir.target) {
    addGap(gaps, {
      code: "missing-target",
      field: "target",
      severity: "blocker",
      title: "No implementation target",
      reason: "The task does not identify the component, interface, service, document, or artifact to change.",
      likelyFailure: "The agent may operate on an arbitrary scope.",
      resolution: "Name the exact repository area or semantic target.",
      question: "Which component, files, interface, or behavior may be changed?",
    });
  } else if (genericReferences.has(ir.target) || isDefaulted(evidence, "target")) {
    addGap(gaps, {
      code: "generic-target",
      field: "target",
      severity: "blocker",
      title: "Target is only a generic request",
      reason: `The target "${ir.target}" identifies the instruction itself rather than the thing to implement.`,
      likelyFailure: "OpenCode has no principled way to choose files or a repository boundary.",
      resolution: "Specify a registered target or a precise extension with repository scope.",
      question: "What exact feature, component, endpoint, screen, or file set is in scope?",
    });
  }

  if (!ir.action) {
    addGap(gaps, {
      code: "missing-action",
      field: "action",
      severity: "blocker",
      title: "No operation is declared",
      reason: "The task does not state whether the target should be created, updated, removed, analyzed, or validated.",
      likelyFailure: "The model may select an operation that changes the wrong state.",
      resolution: "Declare one concrete action.",
      question: "What operation must be performed on the target?",
    });
  } else if (isDefaulted(evidence, "action")) {
    addGap(gaps, {
      code: "generic-action",
      field: "action",
      severity: "warning",
      title: "Action came from a fallback",
      reason: `The action "${ir.action}" was not supported by a matched source phrase.`,
      likelyFailure: "The implementation method may not reflect the user's intended operation.",
      resolution: "Confirm whether the target should be created, modified, deleted, migrated, or analyzed.",
      question: "Which concrete operation should be applied?",
    });
  }

  if (["goal", "target", "action"].some((field) => unknownCoreReference(ir, codebook, field as "goal" | "target" | "action"))) {
    addGap(gaps, {
      code: "unknown-core-reference",
      field: "goal/target/action",
      severity: genericReferences.has(ir.target ?? "") ? "blocker" : "warning",
      title: "Core meaning is outside the selected codebook",
      reason: "A core reference cannot be resolved against core-v0.1.",
      likelyFailure: "The SIL producer and Qwen may assign different meanings to the same reference.",
      resolution: "Use a registered preset or include a precise extension definition in the handoff contract.",
      question: "Should the unknown reference be replaced with a registered preset or formally defined as an extension?",
    });
  }

  if (!ir.outputs.length) {
    addGap(gaps, {
      code: "missing-output",
      field: "output",
      severity: "warning",
      title: "Expected deliverable is unspecified",
      reason: "The task has no output reference.",
      likelyFailure: "The model can finish with the wrong artifact or with explanation only.",
      resolution: "Declare the artifact, response, patch, report, list, or status that must be produced.",
      question: "What exact artifact or observable result must OpenCode return?",
    });
  }

  if (!ir.verification.length) {
    addGap(gaps, {
      code: "missing-verification",
      field: "verify",
      severity: "warning",
      title: "No acceptance test",
      reason: "Nothing defines how success will be checked.",
      likelyFailure: "The agent can claim completion without proving correctness.",
      resolution: "Add tests, build checks, observable behavior, or another acceptance criterion.",
      question: "Which test or observable condition proves the task succeeded?",
    });
  }

  if (!ir.inputs.length) {
    addGap(gaps, {
      code: "missing-input",
      field: "input",
      severity: "warning",
      title: "Required context is not named",
      reason: "No request data, repository context, examples, or files are declared as inputs.",
      likelyFailure: "The model may silently invent context.",
      resolution: "Name the data and repository context the agent is allowed to use.",
      question: "Which files, examples, request data, or existing behavior should be used as input?",
    });
  }

  if (!ir.required.length && !ir.forbidden.length && !ir.preferred.length) {
    addGap(gaps, {
      code: "missing-constraints",
      field: "require/forbid/prefer",
      severity: "warning",
      title: "No change boundaries",
      reason: "The task has no required invariant, prohibition, or preference.",
      likelyFailure: "The change can grow beyond the intended scope or break existing behavior.",
      resolution: "Declare compatibility, security, scope, and quality boundaries.",
      question: "What must be preserved, and what changes are forbidden?",
    });
  }

  if (!ir.failureHandling.length) {
    addGap(gaps, {
      code: "missing-failure-handling",
      field: "on_failure",
      severity: "warning",
      title: "No recovery or stop policy",
      reason: "The task does not say what to do when a tool, test, or implementation step fails.",
      likelyFailure: "The agent may retry indefinitely or leave partial changes.",
      resolution: "Declare stop, rollback, retry, escalation, or diagnostic behavior.",
      question: "If implementation or verification fails, should OpenCode stop, retry, roll back, or ask for help?",
    });
  }

  if (diagnostics.some((item) => item.severity === "error")) {
    addGap(gaps, {
      code: "invalid-sil",
      field: "diagnostics",
      severity: "blocker",
      title: "SIL validation failed",
      reason: "The task contains structural or semantic errors.",
      likelyFailure: "Any downstream interpretation would be based on an invalid contract.",
      resolution: "Resolve all validation errors before preparing an execution handoff.",
      question: "Can the validation errors be resolved before any execution is attempted?",
    });
  }

  const blockers = gaps.filter((gap) => gap.severity === "blocker").length;
  const warnings = gaps.filter((gap) => gap.severity === "warning").length;
  const score = Math.max(0, Math.min(100, 100 - blockers * 18 - warnings * 7));
  const status: ReadinessStatus = blockers ? "blocked" : warnings ? "review" : "ready";
  const continuation: ContinuationStatus = blockers
    ? "blocked"
    : warnings
      ? "continue_with_review"
      : "continue";
  const summary = status === "blocked"
    ? `Execution is blocked by ${blockers} unresolved specification gap${blockers === 1 ? "" : "s"}.`
    : status === "review"
      ? `No hard blocker was found, but ${warnings} item${warnings === 1 ? "" : "s"} should be reviewed.`
      : "The task has a concrete target, deliverable, constraints, verification, and failure policy.";

  return {
    profile: "coding-agent",
    status,
    score,
    safeToExecute: blockers === 0,
    continuation,
    canContinue: continuation !== "blocked",
    summary,
    blockers,
    warnings,
    gaps,
    failures: failureForecasts(gaps),
    requiredQuestions: unique(gaps.filter((gap) => gap.severity === "blocker").map((gap) => gap.question)),
  };
}
