"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  compileNaturalLanguage,
  compileSil,
  coreCodebook,
  diagnosticFromError,
  type CompilationResult,
  type Diagnostic,
} from "@/packages/compiler/src/index";

const sampleSource =
  "既存の動作を壊さず、ログイン画面を追加してください。メールとパスワードを検証し、秘密情報をハードコードしないでください。テストも追加してください。";

const samples = [
  {
    label: "Login flow",
    value: sampleSource,
  },
  {
    label: "Product search",
    value:
      "Build a fast product search using a user query. Return a product list, validate input, do not expose secrets, and verify with tests.",
  },
  {
    label: "API update",
    value:
      "Update the API endpoint without breaking existing behavior. Validate all input, keep errors safe, and do not hardcode secrets.",
  },
];

type OutputTab = "ir" | "code" | "prompt";

function tryCompileNatural(source: string): { result: CompilationResult | null; error: Diagnostic | null } {
  try {
    return { result: compileNaturalLanguage(source), error: null };
  } catch (error) {
    return { result: null, error: diagnosticFromError(error) };
  }
}

function tryCompileDsl(source: string): { result: CompilationResult | null; error: Diagnostic | null } {
  try {
    return { result: compileSil(source), error: null };
  } catch (error) {
    return { result: null, error: diagnosticFromError(error) };
  }
}

