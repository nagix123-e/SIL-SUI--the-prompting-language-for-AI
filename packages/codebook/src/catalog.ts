import {
  PROMPT_COLOR_CATEGORY,
  type CodebookEntry,
  type PromptColorCategory,
  type StatementKind,
} from "../../semantic-ir/src/index";

export const CODEBOOK_VERSION = "0.1";
export const ENTRIES_PER_NAMESPACE = 1_000;

export const CODE_PREFIXES: Record<StatementKind, string> = {
  goal: "G",
  target: "T",
  action: "A",
  input: "I",
  output: "O",
  require: "R",
  prefer: "P",
  forbid: "X",
  verify: "V",
  on_failure: "F",
};

export const CODEBOOK_COLOR_CATEGORY_BY_NAMESPACE: Record<StatementKind, PromptColorCategory> = {
  goal: PROMPT_COLOR_CATEGORY.verb,
  target: PROMPT_COLOR_CATEGORY.noun,
  action: PROMPT_COLOR_CATEGORY.verb,
  input: PROMPT_COLOR_CATEGORY.data,
  output: PROMPT_COLOR_CATEGORY.data,
  require: PROMPT_COLOR_CATEGORY.constraint,
  prefer: PROMPT_COLOR_CATEGORY.constraint,
  forbid: PROMPT_COLOR_CATEGORY.constraint,
  verify: PROMPT_COLOR_CATEGORY.verification,
  on_failure: PROMPT_COLOR_CATEGORY.recovery,
};

const concepts = [
  "account",
  "authentication",
  "authorization",
  "profile",
  "session",
  "organization",
  "team",
  "membership",
  "role",
  "permission",
  "audit",
  "notification",
  "message",
  "comment",
  "attachment",
  "document",
  "media",
  "image",
  "video",
  "audio",
  "search",
  "recommendation",
  "catalog",
  "product",
  "inventory",
  "order",
  "cart",
  "checkout",
  "payment",
  "invoice",
  "subscription",
  "pricing",
  "discount",
  "tax",
  "shipment",
  "delivery",
  "return",
  "refund",
  "support",
  "ticket",
  "knowledge",
  "analytics",
  "report",
  "dashboard",
  "metric",
  "event",
  "log",
  "trace",
  "alert",
  "workflow",
  "job",
  "queue",
  "scheduler",
  "cache",
  "database",
  "record",
  "schema",
  "migration",
  "backup",
  "restore",
  "api",
  "endpoint",
  "webhook",
  "integration",
  "connector",
  "import",
  "export",
  "synchronization",
  "batch",
  "stream",
  "file",
  "folder",
  "secret",
  "credential",
  "key",
  "token",
  "policy",
  "configuration",
  "feature",
  "experiment",
  "localization",
  "accessibility",
  "performance",
  "reliability",
  "security",
  "privacy",
  "compliance",
  "deployment",
  "release",
  "build",
  "test",
  "documentation",
  "onboarding",
  "billing",
  "usage",
  "quota",
  "tenant",
  "workspace",
  "project",
  "task",
  "calendar",
  "contact",
  "campaign",
  "segment",
  "audience",
  "template",
  "form",
  "field",
  "validation",
  "error",
  "network",
  "request",
  "response",
  "service",
  "worker",
  "model",
  "dataset",
  "pipeline",
  "index",
  "query",
] as const;

interface Variant {
  key: string;
  label: string;
}

interface NamespaceFamily {
  variants: readonly Variant[];
  describe: (concept: string, variant: Variant) => string;
}

