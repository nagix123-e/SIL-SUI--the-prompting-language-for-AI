"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  compileNaturalLanguage,
  compileSil,
  coreCodebook,
  diagnosticFromError,
  formatSui,
  formatV02,
  formatV03,
  formatSemanticIrV03,
  highlightPromptText,
  highlightSourceText,
  inspectPromptForm,
  insertPromptBlockText,
  PROMPT_BLOCKS,
  PROMPT_BLOCK_KIND_LABELS,
  PROMPT_BLOCK_KIND_ORDER,
  PROMPT_GUIDE_FIELDS,
  STRUCTURED_PROMPT_TEMPLATE,
  suggestPromptBlocks,
  suggestSuiBlocks,
  SUI_BLOCKS,
  SUI_BLOCK_FIELDS,
  SUI_BLOCK_FIELD_LABELS,
  type CompilationResult,
  type ConversionEvidence,
  type Diagnostic,
  type PromptBlock,
  type SuiBlock,
  parseSui,
  parseV02,
  parseV03,
  validateSui,
  validateV02,
  validateV03,
} from "@/packages/compiler/src/index";

const sampleSource =
  "Create an encrypted account service. Accept a request payload, validate the input, do not expose secrets, and verify that the account was created.";

const samples = [
  {
    label: "Account service",
    value: sampleSource,
  },
  {
    label: "Product search",
    value:
      "Build a fast product search using a user query. Return a product list, validate input, do not expose secrets, and verify with tests.",
  },
  {
    label: "API migration",
    value:
      "Migrate the API endpoint using a request payload. Preserve existing behavior, avoid breaking changes, and roll back on failure.",
  },
] as const;

const outputTabs = ["ir", "code", "prompt", "handoff"] as const;
type OutputTab = (typeof outputTabs)[number];
type ResultOrigin = "generated" | "manual";
type EditorLanguage = "sil" | "sui";
type BlockLibraryMode = "prompt" | "sui";
type MobileWorkspace = "compose" | "source" | "results";
const DEFAULT_RESULTS_HEIGHT = 420;

const sampleSui = `ui PromptEditor {
  version: 0.2
  screen: prompt_editor
  layout: sidebar.left_third
  layout: editor.center
  component: prompt_block_library
  component: english_prompt_editor
  interaction: block.click_insert_at_caret
  interaction: block.drag_drop_insert
  constraint: sidebar.collapsible
  verify: drag_drop.inserts_at_drop_caret
  on_failure: task.abort

  token sidebar_width {
    type: percentage
    value: 33
    unit: percent
  }

  breakpoint compact {
    min: 0
    max: 767
    unit: px
  }

  a11y prompt_block_library {
    role: list
    label: prompt_block_library
  }

  transition sidebar_collapse {
    from: sidebar.expanded
    event: button.click
    to: sidebar.collapsed
  }
}`;

const sampleSilV02 = `task BuildPromptEditor {
  version: 0.2
  goal: feature.add
  target: prompt_editor
  action: implement
  input: ui_spec.PromptEditor
  output: prompt_editor.artifact
  verify: tests.pass
  on_failure: task.abort

  parameter sidebar_width {
    type: number
    value: 33
    unit: percent
    operator: eq
  }

  model PromptBlock {
    format: json_schema
    field label {
      type: string
      required: true
    }
  }

  example PromptBlockJson {
    language: json
    applies_to: model.PromptBlock
    source: samples.prompt_block_json
  }

  bind: output.prompt_editor.artifact -> ui.PromptEditor.prompt_block_library
}`;

const sampleSilV04 = `task BuildPromptEditor:
    version: 0.4
    goal: feature.add
    target: prompt_editor
    action: implement
    input:
        ui_spec.PromptEditor
    output:
        prompt_editor.artifact
    for_each PromptBlock:
        over: input.prompt.blocks
        as: prompt_block
        max_iterations: 200
        body:
            require: prompt_block.sil_aware
    verify:
        tests.pass
    on_failure:
        task.abort
`;

interface CompileAttempt {
  result: CompilationResult | null;
  error: Diagnostic | null;
}

function tryCompileNatural(source: string): CompileAttempt {
  try {
    return { result: compileNaturalLanguage(source), error: null };
  } catch (error) {
    return { result: null, error: diagnosticFromError(error) };
  }
}

function tryCompileDsl(source: string): CompileAttempt {
  try {
    return { result: compileSil(source), error: null };
  } catch (error) {
    return { result: null, error: diagnosticFromError(error) };
  }
}

function asPromptBlock(block: SuiBlock): PromptBlock {
  return {
    id: block.id,
    label: block.label,
    insertText: block.insertText,
    kind: block.kind,
    roles: [],
    bindings: [],
    weight: block.weight,
  };
}

function insertSourceText(source: string, text: string, position: number, selectionEnd = position): { value: string; caret: number } {
  const start = Math.max(0, Math.min(source.length, position));
  const end = Math.max(start, Math.min(source.length, selectionEnd));
  return { value: `${source.slice(0, start)}${text}${source.slice(end)}`, caret: start + text.length };
}

function evidenceFrom(result: CompilationResult): ConversionEvidence[] {
  return result.evidence;
}

function artifactText(result: CompilationResult, tab: OutputTab): string {
  if (tab === "ir") return JSON.stringify(result.ir, null, 2);
  if (tab === "code") return result.quantizedCode;
  if (tab === "handoff") return result.handoffPrompt;
  return result.prompt;
}

function outputTabLabel(tab: OutputTab): string {
  if (tab === "ir") return "JSON IR";
  if (tab === "code") return "Semantic code";
  if (tab === "handoff") return "OpenCode handoff";
  return "Generated prompt";
}

function safeFileStem(taskId: string): string {
  const stem = taskId
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return stem || "instruction";
}

function downloadText(filename: string, value: string, type = "text/plain;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function writeClipboard(value: string): Promise<void> {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    const scratch = document.createElement("textarea");
    scratch.value = value;
    scratch.setAttribute("readonly", "");
    scratch.style.position = "fixed";
    scratch.style.opacity = "0";
    document.body.appendChild(scratch);
    scratch.select();
    const copied = document.execCommand("copy");
    scratch.remove();
    if (!copied) throw new Error("Clipboard permission was denied.");
  }
}

function diagnosticKey(item: Diagnostic, index: number): string {
  return `${item.code}-${item.line ?? 0}-${item.column ?? 0}-${index}`;
}

function blockTitle(block: PromptBlock): string {
  const mappings = block.bindings.map((binding) =>
    binding.reference
      ? `${binding.field} → ${binding.reference}${binding.lossless ? " (lossless)" : ""}`
      : `${binding.field} → contextual`,
  );
  return `${PROMPT_BLOCK_KIND_LABELS[block.kind]} · ${mappings.length ? mappings.join(" · ") : "grammar connector"}`;
}

function textareaOffsetFromPoint(textarea: HTMLTextAreaElement, clientX: number, clientY: number): number {
  const style = window.getComputedStyle(textarea);
  const rect = textarea.getBoundingClientRect();
  const mirror = document.createElement("div");
  const textNode = document.createTextNode(`${textarea.value}\u200b`);

  Object.assign(mirror.style, {
    position: "fixed",
    zIndex: "2147483647",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    boxSizing: style.boxSizing,
    padding: style.padding,
    border: style.border,
    font: style.font,
    fontKerning: style.fontKerning,
    fontVariant: style.fontVariant,
    letterSpacing: style.letterSpacing,
    lineHeight: style.lineHeight,
    textAlign: style.textAlign,
    textIndent: style.textIndent,
    textTransform: style.textTransform,
    tabSize: style.tabSize,
    whiteSpace: "pre-wrap",
    overflowWrap: style.overflowWrap,
    wordBreak: style.wordBreak,
    overflow: "auto",
    opacity: "0.001",
    color: "transparent",
    background: "transparent",
  });
  mirror.setAttribute("aria-hidden", "true");
  mirror.appendChild(textNode);
  document.body.appendChild(mirror);
  mirror.scrollTop = textarea.scrollTop;
  mirror.scrollLeft = textarea.scrollLeft;

  try {
    const caretDocument = document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    const position = caretDocument.caretPositionFromPoint?.(clientX, clientY);
    if (position && mirror.contains(position.offsetNode)) {
      return Math.max(0, Math.min(textarea.value.length, position.offset));
    }
    const range = caretDocument.caretRangeFromPoint?.(clientX, clientY);
    if (range && mirror.contains(range.startContainer)) {
      return Math.max(0, Math.min(textarea.value.length, range.startOffset));
    }
    return textarea.selectionStart;
  } finally {
    mirror.remove();
  }
}

