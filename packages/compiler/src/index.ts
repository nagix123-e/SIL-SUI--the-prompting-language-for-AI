import { coreCodebook } from "../../codebook/src/index";
import { astToIr, formatIr, parseSil, type SilSyntaxError } from "../../parser/src/index";
import { generateOpenCodeHandoff, generatePrompt } from "../../prompt-generator/src/index";
import { quantizeIr } from "../../quantizer/src/index";
import { assessReadiness, type ReadinessAssessment } from "../../readiness/src/index";
import {
  type Codebook,
  type Diagnostic,
  type SemanticIR,
} from "../../semantic-ir/src/index";
import { calculateConfidence, interpretUnregisteredReferences, validateAst, validateIr, type UnregisteredSemanticMarker } from "../../validator/src/index";
import {
  UnsupportedLanguageError,
  analyzeNaturalLanguage,
  type ConversionEvidence,
} from "./english-analyzer";
import { normalizeNaturalLanguageV03, type V03NaturalLanguageAdapter } from "../../v03/src/index";

export interface CompilationResult {
  ir: SemanticIR;
  dsl: string;
  quantizedCode: string;
  prompt: string;
  diagnostics: Diagnostic[];
  valid: boolean;
  confidence: number;
  evidence: ConversionEvidence[];
  unregisteredReferences: UnregisteredSemanticMarker[];
  readiness: ReadinessAssessment;
  handoffPrompt: string;
}

function finishCompilation(
  ir: SemanticIR,
  codebook: Codebook,
  extraDiagnostics: Diagnostic[] = [],
  evidence: ConversionEvidence[] = [],
): CompilationResult {
  const validation = validateIr(ir, codebook);
  const unregisteredReferences = interpretUnregisteredReferences(ir, codebook);
  const quantized = quantizeIr(ir, codebook, "lossless");
  const losslessDerivedReferences = new Set(
    evidence
      .filter((item) => item.field !== "task" && item.kind === "derived")
      .map((item) => item.value),
  );
  const diagnostics = [...extraDiagnostics, ...validation.diagnostics, ...quantized.diagnostics].filter(
    (diagnostic) =>
      !["unknown-reference", "unknown-preserved"].includes(diagnostic.code) ||
      ![...losslessDerivedReferences].some((reference) => diagnostic.message.includes(`"${reference}"`)),
  );
  const semanticEvidence = evidence.filter((item) => item.field !== "task");
  const evidenceCoverage = semanticEvidence.length
    ? semanticEvidence.reduce(
        (total, item) => total + (item.kind === "matched" ? 1 : item.kind === "derived" ? 0.65 : 0),
        0,
      ) / semanticEvidence.length
    : null;
  const rawConfidence = evidenceCoverage === null
    ? calculateConfidence(ir, diagnostics)
    : Math.max(
        0,
        Math.min(
          1,
          0.08 + evidenceCoverage * 0.9 -
            diagnostics.filter((item) => item.severity === "error").length * 0.2 -
            diagnostics.filter((item) => item.code === "unknown-reference").length * 0.03,
        ),
      );
  const readiness = assessReadiness(ir, codebook, diagnostics, evidence);
  const confidence = Math.min(rawConfidence, readiness.status === "blocked" ? readiness.score / 100 : 1);
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
    evidence,
    unregisteredReferences,
    readiness,
    handoffPrompt: generateOpenCodeHandoff(ir, readiness),
  };
}

export function compileSil(source: string, codebook = coreCodebook): CompilationResult {
  const ast = parseSil(source);
  return finishCompilation(astToIr(ast), codebook, validateAst(ast));
}

export function compileNaturalLanguage(source: string, codebook = coreCodebook): CompilationResult {
  const analysis = analyzeNaturalLanguage(source, codebook);
  return finishCompilation(analysis.ir, codebook, [], analysis.evidence);
}

/**
 * Explicit multilingual boundary. No network call occurs here; a host must
 * provide (or intentionally select) a deterministic/reviewed normalizer.
 */
