import { coreCodebook, findEntry } from "../../codebook/src/index";
import type { Diagnostic, SemanticIR, StatementKind } from "../../semantic-ir/src/index";

/**
 * SIL/SUI v0.3 is an indentation-sensitive declarative data language.  This
 * module deliberately has no evaluator: it tokenizes and validates contracts
 * only.  Keeping this boundary local makes Python-like source safe to accept.
 */
export const V03_VERSION = "0.3";
export const V04_VERSION = "0.4";
export const V05_VERSION = "0.5";
export const CURRENT_V0X_VERSION = V05_VERSION;
export type V0xVersion = typeof V03_VERSION | typeof V04_VERSION | typeof V05_VERSION;
export type V03SyntaxStyle = "pythonic" | "legacy";
export type V03ProvenanceKind = "user_explicit" | "user_inferred" | "defaulted" | "repository_observed" | "document_observed" | "knowledge_observed" | "externally_verified";
export type V03NodeKind = "task" | "ui" | "bundle" | "contract" | "metadata" | "readiness" | "flow" | "sequence" | "parallel" | "depends_on" | "parameter" | "model" | "field" | "component" | "semantic" | "example" | "token" | "breakpoint" | "a11y" | "transition" | "navigation" | "binding" | "data" | "design" | "responsive" | "accessibility" | "rule" | "data_policy" | "verification" | "interaction" | "state" | "when" | "condition" | "exception" | "for_each" | "repeat" | "until" | "render_each" | "body" | "group";

export interface V03Location { line: number; column: number; endLine?: number; }
export interface V03Provenance {
  kind: V03ProvenanceKind;
  sourceIdentifier?: string;
  sourceType?: string;
  sourceLanguage?: string;
  confidence?: number;
  observedAt?: string;
  normalizationNote?: string;
}
export interface V03Statement {
  type: "statement";
  id: string;
  explicitId?: boolean;
  field: string;
  value: string;
  quoted?: boolean;
  multiline?: boolean;
  appliesTo?: string;
  parentId: string;
  sourceOrder: number;
  provenance: V03Provenance;
  location: V03Location;
}
export interface V03Node {
  type: "node";
  id: string;
  kind: V03NodeKind;
  name?: string;
  /** Original declaration keyword for groups whose display name is an explicit ID. */
  declaration?: string;
  parentId?: string;
  sourceOrder: number;
  location: V03Location;
  provenance: V03Provenance;
  items: V03Item[];
}
export type V03Item = V03Node | V03Statement;
export interface V03SourceMetadata {
  originalSourceLanguage: string;
  normalizedSemanticLanguage: "en";
  outputIdentifierLanguage: "en";
  normalizationStatus: "native_en" | "normalized" | "adapter_unavailable";
}
export interface V03Document {
  version: V0xVersion;
  syntaxStyle: "pythonic";
  nodes: V03Node[];
  comments: Array<{ text: string; line: number }>;
  sourceMetadata: V03SourceMetadata;
}
export interface V03Validation {
  valid: boolean;
  diagnostics: Diagnostic[];
  dependencyGraph: V03DependencyGraph;
  componentGraph: V03ComponentGraph;
  readiness: V03ReadinessProfile;
  unresolvedReferences: string[];
  /** References resolved by declarations in this contract, not by the Core codebook. */
  localContractReferences: string[];
  loops: V03LoopSpec[];
  declaredExtensions: string[];
  /** Advisory UI coverage; omissions are review items, never syntax failures. */
  uiDesignProfiles: V03UiDesignProfile[];
  executionAuthorization: { declared: boolean; staticAuthorization: false; reason: string };
}
export interface V03UiDesignProfile {
  ui: string;
  designTokens: boolean;
  responsive: boolean;
  accessibility: boolean;
  navigation: boolean;
  dataBinding: boolean;
  states: boolean;
}
export interface V03LoopSpec {
  id: string;
  name: string;
  kind: "for_each" | "repeat" | "until" | "render_each";
  line: number;
  maxIterations: number;
  over?: string;
  item?: string;
  key?: string;
  condition?: string;
}
export interface V03DependencyGraph { nodes: string[]; edges: Array<{ from: string; to: string; source: "depends_on" | "sequence" }>; executionOrder: string[]; }
export interface V03ComponentGraph { nodes: string[]; edges: Array<{ parent: string; child: string }>; }
export interface V03ReadinessDimension { score: number; status: "ready" | "review" | "blocked"; }
export interface V03ReadinessProfile {
  syntax: V03ReadinessDimension; semantic: V03ReadinessDimension; context: V03ReadinessDimension;
  dependency: V03ReadinessDimension; implementation: V03ReadinessDimension; ui: V03ReadinessDimension;
  security: V03ReadinessDimension; verification: V03ReadinessDimension; authorization: V03ReadinessDimension;
  overall: number;
  /** Host authorization remains false: a valid contract never authorizes tools by itself. */
  safeToExecute: false;
  /** Valid v0.3/v0.4/v0.5 data may be interpreted and planned without a clarification-only stop. */
  continuation: "blocked" | "continue_with_review";
  canContinue: boolean;
}

export class V03SyntaxError extends Error {
  constructor(message: string, public readonly line: number, public readonly column = 1) {
    super(`${message} (${line}:${column})`); this.name = "V03SyntaxError";
  }
}

const nodeKinds = new Set<V03NodeKind>(["task", "ui", "bundle", "contract", "metadata", "readiness", "flow", "sequence", "parallel", "depends_on", "parameter", "model", "field", "component", "semantic", "example", "token", "breakpoint", "a11y", "transition", "navigation", "binding", "data", "design", "responsive", "accessibility", "rule", "data_policy", "verification", "interaction", "state", "when", "condition", "exception", "for_each", "repeat", "until", "render_each", "body"]);
const semanticFields = new Set<StatementKind>(["goal", "target", "action", "input", "output", "require", "prefer", "forbid", "verify", "on_failure"]);
const identifier = /^[A-Za-z][A-Za-z0-9_]*$/u;
const reference = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/u;
const dangerousPython = /^(?:def|class|import|from|for|while|if|elif|else|try|except|finally|with|lambda|return|yield|async|await|raise|pass|break|continue|global|nonlocal|assert|del)\b/u;

