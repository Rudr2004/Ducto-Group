# Procurement Control Tower — Dutco Group (Stage 1 POC)

Captures procurement milestone dates automatically from email, SharePoint, DocuSign and OBT evidence, matches them to the right package and milestone with a reason and a confidence, and tracks planned vs actual, SLA, delay ownership and leadership KPIs. Procurement users never type a date.

Built by SoluLab from `PROJECT_SPEC.md`. React 18 + TypeScript (strict) + Vite + Tailwind; a small Node service for the Claude call and email delivery.

## Run it

```bash
npm install
npm run dev            # http://localhost:5173 — fully working demo, no server or API key needed
```

With the Node service (real Claude classification + Mailpit email):

```bash
cp .env.example .env   # add ANTHROPIC_API_KEY (optional — without it the service reports degraded mode)
docker compose up      # app :5173 · API :8787 · Mailpit UI :8025
```

Other commands: `npm test` (61 tests), `npm run typecheck`, `npm run build:single` (one self-contained HTML file, used for the hosted demo).

## What is real and what is simulated

| Area | Status |
|---|---|
| Excel import | **Real.** Reads Dutco's `Sample_Project_Doc.xlsm` directly; matches `schedule_packages.json` exactly (test). |
| Matching rules, dedupe, threading, aggregation, rounds, SLA engine, audit chain | **Real**, unit-tested. |
| Emails, SharePoint/DocuSign/OBT events | **Synthetic**, generated from the real schedule with ground truth (labelled in the UI). |
| AI classification in the browser | **Simulated classifier** (labelled). `server/index.mjs` makes the real Claude call with a strict JSON contract. |
| Microsoft 365 / OBT API / DocuSign Connect | **Stage 2 stubs**, shown as such in Settings → Connectors. |
| Server-side role enforcement | Enforced in the app's data layer (`src/store/store.ts`, every write goes through `guard()`); moves to the API with SSO in Stage 2. |

See `docs/DEMO.md` for the 15-minute walkthrough, `docs/ARCHITECTURE.md`, `docs/PLAN.md` (decisions and open questions) and `docs/STAGE2_INTEGRATION.md`.
