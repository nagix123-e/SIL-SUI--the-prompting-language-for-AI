import { coreCodebook } from "../../codebook/src/index";
import { astToIr, formatIr, parseSil, type SilSyntaxError } from "../../parser/src/index";
import { generatePrompt } from "../../prompt-generator/src/index";
import { quantizeIr } from "../../quantizer/src/index";
import {
  MAX_SOURCE_LENGTH,
  type Codebook,
  type Diagnostic,
  type SemanticIR,
  emptyIr,
} from "../../semantic-ir/src/index";
import { calculateConfidence, validateAst, validateIr } from "../../validator/src/index";

export interface CompilationResult {
  ir: SemanticIR;
  dsl: string;
  quantizedCode: string;
  prompt: string;
  diagnostics: Diagnostic[];
  valid: boolean;
  confidence: number;
}

function detectLanguage(source: string): "ja" | "en" | "unknown" {
  if (/[\u3040-\u30ff\u3400-\u9fff]/u.test(source)) return "ja";
  if (/[A-Za-z]/.test(source)) return "en";
  return "unknown";
}

function contains(source: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(source));
}

function taskIdFromTarget(target: string): string {
  return target
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("") + "Task";
}

export function naturalLanguageToIr(source: string): SemanticIR {
  const text = source.trim();
  if (!text) throw new Error("Source text is empty.");
  if (text.length > MAX_SOURCE_LENGTH) {
    throw new Error(`Source exceeds the ${MAX_SOURCE_LENGTH.toLocaleString()} character limit.`);
  }

  let goal = "task.execute";
  if (contains(text, [/bug/i, /fix/i, /不具合/u, /バグ/u, /修正/u])) goal = "bug.fix";
  else if (contains(text, [/add/i, /build/i, /create/i, /implement/i, /追加/u, /作成/u, /実装/u])) goal = "feature.add";
  else if (contains(text, [/summari[sz]e/i, /要約/u])) goal = "content.summarize";
  else if (contains(text, [/classif/i, /分類/u])) goal = "content.classify";

  let target = "instruction.request";
  if (contains(text, [/login screen/i, /ログイン画面/u])) target = "screen.login";
  else if (contains(text, [/auth/i, /authentication/i, /認証/u])) target = "user.authentication";
  else if (contains(text, [/product search/i, /検索/u])) target = "product.search";
  else if (contains(text, [/\bapi\b/i, /endpoint/i, /エンドポイント/u])) target = "api.endpoint";
  else if (contains(text, [/documentation/i, /\bdocs?\b/i, /ドキュメント/u, /文書/u])) target = "project.documentation";

  const ir = emptyIr(taskIdFromTarget(target));
  ir.goal = goal;
  ir.target = target;
  ir.action = contains(text, [/modify/i, /update/i, /edit/i, /変更/u, /更新/u]) ? "modify" : "implement";

  if (contains(text, [/query/i, /検索語/u, /クエリ/u])) ir.inputs.push("user.query");
  if (contains(text, [/email/i, /メール/u])) ir.inputs.push("user.email");
  if (contains(text, [/password/i, /パスワード/u])) ir.inputs.push("user.password");
  if (target === "product.search") ir.outputs.push("product.list");
  if (target === "user.authentication" || target === "screen.login") ir.outputs.push("auth.session");

  if (contains(text, [/preserve/i, /without breaking/i, /壊さず/u, /維持/u])) ir.required.push("existing.behavior.preserve");
  if (contains(text, [/responsive/i, /レスポンシブ/u])) ir.required.push("ui.responsive");
  if (contains(text, [/fast/i, /latency/i, /高速/u, /素早/u])) ir.required.push("response.fast");
  if (contains(text, [/validat/i, /検証/u, /バリデーション/u])) ir.required.push("input.validate");
  if (contains(text, [/hash/i, /ハッシュ/u])) ir.required.push("password.hash");
  if (contains(text, [/simple/i, /シンプル/u])) ir.preferred.push("code.simple");

  if (contains(text, [/do not expose.*secret/i, /secret.*expos/i, /秘密.*漏/u])) ir.forbidden.push("secret.expose");
  if (contains(text, [/do not hardcode/i, /hardcoded? secret/i, /ハードコード/u])) ir.forbidden.push("secret.hardcode");
  if (contains(text, [/no breaking/i, /breaking change/i, /破壊的変更/u])) ir.forbidden.push("change.breaking");
  if (contains(text, [/plaintext password/i, /平文.*パスワード/u])) ir.forbidden.push("password.plaintext_store");

  if (contains(text, [/test/i, /テスト/u])) ir.verification.push("tests.pass");
  if (target === "screen.login") ir.verification.push("login.success");

  ir.metadata = { sourceLanguage: detectLanguage(text) };
  return ir;
}

function finishCompilation(
  ir: SemanticIR,
  codebook: Codebook,
  extraDiagnostics: Diagnostic[] = [],
): CompilationResult {
  const validation = validateIr(ir, codebook);
  const quantized = quantizeIr(ir, codebook, "lossless");
  const diagnostics = [...extraDiagnostics, ...validation.diagnostics, ...quantized.diagnostics];
  const confidence = calculateConfidence(ir, diagnostics);
  ir.metadata = {
    ...ir.metadata,
    confidence,
    warnings: diagnostics.filter((item) => item.severity === "warning").map((item) => item.message),
  };
  return {
    ir,
    dsl: formatIr(ir),
    quantizedCode: quantized.code,
    prompt: generatePrompt(ir),
    diagnostics,
    valid: validation.valid,
    confidence,
  };
}

export function compileSil(source: string, codebook = coreCodebook): CompilationResult {
  const ast = parseSil(source);
  return finishCompilation(astToIr(ast), codebook, validateAst(ast));
}

export function compileNaturalLanguage(source: string, codebook = coreCodebook): CompilationResult {
  return finishCompilation(naturalLanguageToIr(source), codebook);
}

export function compile(source: string, codebook = coreCodebook): CompilationResult {
  return /^\s*task\s+/u.test(source) ? compileSil(source, codebook) : compileNaturalLanguage(source, codebook);
}

export function diagnosticFromError(error: unknown): Diagnostic {
  const syntax = error as SilSyntaxError;
  return {
    severity: "error",
    code: syntax?.name === "SilSyntaxError" ? "syntax-error" : "compile-error",
    message: error instanceof Error ? error.message : "Unknown compilation error.",
    line: syntax?.line,
    column: syntax?.column,
  };
}

export { coreCodebook } from "../../codebook/src/index";
export { parseSil, formatSil, formatIr, astToIr } from "../../parser/src/index";
export { dequantize, quantizeIr } from "../../quantizer/src/index";
export { generatePrompt, generateJsonPrompt, generateMarkdownPrompt } from "../../prompt-generator/src/index";
export { validateIr } from "../../validator/src/index";
export type { SemanticIR, Diagnostic, Codebook } from "../../semantic-ir/src/index";
