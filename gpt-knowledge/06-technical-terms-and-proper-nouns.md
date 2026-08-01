# Technical Terms and Proper-Noun Preservation

## Purpose

Technical names and proper nouns carry task identity. Never drop them merely because they are not a goal, target, or action. Preserve them as `input` context so a downstream model can reconstruct the intended environment.

## Curated technical catalog

Core v0.1 contains 100 curated AI and development terms. Each term has:

- a canonical display label;
- optional aliases;
- a family such as model, AI concept, language, framework, tool, platform, data, or protocol;
- a lossless context reference;
- a registered `technology.*` target;
- a registered input context reference;
- a prompt color category.

The paired target codes are `T90000` through `T90099`. The paired input-context codes are `I90000` through `I90099`. Use `core-v0.1.json` to verify the exact term-to-code mapping.

## Catalog coverage

The current catalog covers:

- SIL and runtimes: SIL, Ollama, OpenCode;
- model families and model versions: Qwen, Qwen3.6, GPT, ChatGPT, Claude, Gemini, Llama, Mistral, DeepSeek, Grok, Phi, Gemma, Command R, Mixtral, BERT, T5, Stable Diffusion, DALL-E, Whisper, CLIP;
- AI concepts: LLM, VLM, AI, machine learning, deep learning, NLP, computer vision, RAG, embedding, transformer, fine-tuning, quantization, inference, local inference, prompt engineering, system prompt, prompt template, context window, tokenization, tool calling, function calling, AI agent, multi-agent system;
- protocols: MCP, REST, GraphQL;
- languages and markup: TypeScript, JavaScript, Python, Rust, Go, Java, Kotlin, Swift, Dart, C#, C++, SQL, HTML, CSS, Bash;
- frameworks and runtimes: React, Next.js, Vue, Svelte, Angular, Node.js, Vite, Bun, Deno, FastAPI, Django, Flask, Spring Boot, Flutter, LangChain;
- development tools and platforms: Docker, Kubernetes, Git, GitHub, GitLab, VS Code, CI/CD, Linux, macOS, AWS, Azure, Google Cloud;
- data systems and formats: PostgreSQL, MySQL, SQLite, Redis, MongoDB, JSON, YAML, Markdown, vector database.

## Context mappings

Representative mappings:

```text
SIL        -> language.sil
Ollama     -> platform.ollama
OpenCode   -> tool.opencode
Qwen       -> model.qwen
Qwen3.6    -> model.qwen3_6
TypeScript -> language.typescript
React      -> framework.react
GitHub     -> platform.github
JSON       -> data.json
MCP        -> protocol.mcp
```

Preserve an explicit model version. Do not reduce `Qwen3.6` to `model.qwen`.

## Explicit target behavior

When a curated term appears in an explicit `Target:` section, use the registered `technology.*` target and retain the context input.

Input:

```text
Goal: Configure local inference.
Target: Ollama
Action: Update.
```

Relevant SIL:

```sil
target: technology.ollama
input: platform.ollama
```

Do not automatically make every mentioned technology the target. A phrase such as `create a guide for SIL on Ollama` has `project.documentation` as the target and SIL/Ollama as inputs.

## Known-term matching

- Match labels and aliases case-insensitively except ambiguous alphabetic forms of three characters or fewer.
- Short forms such as `AI`, `ML`, `Go`, `JS`, and `TS` require exact case.
- Use the longest non-overlapping match. This preserves `Qwen3.6` as one term.
- If the matched alias contains digits, preserve the matched version in the SemanticRef.
- Deduplicate repeated references while retaining first source order.

## Unknown proper nouns

Preserve an unknown name as `context.<normalized_name>` when it is detected as:

- an all-uppercase acronym of at least two characters;
- a mixed-case brand or identifier such as `AcmeCloud` or `NovaSDK`;
- a capitalized versioned name such as `Model4` or `Model4.2`;
- a TitleCase token after `on`, `using`, `with`, `via`, `for`, `in`, or `from`.

Normalization lowercases the name, replaces non-alphanumeric runs with `_`, trims `_`, and limits the slug length.

```text
AcmeCloud -> context.acmecloud
NovaSDK   -> context.novasdk
```

Structural labels and selected common terms such as `Goal`, `Target`, `Verification`, and `API` are excluded from generic proper-noun detection.

## Writer policy

- Preserve every explicitly named product, model, version, library, platform, organization-specific identifier, attachment, or file.
- Prefer a registered context mapping when exact.
- Use a precise `context.*` extension when no curated mapping exists.
- Never invent a vendor, version, supported-language list, API, or repository path.
- Never claim that a generated `context.*` extension is registered unless the codebook confirms it.