export function compileMultilingualNaturalLanguage(source: string, adapter?: V03NaturalLanguageAdapter, codebook = coreCodebook): CompilationResult {
  const normalized = normalizeNaturalLanguageV03(source, adapter);
  if (!normalized.normalizedSource) throw new UnsupportedLanguageError(`No normalization adapter is configured for source language "${normalized.sourceLanguage}".`);
  const result = compileNaturalLanguage(normalized.normalizedSource, codebook);
  result.ir.metadata = {
    ...result.ir.metadata,
    sourceLanguage: "en",
    originalSourceLanguage: normalized.sourceLanguage,
    normalizedSemanticLanguage: "en",
    outputIdentifierLanguage: "en",
    warnings: [...(result.ir.metadata?.warnings ?? []), ...(normalized.status === "normalized" ? [`Normalized from ${normalized.sourceLanguage} through a configured adapter.`] : [])],
  };
  return result;
}

export function compile(source: string, codebook = coreCodebook): CompilationResult {
  return /^\s*task\s+/u.test(source) ? compileSil(source, codebook) : compileNaturalLanguage(source, codebook);
}

export function diagnosticFromError(error: unknown): Diagnostic {
  const syntax = error as SilSyntaxError;
  return {
    severity: "error",
    code:
      syntax?.name === "SilSyntaxError"
        ? "syntax-error"
        : error instanceof UnsupportedLanguageError
          ? "unsupported-language"
          : "compile-error",
    message: error instanceof Error ? error.message : "Unknown compilation error.",
    line: syntax?.line,
    column: syntax?.column,
  };
}

