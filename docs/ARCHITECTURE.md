# Architecture

```
src/domain     pure: milestones, dates (Asia/Dubai, working days), engine (planned modes, status, health, forecast, attribution, compliance)
src/lib        excelImport (header-by-text, quirks), excelExport (Dutco layout), audit (sha-256 hash chain), parsers (.eml, events), hooks
src/pipeline   synth (generator + ground truth), match (noise → dedupe → thread → features → candidates → AI → decide → validate), run (aggregate, evaluate)
src/store      application state + the only write path; role guard on every mutation, every change audited
src/pages      Dashboard, Schedule, Exceptions, Alerts, Evidence, Data quality, Accuracy, Audit, Settings, Ingest
server/        Node service: Claude classification (strict JSON, temperature 0, cached system prompt, retries, token usage) and SMTP digest
```

**Decision rule.** Auto-commit only when a deterministic anchor exists (exact name+instance, unique ref, linked thread, unique bidder, learned rule, or system ID) **and** rules and AI agree on package and milestone **and** confidence ≥ threshold (0.90) **and** validation passes. Otherwise the item goes to the admin-only Exception Queue with a reason code. System events (DocuSign/OBT/SharePoint with IDs) commit deterministically.

**Provenance.** `ActualRecord.source` is SYSTEM, LEGACY or ADMIN. Display priority ADMIN > SYSTEM > LEGACY; superseded values are kept and shown. Views are recomputed as at the selected date; evidence dated later is "not yet".

**Sources.** Each source produces `SourceDoc`s; Stage 2 connectors (Graph, OBT API, DocuSign Connect) produce the same shape, so matching code does not change.
