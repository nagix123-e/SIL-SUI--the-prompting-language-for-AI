import { compileSil, type CompilationResult } from "../../compiler/src/index";
import { coreCodebook } from "../../codebook/src/index";
import { parseSil } from "../../parser/src/index";
import { parseSui, suiAstToIr, validateSui, type SuiAst, type SuiValidationResult } from "../../sui/src/index";
import type { Diagnostic, StatementKind, TaskAst } from "../../semantic-ir/src/index";
import { interpretUnregisteredReference, type UnregisteredSemanticMarker } from "../../validator/src/index";
import { formatV02, formatV02Semantic, formatV02TopLevelBlock, parseV02, parseV02Semantic, parseV02TopLevelBlock, validateBindings, validateV02, validateV02Semantic, validateV02TopLevelBlock, type V02Contract, type V02SemanticDefinition, type V02TopLevelBlock, type V02TopLevelBlockKind, type V02Validation } from "../../v02/src/index";

export type BundleContractKind = "sil" | "sui" | V02TopLevelBlockKind;
export type BundleContractVersion = "0.1" | "0.2";

export interface BundleContractSource {
  kind: BundleContractKind;
  name: string;
  version: BundleContractVersion;
  source: string;
  startLine: number;
}

export interface SilSuiBundle {
  contracts: BundleContractSource[];
  task?: BundleContractSource;
  uis: BundleContractSource[];
  semantics: BundleContractSource[];
  sharedBlocks: BundleContractSource[];
}

export interface BundleContractValidation {
  kind: BundleContractKind;
  name: string;
  version: BundleContractVersion;
  valid: boolean;
  diagnostics: Diagnostic[];
}

export interface SilSuiBundleValidation {
  valid: boolean;
  executionReady: boolean;
  semanticInteroperable: boolean;
  /** Valid contracts can continue with explicit extension review. This never grants host permission. */
  continuation: "blocked" | "continue_with_review";
  contracts: BundleContractValidation[];
  diagnostics: Diagnostic[];
  unregisteredReferences: UnregisteredSemanticMarker[];
  semanticExtensions: DeclaredSemanticExtension[];
  semanticReferences: SemanticReferenceResolution[];
  semanticEvidence: SemanticEvidence[];
  researchRequests: SemanticResearchRequest[];
}

export type SemanticEvidenceSource = "web" | "repository" | "user";

export interface SemanticEvidence {
  reference: string;
  meaning: string;
  source: SemanticEvidenceSource;
  url?: string;
  retrievedAt?: string;
  excerpt?: string;
}

export interface SemanticEnrichmentOptions {
  /** Explicit permission for a host-provided web resolver or web evidence. */
  allowWebEnrichment?: boolean;
  /** Evidence returned by a web, repository, or user-supplied resolver. */
  semanticEvidence?: SemanticEvidence[];
}

export interface SemanticResearchRequest {
  reference: string;
  query: string;
  allowedSources: SemanticEvidenceSource[];
}

/** Implemented by a host that has an explicitly authorized web or repository search capability. */
export interface SemanticEnrichmentResolver {
  resolve(requests: SemanticResearchRequest[]): Promise<SemanticEvidence[]>;
}

export interface DeclaredSemanticExtension {
  name: string;
  reference: string;
  kind: string;
  meaning: string;
  scope: "bundle" | "contract";
  declaredBy: { kind: BundleContractKind; name: string; line: number };
}

export interface SemanticReferenceResolution extends UnregisteredSemanticMarker {
  resolution: "declared_extension" | "structural_reference" | "local_contract_reference" | "web_resolved_extension" | "evidence_resolved_extension" | "unregistered";
  definition?: DeclaredSemanticExtension;
  evidence?: SemanticEvidence;
}

export class SilSuiBundleSyntaxError extends Error {
  constructor(message: string, public readonly line: number) {
    super(`${message} (${line}:1)`);
    this.name = "SilSuiBundleSyntaxError";
  }
}