export { coreCodebook, getCodebookStats, searchCodebook } from "../../codebook/src/index";
export { parseSil, formatSil, formatIr, astToIr } from "../../parser/src/index";
export { parseSui, suiAstToIr, validateSui, formatSui, formatSuiIr, generateSuiPrompt } from "../../sui/src/index";
export { SUI_BLOCKS, SUI_BLOCK_FIELDS, SUI_BLOCK_FIELD_LABELS, suggestSuiBlocks } from "../../sui/src/index";
export type { SuiBlock, SuggestedSuiBlock } from "../../sui/src/index";
export type { SuiAst, SuiField, SuiIR, SuiStatement, SuiValidationResult } from "../../sui/src/index";
export { formatV02, formatV02Semantic, formatV02TopLevelBlock, parseV02, parseV02Semantic, parseV02TopLevelBlock, validateBindings, validateV02, validateV02Semantic, validateV02TopLevelBlock } from "../../v02/src/index";
export type { V02Binding, V02Contract, V02DataField, V02Example, V02Kind, V02Model, V02Parameter, V02SemanticDefinition, V02TopLevelBlock, V02TopLevelBlockKind, V02Validation } from "../../v02/src/index";
export {
  compileSilSuiBundle,
  enrichSilSuiBundle,
  formatSilSuiBundle,
  isSilSuiBundleSource,
  parseSilSuiBundle,
  validateSilSuiBundle,
} from "../../bundle/src/index";
export type {
  BundleContractKind,
  BundleContractSource,
  BundleContractValidation,
  BundleContractVersion,
  DeclaredSemanticExtension,
  SemanticEnrichmentOptions,
  SemanticEnrichmentResolver,
  SemanticEvidence,
  SemanticEvidenceSource,
  SemanticReferenceResolution,
  SemanticResearchRequest,
  SilSuiBundle,
  SilSuiBundleValidation,
} from "../../bundle/src/index";
export { dequantize, quantizeIr } from "../../quantizer/src/index";
export { generatePrompt, generateJsonPrompt, generateMarkdownPrompt, generateOpenCodeHandoff } from "../../prompt-generator/src/index";
export { assessReadiness } from "../../readiness/src/index";
export type { ReadinessAssessment, ReadinessGap, ReadinessStatus, ContinuationStatus, FailureForecast } from "../../readiness/src/index";
export {
  assessExecutionResult,
  compileRpnProgram,
  executeRpnProgram,
  normalizeTask,
  validateRpnProgram,
} from "../../execution-result/src/index";
export type {
  ActionAdapterResult,
  AssessExecutionResultOptions,
  CapabilityAssessment,
  CapabilityValue,
  ConditionResult,
  EvidenceSource,
  EvidenceStatus,
  ExecutionEvidence,
  ExecutionPhase,
  ExecutionResultAssessment,
  ExecutionResultStatus,
  FailureApplication,
  FailureRule,
  InstructionSource,
  NormalizedTask,
  PostconditionResult,
  RpnInstruction,
  RpnProgram,
  RpnProgramValidation,
  StackEntry,
  StackValueType,
  TrackedCondition,
  VmDiagnostic,
  VmExecutionContext,
  VmExecutionResult,
  VmTraceEntry,
} from "../../execution-result/src/index";
export { orchestrateV03 } from "../../orchestrator/src/index";
export type {
  DependencyKind,
  GateAssessment,
  GateDisposition,
  ObservationStatus,
  OrchestrationMode,
  OrchestrationOptions,
  OrchestrationReport,
  PhaseLedgerEntry,
  PhasePlan,
  PhaseStatus,
  RuntimeObservation,
} from "../../orchestrator/src/index";
export { interpretUnregisteredReference, interpretUnregisteredReferences, validateIr } from "../../validator/src/index";
export type { UnregisteredReferenceKind, UnregisteredSemanticMarker } from "../../validator/src/index";
export { PROMPT_COLOR_CATEGORY } from "../../semantic-ir/src/index";
export {
  V03_VERSION,
  V04_VERSION,
  V05_VERSION,
  CURRENT_V0X_VERSION,
  V03SyntaxError,
  allItems,
  allNodes,
  allStatements,
  applyV03Patch,
  buildComponentGraph,
  buildDependencyGraph,
  formatV03,
  formatSemanticIrV03,
  formatV03Legacy,
  normalizeNaturalLanguageV03,
  deterministicJapaneseAdapter,
  parseV03,
  validateV03,
  v03TaskToSemanticIr,
} from "../../v03/src/index";
export type {
  V03ComponentGraph,
  V03LoopSpec,
  V03DependencyGraph,
  V03Document,
  V03Item,
  V03NaturalLanguageAdapter,
  V03Node,
  V03NodeKind,
  V03PatchOperation,
  V03PatchResult,
  V03Provenance,
  V03ProvenanceKind,
  V03ReadinessProfile,
  V03SourceMetadata,
  V03Statement,
  V03SyntaxStyle,
  V03Validation,
  V03UiDesignProfile,
} from "../../v03/src/index";
export type {
  SemanticIR,
  Diagnostic,
  Codebook,
  CodebookEntry,
  PromptColorCategory,
  StatementKind,
} from "../../semantic-ir/src/index";
export { analyzeNaturalLanguage, naturalLanguageToIr } from "./english-analyzer";
export type { ConversionEvidence, ConversionEvidenceKind, NaturalLanguageAnalysis } from "./english-analyzer";
export {
  inspectPromptForm,
  parsePromptSections,
  PROMPT_GUIDE_FIELDS,
  STRUCTURED_PROMPT_TEMPLATE,
} from "./prompt-structure";
export type {
  PromptFormInspection,
  PromptGuideField,
  PromptSection,
} from "./prompt-structure";
export {
  PROMPT_BLOCKS,
  PROMPT_BLOCK_KIND_LABELS,
  PROMPT_BLOCK_KIND_ORDER,
  highlightPromptText,
  highlightSourceText,
  insertPromptBlockText,
  prependPromptBlockText,
  suggestPromptBlocks,
} from "./prompt-blocks";
export type {
  PromptBlock,
  PromptBlockBinding,
  PromptBlockKind,
  PromptHighlightToken,
  SourceHighlightLanguage,
  SourceHighlightToken,
  SuggestedPromptBlock,
} from "./prompt-blocks";
