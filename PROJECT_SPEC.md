# Dutco Procurement Control Tower — POC Project Specification

**Client:** Dutco Group (Jebel Ali, Dubai) — Procurement, Strategic Excellence
**Client contact:** Jassim, Strategic Excellence Manager, Procurement (also the system administrator and alert recipient)
**Vendor:** SoluLab
**Document version:** 1.0 — 23 October 2026
**Build target:** Stage 1 POC (offline, demo-ready), architected so Stage 2 (live integrations) plugs in without rework.

---

## 0. How to use this document

This is the single source of truth for building the POC. Read it fully before writing code. Everything Dutco has told us so far is captured here, along with the sample data they shared (in `sample_data/`).

- Sections marked **[DECIDED]** are confirmed by Dutco. Do not change them.
- Sections marked **[DEFAULT]** are our best assumption while we wait for Dutco's answer. Build them as **configurable settings**, so the answer can be applied by changing a setting, not code.
- Section 18 lists every open question with the default to use.

---

## 1. Business context

Dutco Group is a tier-one UAE contractor (≈80 years, ≈10,000 staff) in construction, infrastructure and marine. Procurement serves three divisions: **DCC** (Dutco Construction Company), **DCC MEP** (MEP division — full name to be confirmed) and **DIJ** (Dutco Interior & Joinery).

For each project, procurement buys 50–100+ **work packages** (subcontracts and supply — e.g. Facade, Lifts, Waterproofing, Painting). Each package moves through **15 milestones** from receiving the tender package from the project team to issuing the award. Each milestone has an internal **SLA** (allowed days).

**Today:** 60+ procurement staff track 15–20 live projects in one Excel tracker per project. Every *actual* date is typed in by hand after checking Outlook, SharePoint, the Online Bid Tool (OBT) or DocuSign.

**Problems:**
1. **Time** — non-value-adding manual updating.
2. **Accuracy** — dates are missing, wrong or out of sequence (proven by the sample file, see §6.4).
3. **Integrity** — the people whose SLA performance is measured are the ones typing the dates. Dates can be changed to hide delays, and nobody can check.
4. **Visibility** — leadership cannot see where delays originate (project team vs procurement vs suppliers vs approvers).

---

## 2. Goals, non-negotiables and success criteria

### 2.1 Non-negotiables [DECIDED — from Dutco, verbatim intent]
1. **Automatic capture** — actual dates are fetched from source systems (Outlook, SharePoint, OBT, DocuSign), never typed by the procurement team.
2. **Accuracy** — dates must be right; the team must never need to go back and verify them.
3. **No manual editing by the team** — procurement users have **no edit rights** on dates. Tamper-proof.
4. **No review burden on the team** — the team is never asked to review/confirm dates.

### 2.2 How we reconcile "foolproof" with real-world ambiguity [DECIDED in understanding doc]
- Matching is **deterministic first** (reference codes, known threads, known suppliers, system events) and **AI second** (Claude) — AI resolves ambiguity, and both must agree for auto-commit.
- Anything the system is not sure about goes to an **Exception Queue handled only by the Administrator (Jassim)** — never the procurement team.
- Corrections are **admin-only**, require a **reason + evidence link**, and are permanently visible in a **hash-chained, append-only audit log**. The original captured value is never destroyed.

### 2.3 POC success criteria [DECIDED]
"Avoiding manual entry completely and having a foolproof system."
Measured in the POC as:
- **0 manual date entries** for the demo packages.
- **≥ 98% milestone-date accuracy** against ground truth on the evaluation email set (shown live on an Accuracy page).
- **0 silent wrong commits** in the evaluation set: every error either does not occur or lands in the Exception Queue.
- Every captured date has a **clickable evidence link** to its source.

---

## 3. Scope

### 3.1 Stage 1 — build now (this POC)
Offline, using the sample schedule and email files. No live tenant access.
- Import the Dutco Excel schedule (`.xlsm`/`.xlsx`) including SLA master list.
- Ingest emails from a **drop folder / upload** (`.eml` and `.msg`), plus simulated **SharePoint**, **DocuSign** and **OBT** event files (JSON/CSV).
- Matching pipeline (rules + Claude) → milestone events → actual dates with evidence and confidence.
- Planned dates, SLA status, package status, delay attribution.
- Live Procurement Schedule, Package detail with evidence timeline, Leadership Dashboard, Exception Queue, Alerts, Audit Log, Data Quality, Accuracy (evaluation), Settings.
- Email alerts to the admin (via local SMTP catcher — Mailpit — in the POC).
- Export back to Dutco's Excel layout.
- **Synthetic email generator** that produces realistic emails + ground truth from the sample schedule, including deliberate edge cases.
- "As-of date" time travel for demos.

### 3.2 Stage 2 — design for, stub now
- Microsoft 365 via Microsoft Graph (individual mailboxes, app-only permissions, delta queries / webhooks). Approval by Dutco's IT Applications Head (after Stage 1).
- OBT API/export (Dutco has confirmed it exists; access after Stage 1).
- DocuSign Connect webhooks / eSignature API.
- SharePoint (Graph) for DTP/STP folder events.
- Multi-project, multi-division rollout, SSO (Entra ID).

Implement each source behind a common `SourceConnector` interface. Stage 2 connectors exist as **stubs** with a clear "Stage 2" state in the UI (Settings → Connectors).

### 3.3 Out of scope for the POC
Commercial evaluation, bid ranking, vendor management, cost/margin calculations (shown read-only if present in the import, not computed).

---

## 4. Domain model and terminology

### 4.1 Glossary
| Term | Meaning |
|---|---|
| DTP | Detail Tender Package — drawings, specs, BOQs sent by the project team to procurement as a SharePoint link |
| STP | Standard Tender Package — DTP + procurement's standard documents, shared with suppliers |
| RFP | Request for Proposal — the tender invitation sent to suppliers ("Float RFPs") |
| TQ | Technical Query (assumed — confirm) — supplier questions during tender |
| PTC | Post-Tender Clarification (assumed — confirm) |
| LAFO | Last And Final Offer (assumed — confirm) |
| Bid Tab | Bid tabulation — comparison sheet of supplier offers (initial and final) |
| TRF | Tender Review File — approval document, signed via DocuSign |
| OBT | Online Bid Tool — Dutco in-house approval portal; approval produces an **OBT Ref** number (e.g. `15202`) |
| LPO / LOA / SOA | Local Purchase Order / Letter of Award / (SOA — confirm) — the award document |
| Standard Reference No. | Dutco package type code, e.g. `D0729` = Facade. **Not unique per package** (split packages share it) |
| Package Manager | Procurement owner of the package |
| Reporting Period (w/e) | Week-ending date used in reports |