const declarationPattern = /^(task|ui|semantic|parameter|model|example|token|breakpoint|a11y|transition)\s+([A-Za-z][A-Za-z0-9_]*)\s*\{\s*$/;

function stripComment(line: string): string {
  const index = line.indexOf("//");
  return (index === -1 ? line : line.slice(0, index)).trim();
}

function isV02Source(source: string): boolean {
  return /^\s*version:\s*0\.2\s*$/mu.test(source);
}

/** Treat UI declaration spellings such as ShogiGameScreen and shogi_game_screen as equivalent. */
function uiNameKey(name: string): string {
  return name.replace(/_/g, "").toLowerCase();
}

function resolveUi(bundle: SilSuiBundle, reference: string): BundleContractSource | undefined {
  const exact = bundle.uis.find((ui) => ui.name === reference);
  if (exact) return exact;
  const matches = bundle.uis.filter((ui) => uiNameKey(ui.name) === uiNameKey(reference));
  return matches.length === 1 ? matches[0] : undefined;
}

function withGlobalLine(diagnostic: Diagnostic, startLine: number, contract: BundleContractSource): Diagnostic {
  return {
    ...diagnostic,
    line: diagnostic.line === undefined ? undefined : diagnostic.line + startLine - 1,
    path: diagnostic.path ? `${contract.kind}.${contract.name}.${diagnostic.path}` : `${contract.kind}.${contract.name}`,
  };
}

function braceDelta(text: string): number {
  let delta = 0;
  for (const character of text) {
    if (character === "{") delta += 1;
    if (character === "}") delta -= 1;
  }
  return delta;
}

/** Returns true only when the source contains two or more top-level contracts. */
export function isSilSuiBundleSource(source: string): boolean {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let count = 0;
  let depth = 0;
  let inCodeBlock = false;
  for (const line of lines) {
    const text = stripComment(line);
    if (!depth) {
      if (!text) continue;
      if (!declarationPattern.test(text)) continue;
      count += 1;
      depth = 1;
      continue;
    }
    if (text === 'code: """') { inCodeBlock = true; continue; }
    if (inCodeBlock) { if (text === '"""') inCodeBlock = false; continue; }
    depth += braceDelta(text);
  }
  return count > 1;
}

/**
 * Splits a single source document into complete SIL and SUI contracts. Existing
 * single-contract parsers remain intentionally strict; this is the multi-contract
 * document boundary used by the CLI and Runner.
 */
export function parseSilSuiBundle(source: string): SilSuiBundle {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const contracts: BundleContractSource[] = [];
  let currentStart = -1;
  let currentKind: BundleContractKind | undefined;
  let currentName = "";
  let depth = 0;
  let inCodeBlock = false;

  for (let index = 0; index < lines.length; index += 1) {
    const text = stripComment(lines[index]);
    if (currentStart === -1) {
      if (!text) continue;
      const declaration = declarationPattern.exec(text);
      if (!declaration) throw new SilSuiBundleSyntaxError('Expected a task, ui, semantic, or named v0.2 block declaration', index + 1);
      currentStart = index;
      currentKind = declaration[1] === "task" ? "sil" : declaration[1] === "ui" ? "sui" : declaration[1] as V02TopLevelBlockKind;
      currentName = declaration[2];
      depth = 1;
      continue;
    }

    if (text === 'code: """') {
      inCodeBlock = true;
      continue;
    }
    if (inCodeBlock) {
      if (text === '"""') inCodeBlock = false;
      continue;
    }
    depth += braceDelta(text);
    if (depth < 0) throw new SilSuiBundleSyntaxError("Unexpected closing brace", index + 1);
    if (depth === 0) {
      const contractSource = lines.slice(currentStart, index + 1).join("\n");
      contracts.push({
        kind: currentKind!,
        name: currentName,
        version: (currentKind !== "sil" && currentKind !== "sui") || isV02Source(contractSource) ? "0.2" : "0.1",
        source: `${contractSource}\n`,
        startLine: currentStart + 1,
      });
      currentStart = -1;
      currentKind = undefined;
      currentName = "";
    }
  }

  if (currentStart !== -1) throw new SilSuiBundleSyntaxError('Expected closing "}"', lines.length);
  if (!contracts.length) throw new SilSuiBundleSyntaxError('Expected a task, ui, semantic, or named v0.2 block declaration', 1);

  const tasks = contracts.filter((contract) => contract.kind === "sil");
  if (tasks.length > 1) throw new SilSuiBundleSyntaxError("A bundle may contain only one task declaration", tasks[1].startLine);
  const seenUiNames = new Set<string>();
  const seenUiKeys = new Set<string>();
  for (const ui of contracts.filter((contract) => contract.kind === "sui")) {
    if (seenUiNames.has(ui.name)) throw new SilSuiBundleSyntaxError(`Duplicate UI declaration "${ui.name}"`, ui.startLine);
    if (seenUiKeys.has(uiNameKey(ui.name))) throw new SilSuiBundleSyntaxError(`Ambiguous UI declaration "${ui.name}"`, ui.startLine);
    seenUiNames.add(ui.name);
    seenUiKeys.add(uiNameKey(ui.name));
  }

  const seenSemanticNames = new Set<string>();
  for (const semantic of contracts.filter((contract) => contract.kind === "semantic")) {
    if (seenSemanticNames.has(semantic.name)) throw new SilSuiBundleSyntaxError(`Duplicate semantic declaration "${semantic.name}"`, semantic.startLine);
    seenSemanticNames.add(semantic.name);
  }

  return {
    contracts,
    task: tasks[0],
    uis: contracts.filter((contract) => contract.kind === "sui"),
    semantics: contracts.filter((contract) => contract.kind === "semantic"),
    sharedBlocks: contracts.filter((contract) => contract.kind !== "sil" && contract.kind !== "sui" && contract.kind !== "semantic"),
  };
}

function parseContract(contract: BundleContractSource): TaskAst | SuiAst | V02Contract | V02SemanticDefinition | V02TopLevelBlock {
  if (contract.kind === "semantic") return parseV02Semantic(contract.source);
  if (contract.kind !== "sil" && contract.kind !== "sui") return parseV02TopLevelBlock(contract.source);
  if (contract.version === "0.2") return parseV02(contract.source);
  return contract.kind === "sil" ? parseSil(contract.source) : parseSui(contract.source);
}

function validateContract(contract: BundleContractSource): { result: V02Validation | SuiValidationResult | CompilationResult; diagnostics: Diagnostic[] } {
  if (contract.kind === "semantic") {
    const result = validateV02Semantic(parseV02Semantic(contract.source));
    return { result, diagnostics: result.diagnostics.map((item) => withGlobalLine(item, contract.startLine, contract)) };
  }
  if (contract.kind !== "sil" && contract.kind !== "sui") {
    const result = validateV02TopLevelBlock(parseV02TopLevelBlock(contract.source));
    return { result, diagnostics: result.diagnostics.map((item) => withGlobalLine(item, contract.startLine, contract)) };
  }
  if (contract.version === "0.2") {
    const result = validateV02(parseV02(contract.source));
    return { result, diagnostics: result.diagnostics.map((item) => withGlobalLine(item, contract.startLine, contract)) };
  }
  if (contract.kind === "sui") {
    const result = validateSui(parseSui(contract.source));
    return { result, diagnostics: result.diagnostics.map((item) => withGlobalLine(item, contract.startLine, contract)) };
  }
  const result = compileSil(contract.source);
  return { result, diagnostics: result.diagnostics.map((item) => withGlobalLine(item, contract.startLine, contract)) };
}

const silStatementKinds = new Set<StatementKind>(["goal", "target", "action", "input", "output", "require", "prefer", "forbid", "verify", "on_failure"]);

function markersForContract(contract: BundleContractSource): UnregisteredSemanticMarker[] {
  if (contract.kind !== "sil") return [];
  if (contract.version === "0.1") return compileSil(contract.source).unregisteredReferences;
  return parseV02(contract.source).statements.flatMap((statement) => {
    if (!silStatementKinds.has(statement.field as StatementKind)) return [];
    const marker = interpretUnregisteredReference(statement.field as StatementKind, statement.value, coreCodebook);
    return marker ? [marker] : [];
  });
}

function semanticProperty(properties: readonly { key: string; value: string; line: number }[], key: string): { value: string; line: number } | undefined {
  const property = properties.find((item) => item.key === key);
  return property ? { value: property.value, line: property.line } : undefined;
}

function collectSemanticExtensions(bundle: SilSuiBundle): { extensions: DeclaredSemanticExtension[]; diagnostics: Diagnostic[] } {
  const extensions: DeclaredSemanticExtension[] = [];
  const diagnostics: Diagnostic[] = [];
  const byReference = new Map<string, DeclaredSemanticExtension>();
  for (const contract of bundle.contracts) {
    if (contract.version !== "0.2") continue;
    const definitions = contract.kind === "semantic"
      ? [parseV02Semantic(contract.source)]
      : contract.kind === "sil" || contract.kind === "sui"
        ? parseV02(contract.source).semanticDefinitions
        : [];
    for (const semantic of definitions) {
      const reference = semanticProperty(semantic.properties, "reference");
      const kind = semanticProperty(semantic.properties, "kind");
      const meaning = semanticProperty(semantic.properties, "meaning");
      const scope = semanticProperty(semantic.properties, "scope");
      if (!reference || !kind || !meaning || !scope || (scope.value !== "bundle" && scope.value !== "contract")) continue;
      const extension: DeclaredSemanticExtension = {
        name: semantic.name,
        reference: reference.value,
        kind: kind.value,
        meaning: meaning.value,
        scope: scope.value,
        declaredBy: { kind: contract.kind, name: contract.name, line: contract.startLine + reference.line - 1 },
      };
      const previous = byReference.get(extension.reference);
      if (previous && (previous.kind !== extension.kind || previous.meaning !== extension.meaning || previous.scope !== extension.scope)) {
        diagnostics.push({ severity: "error", code: "semantic-definition-conflict", message: `Semantic reference "${extension.reference}" has conflicting bundle definitions.`, line: extension.declaredBy.line, path: `${contract.kind}.${contract.name}.semantic` });
        continue;
      }
      if (!previous) { byReference.set(extension.reference, extension); extensions.push(extension); }
    }
  }
  return { extensions, diagnostics };
}

function validateSemanticEvidence(options: SemanticEnrichmentOptions): { evidence: SemanticEvidence[]; diagnostics: Diagnostic[] } {
  const evidence: SemanticEvidence[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const item of options.semanticEvidence ?? []) {
    if (!/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/u.test(item.reference) || !item.meaning.trim()) {
      diagnostics.push({ severity: "warning", code: "invalid-semantic-evidence", message: "Semantic evidence requires a valid reference and a non-empty meaning.", path: "semanticEvidence" });
      continue;
    }
    if (item.source === "web") {
      if (!options.allowWebEnrichment) {
        diagnostics.push({ severity: "warning", code: "web-enrichment-not-permitted", message: `Web evidence for "${item.reference}" was ignored because web enrichment is not enabled.`, path: "semanticEvidence" });
        continue;
      }
      if (!item.url || !/^https:\/\//u.test(item.url)) {
        diagnostics.push({ severity: "warning", code: "web-evidence-source-missing", message: `Web evidence for "${item.reference}" requires an HTTPS source URL.`, path: "semanticEvidence" });
        continue;
      }
    }
    evidence.push({ ...item, meaning: item.meaning.trim() });
  }
  return { evidence, diagnostics };
}

function hasSharedDeclaration(bundle: SilSuiBundle, reference: string): boolean {
  const match = /^(parameter|model|example|token|breakpoint|a11y|transition)\.([A-Za-z][A-Za-z0-9_]*)$/u.exec(reference);
  return Boolean(match && bundle.sharedBlocks.some((block) => block.kind === match[1] && block.name === match[2]));
}

function hasUiSemanticReference(bundle: SilSuiBundle, reference: string): boolean {
  if (!reference.startsWith("ui.")) return false;
  return bundle.uis.some((ui) => {
    if (ui.version !== "0.2") return false;
    return parseV02(ui.source).statements.some((statement) => statement.value === reference);
  });
}

function isLocalContractReference(marker: UnregisteredSemanticMarker, bundle: SilSuiBundle): boolean {
  if (hasSharedDeclaration(bundle, marker.reference) || hasUiSemanticReference(bundle, marker.reference)) return true;
  if (marker.namespace === "prefer") return true;
  if (marker.namespace === "output" && ["code.patch", "test.report"].includes(marker.reference)) return true;
  if (marker.namespace === "verify") return /\.(?:pass|correct|complete|visible|responsive|no_state_change|matches|applies)$/u.test(marker.reference);
  return false;
}

function resolveSemanticReferences(bundle: SilSuiBundle, extensions: readonly DeclaredSemanticExtension[], evidence: readonly SemanticEvidence[]): SemanticReferenceResolution[] {
  return bundle.contracts.flatMap((contract) => markersForContract(contract).map((marker) => {
    if (marker.reference.startsWith("ui_spec.") && resolveUi(bundle, marker.reference.slice("ui_spec.".length))) {
      return { ...marker, resolution: "structural_reference" as const };
    }
    const definition = extensions.find((item) => item.reference === marker.reference && (item.scope === "bundle" || item.declaredBy.name === contract.name));
    if (definition) return { ...marker, resolution: "declared_extension" as const, definition };
    if (isLocalContractReference(marker, bundle)) return { ...marker, resolution: "local_contract_reference" as const };
    const resolvedEvidence = evidence.find((item) => item.reference === marker.reference);
    if (resolvedEvidence) return {
      ...marker,
      resolution: resolvedEvidence.source === "web" ? "web_resolved_extension" as const : "evidence_resolved_extension" as const,
      evidence: resolvedEvidence,
    };
    return { ...marker, resolution: "unregistered" as const };
  }));
}

function linkDiagnostics(bundle: SilSuiBundle, task: BundleContractSource): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (task.version === "0.2") {
    const parsed = parseV02(task.source);
    for (const statement of parsed.statements.filter((item) => item.field === "input" && item.value.startsWith("ui_spec."))) {
      const uiName = statement.value.slice("ui_spec.".length);
      if (!resolveUi(bundle, uiName)) diagnostics.push({
        severity: "error",
        code: "ui-spec-missing",
        message: `Input "${statement.value}" does not reference a UI contract in this bundle.`,
        line: task.startLine + statement.line - 1,
        path: `sil.${task.name}.input`,
      });
    }
    for (const binding of parsed.bindings) {
      const target = /^ui\.([A-Za-z][A-Za-z0-9_]*)\./.exec(binding.target);
      const ui = target ? resolveUi(bundle, target[1]) : undefined;
      if (!ui) {
        diagnostics.push({
          severity: "error",
          code: "binding-ui-missing",
          message: `Binding target "${binding.target}" does not reference a UI contract in this bundle.`,
          line: task.startLine + binding.line - 1,
          path: `sil.${task.name}.bind`,
        });
        continue;
      }
      if (ui.version !== "0.2") {
        diagnostics.push({ severity: "error", code: "binding-version-mismatch", message: `Binding target "${binding.target}" requires a v0.2 UI contract.`, line: task.startLine + binding.line - 1, path: `sil.${task.name}.bind` });
        continue;
      }
      const normalizedBindings = parsed.bindings.map((item) => item === binding
        ? { ...item, target: item.target.replace(`ui.${target![1]}.`, `ui.${ui.name}.`) }
        : item);
      for (const diagnostic of validateBindings({ ...parsed, bindings: normalizedBindings }, parseV02(ui.source))) {
        diagnostics.push(withGlobalLine(diagnostic, task.startLine, task));
      }
    }
    return diagnostics;
  }

  const parsed = parseSil(task.source);
  for (const statement of parsed.statements.filter((item) => item.kind === "input" && item.value.startsWith("ui_spec."))) {
    const uiName = statement.value.slice("ui_spec.".length);
    if (!resolveUi(bundle, uiName)) diagnostics.push({
      severity: "error",
      code: "ui-spec-missing",
      message: `Input "${statement.value}" does not reference a UI contract in this bundle.`,
      line: task.startLine + statement.location.line - 1,
      column: statement.location.column,
      path: `sil.${task.name}.input`,
    });
  }
  return diagnostics;
}

