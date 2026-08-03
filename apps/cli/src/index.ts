#!/usr/bin/env node
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  compile,
  compileMultilingualNaturalLanguage,
  compileSilSuiBundle,
  compileSil,
  assessExecutionResult,
  coreCodebook,
  dequantize,
  deterministicJapaneseAdapter,
  formatIr,
  formatSil,
  formatSilSuiBundle,
  formatSui,
  formatV02,
  formatV02TopLevelBlock,
  formatV03,
  formatV03Legacy,
  generateSuiPrompt,
  getCodebookStats,
  interpretUnregisteredReference,
  isSilSuiBundleSource,
  parseSil,
  parseSilSuiBundle,
  parseSui,
  parseV02,
  parseV02TopLevelBlock,
  parseV03,
  quantizeIr,
  searchCodebook,
  suiAstToIr,
  validateSui,
  validateBindings,
  validateSilSuiBundle,
  validateV02,
  validateV02TopLevelBlock,
  validateV03,
  v03TaskToSemanticIr,
  applyV03Patch,
  allNodes,
  allStatements,
  orchestrateV03,
  type OrchestrationMode,
  type PhaseLedgerEntry,
  type RuntimeObservation,
  type StatementKind,
} from "../../../packages/compiler/src/index";

const HELP = `Semantic Instruction / UI Language CLI

Usage:
  sil parse <task.sil|screen.sui|bundle.sil>
  sil validate <task.sil|screen.sui|bundle.sil> [--sui <screen.sui>|--sui-source <source>] [--allow-web-enrichment] [--semantic-evidence <evidence.json>|--semantic-evidence-json <json>]
  sil compile <instruction.txt|task.sil|bundle.sil> [--json|--raw-prompt] [--allow-web-enrichment] [--semantic-evidence <evidence.json>|--semantic-evidence-json <json>]
  sil format <task.sil|screen.sui|bundle.sil> [--legacy]
  sil migrate <legacy.sil|legacy.sui>
  sil graph <contract.sil>
  sil patch <contract.sil> --patch <patch.json>|--patch-json <json> [--dry-run]
  sil inspect <contract.sil>
  sil readiness <contract.sil>
  sil orchestrate <contract.sil> [--mode discover|repair|implement|verify|release] [--observations <evidence.json>|--observations-json <json>] [--ledger <phase-report.json>|--ledger-json <json>] [--workspace <directory>] [--report <phase-report.json>]
  sil quantize <task.sil> [--compact]
  sil dequantize <code|file.sq>
  sil assess-result <task.sil> --evidence <evidence.json>|--evidence-json <json> [--capabilities <capabilities.json>|--capabilities-json <json>]
  sil codebook stats
  sil codebook search <query> [--namespace <name>] [--limit <count>] [--offset <count>]

Use "-" as the input path to read from stdin.`;

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function readInput(value?: string): Promise<string> {
  if (!value) throw new Error("Missing input.\n\n" + HELP);
  if (value === "-") return readStdin();
  if (value.startsWith("@")) return value;
  return readFile(value, "utf8");
}

async function jsonOption(args: string[], pathFlag: string, jsonFlag: string): Promise<unknown | undefined> {
  const inputPath = optionValue(args, pathFlag);
  const inline = optionValue(args, jsonFlag);
  if (inputPath && inline) throw new Error(`Provide only one of ${pathFlag} or ${jsonFlag}.`);
  return inline ? JSON.parse(inline) : inputPath ? JSON.parse(await readInput(inputPath)) : undefined;
}

/** Read-only workspace facts used only by the non-executing orchestration preflight. */
async function inspectWorkspace(workspace: string): Promise<Array<{ reference: string; status: "satisfied" | "unavailable"; source: "repository"; detail: string }>> {
  const root = path.resolve(workspace);
  const candidates = [
    ["workspace.accessible", root],
    ["repository.package_json", path.join(root, "package.json")],
    ["repository.git", path.join(root, ".git")],
    ["repository.readme", path.join(root, "README.md")],
  ] as const;
  return Promise.all(candidates.map(async ([reference, target]) => {
    try { await access(target); return { reference, status: "satisfied" as const, source: "repository" as const, detail: target }; }
    catch { return { reference, status: "unavailable" as const, source: "repository" as const, detail: target }; }
  }));
}

