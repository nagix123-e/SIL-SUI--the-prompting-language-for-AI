import { TECHNICAL_TERMS, coreCodebook, type TechnicalTerm } from "../../codebook/src/index";
import {
  MAX_SOURCE_LENGTH,
  type Codebook,
  type CodebookEntry,
  type SemanticIR,
  type StatementKind,
  emptyIr,
} from "../../semantic-ir/src/index";
import { parsePromptSections, type PromptSection } from "./prompt-structure";

export type ConversionEvidenceKind = "matched" | "default" | "derived";

export interface ConversionEvidence {
  field: "task" | StatementKind;
  value: string;
  kind: ConversionEvidenceKind;
  ruleId: string;
  matchedText?: string;
  start?: number;
  end?: number;
}

export interface NaturalLanguageAnalysis {
  ir: SemanticIR;
  evidence: ConversionEvidence[];
}

export class UnsupportedLanguageError extends Error {
  override name = "UnsupportedLanguageError";
}

interface Token {
  raw: string;
  normalized: string;
  concept: string;
  start: number;
  end: number;
  clause: number;
}

interface Candidate {
  namespace: StatementKind;
  value: string;
  score: number;
  start: number;
  end: number;
  ruleId: string;
  kind?: ConversionEvidenceKind;
}

interface LexicalPart {
  normalized: string;
  role: "concept" | "variant";
}

interface PhraseRule {
  namespace: StatementKind;
  value: string;
  ruleId: string;
  score: number;
  patterns: readonly RegExp[];
  allowNegated?: boolean;
  kind?: ConversionEvidenceKind;
}

interface ParameterRule {
  namespace: StatementKind;
  ruleId: string;
  pattern: RegExp;
  value: (match: RegExpExecArray) => string;
}

const SINGLETON_NAMESPACES = new Set<StatementKind>(["goal", "target", "action"]);
const FIELD_ORDER: StatementKind[] = [
  "goal",
  "target",
  "action",
  "input",
  "output",
  "require",
  "prefer",
  "forbid",
  "verify",
  "on_failure",
];

const IR_ARRAY_FIELD: Record<Exclude<StatementKind, "goal" | "target" | "action">, keyof SemanticIR> = {
  input: "inputs",
  output: "outputs",
  require: "required",
  prefer: "preferred",
  forbid: "forbidden",
  verify: "verification",
  on_failure: "failureHandling",
};

const WORD_CANONICAL: Record<string, string> = {
  adds: "create",
  added: "create",
  adding: "create",
  add: "create",
  builds: "create",
  built: "create",
  building: "create",
  build: "create",
  creates: "create",
  created: "create",
  creating: "create",
  implements: "create",
  implemented: "create",
  implementing: "create",
  implementation: "create",
  implement: "create",
  changes: "update",
  changed: "update",
  changing: "update",
  change: "update",
  modifies: "update",
  modified: "update",
  modifying: "update",
  modify: "update",
  edits: "update",
  edited: "update",
  editing: "update",
  edit: "update",
  updates: "update",
  updated: "update",
  updating: "update",
  removes: "delete",
  removed: "delete",
  removing: "delete",
  remove: "delete",
  deletes: "delete",
  deleted: "delete",
  deleting: "delete",
  analyzes: "analyze",
  analysed: "analyze",
  analyzed: "analyze",
  analyzing: "analyze",
  analysis: "analyze",
  optimizes: "optimize",
  optimized: "optimize",
  optimizing: "optimize",
  optimization: "optimize",
  secures: "secure",
  secured: "secure",
  securing: "secure",
  migrates: "migrate",
  migrated: "migrate",
  migrating: "migrate",
  migration: "migration",
  automates: "automate",
  automated: "automate",
  automating: "automate",
  automation: "automation",
  monitors: "monitor",
  monitored: "monitor",
  monitoring: "monitor",
  documents: "document",
  documented: "document",
  documenting: "document",
  documentation: "documentation",
  docs: "documentation",
  validates: "validate",
  validated: "validate",
  validating: "validate",
  validation: "validation",
  transforms: "transform",
  transformed: "transform",
  transforming: "transform",
  synchronizes: "synchronize",
  synchronized: "synchronize",
  synchronizing: "synchronize",
  synchronization: "synchronization",
  sync: "synchronize",
  publishes: "publish",
  published: "publish",
  publishing: "publish",
  archives: "archive",
  archived: "archive",
  archiving: "archive",
  restores: "restore",
  restored: "restore",
  restoring: "restore",
  encrypted: "encrypt",
  encrypts: "encrypt",
  encryption: "encrypt",
  encrypting: "encrypt",
  authorized: "authorize",
  authorizes: "authorize",
  authorization: "authorization",
  authorizing: "authorize",
  authenticated: "authentication",
  authenticates: "authentication",
  authenticating: "authentication",
  auth: "authentication",
  observable: "observe",
  observability: "observe",
  accessible: "access",
  accessibility: "accessibility",
  scalable: "scale",
  scalability: "scale",
  consistent: "consistency",
  idempotent: "idempotency",
  efficient: "efficiency",
  readable: "readability",
  reusable: "reuse",
  maintainable: "maintainability",
  testable: "testability",
  exposure: "expose",
  exposed: "expose",
  corruption: "corrupt",
  corrupted: "corrupt",
  duplication: "duplicate",
  duplicated: "duplicate",
  leakage: "leak",
  leaked: "leak",
  downgrade: "downgrade",
  downgraded: "downgrade",
  bypassed: "bypass",
  timeouts: "timeout",
  deadlocks: "deadlock",
  regressions: "regression",
  accepted: "accept",
  rejected: "reject",
  persisted: "persist",
  emitted: "emit",
  recovered: "recover",
  rendered: "render",
  retries: "retry",
  retried: "retry",
  retrying: "retry",
  aborted: "abort",
  aborting: "abort",
  compensated: "compensate",
  compensating: "compensate",
  notified: "notify",
  notifying: "notify",
  quarantined: "quarantine",
  escalating: "escalate",
  escalated: "escalate",
  logging: "log",
  logged: "log",
  errors: "error",
  results: "result",
  records: "record",
  lists: "list",
  reports: "report",
  statuses: "status",
  events: "event",
  artifacts: "artifact",
  responses: "response",
  requests: "request",
  payloads: "payload",
  queries: "query",
  filters: "filter",
  options: "option",
  credentials: "credential",
  files: "file",
  services: "service",
  interfaces: "interface",
  workflows: "workflow",
  pipelines: "pipeline",
  policies: "policy",
  configurations: "configuration",
  endpoints: "endpoint",
  accounts: "account",
  profiles: "profile",
  sessions: "session",
  products: "product",
  secrets: "secret",
  passwords: "password",
  tests: "test",
  patches: "patch",
  categories: "category",
  cursors: "cursor",
  latencies: "latency",
  milliseconds: "ms",
  millisecond: "ms",
  seconds: "second",
  dependencies: "dependency",
  diagnostics: "diagnostic",
  budgets: "budget",
  components: "component",
  modules: "module",
  repositories: "repository",
  routes: "route",
  pages: "page",
  sizes: "size",
  contracts: "contract",
  schemas: "schema",
  inventories: "inventory",
  costs: "cost",
  backwards: "backward",
  compatible: "compatibility",
  compatibility: "compatibility",
  minimal: "minimal",
  modularity: "modular",
  pagination: "pagination",
  paginated: "pagination",
  stable: "stability",
  stability: "stability",
  unit: "unit",
  integration: "integration",
  typecheck: "typecheck",
  typechecks: "typecheck",
  linting: "lint",
  lints: "lint",
  retry: "retry",
  rollback: "rollback",
};

