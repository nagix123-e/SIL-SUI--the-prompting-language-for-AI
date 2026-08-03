import { describe, expect, it } from "vitest";
import { applyV03Patch, deterministicJapaneseAdapter, formatV03, normalizeNaturalLanguageV03, parseV03, validateV03, v03TaskToSemanticIr } from "../packages/v03/src/index";
import { compileMultilingualNaturalLanguage } from "../packages/compiler/src/index";

const source = `bundle Delivery:
    version: 0.3
    task BuildApi:
        version: 0.3
        goal: feature.add
        target: auth.api
        action: implement
        output:
            api.authentication
        verify:
            tests.pass
        on_failure:
            task.abort
    task BuildUi:
        version: 0.3
        goal: feature.add
        target: auth.ui
        action: implement
        depends_on:
            BuildApi
        output:
            ui.login
        verify:
            tests.pass
        on_failure:
            task.abort
    flow DeliveryFlow:
        sequence:
            BuildApi
            BuildUi
    ui LoginScreen:
        version: 0.3
        screen: login_screen
        component Form:
            kind: form
            component Submit:
                kind: button
`;

describe("SIL/SUI v0.3", () => {
  it("parses, formats, and validates a Pythonic bundle", () => {
    const document = parseV03(source);
    const validation = validateV03(document);
    expect(validation.valid).toBe(true);
    expect(validation.dependencyGraph.executionOrder).toEqual(["BuildApi", "BuildUi"]);
    expect(validation.componentGraph.edges).toEqual([{ parent: "Form", child: "Submit" }]);
    expect(validation.readiness).toMatchObject({
      safeToExecute: false,
      continuation: "continue_with_review",
      canContinue: true,
    });
    expect(formatV03(document)).toContain("    version: 0.3");
    expect(v03TaskToSemanticIr(document, "BuildApi").outputs).toEqual(["api.authentication"]);
  });

  it("accepts v0.3 metadata as a declarative envelope block", () => {
    const document = parseV03(`task MetadataTask:
    version: 0.3
    metadata:
        original_source_language: ja
        normalized_semantic_language: en
        output_identifier_language: en
`);
    expect(formatV03(document)).toContain("metadata:");
    expect(validateV03(document).valid).toBe(true);
  });

  it("accepts a single outer Markdown SIL fence without changing diagnostic line locations", () => {
    const document = parseV03("```sil\nbundle FencedEnvelope:\n    version: 0.3\n```");
    expect(document.nodes[0]).toMatchObject({ kind: "bundle", name: "FencedEnvelope", location: { line: 2 } });
    expect(validateV03(document).valid).toBe(true);
  });

  it("accepts declared readiness as data rather than confusing it with execution permission", () => {
    const document = parseV03(`bundle ReadinessEnvelope:
    version: 0.3
    readiness:
        implementation: review
        verification: blocked
        authorization: false
`);
    const validation = validateV03(document);
    expect(formatV03(document)).toContain("readiness:");
    expect(validation.valid).toBe(true);
    expect(validation.executionAuthorization.staticAuthorization).toBe(false);
  });

  it("accepts top-level v0.3 examples with inert triple-quoted content", () => {
    const document = parseV03(`bundle ExampleEnvelope:
    version: 0.3
    example Calculation:
        language: text
        applies_to: contribution.vch
        code: """
value = input * factor
"""
`);
    expect(formatV03(document)).toContain("example Calculation:");
    expect(validateV03(document).valid).toBe(true);
  });

  it("preserves future declaration blocks as inert extension groups", () => {
    const document = parseV03(`bundle ExtensionEnvelope:
    version: 0.3
    deployment_profile EdgePilot:
        region: ap_northeast_1
        rollout: canary
`);
    const extension = document.nodes[0].items.find((item) => item.type === "node" && item.declaration === "deployment_profile");
    expect(extension).toMatchObject({ type: "node", kind: "group", name: "EdgePilot" });
    expect(formatV03(document)).toContain("deployment_profile EdgePilot:");
    expect(validateV03(document).valid).toBe(true);
  });

  it("validates bounded v0.4 task loops and SUI collection rendering", () => {
    const document = parseV03(`bundle LoopDelivery:
    version: 0.4
    task EvaluateBenchmarks:
        version: 0.4
        goal: effectiveness.confirm
        target: benchmark.results
        action: evaluate
        for_each Benchmark:
            over: input.benchmark.tasks
            as: benchmark
            max_iterations: 100
            body:
                require: benchmark.configuration.fixed
        until Converged:
            condition: evaluation.converged
            max_iterations: 12
            body:
                verify: evaluation.metrics.measured
        verify:
            tests.pass
        on_failure:
            task.abort
    ui BenchmarkDashboard:
        version: 0.4
        screen: benchmark_dashboard
        component Results:
            kind: list
            render_each ResultRow:
                over: output.evaluation.results
                as: result
                key: result.id
                max_items: 100
                component ResultRow:
                    kind: row
`);
    const validation = validateV03(document);
    expect(validation.valid).toBe(true);
    expect(validation.loops).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "for_each", maxIterations: 100, over: "input.benchmark.tasks", item: "benchmark" }),
      expect.objectContaining({ kind: "until", maxIterations: 12, condition: "evaluation.converged" }),
      expect.objectContaining({ kind: "render_each", maxIterations: 100, key: "result.id" }),
    ]));
  });

  it("supports v0.5 UI design layers while keeping incomplete UI coverage advisory", () => {
    const document = parseV03(`ui AccountSettings:
    version: 0.5
    screen: account_settings
    component SettingsForm:
        kind: form
    design Foundation:
        token: color.semantic
        token: spacing.scale
    responsive Compact:
        strategy: reflow.stack
    accessibility Baseline:
        require: keyboard.complete
    navigation SaveFlow:
        behavior: route.back
    binding SettingsState:
        source: state.account_settings
    data SettingsModel:
        model: account.settings
`);
    const validation = validateV03(document);
    expect(validation.valid).toBe(true);
    expect(validation.uiDesignProfiles).toEqual([expect.objectContaining({ ui: "AccountSettings", designTokens: true, responsive: true, accessibility: true, navigation: true, dataBinding: true })]);
  });

  it("rejects unbounded and legacy-version loop declarations", () => {
    const document = parseV03(`task InvalidLoop:
    version: 0.3
    repeat Retry:
        body:
            verify: tests.pass
`);
    const validation = validateV03(document);
    expect(validation.valid).toBe(false);
    expect(validation.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining(["loop-version-unsupported"]));
  });

  it("resolves rule-local references and grouped task verification without claiming Core registration", () => {
    const document = parseV03(`bundle LocalReferenceEnvelope:
    version: 0.3
    semantic JobLease:
        reference: coordinator.job_lease
    rule LeaseRule:
        subject: worker.device
        action: coordinator.job_lease.receive
        resource: coordinator.job
        effect: allow
    rule BanRule:
        subject: role.security_administrator
        action: participant.ban
        resource: participant.account
        effect: allow
    task VerifyContract:
        version: 0.3
        verify:
            tests.pass
`);
    const validation = validateV03(document);
    expect(validation.unresolvedReferences).toEqual([]);
    expect(validation.localContractReferences).toEqual(expect.arrayContaining(["coordinator.job_lease.receive", "participant.ban"]));
    expect(validation.readiness.verification).toMatchObject({ status: "review", score: 80 });
  });

  it("preserves scoped grouped statements and stable explicit IDs", () => {
    const document = parseV03(`task PasswordTask:
    version: 0.3
    goal: feature.add
    target: auth.password
    action: implement
    require REQ_PASSWORD_HASH:
        on user.password:
            rule: password.hash
`);
    const statement = document.nodes[0].items[4].type === "node" ? document.nodes[0].items[4].items[0] : undefined;
    expect(statement?.type === "node" ? statement.items[0] : undefined).toMatchObject({ appliesTo: "user.password" });
    expect(formatV03(document)).toContain("require REQ_PASSWORD_HASH:");
  });

  it("rejects executable Python and indentation errors", () => {
    expect(() => parseV03("task Unsafe:\n    version: 0.3\n    import os\n")).toThrow("Executable Python syntax");
    expect(() => parseV03("task Tabs:\n\tversion: 0.3\n")).toThrow("Tabs are not permitted");
  });

  it("reports cycles and atomically rejects invalid dependency patches", () => {
    const document = parseV03(source);
    const api = document.nodes[0].items.find((item) => item.type === "node" && item.name === "BuildApi");
    expect(api?.type).toBe("node");
    const result = applyV03Patch(document, [{ op: "add_dependency", targetId: api!.id, dependency: "BuildUi" }]);
    expect(result.applied).toBe(false);
    expect(result.document).toBe(document);
  });

  it("keeps Japanese source outside English identifiers until an adapter is configured", () => {
    expect(normalizeNaturalLanguageV03("ログイン画面を実装する")).toMatchObject({ sourceLanguage: "ja", normalizedSemanticLanguage: "en", status: "adapter_unavailable" });
  });

  it("records Japanese source language through the offline normalization boundary", () => {
    const japanese = compileMultilingualNaturalLanguage("ログイン画面を実装する。失敗時は中止する。", deterministicJapaneseAdapter);
    const english = compileMultilingualNaturalLanguage("implement login screen. on failure abort.");
    expect(japanese.ir.metadata).toMatchObject({ sourceLanguage: "en", originalSourceLanguage: "ja", normalizedSemanticLanguage: "en", outputIdentifierLanguage: "en" });
    expect(japanese.ir.failureHandling).toEqual(english.ir.failureHandling);
  });

  it("preserves Japanese mandatory, quantity, and failure cues in the supported offline subset", () => {
    const result = compileMultilingualNaturalLanguage("ログイン画面を実装し、ユーザーのパスワードは必ずハッシュ化する。応答時間は200ミリ秒未満にし、失敗時は中止する。", deterministicJapaneseAdapter);
    expect(result.ir.required).toContain("extension.password_hash");
    expect(result.ir.required).toContain("response.fast");
    expect(result.ir.failureHandling).toContain("task.abort");
  });
});
