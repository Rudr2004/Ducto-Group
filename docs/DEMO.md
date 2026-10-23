# Demo script (≈15 minutes)

Default as-of date is the reporting week (05 Jun 2026). Role: Admin · Jassim.

1. **Dashboard.** Pipeline line of stations, SLA compliance with 4-week trend, days lost by owner, heatmap. Banner: "every date here was typed by hand".
2. **Data quality.** 17 out-of-sequence packages, 19 awarded with < 6 dates, 21 owned by "SITE TEAM", 8 vendor mismatches — the business case.
3. **Ingest → Process mailbox.** Watch the 8-stage pipeline and live feed: ~262 events auto-committed, 6 queued, 6 ignored (OOO, bounce, receipt, invite, chatter, acknowledgement), 3 duplicates, 1 corrupted file reported while the rest continue.
4. **Schedule.** Tick "POC packages only". Shield icons = system-captured. Open **Facade (2)** → expand Initial Proposals → evidence card shows *Package name: Facade (2)* / *Thread already linked* — how it was told apart from Facade (1) despite the shared D0729 ref.
5. **Exceptions.** "RE: quotation" from Al Qassim (bidder on both facades) → pick Facade (1), Enter. Show rules vs AI side by side on the Carpentry disagreement. DocuSign declined / OBT returned → Acknowledge.
6. **Integrity.** Switch role to Package Manager → open a package → Correct a date → refused (403) and the attempt appears in the Audit log. Switch back to Admin → correct with reason + evidence → old value kept. Audit log → Simulate tampering → Verify chain → broken row identified.
7. **Alerts.** Move as-of forward (e.g. Today) → overdue/escalation alerts → Digest email preview → Send digest (Mailpit when the Node service runs).
8. **Accuracy.** 100% date accuracy, 100% auto-commit precision, 0 silent wrong commits, confusion matrix. Change the seed and re-run.
9. **Export.** Schedule → Export to Dutco Excel: two rows per package, provenance in cell comments, Evidence sheet.
10. **Settings → Connectors.** Stage 2 path: Microsoft 365 (Graph), OBT API, DocuSign Connect.