export default function Home() {
  const initial = useMemo(() => compileNaturalLanguage(sampleSource), []);
  const [source, setSource] = useState(sampleSource);
  const [dsl, setDsl] = useState(initial.dsl);
  const [result, setResult] = useState(initial);
  const [transientError, setTransientError] = useState<Diagnostic | null>(null);
  const [activeTab, setActiveTab] = useState<OutputTab>("ir");
  const [copied, setCopied] = useState<string | null>(null);

  const compileSource = useCallback(() => {
    const next = tryCompileNatural(source);
    if (!next.result) {
      setTransientError(next.error);
      return;
    }
    setResult(next.result);
    setDsl(next.result.dsl);
    setTransientError(null);
  }, [source]);

  const validateDsl = useCallback(() => {
    const next = tryCompileDsl(dsl);
    if (!next.result) {
      setTransientError(next.error);
      return;
    }
    setResult(next.result);
    setDsl(next.result.dsl);
    setTransientError(null);
  }, [dsl]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key !== "Enter") return;
      event.preventDefault();
      if (event.shiftKey) validateDsl();
      else compileSource();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [compileSource, validateDsl]);

  const diagnostics = transientError ? [transientError] : result.diagnostics;
  const errors = diagnostics.filter((item) => item.severity === "error").length;
  const warnings = diagnostics.filter((item) => item.severity === "warning").length;

  const outputText =
    activeTab === "ir"
      ? JSON.stringify(result.ir, null, 2)
      : activeTab === "code"
        ? result.quantizedCode
        : result.prompt;

  const copy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1400);
  };

  const loadSample = (value: string) => {
    const next = compileNaturalLanguage(value);
    setSource(value);
    setDsl(next.dsl);
    setResult(next);
    setTransientError(null);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-group">
          <div className="brand-mark" aria-hidden="true">
            <span>S</span>
          </div>
          <div>
            <div className="brand-line">
              <strong>Semantic Instruction Language</strong>
              <span className="version-pill">v0.1</span>
            </div>
            <p>Compile intent, not phrasing.</p>
          </div>
        </div>
        <div className="header-meta">
          <span className="privacy-status"><i aria-hidden="true" /> Local · nothing saved</span>
          <span className="shortcut-hint">⌘ Enter to compile</span>
        </div>
      </header>

      <section className="workspace-intro" aria-labelledby="workspace-title">
        <div>
          <p className="eyebrow">Semantic compiler workspace</p>
          <h1 id="workspace-title">Turn instructions into durable meaning.</h1>
          <p className="intro-copy">
            Normalize human language into a readable DSL, model-independent IR, and compact semantic code.
          </p>
        </div>
        <div className="sample-picker">
          <span>Load example</span>
          <div className="sample-buttons">
            {samples.map((sample) => (
              <button key={sample.label} type="button" onClick={() => loadSample(sample.value)}>
                {sample.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="compiler-grid" aria-label="SIL compiler workspace">
        <article className="editor-panel source-panel">
          <div className="panel-heading">
            <div>
              <span className="step-number">01</span>
              <div>
                <h2>Source instruction</h2>
                <p>Japanese or English</p>
              </div>
            </div>
            <button className="text-button" type="button" onClick={() => setSource("")}>Clear</button>
          </div>
          <textarea
            aria-label="Natural language source"
            className="source-editor"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            spellCheck="false"
            maxLength={100000}
          />
          <div className="panel-footer">
            <span>{source.length.toLocaleString()} chars</span>
            <button className="primary-button" type="button" onClick={compileSource} disabled={!source.trim()}>
              Compile instruction <span aria-hidden="true">→</span>
            </button>
          </div>
        </article>

        <article className="editor-panel dsl-panel">
          <div className="panel-heading">
            <div>
              <span className="step-number accent">02</span>
              <div>
                <h2>Human DSL</h2>
                <p>Editable canonical structure</p>
              </div>
            </div>
            <span className={errors ? "validation-state invalid" : "validation-state"}>
              <i aria-hidden="true" /> {errors ? `${errors} error${errors > 1 ? "s" : ""}` : "Syntax valid"}
            </span>
          </div>
          <textarea
            aria-label="SIL source editor"
            className="code-editor"
            value={dsl}
            onChange={(event) => setDsl(event.target.value)}
            spellCheck="false"
            maxLength={100000}
          />
          <div className="panel-footer">
            <button className="secondary-button" type="button" onClick={() => copy("dsl", dsl)}>
              {copied === "dsl" ? "Copied" : "Copy DSL"}
            </button>
            <button className="primary-button dark" type="button" onClick={validateDsl}>
              Validate & format
            </button>
          </div>
        </article>

        <article className="editor-panel output-panel">
          <div className="panel-heading output-heading">
            <div>
              <span className="step-number ink">03</span>
              <div>
                <h2>Compiled output</h2>
                <p>IR is the source of truth</p>
              </div>
            </div>
            <button className="copy-icon" type="button" onClick={() => copy(activeTab, outputText)} aria-label={`Copy ${activeTab}`}>
              {copied === activeTab ? "Done" : "Copy"}
            </button>
          </div>
          <div className="tabs" role="tablist" aria-label="Output format">
            {(["ir", "code", "prompt"] as OutputTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                className={activeTab === tab ? "active" : ""}
                onClick={() => setActiveTab(tab)}
              >
                {tab === "ir" ? "JSON IR" : tab === "code" ? "Semantic code" : "Prompt"}
              </button>
            ))}
          </div>
          <pre className={`output-code ${activeTab}`}><code>{outputText}</code></pre>
          <div className="codebook-note">
            <span>Codebook</span>
            <strong>core-v{coreCodebook.version}</strong>
            <span>{coreCodebook.entries.length} atoms</span>
          </div>
        </article>
      </section>

      <section className="quality-strip" aria-label="Compilation quality">
        <div className="confidence-card">
          <div className="confidence-label">
            <span>Semantic confidence</span>
            <strong>{Math.round(result.confidence * 100)}%</strong>
          </div>
          <div className="confidence-track" aria-hidden="true">
            <span style={{ width: `${result.confidence * 100}%` }} />
          </div>
          <p>Rule-based estimate · review unknown atoms before production use.</p>
        </div>
        <div className="diagnostics-card">
          <div className="diagnostics-title">
            <h2>Diagnostics</h2>
            <div>
              <span className="error-count">{errors} errors</span>
              <span>{warnings} warnings</span>
            </div>
          </div>
          {diagnostics.length ? (
            <ul>
              {diagnostics.slice(0, 4).map((item, index) => (
                <li key={`${item.code}-${index}`} className={item.severity}>
                  <span>{item.severity === "error" ? "×" : "!"}</span>
                  <p>{item.message}</p>
                  {item.line ? <code>{item.line}:{item.column}</code> : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-diagnostics"><span>✓</span> No semantic conflicts detected.</div>
          )}
        </div>
      </section>

      <footer>
        <span>SIL compiles through Semantic IR. It never executes DSL content.</span>
        <span>Lossless mode preserves unknown required and forbidden rules.</span>
      </footer>
    </main>
  );
}