/** Browser-safe deterministic identifier hash; it is an ID stabilizer, not a cryptographic primitive. */
function hash(value: string): string {
  let first = 0x811c9dc5; let second = 0x9e3779b9;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ (code + first), 0x85ebca6b) >>> 0;
  }
  return `${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`.toUpperCase().slice(0, 12);
}
function generatedId(parent: string, field: string, order: number): string { return `STMT_${hash(`${parent}:${field}:${order}`)}`; }
function nodeId(kind: string, name: string | undefined, parent: string | undefined, order: number): string { return `NODE_${hash(`${parent ?? "ROOT"}:${kind}:${name ?? ""}:${order}`)}`; }
function sourceLanguage(source: string): string { return /[\u3040-\u30ff\u3400-\u9fff]/u.test(source) ? "ja" : "en"; }
function loc(line: number, column = 1): V03Location { return { line, column }; }
function diag(severity: "error" | "warning", code: string, message: string, line?: number, column?: number, path?: string): Diagnostic { return { severity, code, message, line, column, path }; }

interface SourceLine { line: number; indent: number; text: string; }

/**
 * Attachments are commonly pasted as one fenced SIL/SUI Markdown block.
 * Remove only a matching outer fence while retaining the blank lines so every
 * parser diagnostic keeps its original attachment line number.  Fences inside
 * triple-quoted example data are never inspected or changed.
 */
function unwrapOuterMarkdownFence(source: string): string {
  const lines = source.replace(/\r\n?/gu, "\n").split("\n");
  const first = lines.findIndex((line) => line.trim().length > 0);
  const last = lines.length - 1 - [...lines].reverse().findIndex((line) => line.trim().length > 0);
  if (first < 0 || last <= first || !/^```(?:sil|sui|sil-sui)?\s*$/iu.test(lines[first].trim()) || lines[last].trim() !== "```") return source;
  lines[first] = "";
  lines[last] = "";
  return lines.join("\n");
}

/** Removes # and legacy // comments while preserving quoted and triple-quoted data. */
function splitComment(raw: string): { code: string; comment?: string } {
  let quote: "'" | '"' | undefined;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (quote) { if (char === quote && raw[index - 1] !== "\\") quote = undefined; continue; }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (char === "#") return { code: raw.slice(0, index), comment: raw.slice(index + 1).trim() };
    if (char === "/" && raw[index + 1] === "/") return { code: raw.slice(0, index), comment: raw.slice(index + 2).trim() };
  }
  return { code: raw };
}

function prepareLines(source: string): { lines: SourceLine[]; comments: Array<{ text: string; line: number }> } {
  const lines: SourceLine[] = []; const comments: Array<{ text: string; line: number }> = [];
  for (const [offset, raw] of source.replace(/\r\n?/gu, "\n").split("\n").entries()) {
    const line = offset + 1;
    const leading = /^(\s*)/u.exec(raw)?.[1] ?? "";
    if (leading.includes("\t")) throw new V03SyntaxError("Tabs are not permitted; use four spaces for indentation", line, leading.indexOf("\t") + 1);
    if (leading.length % 4 !== 0) throw new V03SyntaxError("Indentation must use multiples of four spaces", line, 1);
    const { code, comment } = splitComment(raw);
    if (comment) comments.push({ text: comment, line });
    const text = code.trim();
    if (text) lines.push({ line, indent: leading.length, text });
  }
  return { lines, comments };
}

function parseHeader(text: string): { keyword: string; name?: string } | undefined {
  const match = /^([a-z_]+)(?:\s+([A-Za-z][A-Za-z0-9_.-]*))?:$/u.exec(text);
  if (!match) return undefined;
  return { keyword: match[1], name: match[2] };
}
function unquote(value: string): { value: string; quoted: boolean } {
  const single = /^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')$/u.exec(value);
  if (!single) return { value, quoted: false };
  try { return { value: JSON.parse(single[1].startsWith("'") ? `"${single[1].slice(1, -1).replace(/"/gu, '\\"')}"` : single[1]), quoted: true }; }
  catch { return { value: single[1].slice(1, -1), quoted: true }; }
}

