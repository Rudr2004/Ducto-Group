# Stage 2 integration plan

**Microsoft 365 (Graph).** Entra ID app registration, app-only. Permissions: `Mail.Read` (restricted with an Application Access Policy to procurement mailboxes), `Sites.Read.All` (or `Sites.Selected` for the procurement site), `User.Read.All` for the people directory. Delta queries per mailbox for backfill plus change-notification webhooks for new mail. Messages are fetched as MIME and fed to the same `SourceDoc` pipeline; Message-ID dedupe already handles the same email in many mailboxes. Approval: Dutco IT Applications Head.

**OBT.** Scheduled pull of the OBT export/API (submission, approval, returned/rejected, OBT Ref). Same fields as the simulated CSV.

**DocuSign.** Connect webhook (envelope sent / completed / declined / voided) with HMAC verification; eSignature API for backfill. Envelope IDs map to packages exactly as in the simulator.

**Platform.** SSO via Entra ID replaces the role switcher; the role guard moves into the API; Postgres replaces in-memory state; Teams alerts alongside email; multi-project and division rollout.