export function validateSilSuiBundle(source: string, options: SemanticEnrichmentOptions = {}): SilSuiBundleValidation {
  const bundle = parseSilSuiBundle(source);
  const contracts: BundleContractValidation[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const contract of bundle.contracts) {
    const validation = validateContract(contract);
    diagnostics.push(...validation.diagnostics);
    contracts.push({ kind: contract.kind, name: contract.name, version: contract.version, valid: validation.result.valid, diagnostics: validation.diagnostics });
  }
  const semantic = collectSemanticExtensions(bundle);
  diagnostics.push(...semantic.diagnostics);
  const evidence = validateSemanticEvidence(options);
  diagnostics.push(...evidence.diagnostics);
  if (!bundle.task) diagnostics.push({ severity: "error", code: "bundle-task-missing", message: "A SIL/SUI bundle requires one task declaration.", path: "bundle" });
  else diagnostics.push(...linkDiagnostics(bundle, bundle.task));
  const valid = !diagnostics.some((item) => item.severity === "error");
  const semanticReferences = resolveSemanticReferences(bundle, semantic.extensions, evidence.evidence);
  const unregisteredReferences = semanticReferences.filter((item) => item.resolution === "unregistered");
  const taskCompilation = bundle.task?.version === "0.1" ? compileSil(bundle.task.source) : undefined;
  const v02TaskReady = bundle.task?.version === "0.2" && (() => {
    const fields = new Set(parseV02(bundle.task!.source).statements.map((statement) => statement.field));
    return ["goal", "target", "action", "output", "verify", "on_failure"].every((field) => fields.has(field));
  })();
  const researchRequests = unregisteredReferences.map((item) => ({
    reference: item.reference,
    query: `Define the exact meaning, inputs, outputs, constraints, and verification implications of ${item.reference}.`,
    allowedSources: options.allowWebEnrichment ? ["repository", "user", "web"] : ["repository", "user"],
  } satisfies SemanticResearchRequest));
  return {
    valid,
    // An exact Core registration is needed for portable semantic
    // interoperability, but it is not needed to preserve and review a valid
    // user-defined domain contract.  Unknown references remain visible below
    // and never become Core entries or host execution authority.
    executionReady: valid && (Boolean(taskCompilation?.readiness.safeToExecute) || Boolean(v02TaskReady)),
    semanticInteroperable: valid && semanticReferences.every((item) => item.resolution !== "unregistered"),
    continuation: valid ? "continue_with_review" : "blocked",
    contracts,
    diagnostics,
    unregisteredReferences,
    semanticExtensions: semantic.extensions,
    semanticReferences,
    semanticEvidence: evidence.evidence,
    researchRequests,
  };
}