export function parseV03(source: string): V03Document {
  source = unwrapOuterMarkdownFence(source);
  const prepared = prepareLines(source); const lines = prepared.lines;
  let cursor = 0; let sequence = 0;
  const defaultProvenance: V03Provenance = { kind: "user_explicit", sourceLanguage: sourceLanguage(source), confidence: 1 };

  const parseItems = (indent: number, parentId?: string, appliesTo?: string): V03Item[] => {
    const items: V03Item[] = [];
    while (cursor < lines.length) {
      const current = lines[cursor];
      if (current.indent < indent) break;
      if (current.indent > indent) throw new V03SyntaxError("Orphan or inconsistent indentation", current.line, 1);
      if (dangerousPython.test(current.text) || /(?:^|\s)(?:=|\+=|-=|\*\*=)/u.test(current.text)) throw new V03SyntaxError("Executable Python syntax is not supported in SIL/SUI", current.line, 1);

      const header = parseHeader(current.text);
      const field = /^([a-z_]+)(?:\s+([A-Z][A-Z0-9_-]*))?:\s*(.*)$/u.exec(current.text);
      if (!header && !field) {
        // Plain entries are legal only inside a known grouped declaration.
        if (!parentId) throw new V03SyntaxError("Expected a declarative field ending in ':'", current.line, 1);
        const item: V03Statement = { type: "statement", id: generatedId(parentId, "item", sequence++), field: "item", value: current.text, appliesTo, parentId, sourceOrder: sequence, provenance: defaultProvenance, location: loc(current.line) };
        cursor += 1; items.push(item); continue;
      }
      const order = sequence++;
      if (header) {
        const keyword = header.keyword;
        // v0.3 contracts are deliberately extensible.  A header that this
        // Runner does not model yet is still inert declarative data, so retain
        // it as a lossless group instead of rejecting an otherwise valid
        // bundle.  It never becomes executable Python or host authority.
        const kind: V03NodeKind = nodeKinds.has(keyword as V03NodeKind) ? keyword as V03NodeKind : "group";
        const id = header.name && keyword === "require" ? header.name : nodeId(keyword, header.name, parentId, order);
        const node: V03Node = { type: "node", id, kind, name: header.name ?? (keyword === "on" ? undefined : keyword), declaration: keyword, parentId, sourceOrder: order, location: loc(current.line), provenance: defaultProvenance, items: [] };
        cursor += 1;
        if (cursor >= lines.length || lines[cursor].indent <= current.indent) throw new V03SyntaxError(`Empty ${keyword} block`, current.line, current.text.length + 1);
        const scoped = keyword === "on" ? header.name : appliesTo;
        node.items = parseItems(indent + 4, node.id, scoped);
        if (keyword === "on") node.name = `on ${header.name ?? ""}`;
        items.push(node); continue;
      }
      const [, key, explicitId, rawValue] = field!;
      if (!rawValue && cursor + 1 < lines.length && lines[cursor + 1].indent > current.indent) {
        const node: V03Node = { type: "node", id: explicitId ?? nodeId(key, key, parentId, order), kind: key === "on" ? "group" : (nodeKinds.has(key as V03NodeKind) ? key as V03NodeKind : "group"), name: explicitId ?? key, declaration: key, parentId, sourceOrder: order, location: loc(current.line), provenance: defaultProvenance, items: [] };
        cursor += 1; node.items = parseItems(indent + 4, node.id, key === "on" ? explicitId : appliesTo); items.push(node); continue;
      }
      if (!rawValue) throw new V03SyntaxError(`Expected a value or indented block for "${key}"`, current.line, current.text.length + 1);
      if (rawValue === '"""') {
        const start = current.line; cursor += 1; const parts: string[] = [];
        while (cursor < lines.length && lines[cursor].text !== '"""') {
          // Triple-quoted inert example data may intentionally start at column 1.
          // Preserve content while never treating it as a nested executable declaration.
          parts.push(" ".repeat(Math.max(0, lines[cursor].indent - current.indent - 4)) + lines[cursor].text);
          cursor += 1;
        }
        if (cursor >= lines.length) throw new V03SyntaxError("Expected closing triple-quoted string", start, current.text.length + 1);
        const statement: V03Statement = { type: "statement", id: explicitId ?? generatedId(parentId ?? "ROOT", key, order), explicitId: Boolean(explicitId), field: key, value: parts.join("\n"), quoted: true, multiline: true, appliesTo, parentId: parentId ?? "ROOT", sourceOrder: order, provenance: defaultProvenance, location: { ...loc(start), endLine: lines[cursor].line } };
        cursor += 1; items.push(statement); continue;
      }
      const value = unquote(rawValue);
      const statement: V03Statement = { type: "statement", id: explicitId ?? generatedId(parentId ?? "ROOT", key, order), explicitId: Boolean(explicitId), field: key, value: value.value, quoted: value.quoted, appliesTo, parentId: parentId ?? "ROOT", sourceOrder: order, provenance: defaultProvenance, location: loc(current.line) };
      cursor += 1; items.push(statement);
    }
    return items;
  };
  const nodes = parseItems(0).filter((item): item is V03Node => item.type === "node");
  if (!nodes.length) throw new V03SyntaxError("Expected a v0.3, v0.4, or v0.5 declaration", 1);
  // New declaration families are inert data by default.  A future authoring
  // tool must not be forced to rewrite a valid envelope solely because this
  // Runner has not assigned a specialised IR node to it yet.
  const language = sourceLanguage(source);
  const versions = allItems({ type: "node", id: "ROOT", kind: "group", sourceOrder: -1, location: loc(1), provenance: defaultProvenance, items: nodes }).filter((item): item is V03Statement => item.type === "statement" && item.field === "version").map((statement) => statement.value);
  const detectedVersion = versions.find((value): value is V0xVersion => value === V03_VERSION || value === V04_VERSION || value === V05_VERSION);
  if (!detectedVersion) throw new V03SyntaxError("A v0.3, v0.4, or v0.5 document must declare version: 0.3, 0.4, or 0.5", nodes[0].location.line);
  const document: V03Document = { version: detectedVersion, syntaxStyle: "pythonic", nodes, comments: prepared.comments, sourceMetadata: { originalSourceLanguage: language, normalizedSemanticLanguage: "en", outputIdentifierLanguage: "en", normalizationStatus: language === "en" ? "native_en" : "adapter_unavailable" } };
  return document;
}

export function allItems(node: V03Node): V03Item[] { return node.items.flatMap((item) => item.type === "node" ? [item, ...allItems(item)] : [item]); }
export function allNodes(document: V03Document): V03Node[] { return document.nodes.flatMap((node) => [node, ...allItems(node).filter((item): item is V03Node => item.type === "node")]); }
export function allStatements(document: V03Document): V03Statement[] { return document.nodes.flatMap((node) => allItems(node).filter((item): item is V03Statement => item.type === "statement")); }

