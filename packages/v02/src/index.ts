import type { Diagnostic } from "../../semantic-ir/src/index";

export type V02Kind = "sil" | "sui";
export interface V02Property { key: string; value: string; line: number; }
export interface V02Parameter { name: string; properties: V02Property[]; }
export interface V02DataField { name: string; properties: V02Property[]; }
export interface V02Model { name: string; properties: V02Property[]; fields: V02DataField[]; }
export interface V02Example { name: string; properties: V02Property[]; code?: string; }
export interface V02Binding { source: string; target: string; line: number; }
export interface V02NamedBlock { name: string; properties: V02Property[]; }
export type V02SemanticDefinition = V02NamedBlock;
export type V02TopLevelBlockKind = "semantic" | "parameter" | "model" | "example" | "token" | "breakpoint" | "a11y" | "transition";
export interface V02TopLevelBlock extends V02NamedBlock {
  kind: V02TopLevelBlockKind;
  fields?: V02DataField[];
  code?: string;
}
export interface V02Contract {
  kind: V02Kind;
  name: string;
  statements: Array<{ field: string; value: string; line: number }>;
  parameters: V02Parameter[];
  models: V02Model[];
  examples: V02Example[];
  bindings: V02Binding[];
  tokens: V02NamedBlock[];
  breakpoints: V02NamedBlock[];
  accessibility: V02NamedBlock[];
  transitions: V02NamedBlock[];
  semanticDefinitions: V02SemanticDefinition[];
}
export interface V02Validation { valid: boolean; diagnostics: Diagnostic[]; }

const ref = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/;
const identifier = /^[A-Za-z][A-Za-z0-9_]*$/;
const silFields = new Set(["version", "goal", "target", "action", "input", "output", "require", "prefer", "forbid", "verify", "on_failure"]);
const suiFields = new Set(["version", "screen", "layout", "component", "content", "style", "interaction", "constraint", "state", "verify", "on_failure"]);

export class V02SyntaxError extends Error {
  constructor(message: string, public readonly line: number) { super(`${message} (${line}:1)`); this.name = "V02SyntaxError"; }
}

function property(properties: readonly V02Property[], key: string): string | undefined { return properties.find((item) => item.key === key)?.value; }
function strip(line: string): string { return line.slice(0, line.indexOf("//") === -1 ? line.length : line.indexOf("//")).trim(); }

function parseProperties(lines: string[], start: number): { properties: V02Property[]; code?: string; next: number } {
  const properties: V02Property[] = []; let code: string | undefined; let index = start;
  for (; index < lines.length; index += 1) {
    const text = strip(lines[index]);
    if (!text) continue;
    if (text === "}") return { properties, code, next: index + 1 };
    if (text === 'code: """') {
      const chunks: string[] = []; index += 1;
      while (index < lines.length && lines[index].trim() !== '"""') { chunks.push(lines[index]); index += 1; }
      if (index >= lines.length) throw new V02SyntaxError("Expected closing code delimiter", lines.length);
      code = chunks.join("\n"); continue;
    }
    const match = /^([a-z_]+):\s*(.+)$/.exec(text);
    if (!match) throw new V02SyntaxError('Expected "property: value"', index + 1);
    properties.push({ key: match[1], value: match[2], line: index + 1 });
  }
  throw new V02SyntaxError('Expected closing "}"', lines.length);
}

