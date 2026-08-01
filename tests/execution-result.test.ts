import { describe, expect, it } from "vitest";
import { assessExecutionResult, compileSil } from "../packages/compiler/src/index";

const task = `task ValidateRunner {
  goal: feature.add
  target: product.search
  action: implement
  input: user.query
  output: runner.report
  require: token_usage.present
  verify: tests.pass
  on_failure: diagnostics.preserve
  on_failure: task.abort
}`;

const ir = compileSil(task).ir;

describe("post-execution SIL result assessment", () => {
  it("keeps readiness separate when a ready task finishes partially", () => {
    const result = assessExecutionResult(ir, {
      readiness: { status: "ready", score: 100 },
      evidence: [
        { reference: "runner.report", status: "satisfied", source: "artifact" },
        { reference: "token_usage.present", status: "unavailable", source: "tool", detail: "provider did not return usage" },
        { reference: "tests.pass", status: "satisfied", source: "test" },
      ],
    });
    expect(result.readiness).toEqual({ status: "ready", score: 100 });
    expect(result.status).toBe("partial");
    expect(result.unmetReferences).toEqual(["token_usage.present"]);
    expect(result.failurePhase).toBe("post_execution");
    expect(result.triggeredOnFailure).toEqual(["diagnostics.preserve", "task.abort"]);
  });

  it("does not accept self-report or an estimate as token usage evidence", () => {
    const result = assessExecutionResult(ir, {
      evidence: [
        { reference: "runner.report", status: "satisfied", source: "artifact" },
        { reference: "token_usage.present", status: "satisfied", source: "agent", numericValue: 42 },
        { reference: "tests.pass", status: "satisfied", source: "test" },
      ],
    });
    expect(result.status).toBe("partial");
    expect(result.postconditions.find((item) => item.reference === "token_usage.present")).toMatchObject({ status: "unmet" });
  });

  it("allows capture-if-available when unavailability is documented", () => {
    const optionalCapture = compileSil(task.replace("token_usage.present", "token_usage.capture_if_available")).ir;
    const result = assessExecutionResult(optionalCapture, {
      evidence: [
        { reference: "runner.report", status: "satisfied", source: "artifact" },
        { reference: "token_usage.capture_if_available", status: "unavailable", source: "tool", documented: true },
        { reference: "tests.pass", status: "satisfied", source: "test" },
      ],
    });
    expect(result.status).toBe("completed");
  });

  it("blocks before execution when an environment capability is unavailable", () => {
    const result = assessExecutionResult(ir, {
      capabilities: { "token_usage.present": false },
      evidence: [],
    });
    expect(result.status).toBe("blocked");
    expect(result.failurePhase).toBe("pre_execution");
    expect(result.triggeredOnFailure).toEqual([]);
  });

  it("keeps adapter-provided observable evidence in the compatibility result", () => {
    const result = assessExecutionResult(ir, {
      evidence: [
        { reference: "token_usage.present", status: "satisfied", source: "tool", numericValue: 160 },
        { reference: "tests.pass", status: "satisfied", source: "test" },
      ],
      actionAdapter: {
        execute: () => ({ success: true, evidence: [{ reference: "runner.report", status: "satisfied", source: "artifact", id: "artifact:runner-report" }] }),
      },
    });
    expect(result.executionEngine).toBe("rpn-vm");
    expect(result.postconditions.find((item) => item.reference === "runner.report")?.evidence).toEqual([
      expect.objectContaining({ id: "artifact:runner-report" }),
    ]);
  });
});