function renderValue(statement: V03Statement): string[] {
  if (statement.multiline) return ['"""', ...statement.value.split("\n"), '"""'];
  if (statement.quoted || /\s|#|\/\//u.test(statement.value)) return [JSON.stringify(statement.value)];
  return [statement.value];
}
function renderItem(item: V03Item, indent: number): string[] {
  const pad = " ".repeat(indent);
  if (item.type === "statement") {
    const label = item.explicitId ? `${item.field} ${item.id}` : item.field;
    const values = renderValue(item);
    if (item.multiline) return [`${pad}${label}: ${values[0]}`, ...values.slice(1, -1).map((line) => `${pad}    ${line}`), `${pad}${values.at(-1)}`];
    return [`${pad}${label}: ${values[0]}`];
  }
  const title = item.kind === "group" ? `${item.declaration ?? "group"}${item.name && item.name !== item.declaration ? ` ${item.name}` : ""}` : `${item.kind}${item.name && item.name !== item.kind ? ` ${item.name}` : ""}`;
  return [`${pad}${title}:`, ...item.items.flatMap((child) => renderItem(child, indent + 4))];
}
/** Canonical v0.3 formatter. Comments intentionally remain non-semantic and are not synthesized. */
export function formatV03(documentOrSource: V03Document | string): string {
  const document = typeof documentOrSource === "string" ? parseV03(documentOrSource) : documentOrSource;
  return `${document.nodes.flatMap((node) => renderItem(node, 0)).join("\n")}\n`;
}

/**
 * Emits the representable SIL task subset in the pre-v0.3 brace syntax. Nested
 * scopes, graphs, provenance, and typed declarations are never silently lost:
 * callers receive explicit warnings for every non-representable construct.
 */
export function formatV03Legacy(documentOrSource: V03Document | string): { source: string; warnings: Diagnostic[] } {
  const document = typeof documentOrSource === "string" ? parseV03(documentOrSource) : documentOrSource;
  const task = tasks(document)[0];
  if (!task) throw new Error("Legacy SIL output requires a task declaration.");
  const warnings: Diagnostic[] = [];
  const lines = [`task ${task.name ?? "UntitledTask"} {`, "  version: 0.2"];
  for (const statement of descendants(task)) {
    if (!semanticFields.has(statement.field as StatementKind) && statement.field !== "version") {
      warnings.push(diag("warning", "lossy-legacy-format", `Legacy output cannot represent ${statement.field} (${statement.id}).`, statement.location.line));
      continue;
    }
    if (statement.field === "version") continue;
    if (statement.appliesTo) warnings.push(diag("warning", "lossy-legacy-format", `Legacy output cannot preserve scope ${statement.appliesTo} for ${statement.id}.`, statement.location.line));
    lines.push(`  ${statement.field}: ${statement.value}`);
  }
  for (const node of allNodes(document)) if (!["task", "group"].includes(node.kind)) warnings.push(diag("warning", "lossy-legacy-format", `Legacy output cannot represent ${node.kind} "${node.name ?? node.id}".`, node.location.line));
  lines.push("}");
  return { source: `${lines.join("\n")}\n`, warnings };
}

function tasks(document: V03Document): V03Node[] { return allNodes(document).filter((node) => node.kind === "task"); }
function descendants(node: V03Node): V03Statement[] { return allItems(node).filter((item): item is V03Statement => item.type === "statement"); }
function groupEntries(node: V03Node, field: string): string[] {
  const direct = descendants(node).filter((statement) => statement.field === field).map((statement) => statement.value);
  const groups = allItems(node).filter((item): item is V03Node => item.type === "node" && (item.kind === "group" && item.name === field || item.kind === field))
    .flatMap((group) => group.items.filter((item): item is V03Statement => item.type === "statement" && item.field === "item").map((item) => item.value));
  return [...direct, ...groups];
}

export function buildDependencyGraph(document: V03Document): { graph: V03DependencyGraph; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = []; const taskNodes = tasks(document); const names = new Set<string>();
  for (const task of taskNodes) {
    if (!task.name || !identifier.test(task.name)) diagnostics.push(diag("error", "invalid-task-id", "Task declarations require an English identifier.", task.location.line));
    else if (names.has(task.name)) diagnostics.push(diag("error", "duplicate-task", `Duplicate task "${task.name}".`, task.location.line));
    else names.add(task.name);
  }
  const edges: V03DependencyGraph["edges"] = []; const add = (from: string, to: string, source: "depends_on" | "sequence", line?: number) => {
    if (from === to) diagnostics.push(diag("error", "self-dependency", `Task "${from}" cannot depend on itself.`, line));
    if (!names.has(to)) diagnostics.push(diag("error", "dependency-target-missing", `Task "${from}" depends on unknown task "${to}".`, line));
    if (edges.some((edge) => edge.from === from && edge.to === to)) return;
    edges.push({ from, to, source });
  };
  for (const task of taskNodes) for (const dependency of groupEntries(task, "depends_on")) add(task.name ?? "", dependency, "depends_on", task.location.line);
  const visitFlow = (node: V03Node): string[] => {
    if (node.kind === "sequence") {
      const members = node.items.filter((item): item is V03Statement => item.type === "statement" && item.field === "item").map((item) => item.value);
      if (members.length < 2) diagnostics.push(diag("error", "sequence-too-short", "A sequence requires at least two tasks.", node.location.line));
      members.forEach((member) => { if (!names.has(member)) diagnostics.push(diag("error", "sequence-target-missing", `Sequence references unknown task "${member}".`, node.location.line)); });
      for (let index = 1; index < members.length; index += 1) add(members[index], members[index - 1], "sequence", node.location.line);
      return members;
    }
    if (node.kind === "parallel") {
      const branches = node.items.flatMap((item) => item.type === "statement" && item.field === "item" ? [item.value] : item.type === "node" ? visitFlow(item) : []);
      if (!branches.length) diagnostics.push(diag("error", "parallel-empty", "A parallel block requires at least one branch.", node.location.line));
      return branches;
    }
    return node.items.flatMap((item) => item.type === "node" ? visitFlow(item) : []);
  };
  allNodes(document).filter((node) => node.kind === "flow").forEach(visitFlow);
  const dependencies = new Map<string, string[]>(); names.forEach((name) => dependencies.set(name, [])); edges.forEach((edge) => dependencies.get(edge.from)?.push(edge.to));
  const visiting = new Set<string>(); const visited = new Set<string>(); const ordered: string[] = [];
  const walk = (name: string, trail: string[]): void => { if (visiting.has(name)) { diagnostics.push(diag("error", "dependency-cycle", `Dependency cycle: ${[...trail, name].join(" -> ")}.`)); return; } if (visited.has(name)) return; visiting.add(name); for (const dep of dependencies.get(name) ?? []) walk(dep, [...trail, name]); visiting.delete(name); visited.add(name); ordered.push(name); };
  names.forEach((name) => walk(name, []));
  if (names.size > 1 && !edges.length) diagnostics.push(diag("warning", "isolated-contracts", "Multiple tasks have no declared flow or dependency relationship."));
  return { graph: { nodes: [...names], edges, executionOrder: ordered }, diagnostics };
}

export function buildComponentGraph(document: V03Document): { graph: V03ComponentGraph; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = []; const nodes: string[] = []; const edges: Array<{ parent: string; child: string }> = []; const seen = new Set<string>();
  const walk = (node: V03Node, parent?: string): void => {
    if (node.kind === "component") {
      const name = node.name ?? node.id;
      if (seen.has(name)) diagnostics.push(diag("error", "duplicate-component", `Duplicate component "${name}".`, node.location.line)); else { seen.add(name); nodes.push(name); }
      if (parent) edges.push({ parent, child: name }); parent = name;
    }
    for (const child of node.items) if (child.type === "node") walk(child, parent);
  };
  allNodes(document).filter((node) => node.kind === "ui").forEach((node) => walk(node));
  return { graph: { nodes, edges }, diagnostics };
}

function declaredExtensions(document: V03Document): Set<string> { return new Set(allNodes(document).filter((node) => node.kind === "semantic").flatMap((node) => descendants(node).filter((item) => item.field === "reference").map((item) => item.value))); }
function references(document: V03Document): V03Statement[] { return allStatements(document).filter((statement) => semanticFields.has(statement.field as StatementKind) && reference.test(statement.value)); }
function hasLocalContractScope(document: V03Document, statement: V03Statement): boolean {
  const nodes = new Map(allNodes(document).map((node) => [node.id, node]));
  let parent = nodes.get(statement.parentId);
  while (parent) {
    if (["rule", "data_policy", "verification", "parameter", "model"].includes(parent.kind)) return true;
    parent = parent.parentId ? nodes.get(parent.parentId) : undefined;
  }
  return false;
}

const loopKinds = new Set<V03LoopSpec["kind"]>(["for_each", "repeat", "until", "render_each"]);
const MAX_LOOP_ITERATIONS = 10_000;
function directValues(node: V03Node, field: string): V03Statement[] { return node.items.filter((item): item is V03Statement => item.type === "statement" && item.field === field); }
function directNode(node: V03Node, declaration: string): V03Node | undefined { return node.items.find((item): item is V03Node => item.type === "node" && item.declaration === declaration); }
function loopDepth(document: V03Document, node: V03Node): number {
  const nodes = new Map(allNodes(document).map((candidate) => [candidate.id, candidate]));
  let depth = 1; let parent = node.parentId ? nodes.get(node.parentId) : undefined;
  while (parent) { if (loopKinds.has(parent.kind as V03LoopSpec["kind"])) depth += 1; parent = parent.parentId ? nodes.get(parent.parentId) : undefined; }
  return depth;
}
function isWithinUi(document: V03Document, node: V03Node): boolean {
  const nodes = new Map(allNodes(document).map((candidate) => [candidate.id, candidate]));
  let current: V03Node | undefined = node;
  while (current) { if (current.kind === "ui") return true; current = current.parentId ? nodes.get(current.parentId) : undefined; }
  return false;
}
function validateLoops(document: V03Document): { loops: V03LoopSpec[]; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = []; const loops: V03LoopSpec[] = [];
  for (const node of allNodes(document).filter((candidate) => loopKinds.has(candidate.kind as V03LoopSpec["kind"]))) {
    const kind = node.kind as V03LoopSpec["kind"];
    if (document.version !== V04_VERSION && document.version !== V05_VERSION) {
      diagnostics.push(diag("error", "loop-version-unsupported", `${kind} requires version: 0.4 or later.`, node.location.line));
      continue;
    }
    if (loopDepth(document, node) > 3) diagnostics.push(diag("error", "loop-depth-exceeded", "Loop nesting may not exceed three levels.", node.location.line));
    const limitField = kind === "render_each" ? "max_items" : "max_iterations";
    const limitStatements = directValues(node, limitField);
    const limit = limitStatements.length === 1 && /^\d+$/u.test(limitStatements[0].value) ? Number(limitStatements[0].value) : NaN;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LOOP_ITERATIONS) {
      diagnostics.push(diag("error", "loop-bound-invalid", `${kind} requires one ${limitField} value from 1 to ${MAX_LOOP_ITERATIONS}.`, node.location.line));
      continue;
    }
    const over = directValues(node, "over")[0]?.value;
    const item = directValues(node, "as")[0]?.value;
    const key = directValues(node, "key")[0]?.value;
    const condition = directValues(node, "condition")[0]?.value;
    if ((kind === "for_each" || kind === "render_each") && (!over || directValues(node, "over").length !== 1)) diagnostics.push(diag("error", "loop-collection-missing", `${kind} requires exactly one over field.`, node.location.line));
    if ((kind === "for_each" || kind === "render_each") && (!item || !identifier.test(item) || directValues(node, "as").length !== 1)) diagnostics.push(diag("error", "loop-item-invalid", `${kind} requires one English identifier in as.`, node.location.line));
    if (kind === "until" && (!condition || directValues(node, "condition").length !== 1)) diagnostics.push(diag("error", "loop-condition-missing", "until requires exactly one declarative condition.", node.location.line));
    if (kind === "render_each") {
      if (!isWithinUi(document, node)) diagnostics.push(diag("error", "render-loop-outside-ui", "render_each is only valid below a ui declaration.", node.location.line));
      if (!key || directValues(node, "key").length !== 1) diagnostics.push(diag("error", "render-loop-key-missing", "render_each requires one stable key field.", node.location.line));
      if (!node.items.some((item) => item.type === "node" && item.kind === "component")) diagnostics.push(diag("error", "render-loop-component-missing", "render_each requires a template component.", node.location.line));
    } else if (!directNode(node, "body")) {
      diagnostics.push(diag("error", "loop-body-missing", `${kind} requires a body block.`, node.location.line));
    }
    loops.push({ id: node.id, name: node.name ?? node.id, kind, line: node.location.line, maxIterations: limit, over, item, key, condition });
  }
  return { loops, diagnostics };
}