### 4.2 The 15 milestones [DECIDED — from the schedule]
Order matters. `sla_days_to_next` = days allowed between this milestone and the next one (the sheet's "Duration" column right after each date column). Default values below come from the SLA master list; **per-package values override** (looked up by Standard Reference No.).

| # | Key | Code | Name (as in sheet) | Stage | Package status label when this is the latest completed | Default SLA to next (days) | Stage-1 evidence source | Default delay owner |
|---|---|---|---|---|---|---|---|---|
| 1 | `dtp_received` | A4 | DTP Received | A: Post-Award Strategy | DTP Received | 2 | Email from project team with SharePoint DTP link | Project team |
| 2 | `stp_created` | A5 | STP Created | A | DTP Received | 1 | SharePoint folder event (simulated JSON) or email | Procurement |
| 3 | `provide_link_to_stp` | A6 | Provide Link to STP | A | DTP Received | 0 | Email sharing STP link | Procurement |
| 4 | `float_rfps` | B1 | Float RFPs | B: Tender | Out To Tender | 5 | Email(s) to external bidders | Procurement |
| 5 | `tq_process` | B2 | TQ Process | B | Out To Tender | 5 | Supplier TQ emails | Suppliers |
| 6 | `tqs_closed` | B3 | TQs Closed | B | Out To Tender | 1 | Last TQ response / closure email | Procurement |
| 7 | `initial_proposals_received` | B5 | Initial Proposals Received | B | Commercial Review | 3 | Supplier proposal emails | Suppliers |
| 8 | `initial_bid_tab` | C1 | Initial Bid Tab | C: Tender Review | Commercial Review | 2 | Email with bid tab attachment | Procurement |
| 9 | `ptc_process` | C2 | PTC Process | C | PTC Stage | 7 | PTC emails to bidders | Procurement |
| 10 | `ptc_closed` | C3 | PTC Closed | C | PTC Stage | 3 | Last PTC response / closure | Suppliers |
| 11 | `lafo_proposal_received` | C5 | LAFO Proposal Received | C | Final Negotiations | 1 | Supplier final offer emails | Suppliers |
| 12 | `final_bid_tab` | C6 | Final Bid Tab | C | Final Negotiations | 2 | Email with final bid tab | Procurement |
| 13 | `trf_created` | C7 | TRF Created | C | Final Negotiations | 2 | DocuSign envelope sent (simulated JSON) | Procurement |
| 14 | `uploaded_to_obt` | C8 | Uploaded to OBT (+ OBT Ref) | C | OBT Ongoing | 5 | OBT export (simulated CSV) | Approvers |
| 15 | `award_issued` | D1 | LPO / LOA / SOA Issue Date | D: Award | Awarded | 0 | DocuSign completed or award email | Procurement |

Default total = 39 days. Status before any milestone = **Awaiting DTP**.
Status order (pipeline): Awaiting DTP → DTP Received → Out To Tender → Commercial Review → PTC Stage → Final Negotiations → OBT Ongoing → Awarded.

### 4.3 Milestone date rules [DEFAULT — configurable per milestone]
The actual date of a milestone is a **calendar date in Asia/Dubai (UTC+4)** derived from evidence events. Each milestone has an **aggregation rule**:

| Milestone | Rule | Notes |
|---|---|---|
| dtp_received | FIRST qualifying event | Internal sender from project team, contains SharePoint link / "DTP" |
| stp_created | FIRST | SharePoint folder created, or email stating STP is ready |
| provide_link_to_stp | FIRST | First email sharing the STP link (may equal float_rfps date) |
| float_rfps | FIRST | First RFP/invitation email to ≥1 external bidder; record all invited bidders |
| tq_process | FIRST | First TQ from a bidder. **Optional**: if no TQ ever occurs and a later milestone exists → status `NOT_APPLICABLE` |
| tqs_closed | LAST before `initial_proposals_received`, or explicit "TQs closed" notice (explicit notice wins) | Optional, same as above |
| initial_proposals_received | LAST proposal received from invited bidders on or before the first `initial_bid_tab` event (configurable: FIRST / LAST / TENDER_DEADLINE) | Late bids after bid tab don't move the date |
| initial_bid_tab | FIRST bid tab circulated | Attachment name/content indicates comparison/bid tab |
| ptc_process | FIRST PTC sent | |
| ptc_closed | LAST PTC response, or explicit closure | |
| lafo_proposal_received | LAST LAFO received before `final_bid_tab` | |
| final_bid_tab | LAST bid tab revision before `trf_created` | Keep all revisions as evidence |
| trf_created | FIRST DocuSign envelope SENT for the TRF | Store COMPLETED date as `trf_approved` sub-event |
| uploaded_to_obt | OBT submission date; store OBT Ref and approval date | |
| award_issued | FIRST award document issued (DocuSign completed or email sending LOA/LPO/SOA to the vendor) | Record awarded vendor |

**Tender rounds:** if `float_rfps` evidence appears again **after** `initial_bid_tab` (re-tender), open **round 2** for that package. Milestones 4–15 then track the latest round; earlier rounds stay visible in the package history. SLA for the re-tendered steps restarts from round 2.

---

## 5. Planned dates, SLA status, package status, attribution

### 5.1 Planned date modes [DEFAULT = BACKWARD_FROM_AWARD, configurable, open question to Dutco]
- **BACKWARD_FROM_AWARD** (how the sample sheet actually works): each package has a **target award date** (planned D1, typed in the sheet). Planned date of milestone *i* = planned date of milestone *i+1* − `sla_days_to_next[i]`.
- **FORWARD_FROM_DTP** (how it was described on the call): planned DTP date is agreed at the strategy meeting; planned *i+1* = planned *i* + `sla_days_to_next[i]`.
- If the anchor is missing → planned dates are empty and the UI shows **"Plan not set"** (not an error).
- Day counting: **calendar days** [DEFAULT]. Setting allows **working days** with a UAE weekend (Sat–Sun) and a holiday list.
- Optional per-milestone **re-baseline** by admin only (reason required, audit logged). Original baseline is kept and shown.

### 5.2 Milestone SLA status (computed against the as-of date)
| Status | Rule |
|---|---|
| `DONE_ON_TIME` | actual ≤ planned |
| `DONE_LATE` | actual > planned (show +N days) |
| `DUE_SOON` | no actual, as-of ≤ planned, planned − as-of ≤ `due_soon_days` (default 2) |
| `OVERDUE` | no actual, as-of > planned (show N days overdue) |
| `UPCOMING` | no actual, planned further away |
| `NOT_APPLICABLE` | optional milestone that did not happen |
| `NO_PLAN` | no planned date |
| `SKIPPED_MISSING` | no actual, but a later milestone has an actual (data gap — flag) |

Also compute **step cycle time** (actual_i+1 − actual_i) vs SLA (sla_days_to_next[i]) — this is the fairest measure because it isolates who caused the delay.

### 5.3 Package status
Label of the **latest milestone (by process order) that has an actual date**, mapped via §4.2. Not by latest calendar date (the sheet's formula uses the max date, which mislabels packages with bad dates — e.g. MEP Services). If no actual → "Awaiting DTP". Plus a package **health**: On Track / At Risk / Delayed, from the worst current milestone status and forecast award date.

### 5.4 Forecast award date
Forecast = latest actual + sum of remaining SLAs (or planned award if later). Show slippage vs target award.

### 5.5 Delay attribution
For every step where cycle time > SLA, attribute the excess days to the **delay owner** of that step (§4.2 table, configurable). Leadership dashboard aggregates "days lost by owner" (Project team / Procurement / Suppliers / Approvers).

### 5.6 SLA compliance %
`steps completed within SLA / steps completed` — sliceable by division, project, category, package manager, milestone, stage, period.

---

## 6. Sample data (in `sample_data/`)

### 6.1 Files
| File | What it is |
|---|---|
| `Sample_Project_Doc.xlsm` | Original Dutco workbook (one live project, name withheld). Sheets: Project Information, Procurement Status Summary, **Procurement Schedule**, Procurement Strategy, Work Package Input, **Work Package Master List** |
| `schedule_packages.json` | Clean extraction of all 74 packages: planned + actual for all 15 milestones, SLA per step, manager, category, OBT ref, comments, sheet row numbers, bidders (from Strategy sheet) |
| `sla_master_list.csv` | 683 standard package types with SLA days per milestone |
| `work_package_input.csv` | Project package list with instances and package managers |
| `data_quality_findings.json` | 85 issues found in the existing manual data (see 6.4) |

The importer must read the **original `.xlsm`** directly (the JSON is for reference/tests). Use the JSON as the expected output in an importer test.

### 6.2 Excel layout (Procurement Schedule sheet)
- Header rows 7–11: row 7 = status label per milestone, row 8 = stage, row 9 = step code (A4…D1), row 11 = column headers.
- Each package uses **two rows**: row *r* = `Planned`, row *r+1* = `Actual` (column I says "Planned"/"Actual").
- Columns: B Sl.No, C Category, D Work Package, E Standard Reference No., F Preferred Vendor, G Package Manager, H Date Added, I Entry Type, then pairs (date, duration) from J to AK: J DTP Received/K, L STP Created/M, N Provide Link to STP/O, P Float RFPs/Q, R TQ Process/S, T TQs Closed/U, V Initial Proposals Received/W, X Initial Bid Tab/Y, Z PTC Process/AA, AB PTC Closed/AC, AD LAFO Proposal Received/AE, AF Final Bid Tab/AG, AH TRF Created/AI, AJ Uploaded to OBT/AK, AL OBT Ref, AM LPO/LOA/SOA Issue Date, AN Date of Last Action, AO Status, AP Comments.
- Planned dates are formulas (backward from AM, the typed target award date). Durations are `INDEX/MATCH` lookups into the Work Package Master List by Standard Reference No.
- Rows continue to ~159 with Sl.No up to 96 but **only 74 rows have a Work Package** — skip blank rows.
- Do **not** rely on cell positions blindly: locate the header row by matching header text, so slightly different project files still import.

### 6.3 Data quirks the importer must handle
- Dates as Excel serials or datetimes; strings with tabs/trailing spaces (`'\tAl Nahda'`, `'15004\t '`, `'Twic '`).
- OBT Ref sometimes on the Planned row, sometimes numeric, sometimes text with whitespace.
- Package manager name variants: `MUFFADAL` vs `MUFADDAL`, uppercase vs title case (`BASHEER` vs `Basheer`), and `SITE TEAM` used instead of a person → normalise via an alias table (Settings → People).
- **Shared Standard Reference No.** across split packages (Facade (1) & (2) both `D0729`; Painting (1)(2)(3) all `E0801`, etc.) → package identity = `project + work package name`, never the ref alone.
- Comments contain award notes like "Awarded with TWIC", and some contradict the Strategy sheet (Waterproofing (1)/(2) vendor appears swapped) → surface as a data-quality finding, don't auto-correct.
- Packages handled outside procurement ("No further action from procurement", "Part of Aluminium Package") → status **Excluded** (admin can toggle), excluded from SLA metrics.
- Planned anchors that look wrong (e.g. Temporary Electrics planned award 2026-12-31 but actuals in Jan 2025 → probable year typo). Flag `PLAN_ANOMALY` when |actual − planned| > 180 days.

### 6.4 Existing data quality (proves the business case — show on the Data Quality page)
- 17 of 74 packages have **out-of-sequence actual dates** (e.g. MEP Services: award 2026-01-01 but DTP 2026-10-10).
- 19 packages marked **Awarded with fewer than 6 of 15** actual dates.
- 21 packages owned by "SITE TEAM" (no named owner).
- 19 shared reference-code groups.
- 8 comment-vs-strategy vendor mismatches (heuristic).
Imported manual actual dates are labelled **Legacy (manual)** — visually distinct from **System-captured** dates — and are never treated as verified evidence.

### 6.5 Recommended POC demo set (5–10 packages; Dutco may override)
Clean, mostly in-sequence history (good for ground truth):
- **Facade (1)** and **Facade (2)** — shared ref `D0729`, the disambiguation showcase.
- **Lifts** (F0201), **Anti-Termite** (B0309, all 15 steps), **Concrete Supply - #1** (C0101, all 15 steps), **Painting (1)** and **Painting (2)** (E0801).
In-progress (shows live SLA tracking/alerts):
- **Kitchen Cabinets & Wardrobes** (OBT Ongoing), **Superstructure Waterproofing (2)** (Final Negotiations), **Carpentry (Install)** (PTC Stage).
Messy legacy (shows data-quality detection):
- **MEP Services** (out-of-sequence), **Temporary Electrics** (plan anomaly).

### 6.6 Default as-of date
Use **2026-06-05** (the sheet's reporting week-ending) as the default demo "as-of" date so the mix of statuses is realistic. Settings allows "Today" or any date.

---

## 7. Architecture and tech stack

### 7.1 Stack [DEFAULT — keep unless there's a strong reason]
- **Next.js (App Router) + TypeScript (strict)** — single repo, server actions/route handlers for the API.
- **Tailwind CSS + shadcn/ui (Radix)** for UI; **lucide-react** icons; **TanStack Table + TanStack Virtual** for the schedule grid; **Recharts** for charts; **cmdk** for the command palette; **sonner** for toasts.
- **Prisma + SQLite** for the POC (schema must be Postgres-compatible; switch via env).
- **Zod** for every external input and every LLM output.
- **exceljs** (or SheetJS) to read `.xlsm/.xlsx` and write exports. Exports are `.xlsx` (macros not preserved — say so in the UI).
- **mailparser** for `.eml`; **@kenjiuno/msgreader** for Outlook `.msg`.
- **@anthropic-ai/sdk** for matching. Model from env `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`); a cheaper model can be set for pre-filtering via `ANTHROPIC_FAST_MODEL`.
- **date-fns + date-fns-tz** — all business dates in `Asia/Dubai`.
- **nodemailer** → **Mailpit** (docker) for alert emails in the POC.
- **Vitest** (unit), **Playwright** (e2e + screenshots).
- **docker-compose** for app + Mailpit. `pnpm` as package manager.

### 7.2 Must run without an API key
If `ANTHROPIC_API_KEY` is absent, the app still runs: the deterministic matcher works, items that need AI go to the Exception Queue with reason `AI_UNAVAILABLE`, and a banner says AI is offline. Never crash.

### 7.3 Suggested structure
```
/app                 Next.js routes (dashboard, schedule, packages/[id], exceptions, alerts, audit, data-quality, accuracy, settings, ingest)
/components          UI components (ui/ = shadcn)
/lib/domain          milestones, sla engine, status, attribution, planned-date modes (pure, fully unit-tested)
/lib/ingest          connectors (folder-email, upload, sharepoint-sim, docusign-sim, obt-sim, graph-stub, docusign-stub, obt-api-stub)
/lib/match           normalise → dedupe → thread → features → candidates → ai → score → decide
/lib/excel           import (xlsm) + export (Dutco layout)
/lib/audit           append-only, hash-chained log
/lib/alerts          rules, scheduler, email templates
/lib/synth           synthetic email generator + ground truth
/lib/eval            accuracy evaluation
/prisma              schema + seed
/sample_data         files from Dutco + generated data
/tests               vitest + playwright
```

### 7.4 Data model (minimum)
- `Division`, `Project` (name, number, client, consultant, division, reporting_week_ending)
- `Package` (project, sl_no, category, work_package, standard_ref, package_manager_id, date_added, excluded, current_round, comments)
- `Person` (name, email, role) + `PersonAlias` (raw name → person)
- `Supplier` (name, domains[], aliases[])
- `PackageBidder` (package, supplier, round, invited_at, awarded)
- `SlaMaster` (standard_ref, milestone_key, days)
- `PackageSlaOverride`
- `PlannedDate` (package, milestone, date, baseline_version, mode)
- `MilestoneActual` (package, milestone, round, date, source_type `SYSTEM|LEGACY|ADMIN_CORRECTION`, evidence_event_id, confidence, status, superseded_by)
- `SourceDocument` (type email/sharepoint/docusign/obt, external_id, message_id, thread_id, hash, raw path, from, to, cc, sent_at, received_at, subject, body_text, attachments meta)
- `EvidenceEvent` (source_document, package, milestone, round, event_at, event_type, confidence, rule_hits, ai_rationale, decision `AUTO_COMMITTED|QUEUED|REJECTED|IGNORED`)
- `ExceptionItem` (event or document, reason code, candidates, status, resolved_by, resolution, reason_text)
- `AuditLog` (seq, at, actor, action, entity, before, after, reason, prev_hash, hash)
- `Alert` (package, milestone, type, severity, sent_at, channel, ack)
- `Setting` (key/value JSON)
- `EvalRun` (dataset, metrics JSON, created_at)

---

## 8. Ingestion and matching pipeline

### 8.1 Flow
1. **Ingest** — read file / event; compute SHA-256 of raw content; store raw file; skip if hash already seen (idempotent).
2. **Normalise** — parse headers (Message-ID, In-Reply-To, References, From, To, Cc, Date, Subject), body (prefer text; strip HTML safely), attachments (name, type, size; extract text from PDF/XLSX/DOCX when small). Convert all timestamps to UTC and keep the original offset. Detect language; keep Arabic text intact.
3. **Filter noise** — auto-replies/out-of-office (headers `Auto-Submitted`, `X-Autoreply`, subject patterns), delivery failures (NDR), read receipts, calendar invites, newsletters → `IGNORED` with reason.
4. **Dedupe** — same Message-ID seen in several mailboxes (individual mailboxes + CC) → one document, many `mailboxes`. Also near-duplicate detection by normalised subject + sender + sent time ± 2 minutes + body hash.
5. **Thread** — build threads via In-Reply-To/References, fallback to normalised subject (strip `RE:`, `FW:`, `FWD:`, `AW:`, `TR:`, `[EXTERNAL]`, numbering) + participants. **Only the new content** of a reply is classified (strip quoted history: `-----Original Message-----`, `From: … Sent: …`, `On … wrote:`, `>` quoting, Outlook separators). Threads inherit the package link of their root when confident.
6. **Features** — reference codes (regex for `[A-F]\d{4}` with variants `D-0729`, `d 0729`, `D0729-01`), package names (fuzzy match against project packages incl. instance suffix `(1)`, `#2`), supplier identity (sender domain/name/signature → `Supplier`), internal vs external, SharePoint links, DocuSign/OBT refs, attachment cues (`bid tab`, `comparison`, `TRF`, `LOA`, `LPO`, `quotation`, `proposal`, `BAFO`, `LAFO`), date phrases ("tender closing on 14/05/2026" — **dd/mm/yyyy is the UAE default**).
7. **Candidate generation (deterministic)** — score each (package, milestone) candidate from rules. Strong anchors: exact package name + instance, ref code + only one package with that ref, thread already linked, supplier is an invited bidder of exactly one open package, DocuSign/OBT ID already linked.
8. **AI classification (Claude)** — called when no single candidate is decisive, or to confirm a deterministic candidate for milestone type. Input: the cleaned new content, metadata, attachment summaries, top-N candidate packages (with bidders, ref, current status, expected next milestones) — never the whole project. Output: strict JSON (validated by Zod):
   ```json
   {"is_procurement_event": true, "package_candidates":[{"package_id":"...","confidence":0.0}],
    "milestone": "float_rfps|...|none", "milestone_confidence": 0.0,
    "event_role": "sent_by_procurement|received_from_supplier|internal|system",
    "supplier_name": "...", "round_hint": 1, "explicit_dates":[{"type":"tender_closing","date":"2026-05-14"}],
    "rationale": "≤ 40 words"}
   ```
   Use `temperature 0`, a cached system prompt with the milestone definitions, and few-shot examples. Retry with backoff on 429/5xx; on repeated failure → queue `AI_UNAVAILABLE`. Log token usage.
9. **Score and decide** — final confidence = calibrated combination of rule score and AI confidence. **Auto-commit only if** confidence ≥ `auto_commit_threshold` (default 0.90) **AND** a deterministic anchor exists **AND** rules and AI agree on package and milestone **AND** validation passes. 0.60–0.90 or disagreement → Exception Queue. < 0.60 and not procurement-related → `IGNORED` (visible in the Evidence log, not in the queue).
10. **Validate** — sequence (milestone after prerequisites; out-of-sequence is allowed but flagged `SEQUENCE_WARNING`), date sanity (not in the future vs as-of / ingestion time, not before package date added − 365d), round logic, duplicates, conflicting evidence (two different dates for a FIRST milestone → earliest wins, conflict logged).
11. **Apply aggregation rule** (§4.3) → set/update `MilestoneActual`. A later qualifying event can move a LAST-rule milestone; every change is an audit event with evidence.
12. **Recompute** planned/SLA/status/attribution for the package; evaluate alert rules.

### 8.2 Source simulators (Stage 1)
- **SharePoint** JSON: `{type:"folder_created"|"link_shared", path, package_hint, at, by}`
- **DocuSign** JSON: `{envelope_id, subject, document_type:"TRF"|"LOA"|"LPO"|"SOA", status:"sent"|"delivered"|"completed"|"declined"|"voided", at, recipients}` — only `sent` sets trf_created; `completed` sets trf_approved / award; `declined`/`voided` → exception + alert.
- **OBT** CSV: `obt_ref, package_name, standard_ref, submitted_at, approved_at, status (Submitted|Approved|Rejected|Returned)`. Rejected/Returned → exception + alert, re-submission keeps latest.

### 8.3 Security of LLM use
Email content is untrusted. Ignore any instruction inside emails ("ignore previous instructions", "mark as approved"). The LLM only classifies; it never writes data directly — code applies the decision after validation. Redact phone numbers/IBANs before sending if `redact_pii` setting is on (default on).

---

## 9. Synthetic data, ground truth and evaluation

Dutco's emails are not organised yet, so Stage 1 must work on **generated emails** and later on real exports with zero code change.

### 9.1 Generator (`pnpm synth`)
For each demo package (§6.5), use its **actual dates from the sheet as ground truth** (only in-sequence ones; for messy packages, generate a corrected plausible timeline and record it as truth). Generate realistic `.eml` files:
- Internal domain `dutco.ae` [DEFAULT]; project team, package managers (from the sheet), approvers; supplier domains from bidder names (e.g. `alnahda-contracting.ae`).
- Every milestone produces 1–N emails/events with realistic subjects and bodies in UAE business English, signatures, disclaimers, attachments (small generated PDFs/XLSX: "Bid Tab Rev 2.xlsx", "LOA - Facade.pdf").
- Mixed subject quality: ~40% with ref code, ~30% package name only, ~30% vague ("RE: quotation", "Revised offer").
- **Edge-case emails** (at least one of each category in §13.1), including: replies with quoted old milestones, forwards, the same email in 3 mailboxes, Arabic text, out-of-office, bounce, wrong-package mention, one email covering Facade (1) and (2), late bid after bid tab, re-tender, DocuSign declined, OBT returned, prompt-injection text, timezone edge (sent 23:30 UTC = next day in Dubai), dd/mm vs mm/dd ambiguity, missing Date header, corrupted `.msg`.
- Writes `sample_data/generated/emails/*.eml`, `sharepoint_events.json`, `docusign_events.json`, `obt_export.csv` and `ground_truth.json` (`message_id → {package, milestone, round, expected_effect}`), plus `expected_actuals.json` (package × milestone → date).
- Deterministic with a seed.

### 9.2 Evaluation (`pnpm eval` + Accuracy page)
Run the pipeline from a clean DB on the generated set and report: milestone-date accuracy, package-match precision/recall, milestone-classification precision/recall, auto-commit precision (must be 100%), % auto-committed vs queued, confusion matrix, list of every mismatch with links. Store as `EvalRun`. This page is a key demo moment: it proves "foolproof".

---

## 10. Integrity, roles and audit

### 10.1 Roles (POC uses a role switcher in the top bar; Stage 2 = SSO)
| Role | Who | Can |
|---|---|---|
| Admin | Jassim | Everything: resolve exceptions, correct dates (reason + evidence), re-baseline plans, settings, exclude packages, run ingestion |
| Package Manager | e.g. Mani, Basheer | View all; see own packages highlighted; add a **delay note** (does not change dates); cannot edit dates |
| Leadership | Procurement Director, division heads | Dashboard and reports, read-only |

### 10.2 Rules
- No UI or API path lets a non-admin change a date. Enforce on the server, not just the UI.
- Admin correction: choose evidence (existing document or upload) + reason → new `MilestoneActual` with `source_type=ADMIN_CORRECTION`; the old one is marked `superseded_by`. Both are visible.
- **Audit log** is append-only; each row stores `prev_hash` and `hash = sha256(prev_hash + payload)`. The Audit page has a **Verify chain** button showing ✅ intact or the first broken row.
- Every date in the UI shows its provenance badge: **System** (with confidence), **Legacy (manual)**, **Admin-corrected**.

---

## 11. Alerts and escalations [DECIDED: email to Jassim; DEFAULT for rules]
- Rules (configurable): milestone `DUE_SOON` (2 days before), `OVERDUE` (day 1), escalation at `OVERDUE` ≥ 5 days, package forecast award slips > 7 days, new exception item, DocuSign declined/voided, OBT returned/rejected, sequence warning on a newly captured date, ingestion failure.
- Channel: email (Mailpit in POC) + in-app Alerts centre with bell badge. Teams = Stage 2.
- **Daily digest** (default 08:00 Asia/Dubai) instead of one email per event; immediate email only for critical (declined/rejected/ingestion failure). No duplicate alerts for the same condition (dedupe key = package+milestone+type+date). Respect as-of date in demo.
- Recipient: admin now; design for per-package manager + escalation chain (manager → procurement manager → divisional manager) from Project Information roles.
- Email template: clean HTML, mobile-friendly, summary table, deep links into the app.

---

## 12. UI / UX specification

The client explicitly wants a **polished UI even for the POC**. This is a leadership-facing product for a tier-one contractor: it should feel like a modern enterprise control tower (think Linear / Stripe dashboard quality), calm and data-dense but highly readable.

### 12.1 Design principles
1. **Familiar first** — the Schedule view mirrors their Excel mental model (packages × 15 milestones, planned vs actual), so adoption is instant.
2. **Trust is visible** — every date shows where it came from; evidence is one click away.
3. **Exceptions, not data entry** — the UI never invites typing dates.
4. **Glanceable** — status colours and numbers readable in 3 seconds on the dashboard.
5. **Consistent** — one status colour system everywhere (cells, chips, charts, emails).

### 12.2 Visual system
- Product name in UI: **"Procurement Control Tower"** with "Dutco Group" as text (no logos we don't own; logo slot configurable).
- Font: **Inter** (fallback system-ui), tabular numerals for dates/numbers. Sizes: 12/13 data, 14 body, 16–20 headings, 28–32 KPI numbers.
- Palette (CSS variables, light + dark themes, respect system preference, toggle in top bar): neutral slate surfaces; primary **deep navy `#0F2A4A`** with accent **teal `#0E9F8E`**.
- Status colours (use everywhere, with icon + text, never colour alone): Done on time = green `#16A34A` (✓), Done late = orange `#EA580C` (clock), Due soon = amber `#D97706`, Overdue = red `#DC2626` (!), Upcoming = slate `#64748B`, N/A = dashed slate, No plan = light grey, Legacy = hatched/striped background, Excluded = muted.
- 8-px spacing grid, 8–12 px radius cards, subtle 1-px borders, soft shadows only on overlays. Motion 150–200 ms, respect `prefers-reduced-motion`.
- Dates displayed `dd MMM yyyy` (e.g. 05 Jun 2026); compact cells `dd MMM`. Currency `AED 1,234,567`.

### 12.3 App shell
- Left sidebar (collapsible): Dashboard, Schedule, Exceptions (count badge), Alerts, Evidence, Data Quality, Accuracy, Audit Log, Settings, Ingest (admin).
- Top bar: project/division switcher, **as-of date picker** (with "Today" and "Reporting week" shortcuts), global search / command palette (⌘K: jump to package, run ingestion, switch role), role switcher (POC), theme toggle, alerts bell.
- Breadcrumbs, page titles with one-line description.

### 12.4 Screens
**A. Leadership Dashboard**
- KPI cards: SLA compliance % (with trend vs last 4 weeks), packages awarded / total, overdue milestones, average days late per step, forecast awards slipping, open exceptions, % of dates system-captured.
- Charts: status funnel (Awaiting DTP → Awarded); SLA compliance by division / project / package manager / milestone (bar); **days lost by delay owner** (stacked bar: Project team / Procurement / Suppliers / Approvers); weekly trend line; **heatmap** packages × milestones coloured by status; top 10 most delayed packages table with sparkline.
- Filters: division, project, category, manager, period. Every chart element drills down to a filtered Schedule.
- Export: PDF/PNG snapshot of dashboard; Excel of underlying data.

**B. Procurement Schedule (live)**
- Virtualised grid: sticky left columns (Sl, Package, Ref, Category, Manager, Status chip, Health), then 15 milestone columns grouped by stage (A/B/C/D header bands like the sheet).
- Each milestone cell shows planned (small, muted) above actual (bold) with a status colour fill and provenance badge; tooltip: SLA, variance, evidence summary, confidence.
- Toggles: "Planned vs Actual" / "Variance (days)" / "Cycle time vs SLA". Density compact/comfortable. Group by category/manager/status. Column presets. Saved filters. Sorting. Search.
- Row click → Package Drawer. Cell click → evidence popover.
- Clear legend. Empty state ("Import a schedule to begin").

**C. Package Detail (drawer + full page)**
- Header: package name, ref, category, manager, status, health, target vs forecast award, round selector.
- **Vertical timeline** of the 15 milestones: planned, actual, variance, status, provenance, evidence cards (email: from/to/date/subject/snippet + "Open source" viewer showing the full email rendered safely with attachments list; DocuSign/OBT: event card).
- Bidders list with invite/response timeline.
- Delay notes (package managers can add; read-only history).
- Audit history for this package.
- Admin actions (admin only): Correct date, Re-baseline, Exclude package — each opens a dialog requiring reason + evidence.

**D. Exception Queue (admin)**
- Inbox-style split view: list (reason code chip, suggested package/milestone, confidence bar, age) + detail (email preview with highlighted cues that drove the match, top candidates).
- **One-click actions**: Confirm suggestion, choose another candidate (dropdown), Not procurement-related, Split (email covers 2 packages → create two events), Snooze. Keyboard shortcuts (J/K navigate, Enter confirm, 1–3 pick candidate). Bulk confirm for identical patterns. Each decision is audited; the system **learns** (stores a rule: e.g. supplier domain → package for this round) and shows "Applied to N similar items".

**E. Alerts centre** — list with severity, package, milestone, rule, sent status; preview of the email digest exactly as sent.

**F. Evidence log** — every ingested document with decision (auto-committed / queued / ignored / duplicate) and reasons; filters; open source viewer.

**G. Data Quality** — findings from the legacy import (§6.4) with counts and per-package list; "Before vs after" comparison: manual sheet vs system-captured (completeness %, sequence errors).

**H. Accuracy** — latest EvalRun metrics, confusion matrix, mismatch list, "Run evaluation" button (admin).

**I. Audit Log** — searchable table, entity filter, diff view (before/after), Verify chain button.

**J. Settings** — Planned-date mode, day counting, weekend/holidays, thresholds (auto-commit, due-soon, escalation), milestone aggregation rules, delay-owner mapping, SLA master (view/import), people & aliases, suppliers & domains, alert rules & recipients, connectors (Folder/Upload = Active; SharePoint/DocuSign/OBT simulators = Active; Microsoft 365, OBT API, DocuSign API = "Stage 2" cards with description), AI status (model, key present, last call, token usage), PII redaction toggle, demo reset.

**K. Ingest (admin)** — drag-and-drop for `.xlsm/.xlsx`, `.eml/.msg` (multi-file, folder), event JSON/CSV; progress per file; results summary (auto-committed / queued / ignored / duplicates / errors) with links. Buttons: "Import Dutco sample", "Generate synthetic emails", "Process all", "Reset demo".

### 12.5 States, accessibility, responsiveness
- Every screen has loading skeletons, empty states with a clear next action, error states with retry, and success toasts.
- WCAG 2.1 AA: contrast, focus rings, keyboard navigation in grid and queue, ARIA labels, status never by colour alone.
- Responsive: full experience ≥ 1280 px; dashboard and package detail usable on tablet/mobile (leadership on phones); schedule grid scrolls horizontally with sticky columns.
- **RTL-safe** text rendering for Arabic names/content inside emails (use `dir="auto"`).
- Long package names truncate with tooltip; numbers right-aligned; no layout shift.

---

## 13. Edge-case catalogue (implement and test every row)

### 13.1 Email and matching
| # | Case | Expected behaviour |
|---|---|---|
| E1 | Reply/forward chain quoting older milestone emails | Classify only new content; quoted text never creates events |
| E2 | Same email in several mailboxes (individual mailboxes, CC/BCC) | One document, deduped by Message-ID; mailboxes listed |
| E3 | Near-duplicate resend (no Message-ID match) | Detected by hash/subject/sender/time; not double counted |
| E4 | No reference code, package name only | Fuzzy name match + bidder/thread context |
| E5 | Vague subject ("RE: quotation") | Thread + supplier + content; AI; queue if not decisive |
| E6 | Ref code shared by split packages (D0729 → Facade (1)/(2)) | Disambiguate by instance suffix, bidder set, thread, attachments; else queue `AMBIGUOUS_PACKAGE` |
| E7 | One email covers two packages | Admin "Split" or auto-create two events when both are explicit |
| E8 | Ref code formatting variants (D-0729, d 0729, D0729-01) | Normalised |
| E9 | Misspelled package/supplier names | Fuzzy match with threshold; aliases learned |
| E10 | Supplier emails from personal domain (gmail) | Match by signature/name/thread; lower confidence |
| E11 | Supplier invited on several open packages | Content/attachments decide; queue if not |
| E12 | Internal chatter mentioning "RFP"/"award" casually | Not an event unless role/recipient pattern matches |
| E13 | Auto-reply, out-of-office, NDR bounce, read receipt, calendar invite | IGNORED with reason |
| E14 | Attachment-only email (blank body) | Use attachment names/text |
| E15 | Arabic or mixed-language content | Preserved; AI handles; RTL display |
| E16 | Prompt-injection text inside email | Ignored; classification unaffected; flagged |
| E17 | Missing/invalid Date header | Use received time, else file time; lower confidence; flag |
| E18 | Timezone: sent 23:30 UTC | Business date = Dubai date (next day) |
| E19 | Dates in body dd/mm vs mm/dd | Default dd/mm (UAE); ambiguous days ≤ 12 lower confidence |
| E20 | Corrupted/unsupported file | Error logged, others continue; visible on Ingest page |
| E21 | Very long thread / huge attachment | Truncate safely for AI (token budget), keep full raw |
| E22 | Email about package before its DTP / before Date Added | Allowed with warning if within window, else queue |
| E23 | Late bid after initial bid tab | Doesn't move initial_proposals_received |
| E24 | Multiple bid tab revisions | initial = first, final = last before TRF |
| E25 | Re-tender (RFPs floated again after bid tab) | New round; history kept |
| E26 | Emails re-ingested (same folder twice) | Idempotent |
| E27 | AI unavailable / rate limited / invalid JSON | Retry, then queue `AI_UNAVAILABLE`; never auto-commit |
| E28 | Rules and AI disagree | Queue `DISAGREEMENT` with both views |
| E29 | Evidence implies a date in the future relative to as-of | Ignored for as-of views (event exists but "not yet") |

### 13.2 System events
| # | Case | Expected |
|---|---|---|
| S1 | DocuSign declined/voided | No milestone; exception + critical alert |
| S2 | DocuSign re-sent after void | Latest valid envelope counts |
| S3 | OBT returned/rejected then resubmitted | Latest submission; history kept; alert |
| S4 | OBT ref with whitespace/tab, numeric vs text | Normalised |
| S5 | SharePoint link shared multiple times | FIRST rule |

### 13.3 Schedule, SLA and data
| # | Case | Expected |
|---|---|---|
| D1 | Missing planned anchor | "Plan not set"; SLA metrics exclude it |
| D2 | Ref code not in SLA master | Use default SLAs; flag `SLA_DEFAULTED` |
| D3 | SLA = 0 days | Same-day step allowed |
| D4 | Optional milestone (TQ) never happens | NOT_APPLICABLE, not overdue |
| D5 | Actual earlier than planned | DONE_ON_TIME (show early by N days) |
| D6 | Out-of-sequence actuals | Status by process order; SEQUENCE_WARNING; Data Quality |
| D7 | Several milestones same day | Fine |
| D8 | Plan anomaly (> 180 days off) | PLAN_ANOMALY flag |
| D9 | Excluded package (handled by another division) | Excluded from metrics; visible muted |
| D10 | Package added mid-project / removed | Import diff: added, removed (soft delete), changed |
| D11 | Manager change | History kept; metrics by manager at time of step |
| D12 | Name variants / SITE TEAM | Alias table; "Unassigned (Site Team)" bucket |
| D13 | Legacy manual date conflicts with system-captured date | System wins for display; conflict listed in Data Quality |
| D14 | Re-import of an updated Excel | Never overwrites system-captured or admin-corrected actuals; only legacy/manual and plan data update; show import diff |
| D15 | Working-days mode + holiday on planned date | Shifted per setting |
| D16 | As-of date in the past | All views computed "as at" that date (events after it hidden) |
| D17 | Blank rows, merged cells, formulas without cached values | Importer robust; compute planned dates itself if cached values missing |
| D18 | Two packages with identical names | Disambiguate by Sl.No; warn |

### 13.4 Security and roles
| # | Case | Expected |
|---|---|---|
| R1 | Package manager tries to edit a date via API | 403; audited |
| R2 | Admin correction without reason/evidence | Blocked by validation |
| R3 | Tampering with audit rows in DB | Verify chain detects it |
| R4 | XSS in email HTML | Sanitised rendering (sandboxed iframe / DOMPurify) |

---

## 14. Excel import and export
- **Import**: Procurement Schedule + Work Package Master List (+ Work Package Input, Strategy bidders, Project Information if present). Locate headers by text. Produce an import report (packages, milestones, legacy actuals, warnings).
- **Export**: regenerate the Procurement Schedule in Dutco's layout (two rows per package, same columns), with system-captured actuals filled in, provenance as cell comments, status colours, and an extra "Evidence" sheet with links. Also a flat CSV/XLSX of milestone events for BI.

---

## 15. Non-functional
- Performance: 100 packages × 15 milestones renders < 1 s; processing 500 emails < 5 min with AI (parallelism with concurrency limit).
- Config via `.env` (`DATABASE_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `SMTP_*`, `APP_TIMEZONE=Asia/Dubai`, `INTERNAL_DOMAINS=dutco.ae,dbb.ae`).
- Structured logging; no secrets or full email bodies in logs.
- Tests: unit tests for SLA engine, planned modes, status, aggregation rules, normaliser, dedupe, threading, quoted-text stripping, ref parsing, date parsing, audit chain; importer test against `schedule_packages.json`; e2e for ingest → schedule → exception confirm → audit; **one test per edge case in §13**.
- Seed command builds a ready-to-demo state in one step.

---

## 16. Demo script (target 15 minutes)
1. Dashboard at as-of 05 Jun 2026: compliance, delays by owner, heatmap.
2. Data Quality: "here's what manual entry looks like today" (17 sequence errors, 19 incomplete awards).
3. Ingest: drop the generated mailbox (incl. noise) → watch results: X auto-committed, Y queued, Z ignored.
4. Schedule: demo packages fill in automatically; open Facade (2) → evidence shows how it was told apart from Facade (1).
5. Exception Queue: confirm 2–3 items in one click; show "applied to similar".
6. Try to edit a date as Package Manager → not allowed. Admin correction → audit log → Verify chain.
7. Move as-of date forward → overdue alerts → open Mailpit to show the digest email.
8. Accuracy page: ≥ 98% accuracy, 100% auto-commit precision.
9. Export to Dutco Excel layout.
10. Settings → Connectors: Stage 2 path (Microsoft 365, OBT API, DocuSign).

---

## 17. Acceptance checklist
- [ ] `docker compose up` (or `pnpm i && pnpm seed && pnpm dev`) gives a working demo with no manual steps beyond `.env`.
- [ ] Imports the original `Sample_Project_Doc.xlsm`; 74 packages; matches `schedule_packages.json`.
- [ ] Synthetic generator + ground truth; evaluation ≥ 98% date accuracy; auto-commit precision 100%.
- [ ] All screens in §12.4 built, light and dark themes, responsive, accessible.
- [ ] Every edge case in §13 has a test and passes.
- [ ] No non-admin path can change a date; audit chain verifies.
- [ ] Alerts arrive in Mailpit; digest works; no duplicates.
- [ ] Runs without an API key (degraded mode).
- [ ] Export reproduces the Dutco layout.
- [ ] README, DEMO.md, ARCHITECTURE.md and a Stage 2 integration note (Graph permissions needed, OBT/DocuSign integration plan).

---

## 18. Open questions (with defaults to build with)
| # | Question to Dutco | Default used |
|---|---|---|
| Q1 | Full name of DCC MEP | "DCC MEP" |
| Q2 | Meaning of TQ, PTC, LAFO, SOA | As in glossary (§4.1) |
| Q3 | Planned dates: backward from target award or forward from DTP? | BACKWARD_FROM_AWARD, switchable |
| Q4 | Calendar or working days for SLAs? | Calendar days |
| Q5 | Which 5–10 packages for Stage 1? | §6.5 set |
| Q6 | Real sample emails (20–30 `.msg/.eml`) | Synthetic set; real ones drop in unchanged |
| Q7 | Final SLA list incl. DIJ SLAs | Sample master list; DIJ uses same until provided |
| Q8 | Initial Proposals Received = first, last or tender deadline? | LAST before first bid tab |
| Q9 | Internal email domains | `dutco.ae`, `dbb.ae` |
| Q10 | Escalation chain beyond Jassim | Jassim only; chain configurable |
| Q11 | What does "SOA" award document mean, and which award doc counts? | First issued of LPO/LOA/SOA |
