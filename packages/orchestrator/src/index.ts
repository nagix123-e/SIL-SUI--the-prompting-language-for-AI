import type { Diagnostic } from "../../semantic-ir/src/index";
import { allItems, allNodes, buildDependencyGraph, type V03Document, type V03Node } from "../../v03/src/index";

/**
 * Runtime orchestration is deliberately separate from SIL/SUI source.  A
 * contract describes intended work; this module records what a host has
 * actually observed and returns a bounded next-step plan.  It never invokes
 * tools, edits files, or treats declared authorization as host permission.
 */
export type OrchestrationMode = "discover" | "repair" | "implement" | "verify" | "release";
export type DependencyKind = "hard" | "soft" | "evidence" | "release";
export type GateDisposition = "satisfied" | "defer" | "hard_block";
export type PhaseStatus = "not_started" | "discovering" | "implementing" | "verifying" | "completed" | "partial" | "blocked" | "deferred";
export type ObservationStatus = "satisfied" | "unmet" | "unavailable" | "unknown";

export interface RuntimeObservation {
  reference: string;
  status: ObservationStatus;
  source: "repository" | "test" | "artifact" | "runtime" | "user" | "capability";
  detail?: string;
  observedAt?: string;
}

export interface PhaseLedgerEntry {
  phase: string;
  status: PhaseStatus;
  evidence: string[];
  blockers: string[];
  updatedAt?: string;
}

export interface OrchestrationOptions {
  mode?: OrchestrationMode;
  observations?: readonly RuntimeObservation[];
  ledger?: readonly PhaseLedgerEntry[];
  /** A host-provided fact only. It never derives from execution_authorized. */
  hostAuthorized?: boolean;
}

export interface GateAssessment {
  reference: string;
  kind: "dependency" | "evidence" | "capability" | "release";
  dependencyKind?: DependencyKind;
  disposition: GateDisposition;
  reason: string;
  evidence?: RuntimeObservation;
}

export interface PhasePlan {
  phase: string;
  mode: OrchestrationMode;
  currentStatus: PhaseStatus;
  nextStatus: PhaseStatus;
  canProceed: boolean;
  gates: GateAssessment[];
  discoveryRequests: string[];
  deferredReferences: string[];
}

export interface OrchestrationReport {
  version: 1;
  generatedAt: string;
  mode: OrchestrationMode;
  valid: boolean;
  contractAuthorization: { declared: boolean; staticAuthorization: false };
  actualHostAuthorization: "granted" | "not_granted";
  phases: PhasePlan[];
  ledger: PhaseLedgerEntry[];
  diagnostics: Diagnostic[];
  summary: { status: "ready" | "partial" | "blocked"; hardBlocks: number; deferred: number };
}

function descendants(node: V03Node) {
  return allItems(node).filter((item) => item.type === "statement");
}

function taskNodes(document: V03Document): V03Node[] {
  return allNodes(document).filter((node) => node.kind === "task");
}

function values(node: V03Node, field: string): string[] {
  return descendants(node).filter((statement) => statement.field === field).map((statement) => statement.value);
}

function dependencyKind(task: V03Node): DependencyKind {
  const value = values(task, "dependency_kind")[0];
  // Existing depends_on syntax expresses ordering, not proof that a previous
  // phase completed. Preserve the order graph, but require an explicit hard
  // marker before an unobserved ledger entry can stop unrelated work.
  return value === "soft" || value === "evidence" || value === "release" || value === "hard" ? value : "soft";
}

function isEnvironmentRequirement(reference: string): boolean {
  return /^(?:platform|tool|model|environment|credential|token_usage)\./u.test(reference);
}

function isReleaseOperation(reference: string): boolean {
  return /^(?:release|publish|deploy|sign|package)\./u.test(reference);
}

function isSafetyCritical(reference: string): boolean {
  return /^(?:credential|secret|personal_data\.delete|data\.delete|repository\.delete|payment|publish|deploy|sign)\./u.test(reference);
}

function observationFor(reference: string, observations: readonly RuntimeObservation[]): RuntimeObservation | undefined {
  return observations.find((item) => item.reference === reference);
}

function nextStatus(mode: OrchestrationMode, gates: readonly GateAssessment[]): PhaseStatus {
  if (gates.some((gate) => gate.disposition === "hard_block")) return "blocked";
  if (gates.some((gate) => gate.disposition === "defer")) return "partial";
  return mode === "discover" ? "discovering" : mode === "verify" ? "verifying" : mode === "implement" || mode === "repair" ? "implementing" : "not_started";
}