const PHRASE_RULES: readonly PhraseRule[] = [
  {
    namespace: "goal",
    value: "content.summarize",
    ruleId: "seed.goal.content_summarize",
    score: 980,
    patterns: [/\bsummari[sz](?:e|es|ed|ing)\b/i],
  },
  {
    namespace: "goal",
    value: "content.classify",
    ruleId: "seed.goal.content_classify",
    score: 980,
    patterns: [/\bclassif(?:y|ies|ied|ying)\b/i],
  },
  {
    namespace: "goal",
    value: "bug.fix",
    ruleId: "seed.goal.bug_fix",
    score: 950,
    patterns: [
      /\b(?:fix|repair|resolve)(?:es|ed|ing)?\s+(?:a\s+|the\s+)?(?:bug|defect|issue)\b/i,
      /\bbug\s+fix\b/i,
      /(?:^|[.!?;]\s*)(?:please\s+)?fix\b/i,
    ],
  },
  {
    namespace: "goal",
    value: "feature.add",
    ruleId: "seed.goal.feature_add",
    score: 350,
    patterns: [/\b(?:add|build|create|implement)(?:s|ed|ing)?\b/i],
  },
  {
    namespace: "target",
    value: "screen.login",
    ruleId: "seed.target.login_screen",
    score: 1_100,
    patterns: [/\blog[ -]?in\s+(?:screen|page|form|view)\b/i],
  },
  {
    namespace: "target",
    value: "user.authentication",
    ruleId: "seed.target.user_authentication",
    score: 900,
    patterns: [/\buser\s+auth(?:entication)?\b/i, /\bauthentication\b/i, /\bauth\b/i, /\blog[ -]?in\b/i],
  },
  {
    namespace: "target",
    value: "product.search",
    ruleId: "seed.target.product_search",
    score: 1_050,
    patterns: [/\bproduct\s+search\b/i],
  },
  {
    namespace: "target",
    value: "api.endpoint",
    ruleId: "seed.target.api_endpoint",
    score: 1_050,
    patterns: [/\bapi\s+endpoint\b/i, /\bendpoint\b/i],
  },
  {
    namespace: "target",
    value: "project.documentation",
    ruleId: "seed.target.project_documentation",
    score: 920,
    patterns: [/\b(?:project\s+)?documentation\b/i, /\b(?:project\s+)?docs?\b/i],
  },
  {
    namespace: "target",
    value: "api.endpoint",
    ruleId: "seed.target.api",
    score: 330,
    patterns: [/\bapi\b/i],
  },
  {
    namespace: "action",
    value: "modify",
    ruleId: "seed.action.modify",
    score: 390,
    patterns: [/\b(?:update|modify|edit|change)(?:s|d|ed|ing)?\b/i, /\bfix(?:es|ed|ing)?\b/i],
  },
  {
    namespace: "action",
    value: "delete",
    ruleId: "seed.action.delete",
    score: 410,
    patterns: [/\b(?:delete|remove)(?:s|d|ed|ing)?\b/i],
  },
  {
    namespace: "action",
    value: "implement",
    ruleId: "seed.action.implement",
    score: 340,
    patterns: [/\b(?:add|build|create|implement)(?:s|d|ed|ing)?\b/i],
  },
  {
    namespace: "input",
    value: "user.query",
    ruleId: "seed.input.user_query",
    score: 880,
    patterns: [/\b(?:user\s+|search\s+)?quer(?:y|ies)\b/i],
  },
  {
    namespace: "input",
    value: "user.email",
    ruleId: "seed.input.user_email",
    score: 880,
    patterns: [/\b(?:user\s+)?e-?mail(?:\s+address)?\b/i],
  },
  {
    namespace: "input",
    value: "user.password",
    ruleId: "seed.input.user_password",
    score: 880,
    patterns: [/\b(?:user\s+)?password\b/i],
  },
  {
    namespace: "input",
    value: "user.query",
    ruleId: "lexicon.input.text_query",
    score: 970,
    patterns: [/\b(?:text|search|user)\s+quer(?:y|ies)\b/i],
  },
  {
    namespace: "input",
    value: "category.filter",
    ruleId: "extension.input.category_filter",
    score: 960,
    kind: "derived",
    patterns: [/\bcategor(?:y|ies)\s+filters?\b/i],
  },
  {
    namespace: "input",
    value: "pagination.page_size",
    ruleId: "extension.input.page_size",
    score: 960,
    kind: "derived",
    patterns: [/\b(?:pagination\s+)?page\s+size\b/i],
  },
  {
    namespace: "input",
    value: "pagination.cursor",
    ruleId: "extension.input.pagination_cursor",
    score: 950,
    kind: "derived",
    patterns: [/\b(?:pagination\s+|next\s+|starting\s+)?cursor\b/i],
  },
  {
    namespace: "input",
    value: "repository.files",
    ruleId: "extension.input.repository_files",
    score: 940,
    kind: "derived",
    patterns: [/\b(?:repository|repo|source)\s+files?\b/i, /\bfiles?\s+in\s+the\s+(?:repository|repo)\b/i],
  },
  {
    namespace: "output",
    value: "product.list",
    ruleId: "seed.output.product_list",
    score: 950,
    patterns: [/\b(?:product\s+list|list\s+of\s+products)\b/i],
  },
  {
    namespace: "output",
    value: "auth.session",
    ruleId: "seed.output.auth_session",
    score: 930,
    patterns: [/\b(?:auth(?:enticated|entication)?\s+)?session\b/i],
  },
  {
    namespace: "output",
    value: "pagination.next_cursor",
    ruleId: "extension.output.next_cursor",
    score: 1_020,
    kind: "derived",
    patterns: [/\bnext\s+cursor\b/i, /\bpagination\s+cursor\b/i],
  },
  {
    namespace: "output",
    value: "code.patch",
    ruleId: "extension.output.code_patch",
    score: 990,
    kind: "derived",
    patterns: [/\b(?:code\s+)?patch\b/i, /\bchanged?\s+files?\b/i],
  },
  {
    namespace: "output",
    value: "test.report",
    ruleId: "extension.output.test_report",
    score: 980,
    kind: "derived",
    patterns: [/\btest\s+report\b/i, /\bverification\s+report\b/i],
  },
  {
    namespace: "require",
    value: "existing.behavior.preserve",
    ruleId: "seed.require.preserve_behavior",
    score: 1_100,
    allowNegated: true,
    patterns: [
      /\bwithout\s+breaking\s+(?:the\s+)?existing\s+behavio[u]?r\b/i,
      /\bpreserv(?:e|es|ed|ing)\s+(?:the\s+)?existing\s+behavio[u]?r\b/i,
      /\bkeep\s+(?:the\s+)?existing\s+behavio[u]?r\b/i,
    ],
  },
  {
    namespace: "require",
    value: "ui.responsive",
    ruleId: "seed.require.responsive_ui",
    score: 900,
    patterns: [/\bresponsive(?:\s+(?:ui|layout|design))?\b/i],
  },
  {
    namespace: "require",
    value: "response.fast",
    ruleId: "seed.require.fast_response",
    score: 880,
    patterns: [/\bfast(?:\s+response)?\b/i, /\blow\s+latency\b/i],
  },
  {
    namespace: "require",
    value: "input.validate",
    ruleId: "seed.require.validate_input",
    score: 940,
    patterns: [
      /\bvalidat(?:e|es|ed|ing|ion)\s+(?:all\s+)?inputs?\b/i,
      /\bvalidat(?:e|es|ed|ing|ion)\s+(?:the\s+)?(?:e-?mail|password|query|payload|request)\b/i,
      /\binputs?\s+validation\b/i,
    ],
  },
  {
    namespace: "require",
    value: "password.hash",
    ruleId: "seed.require.hash_password",
    score: 950,
    patterns: [/\bhash(?:es|ed|ing)?\s+(?:the\s+)?passwords?\b/i, /\bhashed\s+passwords?\b/i],
  },
  {
    namespace: "require",
    value: "error.safe",
    ruleId: "seed.require.safe_error",
    score: 910,
    patterns: [/\bsafe\s+errors?\b/i, /\bkeep\s+errors?\s+safe\b/i],
  },
  {
    namespace: "require",
    value: "existing.behavior.preserve",
    ruleId: "lexicon.require.backward_compatibility",
    score: 1_120,
    patterns: [
      /\b(?:preserv(?:e|es|ed|ing)\s+)?backward\s+compatibility\b/i,
      /\bremain\s+backward[ -]?compatible\b/i,
    ],
  },
  {
    namespace: "require",
    value: "response.fast",
    ruleId: "lexicon.require.response_latency",
    score: 930,
    patterns: [/\b(?:response\s+)?latency\b/i, /\bperformance\s+budget\b/i],
  },
  {
    namespace: "require",
    value: "type.safety",
    ruleId: "extension.require.type_safety",
    score: 920,
    kind: "derived",
    patterns: [/\btype[ -]?safe(?:ty)?\b/i, /\bstrict\s+types?\b/i],
  },
  {
    namespace: "require",
    value: "schema.preserve",
    ruleId: "extension.require.schema_preserve",
    score: 920,
    kind: "derived",
    patterns: [/\b(?:preserv(?:e|es|ed|ing)|keep)\s+(?:the\s+)?(?:existing\s+)?schema\b/i],
  },
  {
    namespace: "prefer",
    value: "code.simple",
    ruleId: "seed.prefer.simple_code",
    score: 860,
    patterns: [/\bsimple(?:\s+(?:code|implementation|solution))?\b/i],
  },
  {
    namespace: "prefer",
    value: "change.minimal",
    ruleId: "extension.prefer.minimal_change",
    score: 920,
    kind: "derived",
    patterns: [/\bminimal(?:\s+(?:change|patch|diff|implementation))?\b/i, /\bsmall(?:est)?\s+(?:change|patch|diff)\b/i],
  },
  {
    namespace: "prefer",
    value: "architecture.modular",
    ruleId: "extension.prefer.modular_architecture",
    score: 400,
    kind: "derived",
    patterns: [/\bmodular(?:\s+(?:design|architecture|implementation|code))?\b/i],
  },
  {
    namespace: "forbid",
    value: "secret.expose",
    ruleId: "seed.forbid.secret_exposure",
    score: 1_050,
    allowNegated: true,
    patterns: [
      /\b(?:do\s+not|don't|never|must\s+not|avoid)\s+expos(?:e|es|ed|ing)\s+(?:any\s+)?secrets?\b/i,
      /\bsecret\s+exposure\b/i,
    ],
  },
  {
    namespace: "forbid",
    value: "secret.hardcode",
    ruleId: "seed.forbid.hardcoded_secret",
    score: 1_060,
    allowNegated: true,
    patterns: [
      /\b(?:do\s+not|don't|never|must\s+not|avoid)\s+hard[ -]?cod(?:e|es|ed|ing)\s+(?:any\s+)?secrets?\b/i,
      /\bhard[ -]?coded?\s+secrets?\b/i,
    ],
  },
  {
    namespace: "forbid",
    value: "change.breaking",
    ruleId: "seed.forbid.breaking_change",
    score: 1_040,
    allowNegated: true,
    patterns: [/\b(?:no|without|avoid)\s+breaking\s+changes?\b/i, /\bdo\s+not\s+introduce\s+breaking\s+changes?\b/i],
  },
  {
    namespace: "forbid",
    value: "password.plaintext_store",
    ruleId: "seed.forbid.plaintext_password",
    score: 1_060,
    allowNegated: true,
    patterns: [
      /\b(?:do\s+not|don't|never|must\s+not|avoid)\s+stor(?:e|es|ed|ing)\s+(?:a\s+)?plaintext\s+passwords?\b/i,
      /\bplaintext\s+password\s+storage\b/i,
    ],
  },
  {
    namespace: "forbid",
    value: "checkout_api.modify",
    ruleId: "extension.forbid.checkout_api_modify",
    score: 1_120,
    allowNegated: true,
    kind: "derived",
    patterns: [
      /\b(?:do\s+not|don't|never|must\s+not|avoid)\s+(?:modify|change|edit|break)\s+(?:the\s+)?checkout\s+(?:api|endpoint)\b/i,
      /\bcheckout\s+(?:api|endpoint)\s+must\s+remain\s+unchanged\b/i,
      /\b(?:modify|change|edit|break)\s+(?:the\s+)?checkout\s+(?:api|endpoint)\b/i,
    ],
  },
  {
    namespace: "forbid",
    value: "unrelated_files.modify",
    ruleId: "extension.forbid.unrelated_files",
    score: 1_080,
    allowNegated: true,
    kind: "derived",
    patterns: [/\b(?:do\s+not|don't|never|must\s+not|avoid)\s+(?:modify|change|edit)\s+unrelated\s+files?\b/i],
  },
  {
    namespace: "forbid",
    value: "dependency.add",
    ruleId: "extension.forbid.new_dependency",
    score: 1_070,
    allowNegated: true,
    kind: "derived",
    patterns: [/\b(?:do\s+not|don't|never|must\s+not|avoid)\s+add(?:ing)?\s+(?:a\s+|any\s+)?new\s+dependenc(?:y|ies)\b/i],
  },
  {
    namespace: "verify",
    value: "tests.pass",
    ruleId: "seed.verify.tests_pass",
    score: 960,
    patterns: [
      /\b(?:add|write|run|include|pass|verify|with)\s+(?:the\s+)?tests?\b/i,
      /\btest\s+suite\s+(?:passes|passing|must\s+pass)\b/i,
    ],
  },
  {
    namespace: "verify",
    value: "login.success",
    ruleId: "seed.verify.login_success",
    score: 980,
    patterns: [/\b(?:verify|test|confirm|ensure)\s+(?:a\s+)?successful\s+log[ -]?in\b/i, /\blog[ -]?in\s+succeeds\b/i],
  },
  {
    namespace: "verify",
    value: "invalid_credentials.reject",
    ruleId: "seed.verify.reject_credentials",
    score: 990,
    patterns: [/\b(?:reject|den(?:y|ies)|test)\s+invalid\s+credentials\b/i],
  },
  {
    namespace: "verify",
    value: "unit_tests.pass",
    ruleId: "extension.verify.unit_tests",
    score: 1_080,
    kind: "derived",
    patterns: [/\bunit\s+tests?\s+(?:pass|passes|passing|succeed)\b/i, /\b(?:run|verify|with)\s+(?:the\s+)?unit\s+tests?\b/i, /\bunit\s+tests?\b/i],
  },
  {
    namespace: "verify",
    value: "integration_tests.pass",
    ruleId: "extension.verify.integration_tests",
    score: 1_080,
    kind: "derived",
    patterns: [/\bintegration\s+tests?\s+(?:pass|passes|passing|succeed)\b/i, /\b(?:run|verify|with)\s+(?:the\s+)?integration\s+tests?\b/i, /\bintegration\s+tests?\b/i],
  },
  {
    namespace: "verify",
    value: "build.pass",
    ruleId: "extension.verify.build",
    score: 1_030,
    kind: "derived",
    patterns: [/\bbuild\s+(?:passes|succeeds|is\s+successful)\b/i, /\b(?:run|verify|check)\s+(?:the\s+)?build\b/i],
  },
  {
    namespace: "verify",
    value: "typecheck.pass",
    ruleId: "extension.verify.typecheck",
    score: 1_030,
    kind: "derived",
    patterns: [/\btype[ -]?check(?:s|ing)?\s+(?:passes|succeeds)?\b/i],
  },
  {
    namespace: "verify",
    value: "lint.pass",
    ruleId: "extension.verify.lint",
    score: 1_020,
    kind: "derived",
    patterns: [/\blint(?:ing)?\s+(?:passes|succeeds|is\s+clean)\b/i, /\bno\s+lint\s+errors?\b/i],
  },
  {
    namespace: "verify",
    value: "pagination.order_stable",
    ruleId: "extension.verify.pagination_order",
    score: 1_050,
    kind: "derived",
    patterns: [/\bpagination\s+order\s+(?:is|remains|stays)\s+stable\b/i, /\bstable\s+pagination\s+order\b/i, /\bpagination\s+order\b/i],
  },
  {
    namespace: "on_failure",
    value: "transaction.rollback",
    ruleId: "seed.failure.transaction_rollback",
    score: 1_000,
    allowNegated: true,
    patterns: [/\broll\s+back\s+(?:the\s+)?transaction\b/i, /\btransaction\s+rollback\b/i],
  },
  {
    namespace: "on_failure",
    value: "change.rollback",
    ruleId: "extension.failure.change_rollback",
    score: 1_080,
    allowNegated: true,
    kind: "derived",
    patterns: [/\broll\s+back\s+(?:the\s+)?(?:change|changes|edit|edits|patch|work)\b/i, /\brevert\s+(?:the\s+)?(?:change|changes|edit|edits|patch|work)\b/i],
  },
  {
    namespace: "on_failure",
    value: "diagnostics.preserve",
    ruleId: "extension.failure.preserve_diagnostics",
    score: 1_060,
    allowNegated: true,
    kind: "derived",
    patterns: [/\bpreserv(?:e|es|ed|ing)\s+(?:the\s+)?diagnostics?\b/i, /\bkeep\s+(?:the\s+)?(?:error\s+)?logs?\b/i],
  },
  {
    namespace: "on_failure",
    value: "task.abort",
    ruleId: "extension.failure.abort",
    score: 1_040,
    allowNegated: true,
    kind: "derived",
    patterns: [/\b(?:then\s+)?(?:abort|stop|halt)\b/i, /\bdo\s+not\s+continue\b/i],
  },
] as const;

const PARAMETER_RULES: readonly ParameterRule[] = [
  {
    namespace: "require",
    ruleId: "parameter.require.latency_max",
    pattern: /\b(?:responses?|response\s+(?:time|latency)|latency)\s+(?:must\s+)?(?:stay|stays|remain|remains|be|is)?\s*(?:under|below|within|at\s+most|no\s+more\s+than|<=?)\s*(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|seconds?)\b/i,
    value: (match) => `latency.max_${numberToken(match[1])}_${unitToken(match[2])}`,
  },
  {
    namespace: "verify",
    ruleId: "parameter.verify.latency_max",
    pattern: /\b(?:responses?|response\s+(?:time|latency)|latency)\s+(?:must\s+)?(?:stay|stays|remain|remains|be|is)?\s*(?:under|below|within|at\s+most|no\s+more\s+than|<=?)\s*(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|seconds?)\b/i,
    value: (match) => `latency.max_${numberToken(match[1])}_${unitToken(match[2])}`,
  },
  {
    namespace: "require",
    ruleId: "parameter.require.timeout_max",
    pattern: /\btimeout\s+(?:must\s+)?(?:be|is|at|after)?\s*(?:under|below|within|at\s+most|no\s+more\s+than)?\s*(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|seconds?|m|minutes?)\b/i,
    value: (match) => `timeout.max_${numberToken(match[1])}_${unitToken(match[2])}`,
  },
  {
    namespace: "verify",
    ruleId: "parameter.verify.coverage_min",
    pattern: /\b(?:test\s+)?coverage\s+(?:must\s+)?(?:be|is|remain|stays?)?\s*(?:at\s+least|no\s+less\s+than|>=?)\s*(\d+(?:\.\d+)?)\s*(?:%|percent)\b/i,
    value: (match) => `coverage.min_${numberToken(match[1])}_percent`,
  },
  {
    namespace: "verify",
    ruleId: "parameter.verify.latency_budget",
    pattern: /\b(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|seconds?)\s+(?:response\s+)?latency\s+budget\b/i,
    value: (match) => `latency.max_${numberToken(match[1])}_${unitToken(match[2])}`,
  },
  {
    namespace: "input",
    ruleId: "parameter.input.page_size",
    pattern: /\bpage\s+size\s+(?:of|is|=|:)?\s*(\d+)\b/i,
    value: (match) => `pagination.page_size_${numberToken(match[1])}`,
  },
  {
    namespace: "require",
    ruleId: "parameter.require.result_limit",
    pattern: /\b(?:return|limit|maximum|max|at\s+most)\s+(?:the\s+result\s+to\s+)?(\d+)\s+(items?|records?|results?|products?)\b/i,
    value: (match) => `result.max_${numberToken(match[1])}_${normalizeConceptWord(match[2] ?? "item")}`,
  },
  {
    namespace: "on_failure",
    ruleId: "parameter.failure.retry_count",
    pattern: /\bretr(?:y|ies)\s+(?:up\s+to\s+|at\s+most\s+|a\s+maximum\s+of\s+)?(\d+)\s+times?\b/i,
    value: (match) => `retry.max_${numberToken(match[1])}`,
  },
  {
    namespace: "on_failure",
    ruleId: "parameter.failure.retry_once",
    pattern: /\bretr(?:y|ies)\s+once\b/i,
    value: () => "retry.max_1",
  },
  {
    namespace: "on_failure",
    ruleId: "parameter.failure.one_retry",
    pattern: /\b(?:after|allow|with)\s+(?:only\s+)?one\s+retr(?:y|ies)\b/i,
    value: () => "retry.max_1",
  },
] as const;

const EXTENSION_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "any",
  "be",
  "do",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "then",
  "to",
  "using",
  "with",
]);

const entriesByNamespaceCache = new WeakMap<Codebook, Map<StatementKind, CodebookEntry[]>>();

function assertEnglishNaturalLanguage(source: string): void {
  if (/[\u3000-\u30ff\u3400-\u9fff\uff01-\uff60]/u.test(source) || !/[A-Za-z]/u.test(source)) {
    throw new UnsupportedLanguageError("Only English natural-language instructions are supported.");
  }
}

function normalizeWord(word: string): string {
  const lower = word.toLowerCase().replace(/[’']/g, "");
  const direct = WORD_CANONICAL[lower];
  if (direct) return direct;
  if (lower.length > 4 && lower.endsWith("ies")) return `${lower.slice(0, -3)}y`;
  if (lower.length > 4 && lower.endsWith("ses")) return lower.slice(0, -2);
  if (lower.length > 4 && lower.endsWith("s") && !lower.endsWith("ss")) return lower.slice(0, -1);
  return lower;
}

function normalizeConceptWord(word: string): string {
  const lower = word.toLowerCase().replace(/[’']/g, "");
  if (lower === "docs") return "documentation";
  if (lower === "auth") return "authentication";
  if (lower.length > 4 && lower.endsWith("ies")) return `${lower.slice(0, -3)}y`;
  if (lower.length > 4 && lower.endsWith("ses")) return lower.slice(0, -2);
  if (lower.length > 4 && lower.endsWith("s") && !lower.endsWith("ss")) return lower.slice(0, -1);
  return lower;
}

function numberToken(value: string | undefined): string {
  return (value ?? "unknown").replace(".", "_");
}

function unitToken(value: string | undefined): string {
  const normalized = (value ?? "unit").toLowerCase();
  if (normalized === "millisecond" || normalized === "milliseconds" || normalized === "ms") return "ms";
  if (normalized === "second" || normalized === "seconds" || normalized === "s") return "seconds";
  if (normalized === "minute" || normalized === "minutes" || normalized === "m") return "minutes";
  return normalizeWord(normalized);
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /[A-Za-z][A-Za-z0-9]*(?:[-'][A-Za-z0-9]+)*/gu;
  const frameBoundaryPattern =
    /\b(?:and|then|but)\s+(?=(?:(?:please|also)\s+)?(?:add|build|create|implement|update|modify|edit|change|delete|remove|analyze|optimize|secure|migrate|automate|monitor|document|validate|transform|synchronize|sync|publish|archive|restore|read|return|produce|emit|verify|test|check|confirm|retry|abort|roll\s+back)\b)/giu;
  const frameBoundaries = [...source.matchAll(frameBoundaryPattern)].map((match) => match.index + match[0].length);
  let boundaryIndex = 0;
  let clause = 0;
  let previousEnd = 0;
  for (const match of source.matchAll(pattern)) {
    const start = match.index;
    if (/[.!?;:\n]/u.test(source.slice(previousEnd, start))) clause += 1;
    while (frameBoundaries[boundaryIndex] !== undefined && frameBoundaries[boundaryIndex] <= start) {
      if (frameBoundaries[boundaryIndex] > previousEnd) clause += 1;
      boundaryIndex += 1;
    }
    const raw = match[0];
    for (const part of raw.split(/[-']/u).filter(Boolean)) {
      const partOffset = raw.indexOf(part);
      tokens.push({
        raw: part,
        normalized: normalizeWord(part),
        concept: normalizeConceptWord(part),
        start: start + partOffset,
        end: start + partOffset + part.length,
        clause,
      });
    }
    previousEnd = start + raw.length;
  }
  return tokens;
}

function lexicalParts(entry: CodebookEntry): LexicalPart[] {
  const [concept = "", ...variantSegments] = entry.key.split(".");
  return [
    ...concept.split("_").filter(Boolean).map((part) => ({ normalized: normalizeConceptWord(part), role: "concept" as const })),
    ...variantSegments
      .join("_")
      .split("_")
      .filter(Boolean)
      .map((part) => ({ normalized: normalizeWord(part), role: "variant" as const })),
  ];
}

function referenceConcept(reference: string): string {
  return normalizeConceptWord(reference.split(/[._]/u)[0] ?? "");
}

function referenceTokens(reference: string): Set<string> {
  return new Set(reference.split(/[._]/u).filter(Boolean).map(normalizeConceptWord));
}

function getEntriesByNamespace(codebook: Codebook): Map<StatementKind, CodebookEntry[]> {
  const cached = entriesByNamespaceCache.get(codebook);
  if (cached) return cached;
  const result = new Map<StatementKind, CodebookEntry[]>();
  for (const field of FIELD_ORDER) result.set(field, []);
  for (const entry of codebook.entries) {
    if (entry.status === "active") result.get(entry.namespace)?.push(entry);
  }
  for (const entries of result.values()) entries.sort((left, right) => left.key.localeCompare(right.key));
  entriesByNamespaceCache.set(codebook, result);
  return result;
}

function isNegated(source: string, start: number, end: number): boolean {
  const clauseStart = Math.max(
    source.lastIndexOf(".", start - 1),
    source.lastIndexOf("!", start - 1),
    source.lastIndexOf("?", start - 1),
    source.lastIndexOf(";", start - 1),
    source.lastIndexOf("\n", start - 1),
  ) + 1;
  const before = source.slice(clauseStart, start);
  const scope = before.split(/\b(?:and|but|then|while)\b|,/iu).at(-1) ?? before;
  const matched = source.slice(start, end);
  return /\b(?:do\s+not|does\s+not|don't|doesn't|must\s+not|should\s+not|never|without|avoid|prevent|forbid|no|not)\b/iu.test(
    `${scope} ${matched}`,
  );
}

function clauseText(source: string, tokens: Token[], clause: number): string {
  const inClause = tokens.filter((token) => token.clause === clause);
  if (!inClause.length) return "";
  return source.slice(inClause[0].start, inClause.at(-1)?.end ?? inClause[0].end);
}

function hasNamespaceCue(
  namespace: StatementKind,
  source: string,
  tokens: Token[],
  match: Token[],
  sections: readonly PromptSection[] = [],
): boolean {
  const start = Math.min(...match.map((token) => token.start));
  const end = Math.max(...match.map((token) => token.end));
  const explicitSection = sections.find((section) =>
    section.items.some((item) => start >= item.start && end <= item.end),
  );
  if (explicitSection) return explicitSection.field === namespace;
  const negated = isNegated(source, start, end);
  const clauseTokens = tokens.filter((token) => token.clause === match[0].clause);
  const context = clauseText(source, tokens, match[0].clause).toLowerCase();
  const clauseStart = clauseTokens[0]?.start ?? start;
  const localPrefix = source
    .slice(clauseStart, start)
    .split(/,/u)
    .at(-1)
    ?.toLowerCase() ?? "";
  const matchedContext = `${localPrefix} ${source.slice(start, end).toLowerCase()}`;
  if (namespace === "forbid") {
    return negated || /\b(?:forbid|avoid|prevent|prohibit|ban|must\s+not|do\s+not|never|no)\b/u.test(context);
  }
  if (namespace !== "on_failure" && negated) return false;
  if (namespace === "goal" || namespace === "action") {
    return !/\b(?:verify|test|check|confirm|assert|must|shall|required|ensure|should|prefer|ideally|return|output|produce|emit|using|accept|given|if|when)\b/u.test(
      matchedContext,
    );
  }
  if (namespace === "target") return true;
  if (namespace === "input") {
    return /\b(?:using|from|with|accept|take|given|input|based\s+on|provide|receive|via)\b/u.test(context) ||
      match.some((token) => /^(?:id|request|payload|query|filter|option|metadata|credential|event|file|email|password)$/u.test(token.normalized));
  }
  if (namespace === "output") {
    return /\b(?:return|output|produce|emit|generate|respond|result|yield|create\s+a\s+report)\b/u.test(context);
  }
  if (namespace === "require") {
    if (/\b(?:verify|test|check|confirm|assert)\b/u.test(localPrefix)) return false;
    return /\b(?:must|require|ensure|need|keep|remain|support|make|with|should|always)\b/u.test(context) ||
      match.some((token) =>
        /^(?:available|consistency|encrypt|validate|authorize|observe|idempotency|scale|access|document)$/u.test(token.normalized),
      );
  }
  if (namespace === "prefer") {
    return /\b(?:prefer|ideally|if\s+possible|favor|should|keep|make)\b/u.test(context);
  }
  if (namespace === "verify") {
    return /\b(?:verify|test|check|confirm|assert|ensure|prove|expect)\b/u.test(context);
  }
  return /\b(?:on\s+failure|if\s+\w+\s+fails?|when\s+\w+\s+fails?|failure|fails?|rollback|retry|abort|compensate|fallback|escalate|quarantine)\b/u.test(
    context,
  );
}

function bestTokenMatch(parts: LexicalPart[], tokens: Token[]): Token[] | null {
  const occurrences = parts.map((part) =>
    tokens.filter((token) => (part.role === "concept" ? token.concept : token.normalized) === part.normalized),
  );
  if (occurrences.some((items) => !items.length)) return null;
  let best: Token[] | null = null;
  let bestSpan = Number.POSITIVE_INFINITY;

  const walk = (position: number, chosen: Token[]) => {
    if (position === occurrences.length) {
      if (new Set(chosen.map((token) => `${token.start}:${token.end}`)).size !== chosen.length) return;
      if (new Set(chosen.map((token) => token.clause)).size !== 1) return;
      const start = Math.min(...chosen.map((token) => token.start));
      const end = Math.max(...chosen.map((token) => token.end));
      const span = end - start;
      if (span < bestSpan || (span === bestSpan && start < Math.min(...(best ?? chosen).map((token) => token.start)))) {
        best = [...chosen];
        bestSpan = span;
      }
      return;
    }
    for (const token of occurrences[position]) {
      if (chosen.includes(token)) continue;
      walk(position + 1, [...chosen, token]);
    }
  };
  walk(0, []);
  return best;
}

function presetCandidates(source: string, tokens: Token[], codebook: Codebook, sections: readonly PromptSection[] = []): Candidate[] {
  const candidates: Candidate[] = [];
  const byNamespace = getEntriesByNamespace(codebook);
  const tokensByClause = new Map<number, Token[]>();
  for (const token of tokens) {
    const group = tokensByClause.get(token.clause) ?? [];
    group.push(token);
    tokensByClause.set(token.clause, group);
  }
  for (const namespace of FIELD_ORDER) {
    for (const entry of byNamespace.get(namespace) ?? []) {
      if (!/^[A-Z]1\d{4}$/u.test(entry.code)) continue;
      const parts = lexicalParts(entry);
      if (parts.length < 2) continue;
      for (const clauseTokens of tokensByClause.values()) {
        const match = bestTokenMatch(parts, clauseTokens);
        if (!match || !hasNamespaceCue(namespace, source, tokens, match, sections)) continue;
        const start = Math.min(...match.map((token) => token.start));
        const end = Math.max(...match.map((token) => token.end));
        const ordered = [...match].sort((left, right) => left.start - right.start);
        const tokenSpan = Math.max(...ordered.map((token) => tokens.indexOf(token))) - Math.min(...ordered.map((token) => tokens.indexOf(token)));
        if (tokenSpan > Math.max(7, parts.length + 4)) continue;
        const contiguous = tokenSpan === parts.length - 1;
        const score = parts.length * 180 + (contiguous ? 360 : Math.max(20, 220 - tokenSpan * 28));
        candidates.push({
          namespace,
          value: entry.key,
          score,
          start,
          end,
          ruleId: `preset.${namespace}.${entry.key.replaceAll(".", "_")}`,
        });
      }
    }
  }
  return candidates;
}

function phraseCandidates(source: string, tokens: Token[], sections: readonly PromptSection[] = []): Candidate[] {
  const result: Candidate[] = [];
  for (const rule of PHRASE_RULES) {
    const matches: RegExpExecArray[] = [];
    for (const pattern of rule.patterns) {
      const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
      const matcher = new RegExp(pattern.source, flags);
      for (const match of source.matchAll(matcher)) {
        if (!matches.some((item) => item.index === match.index && item[0] === match[0])) matches.push(match);
      }
    }
    for (const match of matches) {
      const start = match.index;
      const end = start + match[0].length;
      if (!rule.allowNegated && isNegated(source, start, end)) continue;
      const matchedTokens = tokens.filter((token) => token.start < end && token.end > start);
      const mayBypassCue = rule.allowNegated && rule.namespace === "require";
      if (!mayBypassCue && matchedTokens.length && !hasNamespaceCue(rule.namespace, source, tokens, matchedTokens, sections)) continue;
      result.push({
        namespace: rule.namespace,
        value: rule.value,
        score: rule.score,
        start,
        end,
        ruleId: rule.ruleId,
        kind: rule.kind,
      });
    }
  }
  return result;
}

function parameterCandidates(source: string): Candidate[] {
  const result: Candidate[] = [];
  for (const rule of PARAMETER_RULES) {
    const flags = rule.pattern.flags.includes("g") ? rule.pattern.flags : `${rule.pattern.flags}g`;
    const matcher = new RegExp(rule.pattern.source, flags);
    for (const match of source.matchAll(matcher)) {
      result.push({
        namespace: rule.namespace,
        value: rule.value(match),
        score: 1_500,
        start: match.index,
        end: match.index + match[0].length,
        ruleId: rule.ruleId,
        kind: "derived",
      });
    }
  }
  return result;
}

interface ContextEntityMatch {
  label: string;
  reference: string;
  start: number;
  end: number;
  term?: TechnicalTerm;
}

const GENERIC_ENTITY_STOP_WORDS = new Set([
  "Action",
  "API",
  "Context",
  "English",
  "Forbidden",
  "Goal",
  "Input",
  "Inputs",
  "Instruction",
  "Instructions",
  "On",
  "Output",
  "Outputs",
  "Preference",
  "Preferences",
  "Requirement",
  "Requirements",
  "Target",
  "Verification",
]);

function referenceSlug(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "_")
    .replaceAll(/^_+|_+$/gu, "")
    .slice(0, 80) || "unnamed";
}

function isEntityBoundary(value: string | undefined): boolean {
  return !value || !/[A-Za-z0-9_]/u.test(value);
}

function exactCaseRequired(form: string): boolean {
  return /^[A-Za-z]{1,3}$/u.test(form);
}

function overlapsEntity(left: ContextEntityMatch, right: ContextEntityMatch): boolean {
  return left.start < right.end && right.start < left.end;
}

function technicalEntityMatches(source: string): ContextEntityMatch[] {
  const lowerSource = source.toLowerCase();
  const candidates: ContextEntityMatch[] = [];

  for (const term of TECHNICAL_TERMS) {
    for (const form of new Set([term.label, ...term.aliases])) {
      const lowerForm = form.toLowerCase();
      let from = 0;
      while (from < source.length) {
        const start = lowerSource.indexOf(lowerForm, from);
        if (start < 0) break;
        const end = start + form.length;
        from = start + Math.max(1, form.length);
        if (!isEntityBoundary(source[start - 1]) || !isEntityBoundary(source[end])) continue;
        const matched = source.slice(start, end);
        if (exactCaseRequired(form) && matched !== form) continue;
        const versionedReference = /\d/u.test(matched)
          ? `${term.contextReference.split(".")[0]}.${referenceSlug(matched)}`
          : term.contextReference;
        candidates.push({
          label: matched,
          reference: versionedReference,
          start,
          end,
          term,
        });
      }
    }
  }

  candidates.sort(
    (left, right) => left.start - right.start || right.end - right.start - (left.end - left.start) || left.reference.localeCompare(right.reference),
  );
  const selected: ContextEntityMatch[] = [];
  for (const candidate of candidates) {
    if (selected.some((item) => overlapsEntity(item, candidate))) continue;
    selected.push(candidate);
  }
  return selected;
}

function genericProperNounMatches(source: string, known: readonly ContextEntityMatch[]): ContextEntityMatch[] {
  const candidates: ContextEntityMatch[] = [];
  const patterns = [
    /\b[A-Z][A-Z0-9]{1,}(?:[./+#-][A-Za-z0-9]+)*\b/gu,
    /\b[A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]*)+\b/gu,
    /\b[A-Z][A-Za-z0-9]*\d+(?:\.\d+)*\b/gu,
    /\b(?:on|using|with|via|for|in|from)\s+([A-Z][A-Za-z0-9]*(?:[.-][A-Za-z0-9]+)*)/gu,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const label = match[1] ?? match[0];
      const relativeStart = match[0].lastIndexOf(label);
      const start = match.index + relativeStart;
      const end = start + label.length;
      const candidate: ContextEntityMatch = {
        label,
        reference: `context.${referenceSlug(label)}`,
        start,
        end,
      };
      if (GENERIC_ENTITY_STOP_WORDS.has(label)) continue;
      if (known.some((item) => overlapsEntity(item, candidate))) continue;
      if (candidates.some((item) => overlapsEntity(item, candidate))) continue;
      candidates.push(candidate);
    }
  }
  return candidates.sort((left, right) => left.start - right.start || left.reference.localeCompare(right.reference));
}

function contextEntityCandidates(source: string, sections: readonly PromptSection[]): Candidate[] {
  const known = technicalEntityMatches(source);
  const entities = [...known, ...genericProperNounMatches(source, known)]
    .sort((left, right) => left.start - right.start || left.reference.localeCompare(right.reference));
  const seen = new Set<string>();
  const result: Candidate[] = entities.flatMap((entity) => {
    if (seen.has(entity.reference)) return [];
    seen.add(entity.reference);
    return [{
      namespace: "input" as const,
      value: entity.reference,
      score: entity.term ? 2_400 : 2_100,
      start: entity.start,
      end: entity.end,
      ruleId: entity.term ? `context.technical.${entity.term.id}` : "context.proper_noun.lossless",
      kind: "derived" as const,
    }];
  });
  for (const entity of known) {
    const inTargetSection = sections.some((section) =>
      section.field === "target" && section.items.some((item) => entity.start >= item.start && entity.end <= item.end),
    );
    if (!inTargetSection || !entity.term) continue;
    result.push({
      namespace: "target",
      value: `technology.${entity.term.id}`,
      score: 4_800,
      start: entity.start,
      end: entity.end,
      ruleId: `technical.target.${entity.term.id}`,
      kind: "matched",
    });
  }
  return result;
}

function documentationArtifactCandidates(source: string): Candidate[] {
  const result: Candidate[] = [];
  const matcher = /\b(?:guide|tutorial|manual|documentation|instructions?)\b/giu;
  for (const match of source.matchAll(matcher)) {
    const start = match.index;
    const end = start + match[0].length;
    result.push(
      {
        namespace: "target",
        value: "project.documentation",
        score: 3_300,
        start,
        end,
        ruleId: "artifact.target.project_documentation",
      },
      {
        namespace: "output",
        value: "documentation.artifact",
        score: 3_200,
        start,
        end,
        ruleId: "artifact.output.documentation_artifact",
      },
    );
  }

  const createMatcher = /\b(?:build|create|generate|produce|write)(?:s|d|ed|ing)?\b[^.!?;\n]{0,80}\b(?:guide|tutorial|manual|documentation|instructions?)\b/giu;
  for (const match of source.matchAll(createMatcher)) {
    const start = match.index;
    const end = start + match[0].length;
    result.push(
      {
        namespace: "goal",
        value: "documentation.create",
        score: 3_500,
        start,
        end,
        ruleId: "artifact.goal.documentation_create",
      },
      {
        namespace: "action",
        value: "documentation.create",
        score: 3_400,
        start,
        end,
        ruleId: "artifact.action.documentation_create",
      },
    );
  }
  return result;
}

function semanticExtensionReference(text: string): string {
  const words = [...text.matchAll(/[A-Za-z][A-Za-z0-9]*/gu)]
    .map((match) => normalizeWord(match[0]))
    .filter((word) => !EXTENSION_STOP_WORDS.has(word))
    .slice(0, 8);
  return `extension.${words.length ? words.join("_") : "unspecified"}`;
}

function sectionItemForCandidate(sections: readonly PromptSection[], candidate: Candidate): { section: PromptSection; start: number; end: number } | undefined {
  for (const section of sections) {
    for (const item of section.items) {
      if (candidate.start >= item.start && candidate.end <= item.end) return { section, start: item.start, end: item.end };
    }
  }
  return undefined;
}

function applyStructuredScopes(sections: readonly PromptSection[], candidates: Candidate[]): Candidate[] {
  if (!sections.length) return candidates;

  const scoped = candidates
    .map((candidate) => {
      const item = sectionItemForCandidate(sections, candidate);
      if (!item) return candidate;
      if (item.section.field !== candidate.namespace) return null;
      return { ...candidate, score: candidate.score + 2_500 };
    })
    .filter((candidate): candidate is Candidate => candidate !== null);

  for (const section of sections) {
    for (const item of section.items) {
      const represented = scoped.some(
        (candidate) =>
          candidate.namespace === section.field && candidate.start < item.end && item.start < candidate.end,
      );
      if (represented) continue;
      scoped.push({
        namespace: section.field,
        value: semanticExtensionReference(item.text),
        score: 2_200,
        start: item.start,
        end: item.end,
        ruleId: `structured.${section.field}.lossless_extension`,
        kind: "derived",
      });
    }
  }

  return scoped.map((candidate) => {
    const item = sectionItemForCandidate(sections, candidate);
    if (!item || candidate.kind !== "derived" || candidate.ruleId.startsWith("structured.")) return candidate;
    return {
      ...candidate,
      start: Math.max(item.start, candidate.start),
      end: Math.min(item.end, candidate.end),
    };
  });
}

function compareCandidates(left: Candidate, right: Candidate): number {
  return (
    right.score - left.score ||
    left.start - right.start ||
    left.end - left.start - (right.end - right.start) ||
    left.value.localeCompare(right.value) ||
    left.ruleId.localeCompare(right.ruleId)
  );
}

function overlaps(left: Candidate, right: Candidate): boolean {
  return left.start < right.end && right.start < left.end;
}

function selectCandidates(candidates: Candidate[]): Map<StatementKind, Candidate[]> {
  const selected = new Map<StatementKind, Candidate[]>();
  const target = candidates.filter((candidate) => candidate.namespace === "target").sort(compareCandidates)[0];
  if (target) {
    const targetParts = referenceTokens(target.value);
    for (const candidate of candidates) {
      if (candidate.namespace !== "goal" && candidate.namespace !== "action") continue;
      const candidateConcept = referenceConcept(candidate.value);
      if (candidateConcept && targetParts.has(candidateConcept)) candidate.score += 300;
    }
  }
  for (const namespace of FIELD_ORDER) {
    const scoped = candidates.filter((candidate) => candidate.namespace === namespace).sort(compareCandidates);
    if (SINGLETON_NAMESPACES.has(namespace)) {
      if (scoped[0]) selected.set(namespace, [scoped[0]]);
      continue;
    }
    const kept: Candidate[] = [];
    for (const candidate of scoped) {
      if (kept.some((item) => item.value === candidate.value || overlaps(item, candidate))) continue;
      kept.push(candidate);
      if (kept.length === (namespace === "input" ? 64 : 8)) break;
    }
    kept.sort((left, right) => left.start - right.start || compareCandidates(left, right));
    if (kept.length) selected.set(namespace, kept);
  }
  return selected;
}

function taskIdFromTarget(target: string): string {
  const stem = target
    .split(/[._]/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return `${stem || "InstructionRequest"}Task`;
}

function evidenceForCandidate(source: string, candidate: Candidate): ConversionEvidence {
  return {
    field: candidate.namespace,
    value: candidate.value,
    kind: candidate.kind ?? "matched",
    ruleId: candidate.ruleId,
    matchedText: source.slice(candidate.start, candidate.end),
    start: candidate.start,
    end: candidate.end,
  };
}

export function analyzeNaturalLanguage(source: string, codebook: Codebook = coreCodebook): NaturalLanguageAnalysis {
  if (source.length > MAX_SOURCE_LENGTH) {
    throw new Error(`Source exceeds the ${MAX_SOURCE_LENGTH.toLocaleString()} character limit.`);
  }
  const text = source.trim();
  if (!text) throw new Error("Source text is empty.");
  assertEnglishNaturalLanguage(text);

  const tokens = tokenize(text);
  const sections = parsePromptSections(text);
  const scopedCandidates = applyStructuredScopes(sections, [
    ...phraseCandidates(text, tokens, sections),
    ...parameterCandidates(text),
    ...presetCandidates(text, tokens, codebook, sections),
  ]);
  const candidates = [
    ...scopedCandidates,
    ...documentationArtifactCandidates(text),
    ...contextEntityCandidates(text, sections),
  ];
  const selected = selectCandidates(candidates);

  const goal = selected.get("goal")?.[0];
  const target = selected.get("target")?.[0];
  const action = selected.get("action")?.[0];
  const goalValue = goal?.value ?? "task.execute";
  const targetValue = target?.value ?? "instruction.request";
  const actionValue = action?.value ?? "implement";
  const taskId = taskIdFromTarget(targetValue);
  const ir = emptyIr(taskId);
  ir.goal = goalValue;
  ir.target = targetValue;
  ir.action = actionValue;
  ir.metadata = { sourceLanguage: "en" };

  const evidence: ConversionEvidence[] = [
    {
      field: "task",
      value: taskId,
      kind: "derived",
      ruleId: "derived.task.from_target",
    },
    goal
      ? evidenceForCandidate(text, goal)
      : { field: "goal", value: goalValue, kind: "default", ruleId: "default.goal.task_execute" },
    target
      ? evidenceForCandidate(text, target)
      : { field: "target", value: targetValue, kind: "default", ruleId: "default.target.instruction_request" },
    action
      ? evidenceForCandidate(text, action)
      : { field: "action", value: actionValue, kind: "default", ruleId: "default.action.implement" },
  ];

  for (const namespace of FIELD_ORDER.slice(3)) {
    const field = IR_ARRAY_FIELD[namespace as keyof typeof IR_ARRAY_FIELD];
    const values = ir[field] as string[];
    for (const candidate of selected.get(namespace) ?? []) {
      if (!values.includes(candidate.value)) values.push(candidate.value);
      evidence.push(evidenceForCandidate(text, candidate));
    }
  }

  evidence.sort((left, right) => {
    const leftOrder = left.field === "task" ? -1 : FIELD_ORDER.indexOf(left.field);
    const rightOrder = right.field === "task" ? -1 : FIELD_ORDER.indexOf(right.field);
    return leftOrder - rightOrder || (left.start ?? Number.MAX_SAFE_INTEGER) - (right.start ?? Number.MAX_SAFE_INTEGER) || left.value.localeCompare(right.value);
  });
  return { ir, evidence };
}

export function naturalLanguageToIr(source: string, codebook: Codebook = coreCodebook): SemanticIR {
  return analyzeNaturalLanguage(source, codebook).ir;
}
