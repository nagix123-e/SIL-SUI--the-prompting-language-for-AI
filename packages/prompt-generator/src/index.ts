import type { SemanticIR } from "../../semantic-ir/src/index";

function lines(title: string, values: string[]): string[] {
  return values.length ? [title, ...values.map((value) => `- ${value}`)] : [];
}

export function generatePrompt(ir: SemanticIR): string {
  const sections = [
    `Task: ${ir.taskId}`,
    "",
    "Objective",
    `- Goal: ${ir.goal ?? "unspecified"}`,
    `- Target: ${ir.target ?? "unspecified"}`,
    `- Action: ${ir.action ?? "unspecified"}`,
    ...lines("\nInputs", ir.inputs),
    ...lines("\nExpected outputs", ir.outputs),
    ...lines("\nRequirements", ir.required),
    ...lines("\nPreferences", ir.preferred),
    ...lines("\nProhibitions", ir.forbidden),
    ...lines("\nVerification", ir.verification),
    ...lines("\nIf the task fails", ir.failureHandling),
  ];
  return `${sections.join("\n").trim()}\n`;
}

export function generateMarkdownPrompt(ir: SemanticIR): string {
  return generatePrompt(ir)
    .replace(/^Task: (.+)$/m, "# $1")
    .replace(/^Objective$/m, "## Objective")
    .replace(/^(Inputs|Expected outputs|Requirements|Preferences|Prohibitions|Verification|If the task fails)$/gm, "## $1");
}

export function generateJsonPrompt(ir: SemanticIR): string {
  return JSON.stringify(ir, null, 2);
}
