# SIL Conversion Examples

## 1. Feature addition

Input: Add a responsive login screen without breaking existing behavior. Do not hardcode secrets, and verify the change with tests.

```sil
task AddLoginScreen {
  goal: feature.add
  target: screen.login
  action: implement
  output: auth.session
  require: existing.behavior.preserve
  require: ui.responsive
  forbid: secret.hardcode
  forbid: change.breaking
  verify: login.success
  verify: tests.pass
}
```

## 2. Product search

Input: Build a fast product search that accepts a query and returns matching products. Never expose secrets.

```sil
task BuildProductSearch {
  goal: feature.add
  target: product.search
  action: implement
  input: user.query
  output: product.list
  require: response.fast
  forbid: secret.expose
}
```

## 3. Authentication

Input: Add authentication using email and password. Validate input, hash passwords, return safe errors, reject invalid credentials, and roll back on failure.

```sil
task AddAuthentication {
  goal: feature.add
  target: user.authentication
  action: implement
  input: user.email
  input: user.password
  output: auth.session
  require: password.hash
  require: input.validate
  require: error.safe
  forbid: secret.hardcode
  forbid: password.plaintext_store
  verify: login.success
  verify: invalid_credentials.reject
  on_failure: transaction.rollback
}
```

## 4. Summary

Input: Summarize the attached report concisely for executives. Preserve every fact and number, and do not invent source content.

```sil
task SummarizeExecutiveReport {
  goal: content.summarize
  target: report.executive
  action: summarize
  input: attachment.report
  output: summary.executive
  require: facts.preserve
  require: numbers.preserve
  prefer: output.concise
  forbid: source.content.invent
  verify: summary.source_consistent
}
```

If a reference such as `report.executive` is unregistered, preserve it instead of replacing it with `instruction.request`.

## 5. EN-to-ES learning sets

Input: Based on the languages currently available in this app and the EN-to-ES knowledge files, create every possible knowledge set for the language-learning set maker.

```sil
task CreateLanguageLearningKnowledgeSets {
  goal: knowledge_set.generate
  target: language_learning.sets
  action: generate
  input: app.languages.available
  input: knowledge_files.en_es
  output: knowledge_sets.complete
  require: language_pair.en_es
  require: coverage.exhaustive
  require: source.knowledge_files_use
  forbid: source.content.invent
  verify: supported_languages.covered
  verify: knowledge_sets.no_missing_combination
  verify: output.schema.valid
}
```

Warning example: if `knowledge_set.generate` or another reference is absent from the current Core v0.1 registry, identify it as unregistered, preserve it in lossless form, and treat it as a possible future codebook extension. Never infer registration from the size of the 10,000-entry codebook.

## 6. API change

Input: Update the API endpoint, validate every input, keep errors safe, and do not introduce a breaking change.

```sil
task UpdateApiEndpoint {
  goal: feature.add
  target: api.endpoint
  action: modify
  require: input.validate
  require: error.safe
  forbid: change.breaking
  verify: tests.pass
}
```

## 7. Removal request

Input: Remove the legacy API without breaking clients that still use it.

```sil
task RemoveLegacyApi {
  goal: api.legacy.remove
  target: api.legacy_endpoint
  action: delete
  require: existing.clients.preserve
  forbid: change.breaking
  verify: clients.compatibility.pass
}
```

## 8. Ambiguous request

Input: Create everything.

Do not generate SIL yet. Ask what should be created, which inputs must be used, and what scope "everything" covers. Automatically producing `feature.add / instruction.request / implement` would not preserve the source meaning.

## 9. Technical documentation with proper-name context

Input: Create a guide on how to implement SIL on Ollama with Qwen3.6.

```sil
task ProjectDocumentationTask {
  goal: documentation.create
  target: project.documentation
  action: documentation.create
  input: language.sil
  input: platform.ollama
  input: model.qwen3_6
  output: documentation.artifact
}
```

This conversion preserves every technical name and the model version. It may still be blocked for execution readiness because the source did not define verification, constraints, or failure handling.

## 10. Unknown brand context

Input: Build an integration for AcmeCloud using NovaSDK.

```sil
task BuildAcmeCloudIntegration {
  goal: integration.create
  target: integration.service
  action: integration.create
  input: context.acmecloud
  input: context.novasdk
  output: integration.artifact
}
```

The `context.*` references are intentionally precise extensions unless the current codebook proves otherwise.

## JSON IR example

```json
{
  "version": "0.1",
  "taskId": "BuildProductSearch",
  "goal": "feature.add",
  "target": "product.search",
  "action": "implement",
  "inputs": ["user.query"],
  "outputs": ["product.list"],
  "required": ["response.fast"],
  "preferred": [],
  "forbidden": ["secret.expose"],
  "verification": [],
  "failureHandling": [],
  "metadata": {
    "sourceLanguage": "en",
    "warnings": []
  }
}
```
