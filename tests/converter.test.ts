import { describe, expect, it } from "vitest";
import { findEntry } from "../packages/codebook/src/index";
import {
  compileNaturalLanguage,
  compileSil,
  coreCodebook,
  inspectPromptForm,
  STRUCTURED_PROMPT_TEMPLATE,
  type StatementKind,
} from "../packages/compiler/src/index";

describe("deterministic English prompt conversion", () => {
  it("selects generated presets only when every component is present", () => {
    const result = compileNaturalLanguage("Create an encrypted account service.");

    expect(result.ir).toMatchObject({
      taskId: "AccountServiceTask",
      goal: "account.create",
      target: "account.service",
      action: "account.create",
      required: ["account.encrypted"],
    });
    expect(result.valid).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "target", value: "account.service", kind: "matched" }),
        expect.objectContaining({ field: "require", value: "account.encrypted", matchedText: "encrypted account" }),
      ]),
    );
  });

  it.each([
    ["Publish the catalog.", "action", "catalog.publish"],
    ["Use the payment payload.", "input", "payment.payload"],
    ["Return an order list.", "output", "order.list"],
    ["The workflow should be modular.", "prefer", "workflow.modular"],
    ["Never allow cache corruption.", "forbid", "cache.corruption"],
    ["Verify payment is accepted.", "verify", "payment.accepted"],
    ["If payment fails, retry.", "on_failure", "payment.retry"],
  ] as const)("maps %s through the %s preset namespace", (prompt, field, value) => {
    const result = compileNaturalLanguage(prompt);
    expect(result.evidence).toContainEqual(expect.objectContaining({ field, value, kind: "matched" }));
  });

  it("does not invent target-derived outputs or verification", () => {
    const result = compileNaturalLanguage("Add a login screen.");
    expect(result.ir).toMatchObject({
      goal: "feature.add",
      target: "screen.login",
      action: "implement",
      outputs: [],
      verification: [],
    });
  });

  it("keeps objective evidence in the objective frame when verification repeats the meaning", () => {
    const result = compileNaturalLanguage(
      "Create an encrypted account service. Verify that the account was created.",
    );
    const goal = result.evidence.find((item) => item.field === "goal");
    const action = result.evidence.find((item) => item.field === "action");
    expect(goal?.matchedText).toBe("Create an encrypted account");
    expect(action?.matchedText).toBe("Create an encrypted account");
    expect(result.ir.verification).toContain("account.created");
  });

  it("keeps negative scopes out of positive rules", () => {
    const prohibited = compileNaturalLanguage("Do not add authentication.");
    expect(prohibited.ir.goal).not.toBe("feature.add");
    expect(prohibited.ir.target).not.toBe("user.authentication");
    expect(prohibited.evidence.filter((item) => item.kind === "matched")).toEqual([]);

    const noTests = compileNaturalLanguage("Fix login without tests.");
    expect(noTests.ir.verification).not.toContain("tests.pass");

    const notFast = compileNaturalLanguage("Make the response not fast.");
    expect(notFast.ir.required).not.toContain("response.fast");
  });

  it("does not cross-pair separate coordinated objective frames", () => {
    const result = compileNaturalLanguage("Delete the account and update the report.");
    expect(result.ir.goal).toBe("account.remove");
    expect(result.ir.action).toBe("account.delete");
    expect(result.dsl).not.toMatch(/account\.update|report\.remove|report\.delete/u);
  });

  it("uses whole words and avoids substring false positives", () => {
    const author = compileNaturalLanguage("Create an author biography.");
    expect(author.ir.target).not.toBe("user.authentication");

    const contest = compileNaturalLanguage("Summarize contest results.");
    expect(contest.ir.verification).not.toContain("tests.pass");

    const breakfast = compileNaturalLanguage("Build a breakfast menu.");
    expect(breakfast.ir.required).not.toContain("response.fast");
  });

  it("prefers explicit documentation over a bare API mention", () => {
    const result = compileNaturalLanguage("Update API documentation.");
    expect(result.ir.target).toBe("project.documentation");
    expect(result.ir.target).not.toBe("api.endpoint");
  });

  it("keeps technical names and unknown proper nouns as lossless context", () => {
    const result = compileNaturalLanguage("Goal: create a guide on how to implement this SIL on ollama");
    expect(result.ir).toMatchObject({
      taskId: "ProjectDocumentationTask",
      goal: "documentation.create",
      target: "project.documentation",
      action: "documentation.create",
      inputs: ["language.sil", "platform.ollama"],
      outputs: ["documentation.artifact"],
    });
    expect(result.dsl).toContain("input: language.sil");
    expect(result.dsl).toContain("input: platform.ollama");
    expect(result.prompt).toContain("- language.sil");
    expect(result.prompt).toContain("- platform.ollama");
    expect(result.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "input", value: "language.sil", matchedText: "SIL", kind: "derived" }),
      expect.objectContaining({ field: "input", value: "platform.ollama", matchedText: "ollama", kind: "derived" }),
    ]));

    const versioned = compileNaturalLanguage("Build an integration for AcmeCloud using Qwen3.6 and NovaSDK.");
    expect(versioned.ir.inputs).toEqual(expect.arrayContaining([
      "context.acmecloud",
      "model.qwen3_6",
      "context.novasdk",
    ]));
  });

  it("uses a curated technical term as an explicit target while retaining it as context", () => {
    const result = compileNaturalLanguage("Goal: configure local inference.\nTarget: Ollama\nAction: update");
    expect(result.ir.target).toBe("technology.ollama");
    expect(result.ir.inputs).toContain("platform.ollama");
    expect(result.evidence).toContainEqual(expect.objectContaining({
      field: "target",
      value: "technology.ollama",
      kind: "matched",
    }));
  });

  it("emits registered references for every matched rule", () => {
    const result = compileNaturalLanguage(
      "Create an encrypted account service using an account request. Return an account result and verify the account was created.",
    );
    for (const item of result.evidence) {
      if (item.field === "task" || item.kind !== "matched") continue;
      expect(findEntry(coreCodebook, item.field as StatementKind, item.value), `${item.field}:${item.value}`).toBeDefined();
    }
  });

  it("produces byte-identical artifacts and evidence on repeated conversion", () => {
    const prompt = "Create an encrypted account service using an account request. Verify the account was created.";
    const first = compileNaturalLanguage(prompt);
    const second = compileNaturalLanguage(prompt);
    expect(second.dsl).toBe(first.dsl);
    expect(second.quantizedCode).toBe(first.quantizedCode);
    expect(second.prompt).toBe(first.prompt);
    expect(second.ir).toEqual(first.ir);
    expect(second.evidence).toEqual(first.evidence);
    expect(second.diagnostics).toEqual(first.diagnostics);
  });

  it("enforces the source boundary and English-only input", () => {
    expect(() => compileNaturalLanguage("a".repeat(100_000))).not.toThrow();
    expect(() => compileNaturalLanguage("a".repeat(100_001))).toThrow("100,000 character limit");
    expect(() =>
      compileNaturalLanguage(
        "Create an account\u3002\u30a2\u30ab\u30a6\u30f3\u30c8\u3092\u6697\u53f7\u5316\u3059\u308b\u3002",
      ),
    )
      .toThrow("Only English natural-language instructions are supported.");
  });

  it("does not attach prompt evidence to manually compiled SIL", () => {
    const result = compileSil(`task ManualTask {
  goal: account.create
  target: account.service
  action: account.create
}`);
    expect(result.evidence).toEqual([]);
  });

  it("converts the labeled human template into a complete execution contract", () => {
    const result = compileNaturalLanguage(STRUCTURED_PROMPT_TEMPLATE);

    expect(result.ir).toMatchObject({
      goal: "product.create",
      target: "product.search",
      action: "implement",
      inputs: ["user.query", "category.filter", "pagination.page_size", "pagination.cursor"],
      outputs: ["product.list", "pagination.next_cursor"],
      required: ["input.validate", "latency.max_200_ms", "existing.behavior.preserve"],
      preferred: ["change.minimal", "architecture.modular"],
      forbidden: ["inventory.exposure", "checkout_api.modify"],
      verification: ["unit_tests.pass", "integration_tests.pass", "pagination.order_stable", "latency.max_200_ms"],
      failureHandling: ["change.rollback", "diagnostics.preserve", "retry.max_1", "task.abort"],
    });
    expect(result.readiness).toMatchObject({ status: "ready", score: 100, blockers: 0 });
    expect(result.diagnostics).toEqual([]);
  });

  it("extracts lists, scoped prohibitions, verification checks, and retry limits from prose", () => {
    const result = compileNaturalLanguage(
      "Implement a product search endpoint in the catalog service. Accept a text query, category filters, page size, and cursor. Return a paginated product list and next cursor. Require input validation, responses under 200 milliseconds, and backward compatibility. Do not expose internal inventory costs or modify the checkout API. Verify unit tests, integration tests, pagination order, and the 200 millisecond latency budget. If verification fails, roll back the changes, preserve diagnostics, and stop after one retry.",
    );

    expect(result.ir.inputs).toEqual(["user.query", "category.filter", "pagination.page_size", "pagination.cursor"]);
    expect(result.ir.outputs).toEqual(["product.list", "pagination.next_cursor"]);
    expect(result.ir.required).toEqual(["input.validate", "latency.max_200_ms", "existing.behavior.preserve"]);
    expect(result.ir.forbidden).toEqual(["inventory.exposure", "checkout_api.modify"]);
    expect(result.ir.verification).toEqual(
      expect.arrayContaining(["unit_tests.pass", "integration_tests.pass", "pagination.order_stable", "latency.max_200_ms"]),
    );
    expect(result.ir.failureHandling).toEqual(
      expect.arrayContaining(["change.rollback", "diagnostics.preserve", "retry.max_1", "task.abort"]),
    );
    expect(result.readiness.status).toBe("ready");
  });

  it("retains unmatched labeled details as readable lossless extensions", () => {
    const result = compileNaturalLanguage(`Goal: Analyze API compatibility.
Target: Billing webhook contract.
Action: Analyze.
Inputs:
- protobuf descriptor file
Outputs:
- protobuf compatibility report
Requirements:
- preserve field numbers
Forbidden:
- remove deprecated message fields
Verification:
- compare every message schema
On failure:
- preserve diagnostics`);

    expect(result.ir.inputs).toContain("extension.protobuf_descriptor_file");
    expect(result.ir.outputs).toContain("extension.protobuf_compatibility_report");
    expect(result.ir.verification).toContain("extension.compare_every_message_schema");
    expect(result.quantizedCode).toContain("~i:");
    expect(result.evidence).toContainEqual(
      expect.objectContaining({
        field: "output",
        value: "extension.protobuf_compatibility_report",
        kind: "derived",
        ruleId: "structured.output.lossless_extension",
      }),
    );
  });

  it("preserves numeric values, comparators, and units as semantic parameters", () => {
    const result = compileNaturalLanguage(`Goal: Add report export.
Target: Report pipeline.
Action: Implement.
Inputs:
- page size 50
Outputs:
- report artifact
Requirements:
- timeout within 30 seconds
Verification:
- test coverage at least 85 percent
On failure:
- retry 2 times`);

    expect(result.ir.inputs).toContain("pagination.page_size_50");
    expect(result.ir.required).toContain("timeout.max_30_seconds");
    expect(result.ir.verification).toContain("coverage.min_85_percent");
    expect(result.ir.failureHandling).toContain("retry.max_2");
  });

  it("reports prompt-form coverage before conversion", () => {
    expect(inspectPromptForm(STRUCTURED_PROMPT_TEMPLATE)).toEqual({
      mode: "structured",
      present: ["goal", "target", "action", "input", "output", "require", "prefer", "forbid", "verify", "on_failure"],
      missing: [],
      score: 100,
    });
    expect(inspectPromptForm("Add a login screen.").missing).toEqual(
      expect.arrayContaining(["input", "output", "require", "forbid", "verify", "on_failure"]),
    );
  });
});