/**
 * Runs the two-pass enrichment flow without embedding network access in the DSL.
 * Hosts provide the resolver, which keeps search credentials and authorization
 * outside the parser while preserving every returned source in the result.
 */
export async function enrichSilSuiBundle(source: string, resolver: SemanticEnrichmentResolver, options: SemanticEnrichmentOptions = {}): Promise<SilSuiBundleValidation> {
  const initial = validateSilSuiBundle(source, options);
  if (!options.allowWebEnrichment || !initial.researchRequests.length) return initial;
  const resolvedEvidence = await resolver.resolve(initial.researchRequests);
  return validateSilSuiBundle(source, {
    ...options,
    semanticEvidence: [...(options.semanticEvidence ?? []), ...resolvedEvidence],
  });
}

export function formatSilSuiBundle(source: string): string {
  const bundle = parseSilSuiBundle(source);
  return bundle.contracts.map((contract) => {
    if (contract.kind === "semantic") return formatV02Semantic(parseV02Semantic(contract.source)).trimEnd();
    if (contract.kind !== "sil" && contract.kind !== "sui") return formatV02TopLevelBlock(parseV02TopLevelBlock(contract.source)).trimEnd();
    if (contract.version === "0.2") return formatV02(parseV02(contract.source)).trimEnd();
    if (contract.kind === "sil") return compileSil(contract.source).dsl.trimEnd();
    return formatSuiContract(contract).trimEnd();
  }).join("\n\n") + "\n";
}

