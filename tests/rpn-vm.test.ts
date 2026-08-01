import { describe, expect, it } from "vitest";
import {
  compileRpnProgram,
  compileSil,
  executeRpnProgram,
  normalizeTask,
  parseSil,
  validateRpnProgram,
  type RpnInstruction,
  type RpnProgram,
} from "../packages/compiler/src/index";

const source = `task PublishPost {
  goal: post.publish
  target: social.post
  action: create
  input: post.content
  output: post.id.present
  require: user.authenticated
  require: token_usage.present
  prefer: response.concise
  forbid: post.duplicate
  verify: post.persisted
  verify: tests.pass
  on_failure: diagnostics.preserve
  on_failure: task.abort
}`;

function compiledProgram(): RpnProgram {
  const ir = compileSil(source).ir;
  return compileRpnProgram(normalizeTask(ir, parseSil(source)));
}

function programWith(instructions: RpnInstruction[]): RpnProgram {
  const base = compiledProgram();
  const sourceMap = Object.fromEntries(instructions.map((_, index) => [index, base.sourceMap[index] ?? { normalizedNodeId: `test:${index}` }]));
  return { ...base, instructions, sourceMap };
}

describe("SIL RPN execution engine", () => {
  it("normalizes repeated conditions with stable IDs and deterministic instruction order", () => {
    const first = compiledProgram();
    const second = compiledProgram();
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    type ConditionInstruction = Extract<RpnInstruction, { condition: unknown }>;
    const requires = first.instructions.filter((instruction): instruction is ConditionInstruction => "condition" in instruction && instruction.op === "CHECK_REQUIRE");
    const verifies = first.instructions.filter((instruction): instruction is ConditionInstruction => "condition" in instruction && instruction.op === "CHECK_VERIFY");
    expect(requires.map((instruction) => instruction.condition.id)).toEqual(["require:0", "require:1"]);
    expect(verifies.map((instruction) => instruction.condition.id)).toEqual(["verify:0", "verify:1"]);
    const outputCheck = first.instructions.findIndex((instruction) => instruction.op === "CHECK_OUTPUT");
    expect(first.sourceMap[outputCheck]).toMatchObject({ field: "output", normalizedNodeId: "output:0", sourceLocation: { line: 6, column: 3 } });
    expect(JSON.parse(JSON.stringify(first))).toMatchObject({ version: 1, taskId: "PublishPost" });
  });

  it("statically rejects malformed bytecode before it can execute", () => {
    const base = compiledProgram();
    const underflow = programWith([{ op: "BEGIN_TASK", taskId: "PublishPost" }, { op: "CHECK_OUTPUT", condition: { id: "output:0", field: "output", index: 0, ref: "post.id.present" } }, { op: "APPLY_ON_FAILURE", rules: [{ id: "on_failure:0", index: 0, ref: "task.abort" }] }, { op: "FINALIZE_RESULT" }, { op: "END_TASK" }]);
    const unknown = { ...base, instructions: [{ op: "BEGIN_TASK", taskId: "PublishPost" }, { op: "UNSAFE_DYNAMIC" }, { op: "END_TASK" }] } as unknown as RpnProgram;
    const duplicate = programWith(base.instructions.map((instruction) => instruction.op === "CHECK_VERIFY" ? { ...instruction, condition: { ...instruction.condition, id: "verify:0" } } : instruction));
    expect(validateRpnProgram(underflow).diagnostics.map((item) => item.code)).toContain("stack-underflow");
    expect(validateRpnProgram(unknown).diagnostics.map((item) => item.code)).toContain("unknown-opcode");
    expect(validateRpnProgram(duplicate).diagnostics.map((item) => item.code)).toContain("duplicate-condition-id");
    expect(executeRpnProgram(underflow, { evidence: [] })).toMatchObject({ status: "blocked", executionEngine: "rpn-vm" });
  });

  it("rejects terminal, phase, source-map, and version contract violations", () => {
    const base = compiledProgram();
    const afterEnd = programWith([...base.instructions, { op: "PUSH_REF", ref: "late.ref" }]);
    const backwardsPhase = programWith([
      { op: "BEGIN_TASK", taskId: "PhaseTask" },
      { op: "PUSH_REF", ref: "goal.ref" }, { op: "PUSH_REF", ref: "target.ref" }, { op: "PUSH_REF", ref: "action.ref" },
      { op: "BUILD_ACTION_REQUEST", inputCount: 0 }, { op: "EXECUTE_ACTION" }, { op: "CAPTURE_ACTION_RESULT" }, { op: "CAPTURE_EVIDENCE" },
      { op: "GT" }, { op: "APPLY_ON_FAILURE", rules: [{ id: "on_failure:0", index: 0, ref: "task.abort" }] }, { op: "FINALIZE_RESULT" }, { op: "END_TASK" },
    ]);
    const noSourceMap = { ...base, sourceMap: {} };
    const unsupportedVersion = { ...base, version: 2 } as unknown as RpnProgram;
    expect(validateRpnProgram(afterEnd).diagnostics.map((item) => item.code)).toContain("instruction-after-end");
    expect(validateRpnProgram(backwardsPhase).diagnostics.map((item) => item.code)).toContain("invalid-phase-transition");
    expect(validateRpnProgram(noSourceMap).diagnostics.map((item) => item.code)).toContain("missing-source-map");
    expect(validateRpnProgram(unsupportedVersion).diagnostics.map((item) => item.code)).toContain("unsupported-program-version");
  });

  it("supports typed stack operators and emits an optional deterministic trace", () => {
    const program = programWith([
      { op: "BEGIN_TASK", taskId: "MathTask" },
      { op: "PUSH_LITERAL", value: 4, valueType: "number" },
      { op: "PUSH_LITERAL", value: 2, valueType: "number" },
      { op: "GT" },
      { op: "POP" },
      { op: "PUSH_REF", ref: "goal.ref" },
      { op: "PUSH_REF", ref: "target.ref" },
      { op: "PUSH_REF", ref: "action.ref" },
      { op: "BUILD_ACTION_REQUEST", inputCount: 0 },
      { op: "EXECUTE_ACTION" },
      { op: "CAPTURE_ACTION_RESULT" },
      { op: "CAPTURE_EVIDENCE" },
      { op: "APPLY_ON_FAILURE", rules: [{ id: "on_failure:0", index: 0, ref: "task.abort" }] },
      { op: "FINALIZE_RESULT" },
      { op: "END_TASK" },
    ]);
    const result = executeRpnProgram(program, { evidence: [], debug: true });
    expect(validateRpnProgram(program)).toMatchObject({ valid: true });
    expect(result).toMatchObject({ status: "completed", executionEngine: "rpn-vm", programVersion: 1 });
    expect(result.trace?.map((item) => item.opcode)).toEqual(program.instructions.map((instruction) => instruction.op));
    expect(result.trace?.find((item) => item.opcode === "GT")).toMatchObject({ stackDepthBefore: 2, stackDepthAfter: 1 });
  });

  it("records every condition independently and treats a triggered forbid as fatal", () => {
    const result = executeRpnProgram(compiledProgram(), {
      evidence: [
        { reference: "post.id.present", status: "satisfied", source: "artifact" },
        { reference: "user.authenticated", status: "satisfied", source: "capability" },
        { reference: "token_usage.present", status: "satisfied", source: "tool", numericValue: 160 },
        { reference: "post.duplicate", status: "satisfied", source: "artifact" },
        { reference: "post.persisted", status: "unavailable", source: "tool" },
        { reference: "tests.pass", status: "satisfied", source: "test" },
      ],
    });
    expect(result.conditions.map((condition) => [condition.id, condition.status])).toEqual([
      ["output:0", "met"], ["require:0", "met"], ["require:1", "met"], ["prefer:0", "unmet"], ["forbid:0", "unmet"], ["verify:0", "unknown"], ["verify:1", "met"],
    ]);
    expect(result.status).toBe("failed");
    expect(result.unmetReferences).toEqual(["response.concise", "post.duplicate", "post.persisted"]);
    expect(result.diagnostics.some((item) => item.relatedRef === "post.duplicate" && item.phase === "postcondition_validation")).toBe(true);
  });

  it("keeps a ready task separate from partial evidence and applies failure rules once", () => {
    const result = executeRpnProgram(compiledProgram(), {
      readiness: { status: "ready", score: 100 },
      evidence: [
        { reference: "post.id.present", status: "satisfied", source: "artifact" },
        { reference: "user.authenticated", status: "satisfied", source: "capability" },
        { reference: "token_usage.present", status: "unavailable", source: "tool", documented: true },
        { reference: "post.persisted", status: "satisfied", source: "test" },
        { reference: "tests.pass", status: "satisfied", source: "test" },
      ],
      failureHandler: () => true,
    });
    expect(result.readiness).toEqual({ status: "ready", score: 100 });
    expect(result.status).toBe("partial");
    expect(result.failureApplications.map((application) => application.rule)).toEqual(["diagnostics.preserve", "task.abort"]);
    expect(result.failureApplications.every((application) => application.originalPhase === "postcondition_validation")).toBe(true);
  });

  it("fails on adapter failure and reports an explicit failure-handler error", () => {
    const result = executeRpnProgram(compiledProgram(), {
      evidence: [],
      actionAdapter: { execute: () => ({ success: false, detail: "Adapter refused the request." }) },
      failureHandler: () => false,
    });
    expect(result.status).toBe("failed");
    expect(result.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining(["action-failed", "failure-handler-error"]));
  });
});
