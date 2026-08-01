export type TechnicalTermFamily =
  | "sil"
  | "ai_model"
  | "ai_concept"
  | "language"
  | "framework"
  | "tool"
  | "platform"
  | "data"
  | "protocol";

export interface TechnicalTerm {
  id: string;
  label: string;
  aliases: readonly string[];
  family: TechnicalTermFamily;
  contextReference: string;
  description: string;
  blockKind: "noun" | "data";
}

function term(
  id: string,
  label: string,
  family: TechnicalTermFamily,
  description: string,
  aliases: readonly string[] = [],
  blockKind: "noun" | "data" = "noun",
): TechnicalTerm {
  const prefix: Record<TechnicalTermFamily, string> = {
    sil: "language",
    ai_model: "model",
    ai_concept: "ai",
    language: "language",
    framework: "framework",
    tool: "tool",
    platform: "platform",
    data: "data",
    protocol: "protocol",
  };
  return {
    id,
    label,
    aliases,
    family,
    contextReference: `${prefix[family]}.${id}`,
    description,
    blockKind,
  };
}

/**
 * Curated names that generic concept/variant expansion cannot represent safely.
 * Labels and aliases are display/matching forms; ids and context references remain
 * portable SIL semantic references.
 */
export const TECHNICAL_TERMS: readonly TechnicalTerm[] = [
  term("sil", "SIL", "sil", "Semantic Instruction Language", ["Semantic Instruction Language"]),
  term("ollama", "Ollama", "platform", "Local model runtime and API platform"),
  term("opencode", "OpenCode", "tool", "AI-assisted software development tool", ["Open Code"]),
  term("qwen", "Qwen", "ai_model", "Qwen family of language models", ["Qwen3", "Qwen3.5"]),
  term("qwen3_6", "Qwen3.6", "ai_model", "Qwen 3.6 language model"),
  term("gpt", "GPT", "ai_model", "Generative Pre-trained Transformer model family", ["GPT-4", "GPT-5"]),
  term("chatgpt", "ChatGPT", "ai_model", "Conversational AI application and model interface"),
  term("claude", "Claude", "ai_model", "Claude language model family"),
  term("gemini", "Gemini", "ai_model", "Gemini multimodal model family"),
  term("llama", "Llama", "ai_model", "Llama open model family", ["Llama 3", "Llama3"]),
  term("mistral", "Mistral", "ai_model", "Mistral language model family"),
  term("deepseek", "DeepSeek", "ai_model", "DeepSeek language model family", ["DeepSeek-R1", "DeepSeek V3"]),
  term("grok", "Grok", "ai_model", "Grok language model family"),
  term("phi", "Phi", "ai_model", "Phi small language model family", ["Phi-3", "Phi-4"]),
  term("gemma", "Gemma", "ai_model", "Gemma open model family"),
  term("command_r", "Command R", "ai_model", "Command R language model family", ["Command-R"]),
  term("mixtral", "Mixtral", "ai_model", "Mixture-of-experts language model family"),
  term("bert", "BERT", "ai_model", "Bidirectional encoder model family"),
  term("t5", "T5", "ai_model", "Text-to-text transformer model family"),
  term("stable_diffusion", "Stable Diffusion", "ai_model", "Latent diffusion image model family"),
  term("dall_e", "DALL-E", "ai_model", "Text-to-image model family", ["DALL·E", "DALL E"]),
  term("whisper", "Whisper", "ai_model", "Speech recognition model family"),
  term("clip", "CLIP", "ai_model", "Contrastive language-image model"),
  term("llm", "LLM", "ai_concept", "Large language model", ["large language model"]),
  term("vlm", "VLM", "ai_concept", "Vision-language model", ["vision language model"]),
  term("artificial_intelligence", "AI", "ai_concept", "Artificial intelligence", ["artificial intelligence"]),
  term("machine_learning", "machine learning", "ai_concept", "Machine-learning systems and workflows", ["ML"]),
  term("deep_learning", "deep learning", "ai_concept", "Neural-network-based machine learning"),
  term("natural_language_processing", "NLP", "ai_concept", "Natural language processing", ["natural language processing"]),
  term("computer_vision", "computer vision", "ai_concept", "Visual recognition and generation systems", ["CV"]),
  term("rag", "RAG", "ai_concept", "Retrieval-augmented generation", ["retrieval augmented generation"]),
  term("embedding", "embedding", "ai_concept", "Learned vector representation", ["embeddings"], "data"),
  term("transformer", "transformer", "ai_concept", "Attention-based neural network architecture", ["transformers"]),
  term("fine_tuning", "fine-tuning", "ai_concept", "Model adaptation using additional training", ["fine tuning", "finetuning"]),
  term("quantization", "quantization", "ai_concept", "Reduced-precision model representation", ["quantize", "quantized"]),
  term("inference", "inference", "ai_concept", "Model prediction process"),
  term("local_inference", "local inference", "ai_concept", "On-device or self-hosted model inference"),
  term("prompt_engineering", "prompt engineering", "ai_concept", "Systematic prompt design and evaluation"),
  term("system_prompt", "system prompt", "ai_concept", "Highest-level model instruction context", [], "data"),
  term("prompt_template", "prompt template", "ai_concept", "Reusable structured prompt artifact", [], "data"),
  term("context_window", "context window", "ai_concept", "Model input token capacity", [], "data"),
  term("tokenization", "tokenization", "ai_concept", "Conversion between text and model tokens", ["tokenizer"]),
  term("tool_calling", "tool calling", "ai_concept", "Model invocation of external tools", ["tool use"]),
  term("function_calling", "function calling", "ai_concept", "Structured model function invocation"),
  term("ai_agent", "AI agent", "ai_concept", "Agentic AI system", ["agentic AI"]),
  term("multi_agent_system", "multi-agent system", "ai_concept", "Cooperating AI agent architecture", ["multi agent system"]),
  term("mcp", "MCP", "protocol", "Model Context Protocol", ["Model Context Protocol"]),
  term("typescript", "TypeScript", "language", "Typed JavaScript programming language", ["TS"]),
  term("javascript", "JavaScript", "language", "JavaScript programming language", ["JS"]),
  term("python", "Python", "language", "Python programming language"),
  term("rust", "Rust", "language", "Rust programming language"),
  term("go", "Go", "language", "Go programming language", ["Golang"]),
  term("java", "Java", "language", "Java programming language"),
  term("kotlin", "Kotlin", "language", "Kotlin programming language"),
  term("swift", "Swift", "language", "Swift programming language"),
  term("dart", "Dart", "language", "Dart programming language"),
  term("c_sharp", "C#", "language", "C sharp programming language", ["C Sharp"]),
  term("cpp", "C++", "language", "C plus plus programming language", ["C Plus Plus"]),
  term("sql", "SQL", "language", "Structured Query Language"),
  term("html", "HTML", "language", "HyperText Markup Language"),
  term("css", "CSS", "language", "Cascading Style Sheets"),
  term("bash", "Bash", "language", "Bourne Again Shell language"),
  term("react", "React", "framework", "Component-based web user-interface library", ["React.js", "ReactJS"]),
  term("nextjs", "Next.js", "framework", "React application framework", ["NextJS", "Next JS"]),
  term("vue", "Vue", "framework", "Progressive web user-interface framework", ["Vue.js", "VueJS"]),
  term("svelte", "Svelte", "framework", "Compiled web user-interface framework"),
  term("angular", "Angular", "framework", "Web application framework"),
  term("nodejs", "Node.js", "platform", "JavaScript server runtime", ["NodeJS", "Node JS"]),
  term("vite", "Vite", "tool", "Frontend build tool and development server"),
  term("bun", "Bun", "platform", "JavaScript runtime and toolkit"),
  term("deno", "Deno", "platform", "Secure JavaScript and TypeScript runtime"),
  term("fastapi", "FastAPI", "framework", "Python web API framework"),
  term("django", "Django", "framework", "Python web application framework"),
  term("flask", "Flask", "framework", "Python web application framework"),
  term("spring_boot", "Spring Boot", "framework", "Java application framework", ["SpringBoot"]),
  term("flutter", "Flutter", "framework", "Cross-platform application framework"),
  term("langchain", "LangChain", "framework", "Framework for language-model applications", ["Lang Chain"]),
  term("docker", "Docker", "tool", "Application container platform"),
  term("kubernetes", "Kubernetes", "platform", "Container orchestration platform", ["K8s"]),
  term("git", "Git", "tool", "Distributed version-control system"),
  term("github", "GitHub", "platform", "Git hosting and development platform"),
  term("gitlab", "GitLab", "platform", "Git hosting and DevOps platform"),
  term("vscode", "VS Code", "tool", "Visual Studio Code editor", ["VSCode", "Visual Studio Code"]),
  term("cicd", "CI/CD", "tool", "Continuous integration and delivery workflow", ["CI CD", "continuous integration"]),
  term("linux", "Linux", "platform", "Linux operating-system platform"),
  term("macos", "macOS", "platform", "Apple desktop operating-system platform", ["Mac OS"]),
  term("aws", "AWS", "platform", "Amazon Web Services cloud platform", ["Amazon Web Services"]),
  term("azure", "Azure", "platform", "Microsoft Azure cloud platform"),
  term("google_cloud", "Google Cloud", "platform", "Google Cloud Platform", ["GCP"]),
  term("postgresql", "PostgreSQL", "data", "Relational database system", ["Postgres"], "data"),
  term("mysql", "MySQL", "data", "Relational database system", [], "data"),
  term("sqlite", "SQLite", "data", "Embedded relational database system", [], "data"),
  term("redis", "Redis", "data", "In-memory data store", [], "data"),
  term("mongodb", "MongoDB", "data", "Document database system", ["Mongo DB"], "data"),
  term("rest", "REST", "protocol", "Representational State Transfer API style", ["REST API"]),
  term("graphql", "GraphQL", "protocol", "Graph query and API language"),
  term("json", "JSON", "data", "JavaScript Object Notation data format", [], "data"),
  term("yaml", "YAML", "data", "Human-readable data serialization format", ["YML"], "data"),
  term("markdown", "Markdown", "data", "Plain-text markup format", ["MD"], "data"),
  term("vector_database", "vector database", "data", "Database for vector similarity search", ["vector DB"], "data"),
] as const;
