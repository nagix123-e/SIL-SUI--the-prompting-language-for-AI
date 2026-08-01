import type { PromptBlockKind } from "../../compiler/src/prompt-blocks";

export interface SuiBlock {
  id: string;
  label: string;
  field: string;
  reference: string;
  insertText: string;
  kind: PromptBlockKind;
  weight: number;
}

export interface SuggestedSuiBlock { block: SuiBlock; reason: string; score: number; }

const definitions: Array<{ field: string; kind: PromptBlockKind; values: readonly string[]; template?: (reference: string) => string }> = [
  { field: "screen", kind: "structure", values: ["app_shell", "dashboard", "settings", "profile", "login", "signup", "onboarding", "prompt_editor", "chat", "search", "detail", "list", "table", "form", "modal", "drawer", "wizard", "empty_state", "error_state", "mobile_view"] },
  { field: "layout", kind: "structure", values: ["sidebar.left", "sidebar.left_third", "sidebar.right", "header.top", "footer.bottom", "editor.center", "panel.right", "split.horizontal", "split.vertical", "grid.two_column", "grid.three_column", "stack.vertical", "stack.horizontal", "content.centered", "content.full_width", "content.max_width", "overlay.center", "drawer.end", "tabs.top", "responsive.reflow"] },
  { field: "component", kind: "noun", values: ["button.primary", "button.secondary", "button.icon", "input.text", "input.search", "input.textarea", "select.menu", "checkbox.group", "radio.group", "toggle.switch", "card.summary", "table.data", "list.item", "tabs.navigation", "breadcrumb.path", "modal.dialog", "drawer.panel", "toast.notification", "tooltip.help", "prompt_block_library"] },
  { field: "content", kind: "data", values: ["heading.title", "heading.section", "label.field", "label.required", "placeholder.search", "placeholder.prompt", "helper.text", "message.empty", "message.error", "message.success", "message.loading", "copy.description", "copy.instructions", "value.summary", "value.count", "value.status", "code.example", "image.avatar", "icon.semantic", "link.documentation"] },
  { field: "style", kind: "grammar", values: ["theme.light", "theme.dark", "color.category_coded", "color.semantic_success", "color.semantic_warning", "color.semantic_error", "color.focus_ring", "typography.body", "typography.heading", "spacing.compact", "spacing.comfortable", "radius.medium", "border.subtle", "shadow.elevated", "surface.panel", "surface.canvas", "state.disabled", "state.selected", "state.hover", "motion.reduced"] },
  { field: "interaction", kind: "verb", values: ["button.click_submit", "button.click_cancel", "field.type_text", "field.clear", "menu.select_option", "tab.switch", "modal.open", "modal.close", "drawer.toggle", "sidebar.collapse", "sidebar.expand", "block.click_insert_at_caret", "block.drag_drop_insert", "list.reorder_drag", "item.delete", "item.edit", "search.filter_results", "keyboard.submit", "keyboard.escape_close", "clipboard.copy"] },
  { field: "constraint", kind: "constraint", values: ["layout.responsive", "sidebar.collapsible", "keyboard.accessible", "screen_reader.labeled", "focus.visible", "focus.trapped_in_modal", "contrast.aa", "touch.target_minimum", "content.no_overflow", "form.validation_visible", "error.actionable", "loading.nonblocking", "empty_state.informative", "selection.preserved", "drag_drop.precise", "input.caret_preserved", "state.persisted", "navigation.consistent", "motion.respects_preference", "copy.english_only"] },
  { field: "state", kind: "logic", values: ["view.default", "view.loading", "view.empty", "view.error", "view.success", "sidebar.expanded", "sidebar.collapsed", "modal.open", "modal.closed", "form.pristine", "form.dirty", "form.valid", "form.invalid", "button.enabled", "button.disabled", "selection.active", "drag.active", "drop.targeted", "toast.visible", "network.offline"] },
  { field: "render_each", kind: "logic", values: ["collection.bounded"], template: () => "    render_each Item:\n        over: output.items\n        as: item\n        key: item.id\n        max_items: 100\n        component ItemRow:\n            kind: row\n" },
  { field: "verify", kind: "verification", values: ["render.complete", "layout.responsive", "keyboard.navigable", "focus.order_correct", "contrast.aa", "screen_reader.labeled", "click.inserts_at_current_caret", "drag_drop.inserts_at_drop_caret", "sidebar.collapses", "sidebar.expands", "modal.focus_trapped", "form.error_visible", "form.submit_enabled", "loading.visible", "empty_state.visible", "error_state.actionable", "mobile.reflows", "copy.available", "state.persists", "no_horizontal_overflow"] },
  { field: "on_failure", kind: "recovery", values: ["task.abort", "diagnostics.preserve", "ui.show_error_state", "ui.show_retry_action", "form.preserve_input", "navigation.keep_current_view", "modal.close_safely", "drawer.close_safely", "toast.show_failure", "network.show_offline_state", "request.retry_once", "request.cancel", "state.restore_previous", "selection.clear_safely", "drag.cancel", "upload.keep_pending", "validation.focus_first_error", "fallback.show_empty_state", "support.show_help_link", "log.capture_event"] },
];

export const SUI_BLOCKS: readonly SuiBlock[] = definitions.flatMap(({ field, kind, values }) =>
  values.map((reference, index) => ({
    id: `sui-${field}-${reference.replace(/\./g, "-")}`,
    label: reference,
    field,
    reference,
    insertText: definitions.find((definition) => definition.field === field)?.template?.(reference) ?? `  ${field}: ${reference}\n`,
    kind,
    weight: 100 - index,
  })),
);

export const SUI_BLOCK_FIELDS = definitions.map(({ field }) => field);
export const SUI_BLOCK_FIELD_LABELS: Record<string, string> = Object.fromEntries(
  definitions.map(({ field }) => [field, field.replace(/_/g, " ")]),
);

export function suggestSuiBlocks(source: string, limit = 4): SuggestedSuiBlock[] {
  const lower = source.toLowerCase();
  const existing = new Set(Array.from(source.matchAll(/^\s*([a-z_]+):\s*([^\s;]+)/gm), (match) => `${match[1]}:${match[2]}`));
  return SUI_BLOCKS
    .filter((block) => !existing.has(`${block.field}:${block.reference}`))
    .map((block) => {
      const fieldMissing = !new RegExp(`^\\s*${block.field}:`, "m").test(source);
      const related = lower.includes(block.field) || lower.includes(block.reference.split(".")[0]);
      return { block, reason: fieldMissing ? `Missing ${block.field}` : related ? "Fits current UI" : "UI preset", score: (fieldMissing ? 100 : 0) + (related ? 20 : 0) + block.weight / 100 };
    })
    .sort((a, b) => b.score - a.score || a.block.id.localeCompare(b.block.id))
    .slice(0, limit);
}
