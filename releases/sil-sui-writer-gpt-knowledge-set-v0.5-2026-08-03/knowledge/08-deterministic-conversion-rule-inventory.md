# Deterministic English Conversion Rule Inventory

## Structured labels

The converter recognizes these case-insensitive labels, optionally preceded by Markdown `#`, `##`, or `###`:

| Field | Labels |
| --- | --- |
| goal | Goal, Objective, Outcome |
| target | Target, Scope, Component |
| action | Action, Operation |
| input | Input, Inputs, Context |
| output | Output, Outputs, Deliverable, Deliverables |
| require | Requirement, Requirements, Constraint, Constraints |
| prefer | Preference, Preferences, Preferred |
| forbid | Forbidden, Prohibition, Prohibitions, Do not |
| verify | Verification, Verify, Checks, Acceptance criteria |
| on_failure | On failure, Failure handling, Recovery |

Bullet markers `-`, `*`, `+`, and numbered lists are supported. Without bullets, lines, semicolons, commas, and suitable coordinated `and` phrases separate items. Only the first item is retained for goal, target, and action.

The explicit label controls the normal candidate namespace. Unmatched structured items become readable lossless extension references. Technical-name context and documentation-artifact enrichment are retained even when mentioned inside `Goal:`.

## Built-in phrase mappings

### Goal

- summarize/summarise -> `content.summarize`
- classify -> `content.classify`
- fix/repair/resolve a bug, defect, or issue -> `bug.fix`
- add/build/create/implement -> `feature.add`
- create/write/generate/produce/build a guide, tutorial, manual, documentation, or instructions -> `documentation.create`

### Target

- login screen/page/form/view -> `screen.login`
- user authentication/auth/login -> `user.authentication`
- product search -> `product.search`
- API endpoint/endpoint -> `api.endpoint`
- project documentation/docs -> `project.documentation`
- guide/tutorial/manual/documentation/instructions -> `project.documentation`

### Action

- update/modify/edit/change/fix -> `modify`
- delete/remove -> `delete`
- add/build/create/implement -> `implement`
- create a documentation artifact -> `documentation.create`

### Input

- user/search/text query -> `user.query`
- user email/email address -> `user.email`
- user password/password -> `user.password`
- category filter -> `category.filter`
- page size -> `pagination.page_size`
- pagination/next/starting cursor -> `pagination.cursor`
- repository/repo/source files -> `repository.files`

### Output

- product list/list of products -> `product.list`
- authenticated/authentication session -> `auth.session`
- next/pagination cursor -> `pagination.next_cursor`
- code patch/changed files -> `code.patch`
- test/verification report -> `test.report`
- guide/tutorial/manual/documentation/instructions -> `documentation.artifact`

### Require

- preserve/keep existing behavior or without breaking it -> `existing.behavior.preserve`
- responsive UI/layout/design -> `ui.responsive`
- fast response/low latency -> `response.fast`
- validate inputs or known request values -> `input.validate`
- hash passwords -> `password.hash`
- safe errors -> `error.safe`
- backward compatibility -> `existing.behavior.preserve`
- type-safe/strict types -> `type.safety`
- preserve/keep schema -> `schema.preserve`

### Prefer

- simple code/implementation/solution -> `code.simple`
- minimal/smallest change, patch, diff, implementation -> `change.minimal`
- modular design/architecture/implementation/code -> `architecture.modular`

### Forbid

- secret exposure -> `secret.expose`
- hardcoded secrets -> `secret.hardcode`
- breaking changes -> `change.breaking`
- plaintext password storage -> `password.plaintext_store`
- modifying checkout API/endpoint -> `checkout_api.modify`
- modifying unrelated files -> `unrelated_files.modify`
- adding a new dependency -> `dependency.add`

### Verify

- tests/test suite pass -> `tests.pass`
- successful login/login succeeds -> `login.success`
- reject invalid credentials -> `invalid_credentials.reject`
- unit tests -> `unit_tests.pass`
- integration tests -> `integration_tests.pass`
- build passes -> `build.pass`
- typecheck passes -> `typecheck.pass`
- lint passes/no lint errors -> `lint.pass`
- stable pagination order -> `pagination.order_stable`

### On failure

- roll back transaction -> `transaction.rollback`
- roll back/revert change, edit, patch, or work -> `change.rollback`
- preserve diagnostics/keep logs -> `diagnostics.preserve`
- abort/stop/halt/do not continue -> `task.abort`

If no failure phrase matches, always append the registered default `on_failure: task.abort`. A generated task must never have an empty failure-handling set.

## Numeric parameters

- latency under/below/within/at most/no more than N ms|seconds -> `latency.max_<N>_<unit>` in require and, where verification language applies, verify;
- timeout N ms|seconds|minutes -> `timeout.max_<N>_<unit>`;
- coverage at least/no less than N percent -> `coverage.min_<N>_percent`;
- N ms|seconds latency budget -> `latency.max_<N>_<unit>` in verify;
- page size N -> `pagination.page_size_<N>`;
- return/limit/max/at most N items|records|results|products -> `result.max_<N>_<noun>`;
- retry N times -> `retry.max_<N>`;
- retry once/allow one retry -> `retry.max_1`.

Decimal points become `_`. Units normalize to `ms`, `seconds`, or `minutes`.

## Negation and frames

Positive rules are suppressed within the same negated scope for `do not`, `does not`, `must not`, `should not`, `never`, `without`, `avoid`, `prevent`, `forbid`, `no`, and `not`. Prohibition and selected preservation rules deliberately accept negated phrasing.

Clause and action frames prevent concept/variant words from unrelated coordinated actions from being paired. Whole-word matching prevents substrings such as auth in author, test in contest, and fast in breakfast.

## Codebook composition

Generated presets are candidates only when all key components appear in one compatible clause and the namespace has an appropriate cue. Contiguous and shorter-span matches score higher. Target concept compatibility boosts matching goal and action candidates.

## Proper names and documentation enrichment

Known technical terms and detected proper nouns become `input` context. Model versions are preserved. A known term under `Target:` also becomes `technology.<term>`. Documentation nouns add `project.documentation` and `documentation.artifact`; creation phrasing adds `documentation.create` to goal and action.

## Selection and fallback

- goal, target, and action select one highest-ranked candidate;
- repeated fields remove duplicate values and overlapping evidence spans;
- selected repeated fields return to source order;
- ordinary repeated namespaces retain up to eight candidates;
- input retains up to 64 candidates for technical/proper-name context;
- no matched goal -> `task.execute`;
- no matched target -> `instruction.request`;
- no matched action -> `implement`.

Fallback values are evidence kind `default` and are readiness gaps, not proof of sufficient semantics.