/**
 * v0.5 promotes common UI design concerns into named declarative layers. They
 * are intentionally advisory: a small dialog should not be rejected merely
 * because it has no route or data binding.
 */
function assessUiDesign(document: V03Document): { profiles: V03UiDesignProfile[]; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = []; const profiles: V03UiDesignProfile[] = [];
  for (const ui of allNodes(document).filter((node) => node.kind === "ui")) {
    const nodes = [ui, ...allItems(ui).filter((item): item is V03Node => item.type === "node")];
    const has = (kinds: string[]) => nodes.some((node) => kinds.includes(node.kind) || node.declaration !== undefined && kinds.includes(node.declaration));
    const statements = descendants(ui);
    const profile: V03UiDesignProfile = {
      ui: ui.name ?? ui.id,
      designTokens: has(["design", "token"]) || statements.some((item) => ["token", "theme", "spacing", "color", "typography"].includes(item.field)),
      responsive: has(["responsive", "breakpoint"]) || statements.some((item) => ["breakpoint", "responsive"].includes(item.field)),
      accessibility: has(["accessibility", "a11y"]) || statements.some((item) => ["a11y", "role", "label"].includes(item.field)),
      navigation: has(["navigation", "transition"]) || statements.some((item) => ["route", "to", "event"].includes(item.field)),
      dataBinding: has(["binding", "data", "model"]) || statements.some((item) => ["bind", "data", "model"].includes(item.field)),
      states: has(["state"]) || statements.some((item) => item.field === "state"),
    };
    profiles.push(profile);
    if (document.version === V05_VERSION) {
      const omitted = (["designTokens", "responsive", "accessibility", "navigation", "dataBinding", "states"] as const).filter((key) => !profile[key]);
      if (omitted.length) diagnostics.push(diag("warning", "sui-design-review", `UI "${profile.ui}" omits ${omitted.join(", ")}; record it when relevant or explicitly leave it absent for a bounded UI.`, ui.location.line, 1, `ui.${profile.ui}`));
    }
  }
  return { profiles, diagnostics };
}

