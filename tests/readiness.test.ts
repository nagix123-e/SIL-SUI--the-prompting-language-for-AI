import { describe, expect, it } from "vitest";
import { compileNaturalLanguage, compileSil } from "../packages/compiler/src/index";

const incomplete = `task InstructionRequestTask {
  goal: feature.add
  target: instruction.request
  action: implement
}`;

const ready = `task BuildSearch {
  goal: feature.add
  target: product.search
  action: implement
  input: user.query
  output: product.list
  require: input.validate
  forbid: secret.expose
  verify: tests.pass
  on_failure: transaction.rollback
}`;

describe("execution readiness", () => {
  it("separates syntactic validity from execution readiness", () => {
    const result = compileSil(incomplete);
    expect(result.valid).toBe(true);
    expect(result.readiness.safeToExecute).toBe(false);
    expect(result.readiness.status).toBe("blocked");
    expect(result.readiness.gaps.map((gap) => gap.code)).toEqual(
      expect.arrayContaining([
        "generic-target",
        "unknown-core-reference",
        "missing-output",
        "missing-verification",
        "missing-input",
        "missing-constraints",
        "missing-failure-handling",
      ]),
    );
  });

  it("predicts concrete failure causes without executing the task", () => {
    const result = compileSil(incomplete);
    expect(result.readiness.failures.map((failure) => failure.code)).toEqual(
      expect.arrayContaining([
        "wrong-scope",
        "undefined-deliverable",
        "false-success",
        "invented-context",
        "unbounded-change",
        "partial-state",
        "semantic-decoding-gap",
      ]),
    );
    expect(result.readiness.summary).toMatch(/Execution is blocked/u);
  });

  it("generates a non-executing OpenCode contract when blocked", () => {
    const result = compileSil(incomplete);
    expect(result.handoffPrompt).toContain("Host authorization: required separately");
    expect(result.handoffPrompt).toContain("Do not execute the task");
    expect(result.handoffPrompt).toContain("SIL_READINESS_BLOCKED");
    expect(result.handoffPrompt).toContain("What exact feature, component, endpoint, screen, or file set is in scope?");
  });

  it("marks a complete static contract as ready without granting host authority", () => {
    const result = compileSil(ready);
    expect(result.valid).toBe(true);
    expect(result.readiness).toMatchObject({
      status: "ready",
      score: 100,
      safeToExecute: true,
      blockers: 0,
      warnings: 0,
      gaps: [],
      failures: [],
    });
    expect(result.handoffPrompt).toContain("Workflow: CONTINUE");
  });

  it("continues with an explicit review ledger for omitted deliverable and verification", () => {
    const result = compileSil(`task ExploreSearch {
  goal: feature.add
  target: product.search
  action: implement
  input: repository.current
  require: compatibility.preserve
  on_failure: task.abort
}`);

    expect(result.valid).toBe(true);
    expect(result.readiness).toMatchObject({
      status: "review",
      safeToExecute: true,
      continuation: "continue_with_review",
      canContinue: true,
    });
    expect(result.readiness.gaps.map((gap) => gap.code)).toEqual(
      expect.arrayContaining(["missing-output", "missing-verification"]),
    );
    expect(result.handoffPrompt).toContain("Workflow: CONTINUE WITH REVIEW");
    expect(result.handoffPrompt).toContain("SIL_CONTINUE_WITH_REVIEW");
    expect(result.handoffPrompt).not.toContain("Do not execute the task");
  });

  it("marks mechanically defaulted core meanings as blockers", () => {
    const result = compileNaturalLanguage("Please do the requested task.");
    expect(result.readiness.status).toBe("blocked");
    expect(result.readiness.gaps.map((gap) => gap.code)).toEqual(
      expect.arrayContaining(["generic-goal", "generic-target", "generic-action"]),
    );
    expect(result.confidence).toBeLessThanOrEqual(result.readiness.score / 100);
  });

  it("is deterministic for readiness, forecasts, and handoff prompts", () => {
    const first = compileSil(incomplete);
    const second = compileSil(incomplete);
    expect(second.readiness).toEqual(first.readiness);
    expect(second.handoffPrompt).toBe(first.handoffPrompt);
  });
});
