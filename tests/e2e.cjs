#!/usr/bin/env node
/* End-to-end checks for dist/wslsa-pathway-explorer.html.

   node tests/e2e.cjs            # behaviour checks across all 48 pathways
   node tests/e2e.cjs --pdf      # also renders every pathway to PDF (needs pdfinfo/pdftotext from poppler)
   node tests/e2e.cjs --samples  # also writes the sample PDFs in samples/

   Requires Playwright with Chromium (npm i -D playwright && npx playwright install chromium). */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const APP = 'file://' + path.join(ROOT, 'dist', 'wslsa-pathway-explorer.html');
const args = new Set(process.argv.slice(2));
const FIXED = ['2848', '2785', '2843', '2769', '2767', '2766', '2800', '2758'];
const TBC_CORE = ['LAWS 3099', 'LAWS 3101', 'LAWS 3102', 'LAWS 3103'];

let failures = 0;
let passes = 0;
function check(cond, msg) {
  if (cond) passes++;
  else { failures++; console.log('FAIL', msg); }
}

async function newPage(browser, opts) {
  const page = await browser.newPage(Object.assign({ viewport: { width: 1360, height: 900 } }, opts || {}));
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
  return page;
}

function hasPoppler() {
  try { execSync('pdfinfo -v', { stdio: 'ignore' }); execSync('pdftotext -v', { stdio: 'ignore' }); return true; } catch (e) { return false; }
}

async function renderPdf(page, key, mode, orient, file) {
  await page.evaluate(([k, m, o]) => { WSLSA.select(k); WSLSA.preparePrint({ mode: m, orient: o }); }, [key, mode, orient]);
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: 'screen' });
}