async function main(): Promise<void> {
  const [, , command, input, ...flags] = process.argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(HELP);
    return;
  }

  const source = command === "codebook" ? "" : await readInput(input);
  const isV03 = /^\s*(?:task|ui|bundle|model|semantic|parameter|rule|data_policy|verification|design|responsive|accessibility|navigation|binding|data)\s+[A-Za-z][A-Za-z0-9_]*:\s*$/mu.test(source) && /^\s*version:\s*0\.(?:3|4|5)\s*$/mu.test(source);
  const isBundle = !isV03 && isSilSuiBundleSource(source);
  const isTopLevelBlock = /^\s*(?:semantic|parameter|model|example|token|breakpoint|a11y|transition)\s+/u.test(source);
  const isSui = /^\s*ui\s+/u.test(source);
  const isV02 = /^\s*(?:task|ui)\s+/u.test(source) && /^\s*version:\s*0\.2\s*$/mu.test(source);
  switch (command) {
    case "parse":
      console.log(JSON.stringify(isV03 ? parseV03(source) : isBundle ? parseSilSuiBundle(source) : isTopLevelBlock ? parseV02TopLevelBlock(source) : isV02 ? parseV02(source) : isSui ? parseSui(source) : parseSil(source), null, 2));
      return;
    case "validate": {
      if (isV03) {
        const document = parseV03(source); const result = validateV03(document);
        console.log(JSON.stringify({ language: `sil-sui-${document.version}`, detectedLanguageVersion: document.version, detectedSyntaxStyle: "pythonic", normalizedIrVersion: document.version, contractIds: document.nodes.map((node) => node.name ?? node.id), statementCount: document.nodes.reduce((count, node) => count + node.items.length, 0), ...result }, null, 2));
        if (!result.valid) process.exitCode = 1;
        return;
      }
      if (isBundle) {
        const result = validateSilSuiBundle(source, await semanticEnrichmentOptions(flags));
        console.log(JSON.stringify({ language: "sil-sui-bundle", ...result }, null, 2));
        if (!result.valid) process.exitCode = 1;
        return;
      }
      if (isTopLevelBlock) {
        const specification = parseV02TopLevelBlock(source);
        const result = validateV02TopLevelBlock(specification);
        console.log(JSON.stringify({ language: `${specification.kind}-definition-0.2`, valid: result.valid, specification, diagnostics: result.diagnostics }, null, 2));
        if (!result.valid) process.exitCode = 1;
        return;
      }
      if (isV02) {
        const specification = parseV02(source);
        const result = validateV02(specification);
        const suiPath = optionValue(flags, "--sui");
        const suiSource = optionValue(flags, "--sui-source");
        if (suiPath && suiSource) throw new Error("Provide only one of --sui or --sui-source.");
        const companion = suiSource ? suiSource : suiPath ? await readInput(suiPath) : undefined;
        const bindingDiagnostics = companion && specification.kind === "sil"
          ? validateBindings(specification, parseV02(companion))
          : [];
        const diagnostics = [...result.diagnostics, ...bindingDiagnostics];
        const valid = !diagnostics.some((item) => item.severity === "error");
        const semanticFields = new Set<StatementKind>(["goal", "target", "action", "input", "output", "require", "prefer", "forbid", "verify", "on_failure"]);
        const unregisteredReferences = specification.kind === "sil"
          ? specification.statements.flatMap((statement) => {
            if (!semanticFields.has(statement.field as StatementKind)) return [];
            const marker = interpretUnregisteredReference(statement.field as StatementKind, statement.value, coreCodebook);
            return marker ? [marker] : [];
          })
          : [];
        console.log(JSON.stringify({ language: `${specification.kind}-0.2`, valid, specification, diagnostics, unregisteredReferences }, null, 2));
        if (!valid) process.exitCode = 1;
        return;
      }
      if (isSui) {
        const ast = parseSui(source);
        const result = validateSui(ast);
        console.log(JSON.stringify({ language: "sui", valid: result.valid, specification: suiAstToIr(ast), diagnostics: result.diagnostics }, null, 2));
        if (!result.valid) process.exitCode = 1;
        return;
      }
      const result = compileSil(source);
      console.log(
        JSON.stringify(
          {
            valid: result.valid,
            executionReady: result.readiness.safeToExecute,
            readiness: result.readiness,
            diagnostics: result.diagnostics,
            unregisteredReferences: result.unregisteredReferences,
          },
          null,
          2,
        ),
      );
      if (!result.valid) process.exitCode = 1;
      return;
    }
    case "compile": {
      if (isV03) {
        const document = parseV03(source); const validation = validateV03(document); const ir = v03TaskToSemanticIr(document);
        const handoff = [`SIL/SUI v${document.version} static handoff`, "This is declarative data, not an execution authorization.", "", formatV03(document)].join("\n");
        console.log(flags.includes("--json") ? JSON.stringify({ document, ir, validation, handoff }, null, 2) : flags.includes("--raw-prompt") ? formatV03(document) : handoff);
        if (!validation.valid) process.exitCode = 1;
        return;
      }
      if (isBundle) {
        const result = compileSilSuiBundle(source, await semanticEnrichmentOptions(flags));
        if (flags.includes("--json")) console.log(JSON.stringify(result, null, 2));
        else if (flags.includes("--raw-prompt")) {
          const sections = [result.task?.prompt ?? result.taskContract, result.semanticManifest, result.evidenceManifest, result.sharedManifest, ...result.uiPrompts.map((item) => item.prompt)].filter(Boolean);
          console.log(sections.join("\n\n"));
        } else {
          const sections = [result.task?.handoffPrompt ?? result.taskContract, result.semanticManifest, result.evidenceManifest, result.sharedManifest, ...result.uiPrompts.map((item) => item.prompt)].filter(Boolean);
          console.log(sections.join("\n\n"));
        }
        if (result.validation.diagnostics.length) console.error(JSON.stringify(result.validation.diagnostics, null, 2));
        if (!result.validation.valid) process.exitCode = 1;
        return;
      }
      if (isTopLevelBlock) {
        const specification = parseV02TopLevelBlock(source);
        const validation = validateV02TopLevelBlock(specification);
        if (flags.includes("--json")) console.log(JSON.stringify(specification, null, 2));
        else console.log(formatV02TopLevelBlock(specification));
        if (validation.diagnostics.length) console.error(JSON.stringify(validation.diagnostics, null, 2));
        if (!validation.valid) process.exitCode = 1;
        return;
      }
      if (isV02) {
        const specification = parseV02(source);
        const validation = validateV02(specification);
        if (flags.includes("--json")) console.log(JSON.stringify(specification, null, 2));
        else console.log(formatV02(specification));
        if (validation.diagnostics.length) console.error(JSON.stringify(validation.diagnostics, null, 2));
        if (!validation.valid) process.exitCode = 1;
        return;
      }
      if (isSui) {
        const ast = parseSui(source);
        const validation = validateSui(ast);
        const specification = suiAstToIr(ast);
        if (flags.includes("--json")) console.log(JSON.stringify(specification, null, 2));
        else console.log(generateSuiPrompt(specification));
        if (validation.diagnostics.length) console.error(JSON.stringify(validation.diagnostics, null, 2));
        if (!validation.valid) process.exitCode = 1;
        return;
      }
      const result = /[\u3040-\u30ff\u3400-\u9fff]/u.test(source)
        ? compileMultilingualNaturalLanguage(source, deterministicJapaneseAdapter)
        : compile(source);
      if (flags.includes("--json")) console.log(JSON.stringify(result.ir, null, 2));
      else if (flags.includes("--raw-prompt")) console.log(result.prompt);
      else console.log(result.handoffPrompt);
      if (result.diagnostics.length) console.error(JSON.stringify(result.diagnostics, null, 2));
      if (!result.valid) process.exitCode = 1;
      return;
    }
    case "quantize": {
      const v03Document = isV03 ? parseV03(source) : undefined;
      const result = v03Document ? { ir: v03TaskToSemanticIr(v03Document) } : compileSil(source);
      const quantized = quantizeIr(result.ir, coreCodebook, flags.includes("--compact") ? "compact" : "lossless");
      console.log(quantized.code);
      const v03Diagnostics = v03Document && (allStatements(v03Document).some((statement) => statement.appliesTo) || allNodes(v03Document).some((node) => !["task", "group"].includes(node.kind)))
        ? [{ severity: "warning", code: "v03-quantize-projection", message: "Quantized SIL represents the task semantic subset only; v0.3 scope, provenance, lifecycle, graph, and SUI declarations remain in the source/JSON IR." }]
        : [];
      if (quantized.diagnostics.length || v03Diagnostics.length) console.error(JSON.stringify([...quantized.diagnostics, ...v03Diagnostics], null, 2));
      return;
    }
    case "dequantize": {
      const result = dequantize(source.trim(), coreCodebook);
      console.log(formatIr(result.ir));
      if (result.diagnostics.length) console.error(JSON.stringify(result.diagnostics, null, 2));
      return;
    }
    case "format":
      if (isV03) {
        const formatted = flags.includes("--legacy") ? formatV03Legacy(source) : { source: formatV03(source), warnings: [] };
        console.log(formatted.source); if (formatted.warnings.length) console.error(JSON.stringify(formatted.warnings, null, 2));
      } else console.log(isBundle ? formatSilSuiBundle(source) : isTopLevelBlock ? formatV02TopLevelBlock(parseV02TopLevelBlock(source)) : isV02 ? formatV02(parseV02(source)) : isSui ? formatSui(source) : formatSil(source));
      return;
    case "migrate": {
      if (isV03) { console.log(formatV03(source)); return; }
      const ir = isV02 ? (() => { const spec = parseV02(source); const statement = (key: string) => spec.statements.filter((item) => item.field === key).map((item) => item.value); return { taskId: spec.name, goal: statement("goal")[0], target: statement("target")[0], action: statement("action")[0], inputs: statement("input"), outputs: statement("output"), required: statement("require"), preferred: statement("prefer"), forbidden: statement("forbid"), verification: statement("verify"), failureHandling: statement("on_failure") }; })() : compileSil(source).ir;
      const lines = [`task ${ir.taskId}:`, "    version: 0.4", ...(ir.goal ? [`    goal: ${ir.goal}`] : []), ...(ir.target ? [`    target: ${ir.target}`] : []), ...(ir.action ? [`    action: ${ir.action}`] : [])];
      for (const [field, values] of [["input", ir.inputs], ["output", ir.outputs], ["require", ir.required], ["prefer", ir.preferred], ["forbid", ir.forbidden], ["verify", ir.verification], ["on_failure", ir.failureHandling]] as const) for (const value of values) lines.push(`    ${field}: ${value}`);
      console.log(`${lines.join("\n")}\n`); return;
    }
    case "graph": {
      if (!isV03) throw new Error("graph currently requires a v0.3, v0.4, or v0.5 Pythonic contract.");
      const validation = validateV03(parseV03(source)); console.log(JSON.stringify({ dependencyGraph: validation.dependencyGraph, componentGraph: validation.componentGraph, loops: validation.loops, diagnostics: validation.diagnostics }, null, 2)); if (!validation.valid) process.exitCode = 1; return;
    }
    case "inspect": {
      if (!isV03) throw new Error("inspect currently requires a v0.3, v0.4, or v0.5 Pythonic contract.");
      const document = parseV03(source); const validation = validateV03(document); console.log(JSON.stringify({ detectedLanguageVersion: document.version, detectedSyntaxStyle: "pythonic", normalizedIrVersion: document.version, sourceMetadata: document.sourceMetadata, contractIds: document.nodes.map((node) => node.name ?? node.id), migrationWarnings: [], ...validation }, null, 2)); return;
    }
    case "readiness": {
      if (!isV03) throw new Error("readiness currently requires a v0.3, v0.4, or v0.5 Pythonic contract.");
      console.log(JSON.stringify(validateV03(parseV03(source)).readiness, null, 2)); return;
    }
    case "orchestrate": {
      if (!isV03) throw new Error("orchestrate currently requires a v0.3, v0.4, or v0.5 Pythonic contract.");
      const mode = optionValue(flags, "--mode") ?? "discover";
      if (!['discover', 'repair', 'implement', 'verify', 'release'].includes(mode)) throw new Error("--mode must be discover, repair, implement, verify, or release.");
      const observations = await jsonOption(flags, "--observations", "--observations-json");
      const ledger = await jsonOption(flags, "--ledger", "--ledger-json");
      if (observations !== undefined && !Array.isArray(observations)) throw new Error("Observations must be a JSON array.");
      if (ledger !== undefined && !Array.isArray(ledger)) throw new Error("Phase ledger must be a JSON array.");
      const workspace = optionValue(flags, "--workspace");
      const workspaceObservations = workspace ? await inspectWorkspace(workspace) : [];
      const report = orchestrateV03(parseV03(source), {
        mode: mode as OrchestrationMode,
        observations: [...workspaceObservations, ...(observations ?? [])] as RuntimeObservation[],
        ledger: ledger as PhaseLedgerEntry[] | undefined,
        hostAuthorized: false,
      });
      const reportPath = optionValue(flags, "--report");
      if (reportPath) await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
      console.log(JSON.stringify({ ...report, reportPath: reportPath ?? null }, null, 2));
      if (report.summary.status === "blocked") process.exitCode = 2;
      return;
    }
    case "patch": {
      if (!isV03) throw new Error("patch currently requires a v0.3, v0.4, or v0.5 Pythonic contract.");
      const patchPath = optionValue(flags, "--patch"); const patchJson = optionValue(flags, "--patch-json");
      if (Boolean(patchPath) === Boolean(patchJson)) throw new Error("Provide exactly one of --patch or --patch-json.");
      const operations = JSON.parse(patchJson ?? await readInput(patchPath)); if (!Array.isArray(operations)) throw new Error("Patch must be a JSON array.");
      const result = applyV03Patch(parseV03(source), operations);
      console.log(flags.includes("--dry-run") ? JSON.stringify({ ...result, formatted: result.applied ? formatV03(result.document) : undefined }, null, 2) : result.applied ? formatV03(result.document) : JSON.stringify(result, null, 2));
      if (!result.applied) process.exitCode = 1; return;
    }
    case "assess-result": {
      const evidencePath = optionValue(flags, "--evidence");
      const evidenceJson = optionValue(flags, "--evidence-json");
      if (Boolean(evidencePath) === Boolean(evidenceJson)) throw new Error(`Provide exactly one of --evidence <evidence.json> or --evidence-json <json>.\n\n${HELP}`);
      const evidence = JSON.parse(evidenceJson ?? await readInput(evidencePath));
      const capabilitiesPath = optionValue(flags, "--capabilities");
      const capabilitiesJson = optionValue(flags, "--capabilities-json");
      if (capabilitiesPath && capabilitiesJson) throw new Error("Provide only one of --capabilities or --capabilities-json.");
      const capabilities = capabilitiesJson ? JSON.parse(capabilitiesJson) : capabilitiesPath ? JSON.parse(await readInput(capabilitiesPath)) : undefined;
      const parsed = parseSil(source);
      const compiled = compileSil(source);
      console.log(JSON.stringify(assessExecutionResult(compiled.ir, {
        evidence,
        capabilities,
        readiness: { status: compiled.readiness.status, score: compiled.readiness.score },
        ast: parsed,
      }), null, 2));
      return;
    }
    case "codebook": {
      if (input === "stats") {
        console.log(JSON.stringify(getCodebookStats(coreCodebook), null, 2));
        return;
      }
      if (input !== "search") throw new Error(`Unknown codebook command "${input ?? ""}".\n\n${HELP}`);
      const [query, ...options] = flags;
      if (!query) throw new Error(`Missing codebook search query.\n\n${HELP}`);
      const namespace = optionValue(options, "--namespace") as StatementKind | undefined;
      const allowedNamespaces = new Set<StatementKind>([
        "goal",
        "target",
        "action",
        "input",
        "output",
        "require",
        "prefer",
        "forbid",
        "verify",
        "on_failure",
      ]);
      if (namespace && !allowedNamespaces.has(namespace)) {
        throw new Error(`Unknown codebook namespace "${namespace}".`);
      }
      const limit = integerOption(options, "--limit", 20, 1, 100);
      const offset = integerOption(options, "--offset", 0, 0, Number.MAX_SAFE_INTEGER);
      const entries = searchCodebook(coreCodebook, query, { namespace, limit, offset });
      console.log(JSON.stringify({ query, namespace: namespace ?? null, limit, offset, count: entries.length, entries }, null, 2));
      return;
    }
    default:
      throw new Error(`Unknown command "${command}".\n\n${HELP}`);
  }
}

function optionValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}.`);
  return value;
}

function integerOption(args: string[], name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = optionValue(args, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

async function semanticEnrichmentOptions(args: string[]): Promise<{ allowWebEnrichment: boolean; semanticEvidence?: Array<{ reference: string; meaning: string; source: "web" | "repository" | "user"; url?: string; retrievedAt?: string; excerpt?: string }> }> {
  const evidencePath = optionValue(args, "--semantic-evidence");
  const evidenceJson = optionValue(args, "--semantic-evidence-json");
  if (evidencePath && evidenceJson) throw new Error("Provide only one of --semantic-evidence or --semantic-evidence-json.");
  const raw = evidenceJson ?? (evidencePath ? await readInput(evidencePath) : undefined);
  if (!raw) return { allowWebEnrichment: args.includes("--allow-web-enrichment") };
  const semanticEvidence: unknown = JSON.parse(raw);
  if (!Array.isArray(semanticEvidence)) throw new Error("Semantic evidence must be a JSON array.");
  return {
    allowWebEnrichment: args.includes("--allow-web-enrichment"),
    semanticEvidence: semanticEvidence as Array<{ reference: string; meaning: string; source: "web" | "repository" | "user"; url?: string; retrievedAt?: string; excerpt?: string }>,
  };
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
