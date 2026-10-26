# WSLSA 2027 Degree Pathway Explorer

An interactive degree pathway explorer and PDF guide generator for Western Sydney University law students, built entirely from the Western Sydney Law Students' Association **WSLSA Degree Guides 2027** workbook (2027 Student Handbook data).

**Live site: https://kyosukeamagiri.github.io/wslsa/** (works on phones, tablets and computers).

Sample PDF exports: [2788 Accounting, custom pathway (Mode A)](https://kyosukeamagiri.github.io/wslsa/samples/2788-T046-accounting-custom-pathway-A4-portrait.pdf) · [2788 Accounting, complete handbook sheet (Mode B)](https://kyosukeamagiri.github.io/wslsa/samples/2788-T046-accounting-handbook-sheet-A4-portrait.pdf) · [2848 Laws, custom pathway, landscape (Mode A)](https://kyosukeamagiri.github.io/wslsa/samples/2848-laws-custom-pathway-A4-landscape.pdf)

The same app is a single self-contained file, `dist/wslsa-pathway-explorer.html` (about 590 KB), with every degree, pathway and subject embedded, so it also works offline, can be emailed, or can be hosted anywhere static (SharePoint, a WSLSA website). Nothing is sent anywhere: a student's choices are saved in their own browser, and the Copy plan link button carries a plan to another device.

## What it does

**Cascading selection.** Choosing a degree filters the major/minor list to that degree's own options from the `Lists` sheet, so the workbook's "the selected major/minor doesn't belong to this degree" mismatch cannot occur. The eight fixed-structure degrees (2848, 2785, 2843, 2769, 2767, 2766, 2800, 2758) show a locked selector instead, and 2758 names its built-in Global Politics and International Relations major. Degrees with two pathway groups (2768 ICT and 2538 Social Science) group their options under Pathway A and Pathway B, and every selection carries a badge explaining why that pathway applies, which majors share it, and in which sessions the core law and non-law subjects move compared with the other pathway.

**Interactive slots.** Every "Choose" placeholder in the workbook is now a working control. LLB Alternate slots open a picker listing the degree's LLB Alternate Subjects that actually run in that slot's session (Autumn or Spring), with campus pills, level filters, search, a separate "session TBC" group and an optional view of subjects that only run in the other session. Inline choices such as `FINC 1005 or ECON 1011`, or the Science maths and chemistry options, are toggles inside the slot. "See list" pools (Alternate Accounting, Global Politics option groups, Engaged Learning, Heritage and Tourism) and swappable major options (2538 Child and Community, Disability Studies and Sociology) open the same picker filtered to the right component. Bachelor of Laws electives accept any WSU subject code or a quick pick from the LLB Alternates. A subject can only be placed once in a plan.

**Load and progress.** A full-time view shows the standard 40 CP sessions. A part-time view reflows the same pathway into 20 CP sessions while keeping every subject in a session type it is offered in; it reproduces the Overview's part-time durations for all 13 degrees and is labelled as indicative because it can shift prerequisite timing. Turning on Track progress adds a checklist to every unit, a credit point meter (for example `160 / 400 CP completed`) and an estimate of sessions remaining at the chosen load.

**Campus and risk intelligence.** Campus codes render as colour-coded pills with full campus names on hover; clicking one (or using the Primary campus selector) highlights that campus, flags units that run neither there nor online, and filters the pickers. A risk banner surfaces the advisor prerequisite notes from `Lists` (Note 1 to Note 4) scoped to the selection, the four core law subjects with unpublished 2027 sessions (LAWS 3099, 3101, 3102, 3103) plus any chosen subject that is TBC, subjects still using 2026 session data, campus gaps and open choices. Where the pathway itself bears on a prerequisite gap, the banner says so, for example that picking NATS 3044 in the Year 2 Spring choice slot places it before NATS 3055.

**PDF export.** Export PDF guide opens a settings panel with a live A4 preview and a page estimate that matches Chromium's real pagination. Output goes through the browser's print engine, so text and tables stay vector-sharp, and all tints and badges are forced on with `print-color-adjust: exact`.

| Mode | Contents | Length (all 48 pathways tested) |
| --- | --- | --- |
| A: Custom student pathway | Header (degree, major/minor, CP, duration, intake, campuses, CRICOS, Handbook URL and QR code), colour-coded Autumn/Spring grid with your choices marked ◆, campus codes, session CP and optional completion ticks, then advisor warnings, session checks, accreditation, exit awards, campus legend and the WSLSA disclaimer | 1 to 2 pages, portrait or landscape |
| B: Complete handbook sheet | The full pathway on page 1, the complete LLB Alternate Subjects table on page 2 (filterable by session, campus and TBC status), any other choice pools the pathway uses, then accreditation, assumed knowledge, legend and disclaimer | 3 pages portrait; 3 landscape (4 for 2758, which has three extra choice pools) |

**Also included.** A full subject catalogue browser for each degree (all components, filterable by session and search, with units in your plan highlighted), program structure and accreditation panels, a "Copy plan link" button that encodes the degree, choices and progress into the URL, light and dark themes, and a layout that works at phone width.

## Data pipeline

```
data/source/WSLSA Degree Guides 2027.xlsx
        │  scripts/extract_workbook.py   (openpyxl; segno optional, for QR codes)
        ▼
data/wslsa-2027.json                     complete JSON data store
        │  scripts/validate_data.py      integrity checks
        │  scripts/build_app.py          bundles src/ + data into one file
        ▼
dist/wslsa-pathway-explorer.html
```

The extractor reads every sheet without truncation: 13 degrees from `Overview`, 48 degree/major combinations and 6 advisor notes from `Lists`, all 1,915 rows of `Pathway Data`, and from each of the 13 degree sheets the key facts, program structure, recommended pathway(s), major/minor session tables, the 1,582-row subject catalogue (including every LLB Alternate with level, Autumn/Spring campuses and data source) and the "Check with your advisor" notes. It also resolves each choice slot to its pool and pre-renders the Handbook QR codes as SVG.

The validator rebuilds all 48 pathways from the degree sheets (filling each sheet's "Major slot" placeholders from its major table) and confirms they match `Pathway Data` row for row. It also checks credit point totals against `Overview`, program structure sums, pathway group counts, advisor note parity between `Lists` and the degree sheets, and that every choice pool has something offered in the slot's session. It currently reports 0 errors and 0 warnings.

## Rebuilding after the workbook changes

```bash
pip install openpyxl segno
python3 scripts/extract_workbook.py   # reads data/source/WSLSA Degree Guides 2027.xlsx by default
python3 scripts/validate_data.py
python3 scripts/build_app.py
```

To test, install Playwright with Chromium (`npm install` then `npx playwright install chromium`) and run `npm test` for the behaviour checks across all 48 pathways, `npm run test:pdf` to also render every pathway in both modes and orientations and check page counts and page placement (needs poppler's `pdfinfo` and `pdftotext`), or `npm run samples` to regenerate the PDFs in `samples/`.

## Publishing

`.github/workflows/pages.yml` runs on every push. It validates the data, confirms the committed `dist/` build matches the source, and runs the end-to-end checks in Chromium. When those pass on the default branch, it publishes the app to GitHub Pages as `index.html`, together with the sample PDFs. The one-time setup is **Settings > Pages > Build and deployment > Source: GitHub Actions**; until then the workflow still tests every push and leaves a notice instead of publishing.

To update the live site after the workbook changes, replace the file in `data/source/`, run the three rebuild commands above, and push. The site's address follows the repository name (`wslsa`), so renaming the repository again moves the site to `https://kyosukeamagiri.github.io/<new-name>/`; GitHub does not redirect the old address. A custom domain (Settings > Pages > Custom domain) keeps one stable address regardless of the repository name.

## Repository layout

| Path | Purpose |
| --- | --- |
| `dist/wslsa-pathway-explorer.html` | The finished app; open this |
| `src/index.html`, `src/styles.css`, `src/print.css`, `src/app.js` | App source (screen styles, print/PDF styles, logic) |
| `data/wslsa-2027.json` | Complete extracted data store |
| `data/source/` | The source workbook |
| `scripts/` | Extract, validate and build scripts |
| `tests/e2e.cjs` | Playwright end-to-end and PDF checks |
| `.github/workflows/pages.yml` | Test-then-publish workflow for GitHub Pages |
| `samples/` | Example exports: 2788 Accounting (Mode A and B, portrait) and 2848 (Mode A, landscape) |

## Notes on the data

Advisor notes are scoped rather than shown for the whole degree. A note that names a major or minor applies when that major or minor is selected; a note that names none (2766) applies to every student in the degree. If a note names a different major but its subject still sits in the selected pathway, it appears as a related note, so students in other majors are not left unaware of the same gap.

That related-note logic surfaces one gap the workbook does not flag. NATS 3055 Practicum 1 is in the Science core for every 2743 major and lists NATS 3044 as a prerequisite, but the workbook's note names only Environmental Science. Six majors offer NATS 3044 in their Year 2 Spring choice slot, while Forensic Science (T049) has no NATS 3044 anywhere in its structure and Applied Physics (T078) places its option slot in Year 2 Autumn, where NATS 3044 (Spring only) cannot run. Both appear to need the same advisor note.

The recommended pathways are WSLSA-prepared plans, not official WSU sequences. Students should confirm enrolment decisions, prerequisites and any flagged gaps with the Academic Program Advisor and check the 2027 Handbook for sessions still marked TBC.