function parseModel(lines: string[], start: number, name: string): { model: V02Model; next: number } {
  const properties: V02Property[] = []; const fields: V02DataField[] = []; let index = start;
  for (; index < lines.length; index += 1) {
    const text = strip(lines[index]);
    if (!text) continue;
    if (text === "}") return { model: { name, properties, fields }, next: index + 1 };
    const field = /^field\s+([^\s{]+)\s*\{$/.exec(text);
    if (field) {
      if (!identifier.test(field[1])) throw new V02SyntaxError("Invalid model field identifier", index + 1);
      const parsed = parseProperties(lines, index + 1); fields.push({ name: field[1], properties: parsed.properties }); index = parsed.next - 1; continue;
    }
    const match = /^([a-z_]+):\s*(.+)$/.exec(text);
    if (!match) throw new V02SyntaxError('Expected "property: value" or "field Name {"', index + 1);
    properties.push({ key: match[1], value: match[2], line: index + 1 });
  }
  throw new V02SyntaxError('Expected closing "}"', lines.length);
}

export function parseV02(source: string): V02Contract {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const first = lines.findIndex((line) => strip(line));
  if (first < 0) throw new V02SyntaxError("Expected a v0.2 definition", 1);
  const declaration = /^(task|ui)\s+([^\s{]+)\s*\{$/.exec(strip(lines[first]));
  if (!declaration) throw new V02SyntaxError('Expected "task Name {" or "ui Name {"', first + 1);
  const kind = declaration[1] === "task" ? "sil" : "sui";
  if (!identifier.test(declaration[2])) throw new V02SyntaxError("Invalid identifier", first + 1);
  const contract: V02Contract = { kind, name: declaration[2], statements: [], parameters: [], models: [], examples: [], bindings: [], tokens: [], breakpoints: [], accessibility: [], transitions: [], semanticDefinitions: [] };
  const allowed = kind === "sil" ? silFields : suiFields;
  let index = first + 1;
  while (index < lines.length) {
    const text = strip(lines[index]);
    if (!text) { index += 1; continue; }
    if (text === "}") {
      if (lines.slice(index + 1).some((line) => strip(line))) throw new V02SyntaxError("Unexpected content after definition", index + 2);
      return contract;
    }
    const block = /^(parameter|model|example|token|breakpoint|a11y|transition|semantic)\s+([^\s{]+)\s*\{$/.exec(text);
    if (block) {
      const name = block[2];
      if (!identifier.test(name)) throw new V02SyntaxError("Invalid block identifier", index + 1);
      if (block[1] === "model") {
        const parsed = parseModel(lines, index + 1, name); contract.models.push(parsed.model); index = parsed.next; continue;
      }
      const parsed = parseProperties(lines, index + 1);
      if (block[1] === "parameter") contract.parameters.push({ name, properties: parsed.properties });
      else if (block[1] === "example") contract.examples.push({ name, properties: parsed.properties, code: parsed.code });
      else {
        const named = { name, properties: parsed.properties };
        if (block[1] === "token") contract.tokens.push(named);
        if (block[1] === "breakpoint") contract.breakpoints.push(named);
        if (block[1] === "a11y") contract.accessibility.push(named);
        if (block[1] === "transition") contract.transitions.push(named);
        if (block[1] === "semantic") contract.semanticDefinitions.push(named);
      }
      index = parsed.next; continue;
    }
    const binding = /^bind:\s*([^\s]+)\s*->\s*([^\s]+)$/.exec(text);
    if (binding) { contract.bindings.push({ source: binding[1], target: binding[2], line: index + 1 }); index += 1; continue; }
    const statement = /^([a-z_]+):\s*([^\s;]+)\s*;?$/.exec(text);
    if (!statement || !allowed.has(statement[1]) || (statement[1] !== "version" && !ref.test(statement[2]))) throw new V02SyntaxError('Expected a v0.2 field, block, or binding', index + 1);
    contract.statements.push({ field: statement[1], value: statement[2], line: index + 1 }); index += 1;
  }
  throw new V02SyntaxError('Expected closing "}"', lines.length);
}

/** Parses a portable top-level semantic declaration used by a SIL/SUI bundle. */
export function parseV02Semantic(source: string): V02SemanticDefinition {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const first = lines.findIndex((line) => strip(line));
  if (first < 0) throw new V02SyntaxError("Expected a semantic definition", 1);
  const declaration = /^semantic\s+([^\s{]+)\s*\{$/.exec(strip(lines[first]));
  if (!declaration) throw new V02SyntaxError('Expected "semantic Name {"', first + 1);
  if (!identifier.test(declaration[1])) throw new V02SyntaxError("Invalid semantic identifier", first + 1);
  const parsed = parseProperties(lines, first + 1);
  if (lines.slice(parsed.next).some((line) => strip(line))) throw new V02SyntaxError("Unexpected content after semantic definition", parsed.next + 1);
  return { name: declaration[1], properties: parsed.properties };
}

/** Parses one reusable v0.2 block placed at the top level of a bundle. */
export function parseV02TopLevelBlock(source: string): V02TopLevelBlock {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const first = lines.findIndex((line) => strip(line));
  if (first < 0) throw new V02SyntaxError("Expected a v0.2 top-level block", 1);
  const declaration = /^(semantic|parameter|model|example|token|breakpoint|a11y|transition)\s+([^\s{]+)\s*\{$/.exec(strip(lines[first]));
  if (!declaration) throw new V02SyntaxError('Expected a named v0.2 block declaration', first + 1);
  if (!identifier.test(declaration[2])) throw new V02SyntaxError("Invalid block identifier", first + 1);
  if (declaration[1] === "semantic") {
    const semantic = parseV02Semantic(source);
    return { kind: "semantic", name: semantic.name, properties: semantic.properties };
  }
  if (declaration[1] === "model") {
    const parsed = parseModel(lines, first + 1, declaration[2]);
    if (lines.slice(parsed.next).some((line) => strip(line))) throw new V02SyntaxError("Unexpected content after top-level block", parsed.next + 1);
    return { kind: "model", name: parsed.model.name, properties: parsed.model.properties, fields: parsed.model.fields };
  }
  const parsed = parseProperties(lines, first + 1);
  if (lines.slice(parsed.next).some((line) => strip(line))) throw new V02SyntaxError("Unexpected content after top-level block", parsed.next + 1);
  return { kind: declaration[1] as Exclude<V02TopLevelBlockKind, "semantic" | "model">, name: declaration[2], properties: parsed.properties, code: parsed.code };
}

function requireProperty(diagnostics: Diagnostic[], block: { name: string; properties: V02Property[] }, key: string, path: string): void {
  if (!property(block.properties, key)) diagnostics.push({ severity: "error", code: "missing-property", message: `${path} "${block.name}" requires ${key}.`, path });
}

function validateSemanticDefinition(diagnostics: Diagnostic[], semantic: V02SemanticDefinition, seen: Set<string>): void {
  requireProperty(diagnostics, semantic, "reference", "semantic");
  requireProperty(diagnostics, semantic, "kind", "semantic");
  requireProperty(diagnostics, semantic, "meaning", "semantic");
  requireProperty(diagnostics, semantic, "scope", "semantic");
  const reference = property(semantic.properties, "reference");
  const kind = property(semantic.properties, "kind");
  const scope = property(semantic.properties, "scope");
  if (reference && !ref.test(reference)) diagnostics.push({ severity: "error", code: "invalid-semantic-reference", message: `Semantic "${semantic.name}" has an invalid reference.`, path: "semantic" });
  if (reference && seen.has(reference)) diagnostics.push({ severity: "error", code: "duplicate-semantic-reference", message: `Semantic reference "${reference}" is declared more than once in this contract.`, path: "semantic" });
  if (reference) seen.add(reference);
  if (kind && !new Set(["proper_noun", "verb", "noun", "domain_rule", "data_model"]).has(kind)) diagnostics.push({ severity: "error", code: "invalid-semantic-kind", message: `Semantic "${semantic.name}" has unsupported kind "${kind}".`, path: "semantic" });
  if (scope && !["bundle", "contract"].includes(scope)) diagnostics.push({ severity: "error", code: "invalid-semantic-scope", message: `Semantic "${semantic.name}" must use scope bundle or contract.`, path: "semantic" });
}

export function validateV02Semantic(semantic: V02SemanticDefinition): V02Validation {
  const diagnostics: Diagnostic[] = [];
  validateSemanticDefinition(diagnostics, semantic, new Set());
  return { valid: !diagnostics.some((item) => item.severity === "error"), diagnostics };
}

export function validateV02TopLevelBlock(block: V02TopLevelBlock): V02Validation {
  if (block.kind === "semantic") return validateV02Semantic(block);
  const diagnostics: Diagnostic[] = [];
  if (block.kind === "parameter") {
    requireProperty(diagnostics, block, "type", "parameter");
    if (!property(block.properties, "value") && !property(block.properties, "source") && !property(block.properties, "required")) diagnostics.push({ severity: "error", code: "missing-parameter-definition", message: `Shared parameter "${block.name}" requires value, source, or required.`, path: "parameter" });
    const type = property(block.properties, "type"); const value = property(block.properties, "value");
    if (type === "number" && value && !Number.isFinite(Number(value))) diagnostics.push({ severity: "error", code: "invalid-number", message: `Parameter "${block.name}" has a non-numeric value.`, path: "parameter" });
    if (property(block.properties, "unit") && value && !property(block.properties, "operator")) diagnostics.push({ severity: "error", code: "missing-operator", message: `Parameter "${block.name}" with a value and unit requires an operator.`, path: "parameter" });
  }
  if (block.kind === "model") {
    requireProperty(diagnostics, block, "format", "model");
    if (!block.fields?.length) diagnostics.push({ severity: "error", code: "missing-model-fields", message: `Model "${block.name}" must declare at least one field.`, path: "model" });
    for (const field of block.fields ?? []) { requireProperty(diagnostics, field, "type", "model.field"); requireProperty(diagnostics, field, "required", "model.field"); }
  }
  if (block.kind === "example") {
    requireProperty(diagnostics, block, "language", "example"); requireProperty(diagnostics, block, "applies_to", "example");
    if (!block.code && !property(block.properties, "source")) diagnostics.push({ severity: "error", code: "missing-example-source", message: `Example "${block.name}" needs source or an embedded code block.`, path: "example" });
  }
  if (block.kind === "token") { requireProperty(diagnostics, block, "type", "token"); requireProperty(diagnostics, block, "value", "token"); }
  if (block.kind === "breakpoint") { for (const key of ["min", "max", "unit"]) requireProperty(diagnostics, block, key, "breakpoint"); }
  if (block.kind === "a11y") { requireProperty(diagnostics, block, "role", "a11y"); requireProperty(diagnostics, block, "label", "a11y"); }
  if (block.kind === "transition") { for (const key of ["from", "event", "to"]) requireProperty(diagnostics, block, key, "transition"); }
  return { valid: !diagnostics.some((item) => item.severity === "error"), diagnostics };
}

export function validateV02(contract: V02Contract): V02Validation {
  const diagnostics: Diagnostic[] = [];
  const version = contract.statements.find((item) => item.field === "version")?.value;
  if (version !== "0.2") diagnostics.push({ severity: "error", code: "version-required", message: "A v0.2 definition must declare version: 0.2.", path: "version" });
  const values = (field: string) => contract.statements.filter((item) => item.field === field).map((item) => item.value);
  if (contract.kind === "sil") {
    for (const field of ["goal", "target", "action", "output", "verify", "on_failure"]) if (!values(field).length) diagnostics.push({ severity: field === "goal" ? "error" : "warning", code: `missing-${field}`, message: `No ${field} is declared.`, path: field });
  } else {
    for (const field of ["screen", "component", "verify", "on_failure"]) if (!values(field).length) diagnostics.push({ severity: field === "screen" || field === "component" ? "error" : "warning", code: `missing-${field}`, message: `No ${field} is declared.`, path: field });
  }
  for (const parameter of contract.parameters) {
    requireProperty(diagnostics, parameter, "type", "parameter"); requireProperty(diagnostics, parameter, "value", "parameter");
    const type = property(parameter.properties, "type"); const value = property(parameter.properties, "value");
    if (type === "number" && (!value || !Number.isFinite(Number(value)))) diagnostics.push({ severity: "error", code: "invalid-number", message: `Parameter "${parameter.name}" has a non-numeric value.`, path: "parameter" });
    if (property(parameter.properties, "unit") && !property(parameter.properties, "operator")) diagnostics.push({ severity: "error", code: "missing-operator", message: `Parameter "${parameter.name}" with a unit requires an operator.`, path: "parameter" });
  }
  for (const example of contract.examples) {
    requireProperty(diagnostics, example, "language", "example"); requireProperty(diagnostics, example, "applies_to", "example");
    if (!example.code && !property(example.properties, "source")) diagnostics.push({ severity: "error", code: "missing-example-source", message: `Example "${example.name}" needs source or an embedded code block.`, path: "example" });
  }
  for (const model of contract.models) {
    requireProperty(diagnostics, model, "format", "model");
    if (!model.fields.length) diagnostics.push({ severity: "error", code: "missing-model-fields", message: `Model "${model.name}" must declare at least one field.`, path: "model" });
    for (const field of model.fields) { requireProperty(diagnostics, field, "type", "model.field"); requireProperty(diagnostics, field, "required", "model.field"); }
  }
  for (const token of contract.tokens) { requireProperty(diagnostics, token, "type", "token"); requireProperty(diagnostics, token, "value", "token"); }
  for (const breakpoint of contract.breakpoints) { requireProperty(diagnostics, breakpoint, "min", "breakpoint"); requireProperty(diagnostics, breakpoint, "max", "breakpoint"); requireProperty(diagnostics, breakpoint, "unit", "breakpoint"); }
  for (const item of contract.accessibility) { requireProperty(diagnostics, item, "role", "a11y"); requireProperty(diagnostics, item, "label", "a11y"); }
  for (const item of contract.transitions) { for (const key of ["from", "event", "to"]) requireProperty(diagnostics, item, key, "transition"); }
  const semanticReferences = new Set<string>();
  for (const semantic of contract.semanticDefinitions) validateSemanticDefinition(diagnostics, semantic, semanticReferences);
  return { valid: !diagnostics.some((item) => item.severity === "error"), diagnostics };
}

export function validateBindings(sil: V02Contract, sui: V02Contract): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const outputs = new Set(sil.statements.filter((item) => item.field === "output").map((item) => item.value));
  const components = new Set(sui.statements.filter((item) => item.field === "component").map((item) => item.value));
  for (const binding of sil.bindings) {
    const source = binding.source.replace(/^output\./, "");
    const target = binding.target.replace(`ui.${sui.name}.`, "");
    if (!binding.source.startsWith("output.") || !outputs.has(source)) diagnostics.push({ severity: "error", code: "binding-source-missing", message: `Binding source "${binding.source}" is not a declared SIL output.`, line: binding.line });
    if (!binding.target.startsWith(`ui.${sui.name}.`) || !components.has(target)) diagnostics.push({ severity: "error", code: "binding-target-missing", message: `Binding target "${binding.target}" is not a declared SUI component.`, line: binding.line });
  }
  return diagnostics;
}

export function formatV02(contract: V02Contract): string {
  const opening = `${contract.kind === "sil" ? "task" : "ui"} ${contract.name} {`;
  const lines = [opening, ...contract.statements.map((item) => `  ${item.field}: ${item.value}`)];
  for (const parameter of contract.parameters) { lines.push("", `  parameter ${parameter.name} {`, ...parameter.properties.map((item) => `    ${item.key}: ${item.value}`), "  }"); }
  for (const model of contract.models) { lines.push("", `  model ${model.name} {`, ...model.properties.map((item) => `    ${item.key}: ${item.value}`)); for (const field of model.fields) lines.push(`    field ${field.name} {`, ...field.properties.map((item) => `      ${item.key}: ${item.value}`), "    }"); lines.push("  }"); }
  for (const example of contract.examples) { lines.push("", `  example ${example.name} {`, ...example.properties.map((item) => `    ${item.key}: ${item.value}`)); if (example.code) lines.push('    code: """', ...example.code.split("\n"), '    """'); lines.push("  }"); }
  for (const semantic of contract.semanticDefinitions) lines.push("", `  semantic ${semantic.name} {`, ...semantic.properties.map((item) => `    ${item.key}: ${item.value}`), "  }");
  for (const [keyword, blocks] of [["token", contract.tokens], ["breakpoint", contract.breakpoints], ["a11y", contract.accessibility], ["transition", contract.transitions]] as const) for (const block of blocks) lines.push("", `  ${keyword} ${block.name} {`, ...block.properties.map((item) => `    ${item.key}: ${item.value}`), "  }");
  for (const binding of contract.bindings) lines.push(`  bind: ${binding.source} -> ${binding.target}`);
  lines.push("}"); return `${lines.join("\n")}\n`;
}

export function formatV02Semantic(semantic: V02SemanticDefinition): string {
  return `semantic ${semantic.name} {\n${semantic.properties.map((item) => `  ${item.key}: ${item.value}`).join("\n")}\n}\n`;
}

export function formatV02TopLevelBlock(block: V02TopLevelBlock): string {
  if (block.kind === "semantic") return formatV02Semantic(block);
  const lines = [`${block.kind} ${block.name} {`, ...block.properties.map((item) => `  ${item.key}: ${item.value}`)];
  for (const field of block.fields ?? []) lines.push(`  field ${field.name} {`, ...field.properties.map((item) => `    ${item.key}: ${item.value}`), "  }");
  if (block.code) lines.push('  code: """', ...block.code.split("\n"), '  """');
  lines.push("}");
  return `${lines.join("\n")}\n`;
}
