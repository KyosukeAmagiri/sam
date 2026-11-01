# Maintainer notes: WSLSA 2027 Degree Pathway Explorer

An interactive degree pathway explorer and PDF guide generator for Western Sydney University law students, built entirely from the Western Sydney Law Students' Association **WSLSA Degree Guides 2027** workbook (2027 Student Handbook data).

**Live site: https://wslsa.github.io/degree-pathway/** (works on phones, tablets and computers).

Sample PDF exports: [2788 Accounting, custom pathway (Mode A)](https://wslsa.github.io/degree-pathway/samples/2788-T046-accounting-custom-pathway-A4-portrait.pdf) · [2788 Accounting, complete handbook sheet (Mode B)](https://wslsa.github.io/degree-pathway/samples/2788-T046-accounting-handbook-sheet-A4-portrait.pdf) · [2848 Laws, custom pathway, landscape (Mode A)](https://wslsa.github.io/degree-pathway/samples/2848-laws-custom-pathway-A4-landscape.pdf)

The same app is a single self-contained file, `dist/wslsa-pathway-explorer.html` (about 600 KB), with every degree, pathway and subject embedded, so it also works offline, can be emailed, or can be hosted anywhere static (SharePoint, a WSLSA website). Nothing is sent anywhere: a student's choices are saved in their own browser, and the Copy Share Link button carries a plan to another device.

## What it does

**Cascading selection.** Choosing a degree filters the major/minor list to that degree's own options from the `Lists` sheet, so the workbook's "the selected major/minor doesn't belong to this degree" mismatch cannot occur. The eight fixed-structure degrees (2848, 2785, 2843, 2769, 2767, 2766, 2800, 2758) show a locked selector instead, and 2758 names its built-in Global Politics and International Relations major. Degrees with two pathway groups (2768 ICT and 2538 Social Science) group their options under Pathway A and Pathway B, and every selection carries a badge explaining why that pathway applies, which majors share it, and in which sessions the core law and non-law subjects move compared with the other pathway.

**Interactive slots.** Every "Choose" placeholder in the workbook is now a working control. LLB Alternate slots open a picker listing the degree's LLB Alternate Subjects that actually run in that slot's session (Autumn or Spring), with campus pills, level filters, search, a separate "session TBC" group and an optional view of subjects that only run in the other session. Inline choices such as `FINC 1005 or ECON 1011`, or the Science maths and chemistry options, are toggles inside the slot. "See list" pools (Alternate Accounting, Global Politics option groups, Engaged Learning, Heritage and Tourism) and swappable major options (2538 Child and Community, Disability Studies and Sociology) open the same picker filtered to the right component. Bachelor of Laws electives accept any WSU subject code or a quick pick from the LLB Alternates. A subject can only be placed once in a plan.

**Load and progress.** A full-time view shows the standard 40 CP sessions. A part-time view reflows the same pathway into 20 CP sessions while keeping every subject in a session type it is offered in; it reproduces the Overview's part-time durations for all 13 degrees and is labelled as indicative because it can shift prerequisite timing. Turning on Track progress adds a checklist to every unit, a credit point meter (for example `160 / 400 CP completed`) and an estimate of sessions remaining at the chosen load.

**Campus and risk intelligence.** Campus codes render as colour-coded pills with full campus names on hover; clicking one (or using the Primary campus selector) highlights that campus, flags units that run neither there nor online, and filters the pickers. A risk banner surfaces the advisor prerequisite notes from `Lists` (Note 1 to Note 4) scoped to the selection, the four core law subjects with unpublished 2027 sessions (LAWS 3099, 3101, 3102, 3103) plus any chosen subject that is TBC, subjects still using 2026 session data, campus gaps and open choices. Where the pathway itself bears on a prerequisite gap, the banner says so, for example that picking NATS 3044 in the Year 2 Spring choice slot places it before NATS 3055.

**PDF export.** Print / Save PDF → prints the guide in one click with the last-used settings; PDF Options opens a settings panel with a live A4 preview and a page estimate that matches Chromium's real pagination. Every guide carries the WSLSA masthead and the student's own plan link. Output goes through the browser's print engine, so text and tables stay vector-sharp, and all tints and badges are forced on with `print-color-adjust: exact`.

| Mode | Contents | Length (all 48 pathways tested) |
| --- | --- | --- |
| A: Custom student pathway | Header (degree, major/minor, CP, duration, intake, campuses, CRICOS, Handbook URL and QR code), colour-coded Autumn/Spring grid with your choices marked ◆, campus codes, session CP and optional completion ticks, then advisor warnings, session checks, accreditation, exit awards, campus legend and the WSLSA disclaimer | 1 to 2 pages, portrait or landscape |
| B: Complete handbook sheet | The full pathway on page 1, the complete LLB Alternate Subjects table on page 2 (filterable by session, campus and TBC status), any other choice pools the pathway uses, then accreditation, assumed knowledge, legend and disclaimer | 3 pages portrait; 3 landscape (4 for 2758, which has three extra choice pools) |

**Summer sessions.** Every year bar has a **+ Add Summer** button. In a custom plan it adds an open Summer slot after Spring; from a WSLSA pathway it opens the setup for an editable copy of that pathway and adds the Summer slot there, so the WSLSA recommendations themselves never contain Summer. An open Summer slot's picker lists later subjects in the plan to bring forward (the subject moves into Summer and the empty slot goes, so credit points are unchanged), and Move to lists a Summer session for each year. The workbook has no Summer offerings, so Summer subjects show "Check Handbook" instead of campus pills and are listed in the advisory and the PDF's availability checks. Share links store Summer as session index 2, so older links still open unchanged.

**Progress tools.** Year bars carry calendar years and the facts show the expected finish (the last session with anything in it, at the chosen load), both assuming an Autumn 2027 start (`START_YEAR`), so moving subjects into Summer can bring the finish forward. A Next to enrol card shows the first session with a subject not yet ticked, flags open choices, and copies that session's codes for enrolment. Tick off from my results finds every subject code in pasted text (with or without the space, any case), matches it to the plan and ticks the ones the student keeps selected; a code followed on its line by a fail or withdrawal grade (F, AF, W, Withdrawn and similar) starts unticked, text that only looks like a code (such as "Year 2027") is ignored, and subjects outside the plan are listed for the student to add. Nothing pasted is stored or sent anywhere.

**Tick off from a PDF.** The same dialog takes a PDF of the student's Degree Works audit or the Subject Results page (chosen or dropped on the dialog), and uses only which subjects were passed: grades and marks are never shown or stored. A subject counts only when its row has a grade followed by its credit points (`D 10` in Degree Works, `D 76 10` on Subject Results), so codes in "Still needed" lists, choice pools and notes are never ticked; Degree Works `NA (10)` rows show as in progress, fails and withdrawals start unticked, and 0 CP modules (the academic integrity module) are skipped. In an audit, the requirement name to the left of a code can name a plan subject under another code (the audit counts ECON 2002 for Corporate Finance (UG)), and that plan subject is ticked. Passed subjects outside the plan fill an open choice whose list includes them, most specific first (a named option, then a pool, then LLB Alternates and electives), and are set and ticked together. The Subject Results page is often saved with Print to PDF, which turns its text into drawn shapes, so a page with no text layer is rendered and read with OCR (page segmentation mode 6, as automatic layout drops the narrow grade and mark columns); OCR slips in codes (`LAWS2O03`) and doubled grades (`Cc`) are tolerated, and if a grade is unreadable the mark decides, as every mark from 50 is a pass. The libraries load from jsDelivr only when a PDF is added: pdf.js 4.10.38 (legacy build) and tesseract.js 5.1.1 with its 5.1.1 core and English data, so this one feature needs a connection. Both are pinned in `PDF_LIBS` and `OCR_FILES` in `src/app.js`, and the scripts that run on the page are checked against SHA-384 hashes first (to move to a new version, change the URL and replace its hash with the output of `curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A`). pdf.js parses on the page rather than in a worker, because Chromium cannot start a blob module worker from a page opened as a file.

**School of Law notice.** A card above the advisory carries the School of Law's 26 October 2026 announcement: current students should plan with the 2026 Handbook (this explorer follows the 2027 Handbook and its new curriculum), the six subjects being phased out with their final offering year (`PHASE_OUT` in `src/app.js`), the change to Remedies from 2028, and the Law Enquiry Team contact (`LAW_ENQUIRY`), which also appears in the footer, the advisory's Summer check and the handbook disclaimer on screen and in every PDF.

**Also included.** A full subject catalogue browser for each degree (all components, filterable by session and search, with units in your plan highlighted), program structure and accreditation panels, a "Copy Share Link" button that encodes the degree, choices and progress into a short link, and a layout that works at phone width.

**Share links.** The address bar stays clean while a student plans; a link is built only for Copy Share Link and the PDF's "Your plan" line, and every link is a fresh code that is never the same twice, even for the same plan (for example `#ZUb_qvhOF3zZPH-C_A` for an untouched 2848). Inside the code is a short plan text that names the pathway and carries only what differs from it, with titles looked up from subject codes (only titles typed in by hand travel in the link). An untouched pathway is `2848`; choices, ticks, campus and load add `/p=2S2:LAWS3067`, `/d=` (one bit per slot), `/c=PS` and `/pt`. A custom plan is `my/...`: a copy of a pathway names it with `tp=` and lists runs of untouched template slots as index ranges (`s=0-7,1U:LAWS2003::8,9-39` moves the ninth template subject into Year 1 Summer). `scrambleLink` in `src/app.js` turns that text into the code: 4 random bytes from the browser's secure generator and the time shared seed a keystream that scrambles the time, a check byte and the plan text, so two codes match only if two shares land in the same second with the same random bytes (1 in 4.3 billion). The code is scrambled, not encrypted, and it needs no server or database. The check byte catches a link cut short in transit, which then shows a "damaged link" message and opens the saved plan instead. Opening a link applies it and then clears it from the address bar, including when it is opened in a tab already showing the explorer. Readable links (`#2848/...`) and older `#plan=` links (base64 JSON) still open. Template ranges refer to pathway slot order, so after the workbook changes, an old custom link may place subjects differently. The visual design follows wslsa.com.au: burgundy and charcoal bands, gold accents, Cormorant Garamond display type, Roman-numeral year seals and tracked capital labels.

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

To test, install Playwright with Chromium (`npm install` then `npx playwright install chromium`) and run `npm test` for the behaviour checks across all 48 pathways, `npm run test:pdf` to also render every pathway in both modes and orientations and check page counts and page placement (needs poppler's `pdfinfo` and `pdftotext`), `npm run test:import` to also upload generated Subject Results PDFs (one with text, one as a picture that needs OCR) through the real PDF reader and text recogniser (needs internet), or `npm run samples` to regenerate the PDFs in `samples/`. The default run checks the PDF import rules without the network, with lines as the reader gives them.

## Publishing

`.github/workflows/pages.yml` runs on every push. It validates the data, confirms the committed `dist/` build matches the source, and runs the end-to-end checks in Chromium. When those pass on the default branch, it publishes the app to GitHub Pages as `index.html`, together with the sample PDFs. The one-time setup is **Settings > Pages > Build and deployment > Source: GitHub Actions**; until then the workflow still tests every push and leaves a notice instead of publishing. Keep the repository public: on GitHub's free plan, making it private switches Pages off, and making it public again does not switch it back on, so the Source setting has to be chosen again and the workflow re-run.

To update the live site after the workbook changes, replace the file in `data/source/`, run the three rebuild commands above, and push. The site's address is `https://<owner>.github.io/<repository>/`, so renaming the repository or moving it to another account or organisation moves the site, and GitHub does not redirect the old address. Nothing in the code needs to change when that happens: the deploy step fills in the page's link-preview address from wherever it publishes. A custom domain (Settings > Pages > Custom domain) keeps one stable address regardless of owner or repository name.

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