/**
 * Creates a non-executing work plan. Missing evidence is a deferred discovery
 * request by default; only safety-critical or explicitly hard dependencies
 * block the phase. This avoids rolling an unrelated task back to the earliest
 * unproven phase in a prose plan.
 */
export function orchestrateV03(document: V03Document, options: OrchestrationOptions = {}): OrchestrationReport {
  const mode = options.mode ?? "discover";
  const observations = options.observations ?? [];
  const existing = new Map((options.ledger ?? []).map((entry) => [entry.phase, entry]));
  const graph = buildDependencyGraph(document).graph;
  const contractAuthorization = descendants({ ...document.nodes[0], items: document.nodes } as V03Node)
    .some((statement) => statement.field === "execution_authorized" && statement.value === "true");
  const diagnostics: Diagnostic[] = [];
  const phases = taskNodes(document).map((task) => {
    const phase = task.name ?? task.id;
    const current = existing.get(phase)?.status ?? "not_started";
    const gates: GateAssessment[] = [];
    const kind = dependencyKind(task);
    for (const edge of graph.edges.filter((candidate) => candidate.from === phase)) {
      const prerequisite = existing.get(edge.to);
      const completed = prerequisite?.status === "completed";
      gates.push({
        reference: edge.to,
        kind: "dependency",
        dependencyKind: kind,
        disposition: completed ? "satisfied" : kind === "hard" ? "hard_block" : "defer",
        reason: completed ? "The phase ledger records this dependency as completed." : kind === "hard" ? "A hard dependency is not completed in the phase ledger." : `A ${kind} dependency is not completed; continue with a recorded deferral.`,
      });
    }
    const evidenceReferences = [...values(task, "input"), ...values(task, "output"), ...values(task, "require"), ...values(task, "verify")];
    for (const reference of [...new Set(evidenceReferences)]) {
      const evidence = observationFor(reference, observations);
      const release = isReleaseOperation(reference) || mode === "release" && /^(?:tests|build|format|package|sign|publish|deploy)\./u.test(reference);
      const capability = isEnvironmentRequirement(reference);
      const critical = isSafetyCritical(reference) || release;
      const disposition: GateDisposition = evidence?.status === "satisfied" ? "satisfied" : evidence?.status === "unmet" && critical ? "hard_block" : "defer";
      gates.push({
        reference,
        kind: release ? "release" : capability ? "capability" : "evidence",
        disposition,
        reason: evidence?.status === "satisfied" ? "Observed evidence is available." : evidence?.status === "unmet" && critical ? "A safety-critical or release precondition is explicitly unmet." : "No sufficient observed evidence is available; collect it without blocking unrelated work.",
        evidence,
      });
    }
    if (mode === "release" && !options.hostAuthorized) gates.push({ reference: "host.release_authorization", kind: "release", disposition: "hard_block", reason: "Release mode requires explicit host authorization." });
    const plannedStatus = nextStatus(mode, gates);
    const deferredReferences = gates.filter((gate) => gate.disposition === "defer").map((gate) => gate.reference);
    return {
      phase,
      mode,
      currentStatus: current,
      nextStatus: plannedStatus,
      canProceed: plannedStatus !== "blocked" && (mode === "discover" || Boolean(options.hostAuthorized)),
      gates,
      discoveryRequests: [...new Set(deferredReferences)],
      deferredReferences,
    };
  });
  const ledger = phases.map((phase) => ({
    phase: phase.phase,
    status: phase.nextStatus,
    evidence: phase.gates.filter((gate) => gate.disposition === "satisfied").map((gate) => gate.reference),
    blockers: phase.gates.filter((gate) => gate.disposition === "hard_block").map((gate) => gate.reference),
  }));
  const hardBlocks = phases.flatMap((phase) => phase.gates).filter((gate) => gate.disposition === "hard_block").length;
  const deferred = phases.flatMap((phase) => phase.deferredReferences).length;
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    mode,
    valid: true,
    contractAuthorization: { declared: contractAuthorization, staticAuthorization: false },
    actualHostAuthorization: options.hostAuthorized ? "granted" : "not_granted",
    phases,
    ledger,
    diagnostics,
    summary: { status: hardBlocks ? "blocked" : deferred ? "partial" : "ready", hardBlocks, deferred },
  };
}