const namespaceFamilies: Record<StatementKind, NamespaceFamily> = {
  goal: {
    variants: [
      ["create", "Create"],
      ["update", "Update"],
      ["remove", "Remove"],
      ["analyze", "Analyze"],
      ["optimize", "Optimize"],
      ["secure", "Secure"],
      ["migrate", "Migrate"],
      ["automate", "Automate"],
      ["monitor", "Monitor"],
      ["document", "Document"],
    ].map(([key, label]) => ({ key, label })),
    describe: (concept, variant) => `${variant.label} ${concept} as the task objective`,
  },
  target: {
    variants: ["service", "interface", "workflow", "pipeline", "storage", "model", "policy", "configuration", "report", "endpoint"].map(
      (key) => ({ key, label: key }),
    ),
    describe: (concept, variant) => `${title(concept)} ${variant.label}`,
  },
  action: {
    variants: [
      ["create", "Create"],
      ["read", "Read"],
      ["update", "Update"],
      ["delete", "Delete"],
      ["validate", "Validate"],
      ["transform", "Transform"],
      ["synchronize", "Synchronize"],
      ["publish", "Publish"],
      ["archive", "Archive"],
      ["restore", "Restore"],
    ].map(([key, label]) => ({ key, label })),
    describe: (concept, variant) => `${variant.label} the ${concept}`,
  },
  input: {
    variants: ["id", "request", "payload", "query", "filter", "options", "metadata", "credentials", "event", "file"].map(
      (key) => ({ key, label: key }),
    ),
    describe: (concept, variant) => `${title(concept)} ${variant.label} input`,
  },
  output: {
    variants: ["result", "record", "list", "summary", "report", "status", "event", "artifact", "response", "error"].map(
      (key) => ({ key, label: key }),
    ),
    describe: (concept, variant) => `${title(concept)} ${variant.label} output`,
  },
  require: {
    variants: ["available", "consistent", "encrypted", "validated", "authorized", "observable", "idempotent", "scalable", "accessible", "documented"].map(
      (key) => ({ key, label: key }),
    ),
    describe: (concept, variant) => `Require ${concept} to be ${variant.label}`,
  },
  prefer: {
    variants: ["simple", "modular", "reusable", "efficient", "readable", "minimal", "explicit", "portable", "testable", "maintainable"].map(
      (key) => ({ key, label: key }),
    ),
    describe: (concept, variant) => `Prefer ${variant.label} ${concept}`,
  },
  forbid: {
    variants: ["exposure", "corruption", "duplication", "leakage", "downgrade", "bypass", "timeout", "deadlock", "regression", "data_loss"].map(
      (key) => ({ key, label: key.replace("_", " ") }),
    ),
    describe: (concept, variant) => `Prevent ${variant.label} involving ${concept}`,
  },
  verify: {
    variants: ["created", "updated", "deleted", "accepted", "rejected", "persisted", "emitted", "recovered", "authorized", "rendered"].map(
      (key) => ({ key, label: key }),
    ),
    describe: (concept, variant) => `Verify ${concept} is ${variant.label}`,
  },
  on_failure: {
    variants: [
      ["rollback", "Roll back"],
      ["retry", "Retry"],
      ["abort", "Abort"],
      ["compensate", "Compensate"],
      ["restore", "Restore"],
      ["notify", "Notify"],
      ["quarantine", "Quarantine"],
      ["fallback", "Use a fallback"],
      ["escalate", "Escalate"],
      ["log", "Log"],
    ].map(([key, label]) => ({ key, label })),
    describe: (concept, variant) => `${variant.label} after a ${concept} failure`,
  },
};

function title(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}

export function expandCodebookEntries(seedEntries: readonly CodebookEntry[]): CodebookEntry[] {
  const namespaces = Object.keys(CODE_PREFIXES) as StatementKind[];
  const result: CodebookEntry[] = [];

  for (const namespace of namespaces) {
    const entries = seedEntries.filter((entry) => entry.namespace === namespace).map((entry) => ({
      ...entry,
      aliases: [...entry.aliases],
      colorCategory: CODEBOOK_COLOR_CATEGORY_BY_NAMESPACE[namespace],
    }));
    const keys = new Set(entries.map((entry) => entry.key));
    const codes = new Set(entries.map((entry) => entry.code));
    const family = namespaceFamilies[namespace];
    let candidateIndex = 0;

    for (const concept of concepts) {
      for (const variant of family.variants) {
        const code = `${CODE_PREFIXES[namespace]}${String(10_000 + candidateIndex).padStart(5, "0")}`;
        candidateIndex += 1;
        if (concept === variant.key) continue;

        const key = `${concept}.${variant.key}`;
        if (keys.has(key) || codes.has(code)) continue;
        entries.push({
          id: `${namespace}.${key}`,
          namespace,
          key,
          code,
          description: family.describe(concept, variant),
          aliases: [key.replaceAll(".", "_")],
          colorCategory: CODEBOOK_COLOR_CATEGORY_BY_NAMESPACE[namespace],
          version: CODEBOOK_VERSION,
          status: "active",
        });
        keys.add(key);
        codes.add(code);
        if (entries.length === ENTRIES_PER_NAMESPACE) break;
      }
      if (entries.length === ENTRIES_PER_NAMESPACE) break;
    }

    if (entries.length !== ENTRIES_PER_NAMESPACE) {
      throw new Error(`Generated ${entries.length} ${namespace} entries; expected ${ENTRIES_PER_NAMESPACE}.`);
    }
    result.push(...entries);
  }

  return result;
}