export function validateV03(documentOrSource: V03Document | string): V03Validation {
  const document = typeof documentOrSource === "string" ? parseV03(documentOrSource) : documentOrSource;
  const diagnostics: Diagnostic[] = [];
  const top = allNodes(document).filter((node) => ["task", "ui", "bundle"].includes(node.kind));
  const versionStatements = allStatements(document).filter((statement) => statement.field === "version");
  if (!versionStatements.length || versionStatements.some((statement) => statement.value !== document.version)) diagnostics.push(diag("error", "version-mismatch", `Every v${document.version} contract must declare version: ${document.version}.`));
  const names = new Set<string>();
  for (const node of top) if (node.name) { const key = `${node.kind}:${node.name}`; if (names.has(key)) diagnostics.push(diag("error", "duplicate-contract", `Duplicate ${node.kind} "${node.name}".`, node.location.line)); names.add(key); }
  const dependency = buildDependencyGraph(document); const component = buildComponentGraph(document); const loopValidation = validateLoops(document); const uiDesign = assessUiDesign(document); diagnostics.push(...dependency.diagnostics, ...component.diagnostics, ...loopValidation.diagnostics, ...uiDesign.diagnostics);
  for (const node of allNodes(document).filter((node) => node.kind === "rule")) for (const field of ["subject", "action", "resource", "effect"]) if (!descendants(node).some((statement) => statement.field === field)) diagnostics.push(diag("error", "rule-property-missing", `Rule "${node.name ?? node.id}" requires ${field}.`, node.location.line));
  for (const node of allNodes(document).filter((node) => node.kind === "data_policy")) for (const field of ["data", "classification", "readable_by", "writable_by", "retention", "external_transfer", "log_value"]) if (!descendants(node).some((statement) => statement.field === field || (field === "readable_by" && groupEntries(node, field).length) || (field === "writable_by" && groupEntries(node, field).length))) diagnostics.push(diag("error", "data-policy-property-missing", `Data policy "${node.name ?? node.id}" requires ${field}.`, node.location.line));
  for (const node of allNodes(document).filter((node) => node.kind === "verification")) for (const field of ["applies_to", "method", "observe", "expected", "evidence", "unavailable_behavior"]) if (!descendants(node).some((statement) => statement.field === field)) diagnostics.push(diag("error", "verification-property-missing", `Verification "${node.name ?? node.id}" requires ${field}.`, node.location.line));
  const extensions = declaredExtensions(document); const localContractReferences = new Set<string>(); const unresolved = new Set<string>();
  for (const statement of references(document)) {
    const field = statement.field as StatementKind;
    if (extensions.has(statement.value) || findEntry(coreCodebook, field, statement.value)) continue;
    const declaredFamily = [...extensions].some((extension) => statement.value.startsWith(`${extension}.`));
    if (declaredFamily || hasLocalContractScope(document, statement)) localContractReferences.add(statement.value);
    else unresolved.add(statement.value);
  }
  [...unresolved].forEach((value) => diagnostics.push(diag("warning", "unresolved-extension", `Semantic reference "${value}" is preserved as an unresolved extension, not a Core registration.`)));
  const declaredAuthorization = allStatements(document).some((statement) => statement.field === "execution_authorized" && statement.value === "true");
  const errors = diagnostics.filter((item) => item.severity === "error").length;
  const score = (blockers: number): V03ReadinessDimension => blockers ? { score: Math.max(0, 100 - blockers * 35), status: "blocked" } : { score: 100, status: "ready" };
  const hasVerification = allNodes(document).some((node) => node.kind === "verification") || tasks(document).some((task) => groupEntries(task, "verify").length > 0);
  const profile: V03ReadinessProfile = { syntax: score(errors), semantic: unresolved.size ? { score: 70, status: "review" } : localContractReferences.size ? { score: 85, status: "review" } : score(errors), context: { score: top.some((node) => node.kind === "task") ? 80 : 50, status: top.some((node) => node.kind === "task") ? "review" : "blocked" }, dependency: score(dependency.diagnostics.filter((item) => item.severity === "error").length), implementation: { score: 75, status: "review" }, ui: score(component.diagnostics.filter((item) => item.severity === "error").length), security: { score: 90, status: "review" }, verification: { score: hasVerification ? 80 : 45, status: hasVerification ? "review" : "blocked" }, authorization: { score: declaredAuthorization ? 50 : 0, status: declaredAuthorization ? "review" : "blocked" }, overall: 0, safeToExecute: false, continuation: errors ? "blocked" : "continue_with_review", canContinue: errors === 0 };
  profile.overall = Math.round(Object.values(profile).filter((value): value is V03ReadinessDimension => typeof value === "object" && "score" in value).reduce((total, value) => total + value.score, 0) / 9);
  return { valid: !errors, diagnostics, dependencyGraph: dependency.graph, componentGraph: component.graph, readiness: profile, unresolvedReferences: [...unresolved], localContractReferences: [...localContractReferences], loops: loopValidation.loops, declaredExtensions: [...extensions], uiDesignProfiles: uiDesign.profiles, executionAuthorization: { declared: declaredAuthorization, staticAuthorization: false, reason: "A declarative execution_authorized field is recorded but never authorizes host execution by itself." } };
}

