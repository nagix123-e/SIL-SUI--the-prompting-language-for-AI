import { findEntry, findEntryByCode } from "../../codebook/src/index";
import { emptyIr, type Codebook, type Diagnostic, type SemanticIR } from "../../semantic-ir/src/index";

export type QuantizationMode = "lossless" | "compact";

export interface QuantizationResult {
  code: string;
  diagnostics: Diagnostic[];
}

export interface DequantizationResult {
  ir: SemanticIR;
  diagnostics: Diagnostic[];
}

const fields = [
  ["goal", "goal", "g"],
  ["target", "target", "t"],
  ["action", "action", "a"],
  ["inputs", "input", "i"],
  ["outputs", "output", "o"],
  ["required", "require", "r"],
  ["preferred", "prefer", "p"],
  ["forbidden", "forbid", "x"],
  ["verification", "verify", "v"],
  ["failureHandling", "on_failure", "f"],
] as const;

const namespaceFields: Record<string, keyof SemanticIR> = {
  goal: "goal",
  target: "target",
  action: "action",
  input: "inputs",
  output: "outputs",
  require: "required",
  prefer: "preferred",
  forbid: "forbidden",
  verify: "verification",
  on_failure: "failureHandling",
};

function encode(value: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(value, "utf8").toString("base64url");
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decode(value: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(value, "base64url").toString("utf8");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

export function quantizeIr(
  ir: SemanticIR,
  codebook: Codebook,
  mode: QuantizationMode = "lossless",
): QuantizationResult {
  const tokens: string[] = [];
  const diagnostics: Diagnostic[] = [];
  if (mode === "lossless") tokens.push(`~d:${encode(ir.taskId)}`);

  for (const [field, namespace, marker] of fields) {
    const raw = ir[field];
    const refs = typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw : [];
    for (const ref of refs) {
      const entry = findEntry(codebook, namespace, ref);
      if (entry) {
        tokens.push(entry.code);
        continue;
      }
      const mustPreserve = mode === "lossless" || namespace === "require" || namespace === "forbid";
      if (mustPreserve) tokens.push(`~${marker}:${encode(ref)}`);
      diagnostics.push({
        severity: "warning",
        code: mustPreserve ? "unknown-preserved" : "unknown-omitted",
        message: mustPreserve
          ? `Unknown ${namespace} reference "${ref}" was preserved as an extension token.`
          : `Unknown ${namespace} reference "${ref}" was omitted in compact mode.`,
        path: field,
      });
    }
  }

  return { code: `@${codebook.version}|${tokens.join("|")}`, diagnostics };
}

export function dequantize(
  input: string,
  codebook: Codebook,
  fallbackTaskId = "DequantizedTask",
): DequantizationResult {
  const parts = input.trim().split("|");
  const header = /^@(.+)$/.exec(parts.shift() ?? "");
  if (!header) throw new Error('Quantized code must start with "@<version>".');
  if (header[1] !== codebook.version) {
    throw new Error(`Code version ${header[1]} does not match codebook version ${codebook.version}.`);
  }

  const ir = emptyIr(fallbackTaskId);
  const diagnostics: Diagnostic[] = [];
  const extensionFields: Record<string, keyof SemanticIR> = {
    g: "goal",
    t: "target",
    a: "action",
    i: "inputs",
    o: "outputs",
    r: "required",
    p: "preferred",
    x: "forbidden",
    v: "verification",
    f: "failureHandling",
  };

  for (const token of parts.filter(Boolean)) {
    if (token.startsWith("~d:")) {
      ir.taskId = decode(token.slice(3));
      continue;
    }
    if (token.startsWith("~")) {
      const match = /^~([gtaiorpxvf]):(.+)$/.exec(token);
      if (!match || !extensionFields[match[1]]) {
        diagnostics.push({ severity: "warning", code: "unknown-extension", message: `Unknown extension token "${token}".` });
        continue;
      }
      assign(ir, extensionFields[match[1]], decode(match[2]));
      continue;
    }

    const entry = findEntryByCode(codebook, token);
    if (!entry) {
      diagnostics.push({ severity: "warning", code: "unknown-code", message: `Unknown codebook token "${token}".` });
      continue;
    }
    const field = namespaceFields[entry.namespace];
    if (field) assign(ir, field, entry.key);
  }
  return { ir, diagnostics };
}

function assign(ir: SemanticIR, field: keyof SemanticIR, value: string): void {
  const current = ir[field];
  if (Array.isArray(current)) {
    current.push(value);
  } else if (field === "goal" || field === "target" || field === "action") {
    ir[field] ??= value;
  }
}
