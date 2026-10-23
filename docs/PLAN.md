# Plan, decisions and open questions

## Decisions where the spec was silent
- **Delay attribution:** excess days on step *i→j* go to the owner of milestone *j* (the step being waited on); DTP lateness vs plan goes to the project team.
- **Overdue KPI** counts each package's next open step past its plan (otherwise every future step of a stale package counts).
- **Forecast award** = latest actual + remaining SLAs, never earlier than the target; if the next step is already overdue it rolls forward from the as-of date.
- **Subject vs body:** the rule milestone comes from the subject when it has a cue (declared intent), else the body; the AI reads the body. A conflict becomes DISAGREEMENT rather than a guess.
- **Future-tense clauses** ("bid tab to follow") are not events — found during evaluation, fixed generally, not per test case.
- **Messy legacy packages:** MEP Services ground truth uses DTP 10 Oct 2025 (the sheet's 2026 is a probable typo); recorded as synthetic truth only.
- **Reporting week:** spec says 05 Jun 2026; the workbook's Project Information cell says 08 Jun 2026. Default as-of uses the spec value; the import report shows the sheet value.
- **Excel styling:** export uses SheetJS CE — layout, date formats and provenance comments are preserved; cell colours need exceljs (planned).

## Open questions for Dutco (defaults in use)
| # | Question | Default |
|---|---|---|
| Q1 | Full name of DCC MEP | "DCC MEP" |
| Q2 | Meaning of TQ, PTC, LAFO, SOA | Glossary in spec §4.1 |
| Q3 | Planned dates backward from award or forward from DTP | Backward (Settings switch) |
| Q4 | Calendar or working days | Calendar (Settings switch, UAE weekend + holidays) |
| Q5 | Which 5–10 packages | The 12 in spec §6.5 |
| Q6 | 20–30 real sample emails | Synthetic set; real `.eml` drop in unchanged |
| Q7 | Final SLA list incl. DIJ | Sample master list (683 types) |
| Q8 | Initial Proposals = first, last or deadline | LAST before first bid tab |
| Q9 | Internal email domains | dutco.ae, dbb.ae |
| Q10 | Escalation chain beyond Jassim | Jassim only |
| Q11 | Which award document counts | First issued of LPO/LOA/SOA |