function formatSuiContract(contract: BundleContractSource): string {
  const ir = suiAstToIr(parseSui(contract.source));
  const lines = [`ui ${ir.name} {`, ...(ir.screen ? [`  screen: ${ir.screen}`] : [])];
  for (const [field, values] of [["layout", ir.layouts], ["component", ir.components], ["content", ir.content], ["style", ir.styles], ["interaction", ir.interactions], ["constraint", ir.constraints], ["state", ir.states], ["verify", ir.verification], ["on_failure", ir.failureHandling]] as const) {
    for (const value of values) lines.push(`  ${field}: ${value}`);
  }
  lines.push("}");
  return lines.join("\n");
}

export function compileSilSuiBundle(source: string, options: SemanticEnrichmentOptions = {}): { bundle: SilSuiBundle; validation: SilSuiBundleValidation; task?: CompilationResult; taskContract?: string; semanticManifest: string; evidenceManifest: string; sharedManifest: string; uiPrompts: Array<{ name: string; prompt: string }> } {
  const bundle = parseSilSuiBundle(source);
  const validation = validateSilSuiBundle(source, options);
  const task = bundle.task?.version === "0.1" ? compileSil(bundle.task.source) : undefined;
  const taskContract = bundle.task?.version === "0.2" ? formatV02(parseV02(bundle.task.source)) : undefined;
  const semanticManifest = validation.semanticExtensions.length
    ? `Semantic extension manifest\n${validation.semanticExtensions.map((item) => `- ${item.reference} [${item.kind}; ${item.scope}]: ${item.meaning}`).join("\n")}\n`
    : "";
  const evidenceManifest = validation.semanticEvidence.length
    ? `Resolved semantic evidence\n${validation.semanticEvidence.map((item) => `- ${item.reference} [${item.source}${item.url ? `; ${item.url}` : ""}]: ${item.meaning}`).join("\n")}\n`
    : "";
  const sharedManifest = bundle.sharedBlocks.length
    ? `Shared v0.2 declarations\n${bundle.sharedBlocks.map((block) => formatV02TopLevelBlock(parseV02TopLevelBlock(block.source)).trimEnd()).join("\n\n")}\n`
    : "";
  const uiPrompts = bundle.uis.map((ui) => ({
    name: ui.name,
    prompt: ui.version === "0.1" ? `UI specification: ${ui.name}\n${formatSuiContract(ui)}\n` : formatV02(parseV02(ui.source)),
  }));
  return { bundle, validation, task, taskContract, semanticManifest, evidenceManifest, sharedManifest, uiPrompts };
}
