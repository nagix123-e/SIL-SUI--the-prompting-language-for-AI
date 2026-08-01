import type { SemanticIR } from "../../semantic-ir/src/index";
import type { ReadinessAssessment } from "../../readiness/src/index";

function lines(title: string, values: string[]): string[] {
  return values.length ? [title, ...values.map((value) => `- ${value}`)] : [];
}

export function generatePrompt(ir: SemanticIR): string {
  const sections = [
    `Task: ${ir.taskId}`,
    "",
    "Objective",
    `- Goal: ${ir.goal ?? "unspecified"}`,
    `- Target: ${ir.target ?? "unspecified"}`,
    `- Action: ${ir.action ?? "unspecified"}`,
    ...lines("\nInputs", ir.inputs),
    ...lines("\nExpected outputs", ir.outputs),
    ...lines("\nRequirements", ir.required),
    ...lines("\nPreferences", ir.preferred),
    ...lines("\nProhibitions", ir.forbidden),
    ...lines("\nVerification", ir.verification),
    ...lines("\nIf the task fails", ir.failureHandling),
  ];
  return `${sections.join("\n").trim()}\n`;
}

export function generateMarkdownPrompt(ir: SemanticIR): string {
  return generatePrompt(ir)
    .replace(/^Task: (.+)$/m, "# $1")
    .replace(/^Objective$/m, "## Objective")
    .replace(/^(Inputs|Expected outputs|Requirements|Preferences|Prohibitions|Verification|If the task fails)$/gm, "## $1");
}

export function generateJsonPrompt(ir: SemanticIR): string {
  return JSON.stringify(ir, null, 2);
}

export function generateOpenCodeHandoff(ir: SemanticIR, readiness: ReadinessAssessment): string {
  const blocked = !readiness.canContinue;
  const reviewing = readiness.continuation === "continue_with_review";
  const lines = [
    "# SIL → OpenCode execution contract",
    "",
    `Readiness: ${readiness.status.toUpperCase()} (${readiness.score}/100)`,
    "Host authorization: required separately; SIL itself does not authorize tools or external actions.",
    `Workflow: ${blocked ? "STOP FOR SPECIFICATION" : reviewing ? "CONTINUE WITH REVIEW" : "CONTINUE"}`,
    "",
    "## Safety gate",
    blocked
      ? "Do not execute the task, call tools, inspect a repository, edit files, or allocate implementation resources yet."
      : reviewing
        ? "Do not stop solely for review findings. If the host separately authorizes work, begin bounded discovery and carry every finding as an explicit assumption or pending verification."
        : "If the host separately authorizes work, review the complete contract before calling tools or editing files.",
    blocked
      ? "Use this message only to explain the missing specification and ask the listed clarification questions."
      : reviewing
        ? "Do not invent evidence, silently widen scope, or claim an omitted output or verification passed. Ask a question only when the ambiguity makes a safe bounded choice impossible."
        : "Operate only inside the declared target, constraints, verification, and failure policy.",
    "Never treat SIL syntax validity as execution authorization.",
    "",
    "## Normalized task",
    generatePrompt(ir).trimEnd(),
    "",
    "## Readiness findings",
    readiness.gaps.length
      ? readiness.gaps
          .map(
            (gap) =>
              `- [${gap.severity.toUpperCase()}] ${gap.field}: ${gap.title}\n  Why: ${gap.reason}\n  Likely failure: ${gap.likelyFailure}\n  Resolve with: ${gap.resolution}`,
          )
          .join("\n")
      : "- No specification gaps detected.",
    "",
    "## Blocking clarification questions",
    readiness.requiredQuestions.length
      ? readiness.requiredQuestions.map((question, index) => `${index + 1}. ${question}`).join("\n")
      : "None. Review findings are carried forward rather than causing a clarification-only stop.",
    "",
    "## Predicted failure modes",
    readiness.failures.length
      ? readiness.failures
          .map(
            (failure) =>
              `- ${failure.title} (${failure.severity})\n  Cause: ${failure.why}\n  Expected outcome: ${failure.likelyOutcome}`,
          )
          .join("\n")
      : "- No failure mode was inferred from missing task parameters.",
    "",
    "## Response protocol",
    blocked
      ? "Return `SIL_READINESS_BLOCKED`, summarize why execution is unsafe, and ask only the blocking clarification questions. Do not propose that work was performed."
      : reviewing
        ? "Return `SIL_CONTINUE_WITH_REVIEW`. State the concrete assumptions and pending verification before work, then report only evidence actually obtained."
        : "Before implementation, restate the target, deliverable, constraints, verification, and failure behavior. After implementation, report concrete verification evidence.",
  ];
  return `${lines.join("\n").trim()}\n`;
}
