# SIL/SUI Writer GPT Knowledge Set v0.5

Build date: 2026-08-03

Use `SYSTEM-INSTRUCTIONS.txt` as the GPT Instructions. Upload the Markdown files in `knowledge/` as Knowledge. Upload `data/core-v0.1.json` when the GPT must verify exact registered SIL SemanticRefs or quantized codes.

The set accepts multilingual natural-language input, including Japanese, and normalizes semantic meaning to English identifiers through a configured safe adapter. It retains source-language/provenance metadata. SIL and SUI are declarative data and never authorize task execution. Structural validity, readiness, a declared `execution_authorized` field, and actual host authorization remain separate.

Start with `knowledge/00-knowledge-set-index.md`.