function PromptBlockButton({
  block,
  reason,
  onCaptureCaret,
  onInsertAtCaret,
  onInsertAtPoint,
}: {
  block: PromptBlock;
  reason?: string;
  onCaptureCaret: () => void;
  onInsertAtCaret: (block: PromptBlock) => void;
  onInsertAtPoint: (block: PromptBlock, clientX: number, clientY: number) => boolean;
}) {
  const activeDrag = useRef<{ cleanup: () => void } | null>(null);
  const suppressClick = useRef(false);
  const [isPointerDragging, setIsPointerDragging] = useState(false);

  useEffect(() => () => activeDrag.current?.cleanup(), []);

  return (
    <button
      className={`prompt-block kind-${block.kind}${isPointerDragging ? " is-dragging" : ""}`}
      type="button"
      data-block-id={block.id}
      title={blockTitle(block)}
      aria-label={`Insert ${block.label} at the current caret; or drag it into the prompt`}
      aria-grabbed={isPointerDragging}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        onInsertAtCaret(block);
      }}
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        onCaptureCaret();
        activeDrag.current?.cleanup();
        const startX = event.clientX;
        const startY = event.clientY;
        let moved = false;
        const cleanup = () => {
          window.removeEventListener("mousemove", move);
          window.removeEventListener("mouseup", finish);
        };
        const move = (moveEvent: MouseEvent) => {
          if (!moved && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) >= 6) {
            moved = true;
            setIsPointerDragging(true);
          }
          if (moved) moveEvent.preventDefault();
        };
        const finish = (upEvent: MouseEvent) => {
          cleanup();
          activeDrag.current = null;
          if (moved) {
            suppressClick.current = true;
            upEvent.preventDefault();
            onInsertAtPoint(block, upEvent.clientX, upEvent.clientY);
          }
          setIsPointerDragging(false);
        };
        activeDrag.current = { cleanup };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", finish);
      }}
      onTouchStart={(event) => {
        onCaptureCaret();
        activeDrag.current?.cleanup();
        const touch = event.touches[0];
        if (!touch) return;
        const startX = touch.clientX;
        const startY = touch.clientY;
        let moved = false;
        const move = (moveEvent: TouchEvent) => {
          const nextTouch = moveEvent.touches[0];
          if (!nextTouch) return;
          if (!moved && Math.hypot(nextTouch.clientX - startX, nextTouch.clientY - startY) >= 6) {
            moved = true;
            setIsPointerDragging(true);
          }
          if (moved) moveEvent.preventDefault();
        };
        const cleanup = () => {
          window.removeEventListener("touchmove", move);
          window.removeEventListener("touchend", finish);
        };
        const finish = (upEvent: TouchEvent) => {
          const lastTouch = upEvent.changedTouches[0];
          cleanup();
          activeDrag.current = null;
          if (moved && lastTouch) {
            suppressClick.current = true;
            onInsertAtPoint(block, lastTouch.clientX, lastTouch.clientY);
          }
          setIsPointerDragging(false);
        };
        activeDrag.current = { cleanup };
        window.addEventListener("touchmove", move, { passive: false });
        window.addEventListener("touchend", finish);
      }}
    >
      <span>{block.label}</span>
      {reason ? <small>{reason}</small> : null}
    </button>
  );
}