(async () => {
  const browser = await chromium.launch();
  const page = await newPage(browser);
  await page.goto(APP);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // ---------------------------------------------------------------- every pathway renders correctly
  const info = await page.evaluate(() => WSLSA.keys().map(k => {
    WSLSA.select(k);
    const ctx = WSLSA.context();
    return {
      key: k, degree: ctx.deg.code, cp: ctx.deg.cp, totalCP: ctx.totalCP, slots: ctx.slots.length,
      domSlots: document.querySelectorAll('#grid .subj').length,
      gridText: document.getElementById('grid').textContent + document.getElementById('advisory').textContent + document.getElementById('hero-meta').textContent + document.getElementById('facts').textContent,
      majorOptions: Array.from(document.querySelectorAll('#sel-major option')).map(o => o.value),
      locked: !!document.getElementById('major-locked'),
      degOptions: ctx.deg.options,
      tbc: ctx.risks.tbc.map(s => s.code),
      advisor: ctx.risks.advisor.map(a => ({ applies: a.applies, subject: a.note.subject, hint: a.hint })),
      badge: document.querySelector('.pbadge').textContent,
      group: ctx.opt.groupLetter,
      ptYears: ctx.deg.ptYears,
    };
  }));
  check(info.length === 48, `expected 48 pathways, got ${info.length}`);
  for (const p of info) {
    check(p.totalCP === p.cp, `${p.key}: pathway sums to ${p.totalCP}, degree requires ${p.cp}`);
    check(p.domSlots === p.slots, `${p.key}: ${p.domSlots} slot cards for ${p.slots} slots`);
    check(!/undefined|null|NaN|\[object/.test(p.gridText), `${p.key}: placeholder text leaked into the page`);
    if (FIXED.includes(p.degree)) check(p.locked && p.majorOptions.length === 0, `${p.key}: major selector should be locked`);
    else check(!p.locked && JSON.stringify(p.majorOptions) === JSON.stringify(p.degOptions), `${p.key}: major dropdown must list only this degree's majors/minors`);
    for (const c of TBC_CORE) check(p.tbc.includes(c), `${p.key}: ${c} missing from TBC warnings`);
    check(p.group ? p.badge === 'Pathway ' + p.group : p.badge === 'Single pathway', `${p.key}: badge ${p.badge}`);
  }

  // ---------------------------------------------------------------- advisor notes are scoped to the selection
  const adv = Object.fromEntries(info.map(p => [p.key, p.advisor]));
  const applies = k => adv[k].filter(a => a.applies).map(a => a.subject).sort().join(',');
  check(applies('2788|T046') === 'ACCT 3001,ACCT 3011', '2788|T046 should carry both ACCT notes');
  check(adv['2788|T165'].length === 0, '2788|T165 should carry no notes');
  check(applies('2766|BASE') === 'CULT 3013,CULT 3018', '2766 should carry both CULT notes');
  check(applies('2768|0325') === 'INFO 3015', '2768|0325 should carry the INFO 3015 note');
  check(adv['2768|0128'].length === 0, '2768|0128 should carry no notes');
  check(applies('2743|T185') === 'NATS 3055', '2743|T185 should carry the NATS 3055 note');
  check(adv['2743|T164'].length === 1 && !adv['2743|T164'][0].applies && /NATS 3044 is one of the options/.test(adv['2743|T164'][0].hint),
    '2743|T164 should show the NATS 3055 note as related, with the NATS 3044 option hint');

  // ---------------------------------------------------------------- part-time view matches Overview durations
  await page.click('[data-action="load"][data-load="PT"]');
  for (const p of info) {
    const years = await page.evaluate(k => { WSLSA.select(k); return document.querySelectorAll('#grid .year').length; }, p.key);
    check(years === Math.ceil(p.ptYears), `${p.key}: part-time view runs ${years} years, Overview says ${p.ptYears}`);
  }
  await page.click('[data-action="load"][data-load="FT"]');

  // ---------------------------------------------------------------- LLB picker is filtered by session
  await page.evaluate(() => WSLSA.select('2848|BASE'));
  for (const slot of ['2S2', '3A2']) {
    await page.click(`#slot-${slot} [data-action="picker-open"]`);
    const listed = await page.$$eval('#pick-results .pick-section:first-child .pick', els => els.map(e => e.dataset.code));
    const bad = await page.evaluate(([codes, s]) => {
      const deg = WSLSA.context().deg;
      const col = s[1] === 'A' ? 'autumn' : 'spring';
      return codes.filter(c => { const v = deg.byCode[c][col]; return !v || v === '—' || v === 'TBC'; });
    }, [listed, slot]);
    check(listed.length > 5 && bad.length === 0, `2848 ${slot}: picker lists subjects not offered that session: ${bad}`);
    await page.keyboard.press('Escape');
  }
  await page.click('#slot-2S2 [data-action="picker-open"]');
  await page.click('#pick-results .pick[data-code="LAWS 3067"]');
  await page.click('#slot-3A2 [data-action="picker-open"]');
  check(!(await page.$('#pick-results .pick[data-code="LAWS 3067"]')), 'Spring-only LAWS 3067 must not appear for an Autumn slot');
  await page.click('#pick-results .pick[data-code="LAWS 4008"]');
  await page.click('#slot-3S3 [data-action="picker-open"]');
  check(await page.$eval('#pick-results .pick[data-code="LAWS 3067"]', b => b.disabled), 'a subject already in the plan must be disabled in other slots');
  await page.keyboard.press('Escape');

  // custom elective: a code in neither the workbook nor the subject list is stored as typed
  await page.click('#slot-1A4 [data-action="picker-open"]');
  await page.fill('#cu-code', 'test 1001');
  await page.fill('#cu-title', 'Unlisted Subject');
  await page.click('#custom-form button[type=submit]');
  const el = await page.evaluate(() => { const s = WSLSA.context().byId['1A4']; return [s.code, s.custom]; });
  check(el[0] === 'TEST 1001' && el[1] === true, 'custom elective should be stored and upper-cased');
  // a workbook subject from another degree typed by hand resolves to the real subject, not a custom one
  await page.click('#slot-1A4 [data-action="picker-open"]');
  await page.fill('#cu-code', 'humn1052');
  await page.fill('#cu-title', 'my own title');
  await page.click('#custom-form button[type=submit]');
  const known = await page.evaluate(() => { const s = WSLSA.context().byId['1A4']; return [s.code, !!s.custom, s.title]; });
  check(known[0] === 'HUMN 1052' && !known[1] && known[2] !== 'my own title', 'a typed workbook code should resolve to the 2027 Handbook subject and title');

  // ---------------------------------------------------------------- inline choices and duplicate prevention
  const dupe = await page.evaluate(() => {
    for (const k of WSLSA.keys()) {
      WSLSA.select(k);
      const inl = WSLSA.context().slots.filter(s => s.kind === 'inline' && s.raw.options.length > 1);
      for (let i = 0; i < inl.length; i++) for (let j = i + 1; j < inl.length; j++) {
        const shared = inl[i].raw.options.map(o => o.code).find(c => inl[j].raw.options.some(o => o.code === c));
        if (shared) return { key: k, a: inl[i].id, b: inl[j].id, code: shared };
      }
    }
    return null;
  });
  if (dupe) {
    await page.evaluate(k => WSLSA.select(k), dupe.key);
    await page.click(`#slot-${dupe.a} .inline-opt[data-code="${dupe.code}"]`);
    const picked = await page.evaluate(id => WSLSA.context().byId[id].code, dupe.a);
    check(picked === dupe.code, `${dupe.key}: inline choice should lock in ${dupe.code}`);
    check(await page.$eval(`#slot-${dupe.b} .inline-opt[data-code="${dupe.code}"]`, b => b.disabled), `${dupe.key}: ${dupe.code} should be disabled in ${dupe.b}`);
  }

  // NATS 3044 chosen before NATS 3055 resolves the related note hint
  await page.evaluate(() => WSLSA.select('2743|T164'));
  await page.click('#slot-2S4 .inline-opt[data-code="NATS 3044"]');
  check(await page.evaluate(() => WSLSA.context().risks.advisor[0].resolvedByChoice), 'picking NATS 3044 should be recognised as placing the prerequisite first');

  // ---------------------------------------------------------------- major option swap
  await page.evaluate(() => WSLSA.select('2538|0045'));
  await page.click('#slot-1S4 [data-action="picker-open"]');
  await page.click('#pick-results .pick[data-code="WELF 2001"]');
  check(await page.evaluate(() => WSLSA.context().byId['1S4'].code) === 'WELF 2001', '2538|0045 option swap should apply');

  // ---------------------------------------------------------------- progress tracking
  await page.evaluate(() => WSLSA.select('2788|T046'));
  await page.click('#grid [data-action="session-done"]');
  check(/^40 \/ 400/.test((await page.textContent('#progress-num')).trim()), 'marking a full session should show 40 / 400 CP');

  // ---------------------------------------------------------------- campus filter
  await page.selectOption('#sel-campus', 'CA');
  const campus = await page.evaluate(() => WSLSA.context().risks.campus.map(s => s.code));
  check(campus.length > 0 && campus.every(c => c !== 'LAWS 1003'), '2788|T046 at Campbelltown should flag PC-only subjects but not LAWS 1003');

  // ---------------------------------------------------------------- plan link round trip
  await page.evaluate(() => WSLSA.select('2848|BASE'));
  const url = await page.evaluate(() => location.href);
  const fresh = await browser.newContext();
  const p2 = await fresh.newPage();
  await p2.goto(url);
  const restored = await p2.evaluate(() => { const c = WSLSA.context(); return [c.key, c.byId['2S2'].code, c.byId['3A2'].code, c.byId['1A4'].code]; });
  check(JSON.stringify(restored) === JSON.stringify(['2848|BASE', 'LAWS 3067', 'LAWS 4008', 'HUMN 1052']), `plan link should restore choices, got ${restored}`);
  await p2.goto(APP + '#plan=not-valid-base64!!');
  check(await p2.evaluate(() => !!WSLSA.context().key), 'a malformed plan link should fall back gracefully');
  await fresh.close();

  // ---------------------------------------------------------------- WSU subject list and ranked elective search
  check(await page.evaluate(() => WSLSA.extraCount()) === 3407, 'all 3,407 new subjects from the subject list should be loaded');
  await page.evaluate(() => WSLSA.select('2848|BASE'));
  await page.click('#slot-2S2 [data-action="picker-open"]');
  check(!/Any WSU subject/.test(await page.textContent('#pick-results')), 'LLB Alternate slots must not offer the any-subject list');
  await page.keyboard.press('Escape');
  await page.click('#slot-1S4 [data-action="picker-open"]');
  const useBtn = await page.$eval('#custom-form button[type=submit]', b => [getComputedStyle(b).backgroundColor, getComputedStyle(b).color]);
  check(useBtn[0] !== useBtn[1] && useBtn[0] !== 'rgb(255, 255, 255)', '"Use subject" must render as a filled primary button, not white on white');
  for (const q of ['ACCT2004', 'acct 2004', 'ACCT 2004']) {
    await page.fill('#pick-q', q);
    check(/Exact match/.test(await page.textContent('.pick-best')) && /ACCT 2004/.test(await page.textContent('.pick-best')), `"${q}" should pin ACCT 2004 as the exact match`);
  }
  for (const q of ['intermediate financial', 'financial intermediate', 'intermidiate financial']) {
    await page.fill('#pick-q', q);
    const best = await page.$('.pick-best');
    check(best && /ACCT 2004/.test(await best.textContent()), `"${q}" should rank ACCT 2004 Intermediate Financial Accounting first`);
  }
  await page.fill('#pick-q', 'Revenue Law');
  check(/LAWS 4008/.test(await page.textContent('.pick-best')) && /runs only in Autumn/.test(await page.textContent('.pick-best')) && await page.$eval('.pick-best .pick', b => b.disabled),
    '"Revenue Law" in a Spring slot should surface LAWS 4008 as an exact match that runs only in Autumn');
  await page.fill('#pick-q', 'ACCT1007');
  check(/ACCT 1007/.test(await page.textContent('.pick-best')) && /PC|BC|CA/.test(await page.textContent('.pick-best')), 'workbook subjects from other degrees (ACCT 1007) should be searchable as electives, with their sessions');
  await page.fill('#pick-q', 'psychology');
  check(!(await page.$('.pick-best')) && (await page.$$('#pick-results .pick[data-src="list"]')).length > 5, 'a broad search should list ranked results without forcing a best match');
  await page.fill('#pick-q', 'acct2004');
  await page.click('.pick-best .pick');
  const listPick = await page.evaluate(() => { const s = WSLSA.context().byId['1S4']; return [s.code, s.listSubject, s.offer]; });
  check(listPick[0] === 'ACCT 2004' && listPick[1] === true && listPick[2] === null, 'choosing from the subject list should store a subject-list elective');
  check(/Check Handbook/.test(await page.textContent('#slot-1S4')), 'subject-list electives should point students to the Handbook for sessions');
  const listUrl = await page.evaluate(() => location.href);
  const ctx2 = await browser.newContext();
  const p3 = await ctx2.newPage();
  await p3.goto(listUrl);
  check(await p3.evaluate(() => { const s = WSLSA.context().byId['1S4']; return s.code === 'ACCT 2004' && s.listSubject; }), 'plan links should keep subject-list electives');
  await ctx2.close();
  await page.click('#slot-2S3 [data-action="picker-open"]');
  await page.fill('#cu-code', 'hlth1006');
  check(await page.inputValue('#cu-title') === 'Movement and Skill Development', 'typing a known code in the manual form should fill the title');
  await page.keyboard.press('Escape');
  await page.click('#tab-catalogue');
  await page.selectOption('#cat-comp', '__extra__');
  await page.fill('#cat-q', 'intermediate financial');
  check(/ACCT 2004/.test(await page.textContent('#cat-results')), 'catalogue should search the WSU subject list');
  await page.selectOption('#cat-comp', '');
  await page.fill('#cat-q', 'Revenue');
  const revenueRows = await page.$$eval('#cat-results tbody tr', trs => trs.filter(tr => tr.querySelector('.c-code').textContent === 'LAWS 4008').length);
  check(revenueRows === 1, `LAWS 4008 should appear once in a combined search, appeared ${revenueRows} times`);
  await page.fill('#cat-q', '');
  await page.click('#tab-structure');

  // ---------------------------------------------------------------- redesign: roman numerals, advisory, tabs, checkbox
  await page.evaluate(() => WSLSA.select('2843|BASE'));
  const romans = await page.$$eval('#grid .year-seal', els => els.map(e => e.textContent));
  check(JSON.stringify(romans) === JSON.stringify(['I', 'II', 'III', 'IV', 'V', 'VI']), `2843 year seals should read I to VI, got ${romans}`);
  await page.evaluate(() => WSLSA.select('2788|T046'));
  check(await page.$eval('#advisory-box', d => !d.open), 'advisory starts collapsed');
  await page.click('#grid .flag-warn[data-action="open-advisory"]');
  check(await page.$eval('#advisory-box', d => d.open), 'Check prerequisite flag should open the advisory');
  check(/2 prerequisite notes/.test(await page.textContent('#advisory-box summary')), 'advisory summary should count the 2 ACCT notes');
  await page.click('#tab-admission');
  check(/Exit awards/.test(await page.textContent('#details')), 'admission tab should show exit awards');
  await page.click('#tab-catalogue');
  await page.fill('#cat-q', 'Revenue');
  check(/LAWS 4008/.test(await page.textContent('#cat-results')), 'catalogue search should find LAWS 4008');
  await page.click('#tab-structure');
  const before = await page.evaluate(() => WSLSA.context().doneCP);
  await page.click('#slot-3S1 .tick');
  check(await page.evaluate(() => WSLSA.context().doneCP) === before + 10, 'ticking a subject should add 10 CP');
  check(await page.$eval('#slot-3S1', el => el.classList.contains('is-done')), 'ticked subject should be marked done');
  await page.click('#slot-3S1 .tick');
  check(await page.evaluate(() => WSLSA.context().doneCP) === before, 'unticking should remove the CP again');
  const planDoc = await page.evaluate(() => WSLSA.buildPrintDoc({ mode: 'A', orient: 'portrait' }));
  check(/#plan=/.test(planDoc) && /Est\. 1996/.test(planDoc), 'PDF masthead should carry the plan link and Est. 1996 line');

  // ---------------------------------------------------------------- export modal and print document
  await page.click('[data-action="export-open"]');
  await page.waitForTimeout(300);
  check(/Estimated length: [12] A4 page/.test(await page.textContent('#preview-pages')), 'Mode A preview should estimate 1-2 pages');
  await page.keyboard.press('Escape');
  const docB = await page.evaluate(() => WSLSA.buildPrintDoc({ mode: 'B', orient: 'portrait' }));
  check(docB.includes('LLB Alternate Subjects') && docB.includes('pd-page-break'), 'Mode B should append the LLB Alternate table after a page break');

  // ---------------------------------------------------------------- mobile layout
  const m = await newPage(browser, { viewport: { width: 390, height: 844 } });
  await m.goto(APP);
  check(await m.evaluate(() => document.documentElement.scrollWidth <= 390), 'no horizontal scroll at 390px');
  check(m.errors.length === 0, 'mobile console errors: ' + m.errors.join('; '));
  await m.close();

  // ---------------------------------------------------------------- PDFs (optional)
  if (args.has('--pdf') || args.has('--samples')) {
    if (!hasPoppler()) {
      console.log('SKIP PDF checks: pdfinfo/pdftotext not installed');
    } else {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wslsa-'));
      const pdfPage = await newPage(browser);
      await pdfPage.goto(APP);
      await pdfPage.evaluate(() => document.fonts.ready);
      const keys = args.has('--pdf') ? info.map(p => p.key) : [];
      for (const key of keys) {
        for (const [mode, orient, max] of [['A', 'portrait', 2], ['A', 'landscape', 2], ['B', 'portrait', 3], ['B', 'landscape', 4]]) {
          const f = path.join(tmp, 'x.pdf');
          await renderPdf(pdfPage, key, mode, orient, f);
          const pages = +execSync(`pdfinfo "${f}"`).toString().match(/Pages:\s+(\d+)/)[1];
          check(pages <= max, `${key} Mode ${mode} ${orient}: ${pages} pages (max ${max})`);
          const codes = await pdfPage.evaluate(() => Array.from(document.querySelectorAll('#print-root td.pd-code')).map(td => td.textContent.trim()).filter(c => c !== '—'));
          const p1 = execSync(`pdftotext -f 1 -l 1 "${f}" -`).toString().replace(/\s+/g, ' ');
          const missing = codes.filter(c => !p1.includes(c));
          check(missing.length === 0, `${key} Mode ${mode} ${orient}: grid spills off page 1 (${missing.join(', ')})`);
          if (mode === 'B') {
            const p2 = execSync(`pdftotext -f 2 -l 2 "${f}" -`).toString();
            check(p2.includes('LLB Alternate Subjects'), `${key} Mode B ${orient}: LLB Alternate table should start on page 2`);
          }
        }
      }
      if (args.has('--samples')) {
        const out = path.join(ROOT, 'samples');
        fs.mkdirSync(out, { recursive: true });
        // a realistic plan: Accounting major, Parramatta South, several choices made, first year complete
        await pdfPage.evaluate(() => {
          localStorage.clear();
          WSLSA.select('2788|T046');
        });
        await pdfPage.selectOption('#sel-campus', 'PS');
        await pdfPage.click('#slot-2A3 .inline-opt[data-code="ECON 1011"]');
        for (const [slot, code] of [['4A3', 'LAWS 4008'], ['4A4', 'LAWS 4018'], ['4S3', 'LAWS 3067'], ['4S4', 'LAWS 3005']]) {
          await pdfPage.click(`#slot-${slot} [data-action="picker-open"]`);
          await pdfPage.click(`#pick-results .pick[data-code="${code}"]`);
        }
        for (const i of [0, 1]) await pdfPage.locator('#grid .year:first-child [data-action="session-done"]').nth(i).click();
        const samples = [
          ['2788|T046', 'A', 'portrait', '2788-T046-accounting-custom-pathway-A4-portrait.pdf'],
          ['2788|T046', 'B', 'portrait', '2788-T046-accounting-handbook-sheet-A4-portrait.pdf'],
        ];
        for (const [key, mode, orient, name] of samples) {
          await pdfPage.evaluate(([m, o]) => WSLSA.preparePrint({ mode: m, orient: o, ticks: true }), [mode, orient]);
          await pdfPage.emulateMedia({ media: 'print' });
          await pdfPage.pdf({ path: path.join(out, name), preferCSSPageSize: true, printBackground: true });
          await pdfPage.emulateMedia({ media: 'screen' });
        }
        await pdfPage.evaluate(() => { localStorage.clear(); WSLSA.select('2848|BASE'); });
        await pdfPage.reload();
        await renderPdf(pdfPage, '2848|BASE', 'A', 'landscape', path.join(out, '2848-laws-custom-pathway-A4-landscape.pdf'));
        console.log('Wrote sample PDFs to samples/');
      }
      check(pdfPage.errors.length === 0, 'PDF page errors: ' + pdfPage.errors.join('; '));
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  check(page.errors.length === 0, 'console errors: ' + page.errors.join('; '));
  await browser.close();
  console.log(`\n${passes} checks passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
