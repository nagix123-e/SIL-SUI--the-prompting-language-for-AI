# Semantic UI Language v0.1 — Legacy SUI Compatibility Specification

> New SUI output uses v0.4 nested components and four-space indentation. This file preserves v0.1 brace-syntax input compatibility; see `13-v0.4-bounded-loops.md` for collection rendering and `12-v0.3-pythonic-contracts.md` for the shared contract model.

## Purpose and boundary

SUI is a declarative DSL for a UI's screen identity, layout, components, visual behavior, interactions, UI constraints, and UI acceptance criteria. It is not CSS, HTML, JSX, executable code, or an authorization to edit an interface.

Use SIL for task intent, deliverables, non-UI constraints, and execution contracts. Use SUI for the UI design that implements a SIL task. When both are needed, emit an indented SIL `task` followed by an indented SUI `ui` block, and reference the UI specification from SIL with `input: ui_spec.<ui_name>`.

## Grammar

```ebnf
Program       = Ui ;
Ui            = "ui", Identifier, "{", { Statement }, "}" ;
Statement     = Field, ":", SemanticRef, [ ";" ] ;
Field         = "screen" | "layout" | "component" | "content" | "style"
              | "interaction" | "constraint" | "state" | "verify" | "on_failure" ;
SemanticRef   = Identifier, { ".", Identifier } ;
Identifier    = Letter, { Letter | Digit | "_" } ;
```

## Fields and order

| Field | Meaning | Cardinality |
| --- | --- | --- |
| `screen` | Screen, route, panel, or modal being specified | One |
| `layout` | Positional relationship or spatial structure | Many |
| `component` | Visible UI building block | Many; at least one |
| `content` | Textual, data, or information content | Many |
| `style` | Visual treatment, tokens, or semantic color behavior | Many |
| `interaction` | User action and resulting UI behavior | Many |
| `constraint` | Mandatory UI invariant | Many |
| `state` | UI state, transition, or visibility condition | Many |
| `verify` | Observable UI acceptance condition | Many |
| `on_failure` | UI failure/recovery behavior | Many; at least one |

Write fields in the listed order. Use a PascalCase UI name and lowercase dotted `snake_case` references. Format every field with exactly two leading spaces.

## Conversion rules

- screen/page/view/modal/panel -> `screen`
- left/right/top/bottom/sidebar/width/stack/grid -> `layout`
- button/input/editor/list/sidebar/card/dialog -> `component`
- label/copy/message/value/placeholder -> `content`
- color/theme/spacing/typography/selected/disabled -> `style` or `state`
- click/drag/drop/type/hover/expand/collapse -> `interaction`
- must/always/only/accessible/responsive -> `constraint`
- visible/open/loading/empty/error/selected -> `state`
- acceptance behavior, keyboard behavior, or visual result -> `verify`
- UI error, unavailable input, or interaction failure -> `on_failure`

Preserve exact proper nouns and technologies as precise references. SUI does not use the SIL core codebook; do not claim a SUI reference is registered simply because it sounds plausible.

## Example

```sui
ui PromptEditor {
  screen: prompt_editor
  layout: sidebar.left_third
  layout: editor.center
  layout: sil_source.right

  component: prompt_block_library
  component: english_prompt_editor
  component: sil_source_editor

  style: block.category_color_coded
  interaction: block.click_insert_at_caret
  interaction: block.drag_drop_insert
  constraint: sidebar.collapsible

  verify: click.inserts_at_current_caret
  verify: drag_drop.inserts_at_drop_caret
  on_failure: task.abort
}
```