/** Converts the SIL subset of a v0.3 task to the established v0.1-compatible IR. */
export function v03TaskToSemanticIr(document: V03Document, taskName?: string): SemanticIR {
  const task = tasks(document).find((node) => !taskName || node.name === taskName);
  if (!task) throw new Error("No task is available for Semantic IR conversion.");
  const values = (field: string) => groupEntries(task, field);
  const single = (field: string) => descendants(task).find((statement) => statement.field === field)?.value;
  return { version: document.version, taskId: task.name ?? "UntitledTask", goal: single("goal"), target: single("target"), action: single("action"), inputs: values("input"), outputs: values("output"), required: values("require"), preferred: values("prefer"), forbidden: values("forbid"), verification: values("verify"), failureHandling: values("on_failure"), metadata: { sourceLanguage: document.sourceMetadata.originalSourceLanguage === "en" ? "en" : "en", warnings: document.sourceMetadata.normalizationStatus === "adapter_unavailable" ? ["Source language requires a configured normalization adapter before English semantic normalization."] : undefined } };
}

/** Canonical v0.3 projection of the established task-only Semantic IR. */
export function formatSemanticIrV03(ir: SemanticIR): string {
  const lines = [`task ${ir.taskId}:`, `    version: ${CURRENT_V0X_VERSION}`];
  for (const [field, value] of [["goal", ir.goal], ["target", ir.target], ["action", ir.action]] as const) if (value) lines.push(`    ${field}: ${value}`);
  for (const [field, values] of [["input", ir.inputs], ["output", ir.outputs], ["require", ir.required], ["prefer", ir.preferred], ["forbid", ir.forbidden], ["verify", ir.verification], ["on_failure", ir.failureHandling]] as const) {
    if (!values.length) continue;
    lines.push(`    ${field}:`);
    values.forEach((value) => lines.push(`        ${value}`));
  }
  return `${lines.join("\n")}\n`;
}