export default function Home() {
  const initial = useMemo(() => compileNaturalLanguage(sampleSource), []);
  const initialV03 = useMemo(() => formatSemanticIrV03(initial.ir), [initial]);
  const [promptDraft, setPromptDraft] = useState(sampleSource);
  const [convertedPrompt, setConvertedPrompt] = useState(sampleSource);
  const [silDraft, setSilDraft] = useState(initialV03);
  const [generatedSil, setGeneratedSil] = useState(initialV03);
  const [lastValidatedSil, setLastValidatedSil] = useState(initialV03);
  const [lastGood, setLastGood] = useState(initial);
  const [origin, setOrigin] = useState<ResultOrigin>("generated");
  const [conversionEvidence, setConversionEvidence] = useState<ConversionEvidence[]>(() => evidenceFrom(initial));
  const [promptDiagnostic, setPromptDiagnostic] = useState<Diagnostic | null>(null);
  const [silDiagnostics, setSilDiagnostics] = useState<Diagnostic[]>([]);
  const [suiDraft, setSuiDraft] = useState(sampleSui);
  const [lastValidatedSui, setLastValidatedSui] = useState(sampleSui);
  const [suiDiagnostics, setSuiDiagnostics] = useState<Diagnostic[]>([]);
  const [editorLanguage, setEditorLanguage] = useState<EditorLanguage>("sil");
  const [activeTab, setActiveTab] = useState<OutputTab>("ir");
  const [copied, setCopied] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [announcementTone, setAnnouncementTone] = useState<"neutral" | "error">("neutral");
  const [guideExpanded, setGuideExpanded] = useState(false);
  const [blockSidebarOpen, setBlockSidebarOpen] = useState(true);
  const [blockLibraryMode, setBlockLibraryMode] = useState<BlockLibraryMode>("prompt");
  const [blockSearch, setBlockSearch] = useState("");
  const [resultsOpen, setResultsOpen] = useState(true);
  const [resultsHeight, setResultsHeight] = useState(DEFAULT_RESULTS_HEIGHT);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [mobileWorkspace, setMobileWorkspace] = useState<MobileWorkspace>("compose");
  const copiedTimer = useRef<number | null>(null);
  const promptEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const sourceEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const issueNavigatorRef = useRef<HTMLElement | null>(null);
  const readinessRef = useRef<HTMLElement | null>(null);
  const resultsDrawerRef = useRef<HTMLElement | null>(null);
  const resultsResizeRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const promptHighlightRef = useRef<HTMLPreElement | null>(null);
  const promptSelectionRef = useRef({ start: sampleSource.length, end: sampleSource.length });
  const suiSelectionRef = useRef({ start: sampleSui.length, end: sampleSui.length });

  const promptIsStale = promptDraft !== convertedPrompt;
  const silIsDirty = silDraft !== lastValidatedSil;
  const suiIsDirty = suiDraft !== lastValidatedSui;
  const artifactsAreStale = promptIsStale || silIsDirty || suiIsDirty || silDiagnostics.length > 0 || suiDiagnostics.length > 0;
  const evidenceIsReference = promptIsStale || silDraft !== generatedSil || origin === "manual";

  const resultDiagnostics = lastGood.diagnostics;
  const diagnostics = [
    ...(promptDiagnostic ? [promptDiagnostic] : []),
    ...silDiagnostics,
    ...resultDiagnostics,
  ];
  const errors = diagnostics.filter((item) => item.severity === "error").length;
  const warnings = diagnostics.filter((item) => item.severity === "warning").length;
  const outputText = artifactText(lastGood, activeTab);
  const fileStem = safeFileStem(lastGood.ir.taskId);
  const readiness = lastGood.readiness;
  const promptInspection = useMemo(() => inspectPromptForm(promptDraft), [promptDraft]);
  const promptHighlightTokens = useMemo(() => highlightPromptText(promptDraft), [promptDraft]);
  const sourceHighlightTokens = useMemo(
    () => highlightSourceText(editorLanguage === "sil" ? silDraft : suiDraft, editorLanguage),
    [editorLanguage, silDraft, suiDraft],
  );
  const suggestedBlocks = useMemo(() => suggestPromptBlocks(promptDraft, 4), [promptDraft]);
  const suggestedSuiBlocks = useMemo(() => suggestSuiBlocks(suiDraft, 4), [suiDraft]);
  const visibleBlockGroups = useMemo(() => {
    const query = blockSearch.trim().toLowerCase();
    return PROMPT_BLOCK_KIND_ORDER.map((kind) => ({
      kind,
      blocks: PROMPT_BLOCKS.filter((block) => {
        if (block.kind !== kind) return false;
        if (!query) return true;
        const searchable = [
          block.label,
          block.kind,
          ...block.roles,
          ...block.bindings.map((binding) => binding.reference ?? binding.field),
        ].join(" ").toLowerCase();
        return searchable.includes(query);
      }),
    })).filter((group) => group.blocks.length);
  }, [blockSearch]);
  const visibleSuiBlockGroups = useMemo(() => {
    const query = blockSearch.trim().toLowerCase();
    return SUI_BLOCK_FIELDS.map((field) => ({
      field,
      blocks: SUI_BLOCKS.filter((block) => block.field === field && (!query || `${block.label} ${block.field} ${block.reference}`.toLowerCase().includes(query))),
    })).filter((group) => group.blocks.length);
  }, [blockSearch]);

  const announce = useCallback((message: string, tone: "neutral" | "error" = "neutral") => {
    setAnnouncement(message);
    setAnnouncementTone(tone);
  }, []);

  const currentSource = editorLanguage === "sil" ? silDraft : suiDraft;
  const currentSourceDiagnostics = editorLanguage === "sil" ? silDiagnostics : suiDiagnostics;
  const syntaxLabel = currentSourceDiagnostics.some((item) => item.severity === "error")
    ? "Syntax: invalid"
    : editorLanguage === "sil" && silIsDirty || editorLanguage === "sui" && suiIsDirty
      ? "Syntax: not validated"
      : "Syntax: valid";
  const freshnessLabel = artifactsAreStale ? "Artifacts: stale" : "Artifacts: current";

  const focusSourceIssue = useCallback((diagnostic: Diagnostic) => {
    const editor = sourceEditorRef.current;
    if (!editor) return;
    const line = Math.max(1, diagnostic.line ?? 1);
    const lines = currentSource.split("\n");
    const start = lines.slice(0, line - 1).reduce((total, value) => total + value.length + 1, 0) + Math.max(0, (diagnostic.column ?? 1) - 1);
    const end = Math.min(currentSource.length, start + Math.max(1, lines[line - 1]?.length ?? 1));
    window.requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(start, end);
      editor.scrollTop = Math.max(0, (line - 3) * 23);
      announce(`Focused validation issue at ${line}:${diagnostic.column ?? 1}.`);
    });
  }, [announce, currentSource]);

  const beginResultsResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    resultsResizeRef.current = { startY: event.clientY, startHeight: resultsHeight };
    const move = (moveEvent: PointerEvent) => {
      const start = resultsResizeRef.current;
      if (!start) return;
      setResultsHeight(Math.max(180, Math.min(Math.round(window.innerHeight * 0.6), start.startHeight + start.startY - moveEvent.clientY)));
    };
    const end = () => {
      resultsResizeRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  }, [resultsHeight]);

  const showSyntaxDetails = useCallback(() => {
    const errorCount = currentSourceDiagnostics.filter((item) => item.severity === "error").length;
    if (errorCount) {
      setIssuesOpen(true);
      window.requestAnimationFrame(() => {
        issueNavigatorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        announce(`${errorCount} syntax issue${errorCount === 1 ? "" : "s"} available in the issue navigator.`, "error");
      });
      return;
    }
    setMobileWorkspace("source");
    window.requestAnimationFrame(() => {
      sourceEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      announce(`${editorLanguage.toUpperCase()} syntax is ${syntaxLabel.replace("Syntax: ", "")}.`);
    });
  }, [announce, currentSourceDiagnostics, editorLanguage, syntaxLabel]);

  const showReadinessDetails = useCallback(() => {
    window.requestAnimationFrame(() => {
      readinessRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      announce(`Readiness is ${readiness.status}: ${readiness.blockers} blocker${readiness.blockers === 1 ? "" : "s"}.`, readiness.status === "blocked" ? "error" : "neutral");
    });
  }, [announce, readiness.blockers, readiness.status]);

  const showResults = useCallback(() => {
    setResultsOpen(true);
    setMobileWorkspace("results");
    window.requestAnimationFrame(() => {
      resultsDrawerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      announce(artifactsAreStale ? "Showing stale conversion results for comparison." : "Showing current conversion results.");
    });
  }, [announce, artifactsAreStale]);

  const resetResultsHeight = useCallback(() => {
    if (resultsHeight === DEFAULT_RESULTS_HEIGHT) return;
    setResultsHeight(DEFAULT_RESULTS_HEIGHT);
    setResultsOpen(true);
    window.requestAnimationFrame(() => announce(`Results height reset to ${DEFAULT_RESULTS_HEIGHT} px.`));
  }, [announce, resultsHeight]);

  const capturePromptCaret = useCallback(() => {
    const editor = promptEditorRef.current;
    if (!editor || document.activeElement !== editor) return;
    promptSelectionRef.current = {
      start: editor.selectionStart,
      end: editor.selectionEnd,
    };
  }, []);

  const insertPromptBlockAtCaret = useCallback((block: PromptBlock) => {
    const editor = promptEditorRef.current;
    const source = editor?.value ?? promptDraft;
    const selectionStart = Math.min(source.length, promptSelectionRef.current.start);
    const selectionEnd = Math.min(source.length, Math.max(selectionStart, promptSelectionRef.current.end));
    const insertion = insertPromptBlockText(source, block, selectionStart, selectionEnd);
    promptSelectionRef.current = { start: insertion.caret, end: insertion.caret };
    setPromptDraft(insertion.value);
    setPromptDiagnostic(null);
    announce(`Inserted “${block.label}” at the current caret.`);
    window.requestAnimationFrame(() => {
      promptEditorRef.current?.focus();
      promptEditorRef.current?.setSelectionRange(insertion.caret, insertion.caret);
    });
  }, [announce, promptDraft]);

  const insertPromptBlockAtPoint = useCallback((block: PromptBlock, clientX: number, clientY: number) => {
    const editor = promptEditorRef.current;
    if (!editor) return false;
    const rect = editor.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return false;

    const insertion = insertPromptBlockText(
      editor.value,
      block,
      textareaOffsetFromPoint(editor, clientX, clientY),
    );
    promptSelectionRef.current = { start: insertion.caret, end: insertion.caret };
    setPromptDraft(insertion.value);
    setPromptDiagnostic(null);
    window.requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(insertion.caret, insertion.caret);
      announce(`Inserted “${block.label}” at the drop position.`);
    });
    return true;
  }, [announce]);

  const captureSuiCaret = useCallback(() => {
    const editor = sourceEditorRef.current;
    if (!editor || document.activeElement !== editor) return;
    suiSelectionRef.current = { start: editor.selectionStart, end: editor.selectionEnd };
  }, []);

  const insertSuiBlockAtCaret = useCallback((block: PromptBlock) => {
    const editor = sourceEditorRef.current;
    const source = editor?.value ?? suiDraft;
    const insertion = insertSourceText(source, block.insertText, suiSelectionRef.current.start, suiSelectionRef.current.end);
    suiSelectionRef.current = { start: insertion.caret, end: insertion.caret };
    setSuiDraft(insertion.value);
    setSuiDiagnostics([]);
    setEditorLanguage("sui");
    window.requestAnimationFrame(() => {
      sourceEditorRef.current?.focus();
      sourceEditorRef.current?.setSelectionRange(insertion.caret, insertion.caret);
      announce(`Inserted SUI “${block.label}” at the current caret.`);
    });
  }, [announce, suiDraft]);

  const insertSuiBlockAtPoint = useCallback((block: PromptBlock, clientX: number, clientY: number) => {
    const editor = sourceEditorRef.current;
    if (!editor) return false;
    const rect = editor.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return false;
    const insertion = insertSourceText(editor.value, block.insertText, textareaOffsetFromPoint(editor, clientX, clientY));
    suiSelectionRef.current = { start: insertion.caret, end: insertion.caret };
    setSuiDraft(insertion.value);
    setSuiDiagnostics([]);
    window.requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(insertion.caret, insertion.caret);
      announce(`Inserted SUI “${block.label}” at the drop position.`);
    });
    return true;
  }, [announce]);

  const convertPrompt = useCallback(() => {
    const next = tryCompileNatural(promptDraft);
    if (!next.result) {
      setPromptDiagnostic(next.error);
      announce(next.error?.message ?? "The prompt could not be converted.", "error");
      return;
    }
    if (!next.result.valid) {
      const firstError = next.result.diagnostics.find((item) => item.severity === "error") ?? {
        severity: "error" as const,
        code: "conversion-invalid",
        message: "The prompt produced invalid SIL.",
      };
      setPromptDiagnostic(firstError);
      announce(firstError.message, "error");
      return;
    }

    setLastGood(next.result);
    setConvertedPrompt(promptDraft);
    const v03 = formatSemanticIrV03(next.result.ir);
    setSilDraft(v03);
    setGeneratedSil(v03);
    setLastValidatedSil(v03);
    setConversionEvidence(evidenceFrom(next.result));
    setOrigin("generated");
    setResultsOpen(true);
    setMobileWorkspace("results");
    setPromptDiagnostic(null);
    setSilDiagnostics([]);
    announce(
      next.result.readiness.safeToExecute
        ? "Prompt converted. Review the execution contract before using tools."
        : `Prompt converted for analysis. Execution blocked by ${next.result.readiness.blockers} specification gap${next.result.readiness.blockers === 1 ? "" : "s"}.`,
    );
  }, [announce, promptDraft]);

  const validateSil = useCallback(() => {
    const source = editorLanguage === "sui" ? suiDraft : silDraft;
    if (/^\s*version:\s*0\.(?:3|4)\s*$/mu.test(source)) {
      try {
        const document = parseV03(source);
        const validation = validateV03(document);
        if (editorLanguage === "sui") setSuiDiagnostics(validation.diagnostics); else setSilDiagnostics(validation.diagnostics);
        if (!validation.valid) {
          announce(`SIL/SUI v${document.version} validation found errors. The source was preserved.`, "error");
          return;
        }
        const formatted = formatV03(document);
        if (editorLanguage === "sui") { setSuiDraft(formatted); setLastValidatedSui(formatted); } else { setSilDraft(formatted); setLastValidatedSil(formatted); }
        setResultsOpen(true);
        setMobileWorkspace("results");
        announce(validation.diagnostics.length ? `SIL/SUI v${document.version} is structurally valid with review warnings. Execution remains host-authorized only.` : `SIL/SUI v${document.version} structure was validated locally. Execution remains host-authorized only.`);
      } catch (error) {
        const diagnostic = diagnosticFromError(error);
        if (editorLanguage === "sui") setSuiDiagnostics([diagnostic]); else setSilDiagnostics([diagnostic]);
        announce(diagnostic.message, "error");
      }
      return;
    }
    if (/^\s*version:\s*0\.2\s*$/mu.test(source)) {
      try {
        const contract = parseV02(source);
        const validation = validateV02(contract);
        const diagnostics = validation.diagnostics;
        if (editorLanguage === "sui") setSuiDiagnostics(diagnostics); else setSilDiagnostics(diagnostics);
        if (!validation.valid) {
          announce(`${editorLanguage.toUpperCase()} v0.2 validation found errors. The source was preserved.`, "error");
          return;
        }
        const formatted = formatV02(contract);
        if (editorLanguage === "sui") {
          setSuiDraft(formatted); setLastValidatedSui(formatted);
        } else {
          setSilDraft(formatted); setLastValidatedSil(formatted);
        }
        setResultsOpen(true);
        setMobileWorkspace("results");
        announce(diagnostics.length ? `${editorLanguage.toUpperCase()} v0.2 is valid with review warnings.` : `${editorLanguage.toUpperCase()} v0.2 structure was validated locally.`);
      } catch (error) {
        const diagnostic = diagnosticFromError(error);
        if (editorLanguage === "sui") setSuiDiagnostics([diagnostic]); else setSilDiagnostics([diagnostic]);
        announce(diagnostic.message, "error");
      }
      return;
    }
    if (editorLanguage === "sui") {
      try {
        const ast = parseSui(suiDraft);
        const result = validateSui(ast);
        setSuiDiagnostics(result.diagnostics);
        if (!result.valid) {
          announce("SUI validation found errors. The source was preserved.", "error");
          return;
        }
        const formatted = formatSui(suiDraft);
        setSuiDraft(formatted);
        setLastValidatedSui(formatted);
        setSuiDiagnostics(result.diagnostics);
        announce(result.diagnostics.length ? "SUI syntax is valid with review warnings." : "SUI syntax and UI specification were validated locally.");
      } catch (error) {
        const diagnostic = diagnosticFromError(error);
        setSuiDiagnostics([diagnostic]);
        announce(diagnostic.message, "error");
      }
      return;
    }
    const next = tryCompileDsl(silDraft);
    if (!next.result) {
      const error = next.error ?? {
        severity: "error" as const,
        code: "sil-invalid",
        message: "The SIL source could not be validated.",
      };
      setSilDiagnostics([error]);
      announce(error.message, "error");
      return;
    }
    if (!next.result.valid) {
      const nextDiagnostics = next.result.diagnostics.length
        ? next.result.diagnostics
        : [{ severity: "error" as const, code: "sil-invalid", message: "The SIL source is invalid." }];
      setSilDiagnostics(nextDiagnostics);
      announce("SIL validation found errors. The last valid artifacts were preserved.", "error");
      return;
    }

    setLastGood(next.result);
    setSilDraft(next.result.dsl);
    setLastValidatedSil(next.result.dsl);
    setOrigin(next.result.dsl === generatedSil ? "generated" : "manual");
    setResultsOpen(true);
    setMobileWorkspace("results");
    setSilDiagnostics([]);
    announce(
      next.result.readiness.safeToExecute
        ? "SIL syntax and execution readiness were validated locally."
        : `SIL syntax is valid, but execution remains blocked by ${next.result.readiness.blockers} gap${next.result.readiness.blockers === 1 ? "" : "s"}.`,
    );
  }, [announce, editorLanguage, generatedSil, silDraft, suiDraft]);

  const resetGeneratedSil = useCallback(() => {
    if (editorLanguage === "sui") {
      setSuiDraft(sampleSui);
      setLastValidatedSui(sampleSui);
      setSuiDiagnostics([]);
      announce("SUI example restored.");
      return;
    }
    let restored: CompilationResult | null = null;
    if (/^\s*version:\s*0\.(?:3|4)\s*$/mu.test(generatedSil)) {
      try {
        const validation = validateV03(parseV03(generatedSil));
        if (!validation.valid) { announce("The generated SIL could not be restored.", "error"); return; }
      } catch { announce("The generated SIL could not be restored.", "error"); return; }
    } else {
      const next = tryCompileDsl(generatedSil);
      if (!next.result || !next.result.valid) {
        announce("The generated SIL could not be restored.", "error");
        return;
      }
      restored = next.result;
    }
    setSilDraft(generatedSil);
    setLastValidatedSil(generatedSil);
    if (restored) setLastGood(restored);
    setOrigin("generated");
    setSilDiagnostics([]);
    announce("Generated SIL restored.");
  }, [announce, editorLanguage, generatedSil]);

  const copy = useCallback(
    async (label: string, value: string) => {
      try {
        await writeClipboard(value);
        setCopied(label);
        announce("Copied to clipboard.");
        if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
        copiedTimer.current = window.setTimeout(() => setCopied(null), 1600);
      } catch (error) {
        announce(error instanceof Error ? error.message : "Copy failed.", "error");
      }
    },
    [announce],
  );

  const downloadSil = useCallback(() => {
    try {
      const isSui = editorLanguage === "sui";
      const filename = isSui ? "ui-specification.sui" : `${fileStem}.sil`;
      downloadText(filename, isSui ? suiDraft : silDraft);
      announce(`Downloaded ${filename}.`);
    } catch {
      announce("SIL download failed.", "error");
    }
  }, [announce, editorLanguage, fileStem, silDraft, suiDraft]);

  const downloadArtifact = useCallback(() => {
    try {
      const metadata =
        activeTab === "ir"
          ? { filename: `${fileStem}.ir.json`, type: "application/json;charset=utf-8" }
          : activeTab === "code"
            ? { filename: `${fileStem}.semantic-code.txt`, type: "text/plain;charset=utf-8" }
            : activeTab === "handoff"
              ? { filename: `${fileStem}.opencode.md`, type: "text/markdown;charset=utf-8" }
              : { filename: `${fileStem}.prompt.txt`, type: "text/plain;charset=utf-8" };
      downloadText(metadata.filename, outputText, metadata.type);
      announce(`Downloaded ${metadata.filename}.`);
    } catch {
      announce("Artifact download failed.", "error");
    }
  }, [activeTab, announce, fileStem, outputText]);

  const selectTabFromKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>, tab: OutputTab) => {
    const currentIndex = outputTabs.indexOf(tab);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % outputTabs.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + outputTabs.length) % outputTabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = outputTabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = outputTabs[nextIndex];
    setActiveTab(nextTab);
    window.requestAnimationFrame(() => document.getElementById(`artifact-tab-${nextTab}`)?.focus());
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key !== "Enter") return;
      event.preventDefault();
      if (event.shiftKey) validateSil();
      else convertPrompt();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [convertPrompt, validateSil]);

  useEffect(
    () => () => {
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
    },
    [],
  );

  const silStatus = editorLanguage === "sui"
    ? suiDiagnostics.some((item) => item.severity === "error")
      ? { label: "SUI validation failed", className: "invalid" }
      : suiIsDirty
        ? { label: "SUI not validated", className: "pending" }
        : suiDiagnostics.length
          ? { label: "SUI valid · review warnings", className: "pending" }
          : { label: "SUI valid", className: "valid" }
    : /^\s*version:\s*0\.(?:3|4)\s*$/mu.test(silDraft)
      ? silDiagnostics.some((item) => item.severity === "error")
        ? { label: "SIL/SUI v0.3/v0.4 validation failed", className: "invalid" }
        : silIsDirty
          ? { label: "SIL/SUI v0.3/v0.4 not validated", className: "pending" }
          : { label: "SIL/SUI v0.3/v0.4 valid", className: "valid" }
    : /^\s*version:\s*0\.2\s*$/mu.test(silDraft)
      ? silDiagnostics.some((item) => item.severity === "error")
        ? { label: "SIL v0.2 validation failed", className: "invalid" }
        : silIsDirty
          ? { label: "SIL v0.2 not validated", className: "pending" }
          : { label: "SIL v0.2 valid", className: "valid" }
    : silDiagnostics.length
    ? { label: "Validation failed", className: "invalid" }
    : silIsDirty
      ? { label: "Not validated", className: "pending" }
      : promptIsStale
        ? { label: "Prompt not converted", className: "stale" }
        : readiness.status === "blocked"
          ? { label: "Syntax valid · execution blocked", className: "blocked" }
          : readiness.status === "review"
            ? { label: "Syntax valid · review required", className: "pending" }
            : origin === "manual"
              ? { label: "Manually validated · ready", className: "valid" }
              : { label: "Generated · ready", className: "valid" };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-group">
          <img className="brand-mark" src="/sil-logo.png" alt="SIL/SUI logo" />
          <div>
            <div className="brand-line">
              <strong>SIL/SUI Local Converter</strong>
              <span className="version-pill">v0.4</span>
            </div>
            <p>Static prompt analysis → SIL/SUI v0.4 → guarded OpenCode handoff</p>
          </div>
        </div>
        <div className="header-meta">
          <span className="privacy-status"><i aria-hidden="true" /> Analyze only · no execution · nothing saved</span>
          <span className="shortcut-hint">⌘/Ctrl Enter</span>
        </div>
      </header>

      <div className="page-frame">
        <section className="workspace-intro" aria-labelledby="workspace-title">
          <div>
            <p className="eyebrow">Failure-aware SIL interpreter</p>
            <h1 id="workspace-title">Find what will fail before execution.</h1>
            <p className="intro-copy">
              Convert an English prompt locally, forecast failure modes, and block OpenCode handoff until the target, deliverable, constraints, verification, and failure policy are explicit.
            </p>
          </div>
          <div className="sample-picker" aria-label="Prompt examples">
            <span>Use a sample</span>
            <div className="sample-buttons">
              {samples.map((sample) => (
                <button
                  key={sample.label}
                  type="button"
                  onClick={() => {
                    promptSelectionRef.current = { start: sample.value.length, end: sample.value.length };
                    setPromptDraft(sample.value);
                    setPromptDiagnostic(null);
                    announce("Sample loaded. Select Convert to generate SIL.");
                  }}
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className={`prompt-guide ${guideExpanded ? "expanded" : "collapsed"}`} aria-labelledby="prompt-guide-title">
          <div className="guide-heading">
            <div>
              <p className="eyebrow">Human prompt pattern</p>
              <h2 id="prompt-guide-title">Write by role, not as one long paragraph.</h2>
              <p>English-only · one task · one labeled responsibility per line</p>
            </div>
            <div className="guide-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  promptSelectionRef.current = {
                    start: STRUCTURED_PROMPT_TEMPLATE.length,
                    end: STRUCTURED_PROMPT_TEMPLATE.length,
                  };
                  setPromptDraft(STRUCTURED_PROMPT_TEMPLATE);
                  setPromptDiagnostic(null);
                  setGuideExpanded(true);
                  announce("Structured prompt template loaded. Replace each example value, then analyze it.");
                }}
              >
                Load full template
              </button>
              <button
                className="quiet-button guide-toggle"
                type="button"
                aria-expanded={guideExpanded}
                aria-controls="prompt-guide-body"
                onClick={() => setGuideExpanded((current) => !current)}
              >
                {guideExpanded ? "Hide guide" : "Show guide"}
              </button>
            </div>
          </div>

          <div className="guide-body" id="prompt-guide-body" hidden={!guideExpanded}>
            <ol className="guide-fields">
              {PROMPT_GUIDE_FIELDS.map((item, index) => {
                const detected = promptInspection.present.includes(item.field);
                return (
                  <li className={detected ? "detected" : "missing"} key={item.field}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <p><strong>{item.label}</strong>{item.required ? <em>recommended</em> : <em>optional</em>}</p>
                      <code>{item.label}: {item.pattern}</code>
                    </div>
                    <b>{detected ? "detected" : "add"}</b>
                  </li>
                );
              })}
            </ol>

            <aside className="guide-rules" aria-label="Reliable conversion rules">
              <div className="guide-score">
                <span>{promptInspection.mode === "structured" ? "Structured form" : "Free-form cues"}</span>
                <strong>{promptInspection.present.length}/10</strong>
                <p>roles detected before conversion</p>
              </div>
              <h3>Rules that convert reliably</h3>
              <ul>
                <li>Use the labels exactly; bullet lists are supported.</li>
                <li>Name concrete components, inputs, outputs, and forbidden scope.</li>
                <li>Write numbers with units: <code>under 200 ms</code>, <code>retry 2 times</code>.</li>
                <li>Keep product and model names exact: <code>Ollama</code>, <code>Qwen3.6</code>, <code>OpenCode</code>.</li>
                <li>Separate requirements from verification: invariant first, exact check second.</li>
                <li>Keep one implementation objective per prompt.</li>
              </ul>
              <p className="guide-note">Known AI/development terms and detected proper nouns are forced into SIL inputs as lossless context instead of being discarded.</p>
            </aside>
          </div>
        </section>

        <p className="live-status" data-tone={announcementTone} role="status" aria-live="polite">
          {announcement || "Ready for static analysis. No task tools or implementation resources will be used."}
        </p>

        <section className="status-summary-strip" role="status" aria-label="Syntax readiness and artifact status">
          <button className={`status-chip ${currentSourceDiagnostics.some((item) => item.severity === "error") ? "invalid" : ""}`} type="button" onClick={showSyntaxDetails}>
            {syntaxLabel}
          </button>
          <button className={`status-chip ${readiness.status}`} type="button" onClick={showReadinessDetails}>Readiness: {readiness.status}</button>
          <button className={`status-chip ${artifactsAreStale ? "stale" : "current"}`} type="button" onClick={showResults}>{freshnessLabel}</button>
          <button className="status-open-results" type="button" onClick={() => { setResultsOpen((current) => !current); setMobileWorkspace("results"); }}>
            {resultsOpen ? "Hide results" : "Open results"}
          </button>
        </section>

        <div className="mobile-workspace-switcher" role="tablist" aria-label="Workspace section">
          {(["compose", "source", "results"] as const).map((workspace) => (
            <button key={workspace} type="button" role="tab" aria-selected={mobileWorkspace === workspace} className={mobileWorkspace === workspace ? "active" : ""} onClick={() => { setMobileWorkspace(workspace); if (workspace === "results") setResultsOpen(true); }}>
              {workspace === "compose" ? "Compose" : workspace === "source" ? "Source" : "Results"}
            </button>
          ))}
        </div>

        {issuesOpen && currentSourceDiagnostics.length ? (
          <section className="issue-navigator" role="region" aria-label="Validation issues" ref={issueNavigatorRef}>
            <div><strong>Validation issues</strong><span>{currentSourceDiagnostics.length}</span></div>
            <ol>
              {currentSourceDiagnostics.map((item, index) => (
                <li key={diagnosticKey(item, index)}>
                  <button type="button" onClick={() => focusSourceIssue(item)}>
                    <span>{item.severity === "error" ? "Error" : "Warning"}</span>
                    {item.message}
                    {item.line ? <code>{item.line}:{item.column ?? 1}</code> : null}
                  </button>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <section className={`workbench-grid mobile-${mobileWorkspace}`} aria-label="Prompt to SIL workbench">
          <article className="editor-panel prompt-panel workspace-compose">
            <div className="panel-heading">
              <div className="heading-copy">
                <span className="step-number">01</span>
                <div>
                  <h2>English prompt</h2>
                  <p>Plain text · English only</p>
                </div>
              </div>
              <button
                className="quiet-button"
                type="button"
                onClick={() => {
                  promptSelectionRef.current = { start: 0, end: 0 };
                  setPromptDraft("");
                  setPromptDiagnostic(null);
                  announce("Prompt cleared.");
                }}
              >
                Clear
              </button>
            </div>
            <div className={`prompt-authoring-layout ${blockSidebarOpen ? "sidebar-open" : "sidebar-collapsed"}`}>
              <aside className="prompt-block-sidebar" aria-label="Prompt block library">
                {blockSidebarOpen ? (
                  <>
                    <div className="block-sidebar-heading">
                      <div>
                        <strong>{blockLibraryMode === "prompt" ? "Prompt blocks" : "SUI blocks"}</strong>
                        <span>{blockLibraryMode === "prompt" ? `${PROMPT_BLOCKS.length} SIL-aware blocks` : `${SUI_BLOCKS.length} SUI-aware blocks`}</span>
                      </div>
                      <button
                        className="block-sidebar-toggle"
                        type="button"
                        aria-label="Collapse prompt block sidebar"
                        aria-expanded="true"
                        onClick={() => setBlockSidebarOpen(false)}
                      >
                        ‹
                      </button>
                    </div>

                    <div className="block-mode-toggle" role="tablist" aria-label="Block language">
                      <button type="button" role="tab" aria-selected={blockLibraryMode === "prompt"} className={blockLibraryMode === "prompt" ? "active" : ""} onClick={() => setBlockLibraryMode("prompt")}>Prompt → SIL</button>
                      <button type="button" role="tab" aria-selected={blockLibraryMode === "sui"} className={blockLibraryMode === "sui" ? "active" : ""} onClick={() => { setBlockLibraryMode("sui"); setEditorLanguage("sui"); }}>SUI editor</button>
                    </div>

                    <div className="suggested-blocks" aria-label="Suggested next blocks">
                      <div className="block-section-title">
                        <strong>Suggested next</strong>
                        <span>context scored</span>
                      </div>
                      <div className="block-stack suggestions">
                        {(blockLibraryMode === "prompt" ? suggestedBlocks : suggestedSuiBlocks.map(({ block, reason }) => ({ block: asPromptBlock(block), reason }))).map(({ block, reason }) => (
                          <PromptBlockButton
                            block={block}
                            key={block.id}
                            onCaptureCaret={blockLibraryMode === "prompt" ? capturePromptCaret : captureSuiCaret}
                            onInsertAtCaret={blockLibraryMode === "prompt" ? insertPromptBlockAtCaret : insertSuiBlockAtCaret}
                            onInsertAtPoint={blockLibraryMode === "prompt" ? insertPromptBlockAtPoint : insertSuiBlockAtPoint}
                            reason={reason}
                          />
                        ))}
                      </div>
                    </div>

                    <label className="block-search">
                      <span>Find a block</span>
                      <input
                        type="search"
                        value={blockSearch}
                        onChange={(event) => setBlockSearch(event.target.value)}
                        placeholder={blockLibraryMode === "prompt" ? "Ollama, Python, output…" : "sidebar, drag, color…"}
                        aria-label="Filter blocks"
                      />
                    </label>

                    <div className="block-library-scroll">
                      {blockLibraryMode === "prompt" ? visibleBlockGroups.map((group) => (
                        <section className={`block-group kind-${group.kind}`} key={group.kind}>
                          <div className="block-section-title">
                            <strong>{PROMPT_BLOCK_KIND_LABELS[group.kind]}</strong>
                            <span>{group.blocks.length}</span>
                          </div>
                          <div className="block-stack">
                            {group.blocks.map((block) => (
                              <PromptBlockButton
                                block={block}
                                key={block.id}
                                onCaptureCaret={capturePromptCaret}
                                onInsertAtCaret={insertPromptBlockAtCaret}
                                onInsertAtPoint={insertPromptBlockAtPoint}
                              />
                            ))}
                          </div>
                        </section>
                      )) : visibleSuiBlockGroups.map((group) => (
                        <section className={`block-group kind-${SUI_BLOCKS.find((block) => block.field === group.field)?.kind ?? "structure"}`} key={group.field}>
                          <div className="block-section-title">
                            <strong>{SUI_BLOCK_FIELD_LABELS[group.field]}</strong>
                            <span>{group.blocks.length}</span>
                          </div>
                          <div className="block-stack">
                            {group.blocks.map((block) => (
                              <PromptBlockButton
                                block={asPromptBlock(block)}
                                key={block.id}
                                onCaptureCaret={captureSuiCaret}
                                onInsertAtCaret={insertSuiBlockAtCaret}
                                onInsertAtPoint={insertSuiBlockAtPoint}
                              />
                            ))}
                          </div>
                        </section>
                      ))}
                      {!(blockLibraryMode === "prompt" ? visibleBlockGroups.length : visibleSuiBlockGroups.length) ? <p className="no-blocks">No matching blocks.</p> : null}
                    </div>
                    <p className="block-help">Click → current caret · Drag → drop caret{blockLibraryMode === "sui" ? " in the SUI editor" : ""}</p>
                  </>
                ) : (
                  <button
                    className="block-sidebar-rail"
                    type="button"
                    aria-label="Expand prompt block sidebar"
                    aria-expanded="false"
                    onClick={() => setBlockSidebarOpen(true)}
                  >
                    <span>Blocks</span><b>›</b>
                  </button>
                )}
              </aside>

              <div className="prompt-editor-column">
                <div className="prompt-editor-stack">
                  <pre className="prompt-highlight-layer" ref={promptHighlightRef} aria-hidden="true">
                    {promptHighlightTokens.map((token, index) => (
                      <span
                        className={`prompt-token${token.kind ? ` kind-${token.kind}` : ""}`}
                        data-color-category={token.colorCategory}
                        data-token-kind={token.kind ?? undefined}
                        key={`${token.blockId ?? token.codebookId ?? "plain"}-${index}`}
                      >
                        {token.text}
                      </span>
                    ))}
                    {promptDraft.endsWith("\n") ? "\u200b" : null}
                  </pre>
                <textarea
                  ref={promptEditorRef}
                  aria-label="English prompt"
                  aria-describedby={promptDiagnostic ? "prompt-error prompt-counter" : "prompt-counter"}
                  aria-invalid={Boolean(promptDiagnostic)}
                  className="prompt-editor"
                  value={promptDraft}
                  onChange={(event) => {
                    promptSelectionRef.current = {
                      start: event.target.selectionStart,
                      end: event.target.selectionEnd,
                    };
                    setPromptDraft(event.target.value);
                    setPromptDiagnostic(null);
                  }}
                  onSelect={(event) => {
                    promptSelectionRef.current = {
                      start: event.currentTarget.selectionStart,
                      end: event.currentTarget.selectionEnd,
                    };
                  }}
                  onScroll={(event) => {
                    if (!promptHighlightRef.current) return;
                    promptHighlightRef.current.scrollTop = event.currentTarget.scrollTop;
                    promptHighlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
                  }}
                  onDragOver={(event) => {
                    if (!event.dataTransfer.types.includes("application/x-sil-prompt-block")) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                  }}
                  onDrop={(event) => {
                    const blockId = event.dataTransfer.getData("application/x-sil-prompt-block");
                    if (!blockId) return;
                    event.preventDefault();
                    const block = PROMPT_BLOCKS.find((candidate) => candidate.id === blockId);
                    if (!block) return;
                    const editor = event.currentTarget;
                    const insertion = insertPromptBlockText(
                      editor.value,
                      block,
                      textareaOffsetFromPoint(editor, event.clientX, event.clientY),
                    );
                    promptSelectionRef.current = { start: insertion.caret, end: insertion.caret };
                    setPromptDraft(insertion.value);
                    setPromptDiagnostic(null);
                    window.requestAnimationFrame(() => {
                      editor.focus();
                      editor.setSelectionRange(insertion.caret, insertion.caret);
                      announce("Block inserted at the drop position.");
                    });
                  }}
                  spellCheck="true"
                  maxLength={100000}
                  placeholder="Type freely, click a block at the caret, or drag it to an exact position…"
                />
                </div>
                {promptDiagnostic ? (
                  <p className="inline-diagnostic error" id="prompt-error" role="alert">
                    <span aria-hidden="true">×</span>{promptDiagnostic.message}
                  </p>
                ) : null}
                <div className="panel-footer">
                  <span id="prompt-counter">{promptDraft.length.toLocaleString()} / 100,000 characters</span>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={convertPrompt}
                    disabled={!promptDraft.trim()}
                    aria-keyshortcuts="Meta+Enter Control+Enter"
                  >
                    Analyze & convert <span aria-hidden="true">→</span>
                  </button>
                </div>
              </div>
            </div>
          </article>

          <article className="editor-panel sil-panel workspace-source">
            <div className="panel-heading sil-heading">
              <div className="heading-copy">
                <span className="step-number accent">02</span>
                <div>
                  <h2>{editorLanguage.toUpperCase()} source</h2>
                  <p>{editorLanguage === "sil" ? "Editable task contract" : "Editable UI specification"}</p>
                </div>
              </div>
              <span className={`validation-state ${silStatus.className}`}>
                <i aria-hidden="true" />{silStatus.label}
              </span>
            </div>
            <div className="source-language-toggle" role="tablist" aria-label="Source language">
              <button type="button" role="tab" aria-selected={editorLanguage === "sil"} className={editorLanguage === "sil" ? "active" : ""} onClick={() => setEditorLanguage("sil")}>SIL task</button>
              <button type="button" role="tab" aria-selected={editorLanguage === "sui"} className={editorLanguage === "sui" ? "active" : ""} onClick={() => setEditorLanguage("sui")}>SUI layout</button>
              <button type="button" onClick={() => { setEditorLanguage("sil"); setSilDraft(sampleSilV04); setSilDiagnostics([]); announce("SIL v0.4 template loaded."); }}>Load SIL v0.4</button>
              <button type="button" onClick={() => { setEditorLanguage("sil"); setSilDraft(sampleSilV02); setSilDiagnostics([]); announce("SIL v0.2 template loaded."); }}>Load SIL v0.2</button>
              <button type="button" onClick={() => { setEditorLanguage("sui"); setSuiDraft(sampleSui); setSuiDiagnostics([]); announce("SUI v0.2 template loaded."); }}>Load SUI v0.2</button>
            </div>
            <div className="sil-editor-stack">
              <pre className="sil-highlight-layer" aria-hidden="true">
                {sourceHighlightTokens.map((token, index) => (
                  <span
                    className={`prompt-token${token.kind ? ` kind-${token.kind}` : ""}`}
                    data-color-category={token.colorCategory}
                    data-token-kind={token.kind ?? undefined}
                    key={`${token.kind ?? "plain"}-${index}`}
                  >
                    {token.text}
                  </span>
                ))}
                {(editorLanguage === "sil" ? silDraft : suiDraft).endsWith("\n") ? "\u200b" : null}
              </pre>
              <textarea
                ref={sourceEditorRef}
                aria-label={editorLanguage === "sil" ? "SIL source editor" : "SUI source editor"}
                aria-describedby={(editorLanguage === "sil" ? silDiagnostics : suiDiagnostics).length ? "sil-errors" : undefined}
                aria-invalid={(editorLanguage === "sil" ? silDiagnostics : suiDiagnostics).length > 0}
                className="sil-editor"
                value={editorLanguage === "sil" ? silDraft : suiDraft}
                onChange={(event) => {
                  if (editorLanguage === "sil") {
                    setSilDraft(event.target.value);
                    setSilDiagnostics([]);
                  } else {
                    suiSelectionRef.current = { start: event.target.selectionStart, end: event.target.selectionEnd };
                    setSuiDraft(event.target.value);
                    setSuiDiagnostics([]);
                  }
                }}
                onSelect={(event) => {
                  if (editorLanguage === "sui") suiSelectionRef.current = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd };
                }}
                onScroll={(event) => {
                  const highlight = event.currentTarget.previousElementSibling;
                  if (!(highlight instanceof HTMLElement)) return;
                  highlight.scrollTop = event.currentTarget.scrollTop;
                  highlight.scrollLeft = event.currentTarget.scrollLeft;
                }}
                spellCheck="false"
                maxLength={100000}
              />
            </div>
            {(editorLanguage === "sil" ? silDiagnostics : suiDiagnostics).length ? (
              <div className="inline-diagnostic-list" id="sil-errors" role="alert">
                {(editorLanguage === "sil" ? silDiagnostics : suiDiagnostics).map((item, index) => (
                  <p className={`inline-diagnostic ${item.severity}`} key={diagnosticKey(item, index)}>
                    <span aria-hidden="true">{item.severity === "error" ? "×" : "!"}</span>
                    {item.message}
                    {item.line ? <code>{item.line}:{item.column}</code> : null}
                  </p>
                ))}
              </div>
            ) : null}
            <div className="panel-footer sil-actions">
              <div className="button-group">
                <button className="secondary-button" type="button" onClick={resetGeneratedSil} disabled={editorLanguage === "sil" ? silDraft === generatedSil : suiDraft === sampleSui}>
                  {editorLanguage === "sil" ? "Reset generated" : "Reset SUI example"}
                </button>
                <button className="secondary-button" type="button" onClick={() => void copy(editorLanguage, editorLanguage === "sil" ? silDraft : suiDraft)} disabled={!(editorLanguage === "sil" ? silDraft : suiDraft)}>
                  {copied === editorLanguage ? "Copied" : `Copy ${editorLanguage.toUpperCase()}`}
                </button>
                <button className="secondary-button" type="button" onClick={downloadSil} disabled={!(editorLanguage === "sil" ? silDraft : suiDraft)}>
                  Download .{editorLanguage}
                </button>
              </div>
              <button
                className="primary-button dark"
                type="button"
                onClick={validateSil}
                disabled={!(editorLanguage === "sil" ? silDraft : suiDraft).trim()}
                aria-keyshortcuts="Meta+Shift+Enter Control+Shift+Enter"
              >
                Validate & format {editorLanguage.toUpperCase()}
              </button>
            </div>
          </article>
        </section>

        <section className={`readiness-grid ${readiness.status}`} aria-label="Execution readiness" ref={readinessRef}>
          <article className="execution-gate-card">
            <div className="gate-heading">
              <div>
                <p className="eyebrow">Execution gate</p>
                <h2>{readiness.status === "blocked" ? "Do not execute" : readiness.status === "review" ? "Human review required" : "Ready for reviewed handoff"}</h2>
              </div>
              <span className={`gate-status ${readiness.status}`}>{readiness.status}</span>
            </div>
            <div className="readiness-score-line">
              <strong>{readiness.score}</strong><span>/100 readiness</span>
            </div>
            <p>{readiness.summary}</p>
            <div className="gate-counts">
              <span>{readiness.blockers} blockers</span>
              <span>{readiness.warnings} warnings</span>
              <span>0 task actions executed</span>
            </div>
          </article>

          <article className="gap-card">
            <div className="gap-card-heading">
              <div>
                <p className="eyebrow">Missing contract parameters</p>
                <h2>Resolve before Ollama → OpenCode</h2>
              </div>
              <span>{readiness.gaps.length} findings</span>
            </div>
            {readiness.gaps.length ? (
              <ul className="gap-list">
                {readiness.gaps.map((gap) => (
                  <li key={gap.code} className={gap.severity}>
                    <span>{gap.severity}</span>
                    <div>
                      <strong>{gap.field}: {gap.title}</strong>
                      <p>{gap.reason}</p>
                      <em>{gap.question}</em>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-diagnostics"><span aria-hidden="true">✓</span>No execution-contract gaps detected.</div>
            )}
          </article>
        </section>

        <section className={`results-drawer ${resultsOpen ? "open" : "collapsed"} mobile-${mobileWorkspace}`} aria-label="Conversion results" ref={resultsDrawerRef} style={{ "--results-height": `${resultsHeight}px` } as CSSProperties}>
          <div className="results-drawer-heading">
            <div>
              <p className="eyebrow">Review</p>
              <strong>Current conversion results</strong>
              <span>{artifactsAreStale ? "Source changed · results are reference only" : "Current artifacts available"}</span>
            </div>
            <div>
              <span className="results-height-label" aria-live="polite">Height: {resultsHeight}px</span>
              <button className="secondary-button" type="button" onClick={resetResultsHeight} disabled={resultsHeight === DEFAULT_RESULTS_HEIGHT} title={resultsHeight === DEFAULT_RESULTS_HEIGHT ? "Results are already at the default height." : `Reset to ${DEFAULT_RESULTS_HEIGHT} px`}>Reset height</button>
              <button className="secondary-button" type="button" onClick={() => setResultsOpen((current) => !current)}>{resultsOpen ? "Collapse" : "Expand"}</button>
            </div>
          </div>
          {resultsOpen ? <>
          <button className="results-drawer-handle" type="button" role="separator" aria-label="Resize conversion results" aria-orientation="horizontal" onPointerDown={beginResultsResize} onKeyDown={(event) => {
            if (event.key === "ArrowUp") { event.preventDefault(); setResultsHeight((current) => Math.min(Math.round(window.innerHeight * 0.6), current + 40)); }
            if (event.key === "ArrowDown") { event.preventDefault(); setResultsHeight((current) => Math.max(180, current - 40)); }
          }}><span /></button>
          <div className="result-grid">
          <article className="artifact-panel">
            <div className="result-heading">
              <div>
                <p className="eyebrow">Compiled artifacts</p>
                <h2>Portable outputs</h2>
              </div>
              <span className={`result-state ${artifactsAreStale ? "stale" : "current"}`}>
                {artifactsAreStale ? "Last validated result" : "Current"}
              </span>
            </div>
            {artifactsAreStale ? (
              <p className="stale-notice">
                The prompt or SIL draft changed. Convert or validate before treating these artifacts as current.
              </p>
            ) : null}
            <div className="artifact-toolbar">
              <div className="tabs" role="tablist" aria-label="Artifact format">
                {outputTabs.map((tab) => (
                  <button
                    id={`artifact-tab-${tab}`}
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab}
                    aria-controls={`artifact-panel-${tab}`}
                    tabIndex={activeTab === tab ? 0 : -1}
                    className={activeTab === tab ? "active" : ""}
                    onClick={() => setActiveTab(tab)}
                    onKeyDown={(event) => selectTabFromKeyboard(event, tab)}
                  >
                    {outputTabLabel(tab)}
                  </button>
                ))}
              </div>
              <div className="artifact-actions">
                <button className="dark-button" type="button" onClick={() => void copy(`artifact-${activeTab}`, outputText)}>
                  {copied === `artifact-${activeTab}` ? "Copied" : "Copy"}
                </button>
                <button className="dark-button" type="button" onClick={downloadArtifact}>Download</button>
              </div>
            </div>
            <div className="artifact-views">
              {outputTabs.map((tab) => (
                <pre
                  className={`artifact-code ${tab}`}
                  id={`artifact-panel-${tab}`}
                  key={tab}
                  role="tabpanel"
                  aria-labelledby={`artifact-tab-${tab}`}
                  tabIndex={0}
                  hidden={activeTab !== tab}
                ><code>{artifactText(lastGood, tab)}</code></pre>
              ))}
            </div>
            <div className="codebook-note">
              <span>Codebook</span>
              <strong>core-v{coreCodebook.version}</strong>
              <span>{coreCodebook.entries.length.toLocaleString()} registered meanings</span>
            </div>
          </article>

          <article className="evidence-panel">
            <div className="result-heading">
              <div>
                <p className="eyebrow">Conversion report</p>
                <h2>Why each meaning was selected</h2>
              </div>
              <span className={`result-state ${evidenceIsReference ? "stale" : "current"}`}>
                {evidenceIsReference ? "Reference only" : "Current"}
              </span>
            </div>
            <p className="report-intro">
              Deterministic rules record matched text, defaults, and derived fields in SIL order.
            </p>
            {conversionEvidence.length ? (
              <ol className="evidence-list">
                {conversionEvidence.map((item, index) => (
                  <li key={`${item.field}-${item.value}-${item.ruleId}-${index}`}>
                    <span className={`evidence-kind ${item.kind}`}>{item.kind}</span>
                    <div>
                      <p><code>{item.field}</code><strong>{item.value}</strong></p>
                      <p className="rule-line"><span>{item.ruleId}</span>
                        {item.matchedText ? <q>{item.matchedText}</q> : <em>No source phrase</em>}
                      </p>
                    </div>
                    {typeof item.start === "number" ? (
                      <span className="source-range">{item.start}–{item.end ?? item.start + (item.matchedText?.length ?? 0)}</span>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <div className="empty-report">
                <strong>No evidence emitted</strong>
                <p>Convert a prompt with the updated deterministic analyzer to populate this report.</p>
              </div>
            )}
          </article>
          </div>
          </> : null}
        </section>

        <section className="failure-panel" aria-labelledby="failure-title">
          <div className="failure-heading">
            <div>
              <p className="eyebrow">Static failure forecast</p>
              <h2 id="failure-title">Why this handoff is likely to fail</h2>
            </div>
            <span>No task execution performed</span>
          </div>
          {readiness.failures.length ? (
            <div className="failure-grid">
              {readiness.failures.map((failure) => (
                <article key={failure.code} className={failure.severity}>
                  <div><span>{failure.severity}</span><code>{failure.code}</code></div>
                  <h3>{failure.title}</h3>
                  <p><strong>Cause</strong>{failure.why}</p>
                  <p><strong>Likely result</strong>{failure.likelyOutcome}</p>
                  <p><strong>Prevent with</strong>{failure.preventedBy.join(" · ")}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-diagnostics"><span aria-hidden="true">✓</span>No missing-parameter failure mode was inferred.</div>
          )}
        </section>

        <section className="quality-grid" aria-label="Validation quality">
          <article className="confidence-card">
            <div className="confidence-label">
              <div>
                <p className="eyebrow">Source coverage</p>
                <h2>Conversion confidence</h2>
              </div>
              <strong>{Math.round(lastGood.confidence * 100)}%</strong>
            </div>
            <div
              className="confidence-track"
              role="progressbar"
              aria-label="Conversion confidence"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(lastGood.confidence * 100)}
            >
              <span style={{ width: `${lastGood.confidence * 100}%` }} />
            </div>
            <p>How strongly source phrases support the selected meanings. This is separate from execution readiness.</p>
          </article>

          <article className="diagnostics-card">
            <div className="diagnostics-title">
              <div>
                <p className="eyebrow">Validator</p>
                <h2>Diagnostics</h2>
              </div>
              <div className="diagnostic-counts">
                <span className="error-count">{errors} errors</span>
                <span>{warnings} warnings</span>
                <button className="quiet-button" type="button" onClick={() => setDiagnosticsOpen((current) => !current)} aria-expanded={diagnosticsOpen}>
                  {diagnosticsOpen ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            {diagnosticsOpen && diagnostics.length ? (
              <ul>
                {diagnostics.map((item, index) => (
                  <li key={diagnosticKey(item, index)} className={item.severity}>
                    <span aria-hidden="true">{item.severity === "error" ? "×" : "!"}</span>
                    <p>{item.message}</p>
                    {item.line ? <code>{item.line}:{item.column}</code> : null}
                  </li>
                ))}
              </ul>
            ) : diagnosticsOpen ? (
              <div className="empty-diagnostics"><span aria-hidden="true">✓</span>No semantic conflicts detected.</div>
            ) : <p className="diagnostics-collapsed-note">Open diagnostics to inspect validator details.</p>}
          </article>
        </section>
      </div>

      <footer>
        <span>SIL conversion, readiness analysis, and failure forecasting run entirely in this browser tab.</span>
        <span>No persistence · no task tools · no prompt execution</span>
      </footer>
    </main>
  );
}
