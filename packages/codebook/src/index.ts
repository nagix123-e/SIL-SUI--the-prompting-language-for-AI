import {
  codebookSchema,
  type Codebook,
  type CodebookEntry,
} from "../../semantic-ir/src/index";

const entries: CodebookEntry[] = [
  ["goal.feature.add", "goal", "feature.add", "G12", "Add a product feature", ["add_feature"]],
  ["goal.content.summarize", "goal", "content.summarize", "G01", "Summarize content", ["summarize"]],
  ["goal.content.classify", "goal", "content.classify", "G02", "Classify content", ["classify"]],
  ["goal.bug.fix", "goal", "bug.fix", "G13", "Fix a defect", ["fix_bug"]],
  ["action.implement", "action", "implement", "A01", "Implement the requested change", ["build", "create"]],
  ["action.modify", "action", "modify", "A02", "Modify an existing artifact", ["update", "edit"]],
  ["action.delete", "action", "delete", "A03", "Delete an artifact", ["remove"]],
  ["target.screen.login", "target", "screen.login", "T044", "Login screen", ["login_screen"]],
  ["target.user.authentication", "target", "user.authentication", "T045", "User authentication", ["auth"]],
  ["target.product.search", "target", "product.search", "T204", "Product search", ["search"]],
  ["target.api.endpoint", "target", "api.endpoint", "T120", "API endpoint", ["api"]],
  ["target.documentation", "target", "project.documentation", "T310", "Project documentation", ["docs"]],
  ["input.user.query", "input", "user.query", "I18", "User search query", ["query"]],
  ["input.user.email", "input", "user.email", "I19", "User email address", ["email"]],
  ["input.user.password", "input", "user.password", "I20", "User password", ["password"]],
  ["output.product.list", "output", "product.list", "O31", "List of products", ["results"]],
  ["output.auth.session", "output", "auth.session", "O32", "Authenticated session", ["session"]],
  ["require.response.fast", "require", "response.fast", "R07", "Keep response latency low", ["fast_response"]],
  ["require.existing.behavior.preserve", "require", "existing.behavior.preserve", "R08", "Preserve existing behavior", ["preserve_behavior"]],
  ["require.password.hash", "require", "password.hash", "R09", "Hash passwords securely", ["hash_password"]],
  ["require.input.validate", "require", "input.validate", "R10", "Validate all input", ["validate_input"]],
  ["require.error.safe", "require", "error.safe", "R11", "Return safe errors", ["safe_error"]],
  ["require.ui.responsive", "require", "ui.responsive", "R12", "Support responsive layouts", ["responsive_ui"]],
  ["prefer.code.simple", "prefer", "code.simple", "P01", "Prefer a simple implementation", ["simple"]],
  ["forbid.secret.expose", "forbid", "secret.expose", "X01", "Do not expose secrets", ["no_secret_exposure"]],
  ["forbid.change.breaking", "forbid", "change.breaking", "X02", "Do not introduce breaking changes", ["no_breaking_change"]],
  ["forbid.secret.hardcode", "forbid", "secret.hardcode", "X03", "Do not hardcode secrets", ["no_hardcoded_secret"]],
  ["forbid.password.plaintext_store", "forbid", "password.plaintext_store", "X04", "Do not store plaintext passwords", ["no_plaintext_password"]],
  ["verify.login.success", "verify", "login.success", "V01", "Verify successful login", ["login_works"]],
  ["verify.invalid_credentials.reject", "verify", "invalid_credentials.reject", "V02", "Reject invalid credentials", ["reject_invalid_credentials"]],
  ["verify.tests.pass", "verify", "tests.pass", "V03", "Verify the test suite passes", ["test"]],
  ["on_failure.transaction.rollback", "on_failure", "transaction.rollback", "F01", "Roll back the transaction", ["rollback"]],
].map(([id, namespace, key, code, description, aliases]) => ({
  id: id as string,
  namespace: namespace as string,
  key: key as string,
  code: code as string,
  description: description as string,
  aliases: aliases as string[],
  version: "0.1",
  status: "active" as const,
}));

export const coreCodebook: Codebook = { version: "0.1", entries };

export function loadCodebook(input: unknown): Codebook {
  const result = codebookSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Invalid codebook: ${result.error.issues.map((issue) => issue.message).join(", ")}`);
  }
  const codes = new Set<string>();
  const keys = new Set<string>();
  for (const entry of result.data.entries) {
    const key = `${entry.namespace}:${entry.key}`;
    if (codes.has(entry.code)) throw new Error(`Duplicate codebook code: ${entry.code}`);
    if (keys.has(key)) throw new Error(`Duplicate codebook key: ${key}`);
    codes.add(entry.code);
    keys.add(key);
  }
  return result.data;
}

export function findEntry(
  codebook: Codebook,
  namespace: string,
  reference: string,
): CodebookEntry | undefined {
  return codebook.entries.find(
    (entry) =>
      entry.namespace === namespace &&
      entry.status === "active" &&
      (entry.key === reference || entry.aliases.includes(reference)),
  );
}

export function findEntryByCode(codebook: Codebook, code: string): CodebookEntry | undefined {
  return codebook.entries.find((entry) => entry.code === code && entry.status === "active");
}