export interface V03PatchOperation { op: "add" | "remove" | "replace" | "move" | "change_scope" | "change_force" | "reorder" | "add_dependency" | "remove_dependency"; targetId: string; field?: string; value?: string; appliesTo?: string; afterId?: string; dependency?: string; }
export interface V03PatchResult { applied: boolean; document: V03Document; diagnostics: Diagnostic[]; validation: V03Validation; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function findItem(document: V03Document, id: string): { item: V03Item; parent?: V03Node; index: number } | undefined {
  const walk = (items: V03Item[], parent?: V03Node): { item: V03Item; parent?: V03Node; index: number } | undefined => { for (let index = 0; index < items.length; index += 1) { const item = items[index]; if (item.id === id) return { item, parent, index }; if (item.type === "node") { const match = walk(item.items, item); if (match) return match; } } return undefined; };
  return walk(document.nodes);
}
/** Applies all operations against a copy, validates the result, then commits atomically. */
export function applyV03Patch(document: V03Document, operations: V03PatchOperation[]): V03PatchResult {
  const next = clone(document); const diagnostics: Diagnostic[] = [];
  const fail = (message: string): V03PatchResult => ({ applied: false, document, diagnostics: [diag("error", "patch-failed", message)], validation: validateV03(document) });
  for (const operation of operations) {
    const found = findItem(next, operation.targetId);
    if (!found) return fail(`Patch target "${operation.targetId}" does not exist.`);
    if (operation.op === "remove") { if (!found.parent) return fail("A top-level contract cannot be removed by a statement patch."); found.parent.items.splice(found.index, 1); continue; }
    if (operation.op === "replace") { if (found.item.type !== "statement" || operation.value === undefined) return fail("replace requires a statement target and value."); found.item.value = operation.value; continue; }
    if (operation.op === "move" || operation.op === "change_scope") { if (found.item.type !== "statement" || !operation.appliesTo) return fail(`${operation.op} requires a statement target and appliesTo.`); found.item.appliesTo = operation.appliesTo; continue; }
    if (operation.op === "change_force") { if (found.item.type !== "statement" || !operation.value || !["require", "prefer", "forbid"].includes(operation.value)) return fail("change_force requires require, prefer, or forbid."); found.item.field = operation.value; continue; }
    if (operation.op === "reorder") { if (!found.parent || !operation.afterId) return fail("reorder requires a contained target and afterId."); const after = found.parent.items.findIndex((item) => item.id === operation.afterId); if (after < 0) return fail("reorder afterId does not exist in the same parent."); const [item] = found.parent.items.splice(found.index, 1); found.parent.items.splice(after + (after < found.index ? 1 : 0), 0, item); continue; }
    if (operation.op === "add") { if (found.item.type !== "node" || !operation.field || operation.value === undefined) return fail("add requires a node target, field, and value."); found.item.items.push({ type: "statement", id: generatedId(found.item.id, operation.field, found.item.items.length), field: operation.field, value: operation.value, parentId: found.item.id, sourceOrder: found.item.items.length, provenance: { kind: "user_inferred", confidence: 0.8 }, location: found.item.location }); continue; }
    if (operation.op === "add_dependency" || operation.op === "remove_dependency") { if (found.item.type !== "node" || found.item.kind !== "task" || !operation.dependency) return fail(`${operation.op} requires a task target and dependency.`); const deps = found.item.items.filter((item): item is V03Statement => item.type === "statement" && item.field === "depends_on"); if (operation.op === "add_dependency") { if (deps.some((item) => item.value === operation.dependency)) return fail("Dependency already exists."); found.item.items.push({ type: "statement", id: generatedId(found.item.id, "depends_on", found.item.items.length), field: "depends_on", value: operation.dependency, parentId: found.item.id, sourceOrder: found.item.items.length, provenance: { kind: "user_inferred", confidence: 0.8 }, location: found.item.location }); } else { const index = found.item.items.findIndex((item) => item.type === "statement" && item.field === "depends_on" && item.value === operation.dependency); if (index < 0) return fail("Dependency does not exist."); found.item.items.splice(index, 1); } continue; }
    return fail(`Unsupported patch operation "${operation.op}".`);
  }
  const validation = validateV03(next); if (!validation.valid) return { applied: false, document, diagnostics: [...diagnostics, ...validation.diagnostics], validation };
  return { applied: true, document: next, diagnostics, validation };
}

export interface V03NaturalLanguageAdapter { normalize(input: string, sourceLanguage: string): { normalizedSource: string; confidence: number; note?: string }; }
/**
 * Small offline Japanese normalizer for common instruction force/quantity
 * phrases. It is intentionally conservative: unmatched words remain visible
 * instead of becoming invented English semantics. Hosts may replace it with a
 * reviewed adapter when they need broader language coverage.
 */
export const deterministicJapaneseAdapter: V03NaturalLanguageAdapter = {
  normalize(input) {
    // Emit labelled English semantic candidates for the subset we can preserve
    // exactly. This avoids weakening Japanese 必ず into an unlabelled sentence.
    if (/ログイン画面/u.test(input) || /パスワード/u.test(input)) {
      const lines: string[] = [];
      if (/ログイン画面/u.test(input)) lines.push("Goal: Add login screen.", "Target: screen.login.", "Action: implement.");
      if (/パスワード/u.test(input) && /ハッシュ/u.test(input)) lines.push("Requirements:", "- password.hash");
      const latency = /(\d+)\s*ミリ秒/u.exec(input);
      if (latency && /(?:応答時間|レスポンス時間)/u.test(input)) lines.push("Requirements:", `- latency.max_${latency[1]}_ms`);
      if (/失敗時/u.test(input) && /中止/u.test(input)) lines.push("On failure:", "- task.abort");
      if (lines.length) return { normalizedSource: lines.join("\n"), confidence: 0.86, note: "offline deterministic Japanese labelled normalization" };
    }
    const normalized = input
      .replace(/ログイン画面/gu, "login screen")
      .replace(/ユーザー(?:の)?パスワード/gu, "user password")
      .replace(/応答時間|レスポンス時間/gu, "response latency")
      .replace(/失敗時(?:は)?/gu, "on failure ")
      .replace(/必ず|必須(?:で)?/gu, "must ")
      .replace(/してはいけない|しない/gu, "do not ")
      .replace(/のみ/gu, "only ")
      .replace(/すべて|全て|各(?:々)?/gu, "all ")
      .replace(/未満/gu, "under")
      .replace(/以上/gu, "at least")
      .replace(/(\d+)\s*ミリ秒/gu, "$1 ms")
      .replace(/ハッシュ化(?:する)?/gu, "hash")
      .replace(/実装(?:する|し)?/gu, "implement")
      .replace(/中止(?:する)?/gu, "abort")
      .replace(/[をはにがでとし]/gu, " ")
      .replace(/[。、】【]/gu, ". ")
      .replace(/\s+/gu, " ").trim();
    return { normalizedSource: normalized, confidence: 0.72, note: "offline deterministic Japanese phrase normalization" };
  },
};
/** No network or model call is made here. Hosts may deliberately install an adapter. */
export function normalizeNaturalLanguageV03(input: string, adapter?: V03NaturalLanguageAdapter): { sourceLanguage: string; normalizedSemanticLanguage: "en"; normalizedSource?: string; status: "native_en" | "normalized" | "adapter_unavailable" } {
  const language = sourceLanguage(input); if (language === "en") return { sourceLanguage: language, normalizedSemanticLanguage: "en", normalizedSource: input, status: "native_en" };
  if (!adapter) return { sourceLanguage: language, normalizedSemanticLanguage: "en", status: "adapter_unavailable" };
  return { sourceLanguage: language, normalizedSemanticLanguage: "en", normalizedSource: adapter.normalize(input, language).normalizedSource, status: "normalized" };
}
