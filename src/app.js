/* WSLSA 2027 Degree Pathway Explorer.
   All data comes from the embedded JSON payload built by scripts/build_app.py from the WSLSA 2027
   Degree Guides workbook. No network calls; state lives in localStorage and the URL hash. */
(function () {
  'use strict';

  // ======================================================================== data
  const $ = (sel, root) => (root || document).querySelector(sel);
  const RAW = JSON.parse($('#wslsa-data').textContent);
  const META = RAW.meta;
  const CAMPUS_NAMES = Object.assign({}, META.campuses, { TBC: 'Session not yet published for 2027' });
  const PRIMARY_CAMPUSES = ['PS', 'CA', 'PC', 'HA', 'BC', 'PE', 'LC'];
  const SESSIONS = ['Autumn', 'Spring'];
  const LOAD_CP = { FT: 40, PT: 20 };

  const DEG = {};
  const DEGREES = RAW.degrees.map(function (d) {
    d.catalogue = d.catalogue.map(function (r) {
      return { component: r[0], level: r[1], code: r[2], title: r[3], autumn: r[4], spring: r[5], cp: r[6], source: r[7] };
    });
    d.byCode = {};
    d.byComp = {};
    d.components = [];
    d.catalogue.forEach(function (c) {
      if (!d.byCode[c.code]) d.byCode[c.code] = c;
      if (!d.byComp[c.component]) { d.byComp[c.component] = []; d.components.push(c.component); }
      d.byComp[c.component].push(c);
    });
    d.llbComponent = d.components.find(function (c) { return c.indexOf('LLB Alternate') === 0; });
    DEG[d.code] = d;
    return d;
  });

  const OPT = {};
  RAW.options.forEach(function (o) { OPT[o.pathwayKey] = o; });

  const PATH = {};
  Object.keys(RAW.pathways).forEach(function (key) {
    PATH[key] = RAW.pathways[key].map(function (r) {
      return {
        year: r[0], session: r[1] === 'A' ? 'Autumn' : 'Spring', slot: r[2], code: r[3], title: r[4], type: r[5],
        offered: r[6], cp: r[7], notes: r[8], kind: r[9], pool: r[10] || null,
        options: r[11] ? r[11].map(function (o) { return { code: o[0], title: o[1], tbcFlag: o[2] }; }) : null,
        id: r[0] + r[1] + r[2],
      };
    });
  });

  // ======================================================================== helpers
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function parseOffered(v) {
    let s = (v || '').trim();
    const info = { codes: [], tbc: false, y2026: false, none: false };
    if (!s || s === '—' || s === '-') { info.none = true; return info; }
    if (s.indexOf('(2026)') >= 0) { info.y2026 = true; s = s.replace('(2026)', '').trim(); }
    if (s === 'TBC') { info.tbc = true; return info; }
    info.codes = s.split(/\s+/);
    return info;
  }
  function sessionValue(entry, session) { return session === 'Autumn' ? entry.autumn : entry.spring; }
  function offerFor(deg, code, session) {
    const e = deg.byCode[code];
    if (!e) return null;
    const info = parseOffered(sessionValue(e, session));
    if (e.source && /^2026/.test(e.source)) info.y2026 = true;
    return info;
  }
  function orderIdx(y, s) { return (y - 1) * 2 + (s === 'Spring' ? 1 : 0); }
  function where(s) { return 'Year ' + s.year + ' ' + s.session; }
  function fmt(n) { return String(Math.round(n * 10) / 10); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function cleanPoolTitle(t) { return t.replace(/\s*\(see list\)\s*/, '').trim(); }
  function today() {
    return new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function typeGroup(type) {
    switch (type) {
      case 'Law': return 'law';
      case 'Non-law': return 'nonlaw';
      case 'Major': case 'Major (option)': return 'major';
      case 'LLB alternate': return 'llb';
      case 'Choice': return 'choice';
      case 'Elective': return 'elective';
      default: return 'nonlaw';
    }
  }
  const TYPE_LABEL = { law: 'Law core', nonlaw: 'Non-law core', major: 'Major / minor', llb: 'LLB alternate', choice: 'Choice', elective: 'Elective' };
  function typeLabel(raw, opt) {
    if (raw.type === 'Major') return opt.majorKind === 'Minor' ? 'Minor' : 'Major';
    if (raw.type === 'Major (option)') return 'Major option';
    return TYPE_LABEL[typeGroup(raw.type)];
  }

  // ======================================================================== state
  const STORE_KEY = 'wslsa-2027-pathway-explorer:v1';
  const DEFAULT_EXPORT = { mode: 'A', orient: 'portrait', ticks: true, llbSession: 'all', llbCampus: false, llbTbc: true };
  let state = sanitise(readStore());
  const ui = { tab: 'structure', cat: { q: '', comp: '', session: '', inPlan: false }, modal: null, picker: null };

  function readStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { return null; }
  }
  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* private mode: state still works for this session */ }
  }
  function str(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }
  function sanitisePicks(key, picks) {
    const out = {};
    if (!picks || typeof picks !== 'object' || !PATH[key]) return out;
    PATH[key].forEach(function (raw) {
      const p = picks[raw.id];
      if (!p || raw.kind === 'fixed') return;
      const code = str(p.code, 16).trim();
      const title = str(p.title, 140).trim();
      if (!code || !title) return;
      out[raw.id] = { code: code, title: title, custom: raw.kind === 'elective' && !!p.custom };
    });
    return out;
  }
  function sanitiseDone(key, done) {
    const out = {};
    if (!done || !PATH[key]) return out;
    const ids = Array.isArray(done) ? done : Object.keys(done);
    PATH[key].forEach(function (raw) { if (ids.indexOf(raw.id) >= 0) out[raw.id] = 1; });
    return out;
  }
  function sanitise(s) {
    s = s && typeof s === 'object' ? s : {};
    const out = {
      degree: DEG[s.degree] ? s.degree : DEGREES[0].code,
      majorFor: {},
      campus: PRIMARY_CAMPUSES.indexOf(s.campus) >= 0 ? s.campus : '',
      load: s.load === 'PT' ? 'PT' : 'FT',
      track: !!s.track,
      picks: {},
      done: {},
      exp: Object.assign({}, DEFAULT_EXPORT),
    };
    if (s.majorFor && typeof s.majorFor === 'object') {
      Object.keys(s.majorFor).forEach(function (d) {
        if (DEG[d] && DEG[d].options.indexOf(s.majorFor[d]) >= 0) out.majorFor[d] = s.majorFor[d];
      });
    }
    Object.keys(PATH).forEach(function (key) {
      const p = sanitisePicks(key, s.picks && s.picks[key]);
      if (Object.keys(p).length) out.picks[key] = p;
      const d = sanitiseDone(key, s.done && s.done[key]);
      if (Object.keys(d).length) out.done[key] = d;
    });
    if (s.exp && typeof s.exp === 'object') {
      if (s.exp.mode === 'B') out.exp.mode = 'B';
      if (s.exp.orient === 'landscape') out.exp.orient = 'landscape';
      out.exp.ticks = s.exp.ticks !== false;
      if (['Autumn', 'Spring', 'all'].indexOf(s.exp.llbSession) >= 0) out.exp.llbSession = s.exp.llbSession;
      out.exp.llbCampus = !!s.exp.llbCampus;
      out.exp.llbTbc = s.exp.llbTbc !== false;
    }
    return out;
  }
  function currentKey() {
    const deg = DEG[state.degree];
    const k = state.majorFor[deg.code];
    return deg.options.indexOf(k) >= 0 ? k : deg.options[0];
  }

  // ---- shareable URL hash: #plan=<base64url(JSON)>
  function b64enc(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function b64dec(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); }
  function encodePlan() {
    const key = currentKey();
    return b64enc(JSON.stringify({
      v: 1, k: key, c: state.campus, l: state.load, t: state.track ? 1 : 0,
      p: state.picks[key] || {}, d: Object.keys(state.done[key] || {}),
    }));
  }
  function applyHash() {
    const m = /^#plan=([A-Za-z0-9_-]+)$/.exec(location.hash || '');
    if (!m) return false;
    try {
      const o = JSON.parse(b64dec(m[1]));
      if (!o || !PATH[o.k]) return false;
      const deg = o.k.split('|')[0];
      state.degree = deg;
      state.majorFor[deg] = o.k;
      state.campus = PRIMARY_CAMPUSES.indexOf(o.c) >= 0 ? o.c : '';
      state.load = o.l === 'PT' ? 'PT' : 'FT';
      state.track = !!o.t;
      state.picks[o.k] = sanitisePicks(o.k, o.p);
      state.done[o.k] = sanitiseDone(o.k, o.d);
      return true;
    } catch (e) { return false; }
  }
  function planUrl() { return location.href.split('#')[0] + '#plan=' + encodePlan(); }
  function syncHash() {
    try { history.replaceState(null, '', '#plan=' + encodePlan()); } catch (e) { /* file:// in some browsers */ }
  }

  // ======================================================================== slot resolution
  function placeholder(raw) {
    if (raw.kind === 'llb') return 'LLB Alternate subject: choose from the list';
    if (raw.kind === 'pool') return 'Choose: ' + cleanPoolTitle(raw.title);
    if (raw.kind === 'elective') return 'Elective (any WSU subject)';
    if (raw.kind === 'inline') return 'Choose one of the options below';
    return raw.title;
  }

  function resolveSlot(raw, deg, opt, picks, done) {
    const s = {
      raw: raw, id: raw.id, year: raw.year, session: raw.session, cp: raw.cp, kind: raw.kind, type: raw.type,
      group: typeGroup(raw.type), typeLabel: typeLabel(raw, opt), selectable: raw.kind !== 'fixed',
      pick: picks[raw.id] || null, done: !!done[raw.id], pending: false, chosen: false, auto: false, custom: false,
      code: null, title: null, offer: null, tbcFlag: false,
    };
    if (raw.kind === 'fixed') {
      s.code = raw.code; s.title = raw.title; s.offer = parseOffered(raw.offered);
    } else if (raw.kind === 'option') {
      if (s.pick && s.pick.code !== raw.code) {
        s.code = s.pick.code; s.title = s.pick.title; s.chosen = true; s.offer = offerFor(deg, s.code, s.session);
      } else {
        s.code = raw.code; s.title = raw.title; s.offer = parseOffered(raw.offered);
      }
    } else if (raw.kind === 'inline') {
      let o = s.pick ? raw.options.find(function (x) { return x.code === s.pick.code; }) : null;
      if (!o && raw.options.length === 1) { o = raw.options[0]; s.auto = true; }
      if (o) {
        s.code = o.code; s.title = o.title; s.chosen = !s.auto; s.tbcFlag = o.tbcFlag;
        s.offer = offerFor(deg, o.code, s.session) || { codes: [], tbc: false, y2026: false, none: true };
        if (o.tbcFlag) s.offer.tbc = true;
      } else {
        s.pending = true; s.title = placeholder(raw);
      }
    } else {
      if (s.pick) {
        s.code = s.pick.code; s.title = s.pick.title; s.chosen = true; s.custom = !!s.pick.custom;
        s.offer = s.custom ? null : offerFor(deg, s.code, s.session);
      } else {
        s.pending = true; s.title = placeholder(raw);
      }
    }
    return s;
  }

  function buildContext() {
    const key = currentKey();
    const deg = DEG[state.degree];
    const opt = OPT[key];
    const picks = state.picks[key] || {};
    const done = state.done[key] || {};
    const slots = PATH[key].map(function (raw) { return resolveSlot(raw, deg, opt, picks, done); });
    const byId = {};
    const used = {};
    slots.forEach(function (s) {
      byId[s.id] = s;
      if (s.code && !s.pending) (used[s.code] = used[s.code] || []).push(s.id);
    });
    const ctx = { key: key, deg: deg, opt: opt, slots: slots, byId: byId, used: used };
    ctx.totalCP = slots.reduce(function (a, s) { return a + s.cp; }, 0);
    ctx.doneCP = slots.reduce(function (a, s) { return a + (s.done ? s.cp : 0); }, 0);
    ctx.risks = computeRisks(ctx);
    return ctx;
  }
  function usedElsewhere(ctx, code, slotId) {
    const ids = ctx.used[code] || [];
    return ids.some(function (id) { return id !== slotId; });
  }
  function poolEntries(ctx, raw) {
    const comps = raw.kind === 'elective' ? [ctx.deg.llbComponent] : raw.pool;
    const seen = {};
    const out = [];
    comps.forEach(function (comp) {
      (ctx.deg.byComp[comp] || []).forEach(function (e) {
        if (seen[e.code]) return;
        seen[e.code] = 1;
        out.push(e);
      });
    });
    return out;
  }

  // ======================================================================== risk engine
  function prereqHint(ctx, note, flagSlot) {
    const fIdx = flagSlot ? orderIdx(flagSlot.year, flagSlot.session) : Infinity;
    const have = ctx.slots.find(function (s) { return !s.pending && s.code === note.prereq; });
    if (have) {
      return { type: orderIdx(have.year, have.session) < fIdx ? 'have-before' : 'have-after', slot: have };
    }
    const optSlot = ctx.slots.find(function (s) {
      if (s.kind === 'inline') return s.raw.options.some(function (o) { return o.code === note.prereq; });
      if (s.kind === 'pool' || s.kind === 'option') return poolEntries(ctx, s.raw).some(function (e) { return e.code === note.prereq; });
      return false;
    });
    if (optSlot) return { type: 'option', slot: optSlot, before: orderIdx(optSlot.year, optSlot.session) < fIdx };
    return null;
  }
  function hintText(note, h, flagSlot) {
    if (!h) return '';
    if (h.type === 'have-before') return 'Your plan has ' + note.prereq + ' in ' + where(h.slot) + ', before ' + note.subject + '. Still confirm with the advisor that this satisfies the rule.';
    if (h.type === 'have-after') return 'Your plan has ' + note.prereq + ' in ' + where(h.slot) + ', which is after ' + note.subject + (flagSlot ? ' (' + where(flagSlot) + ')' : '') + '.';
    if (h.type === 'option') return note.prereq + ' is one of the options in your ' + where(h.slot) + ' choice slot' + (h.before ? '; picking it there places it before ' + note.subject + '.' : ', but that slot sits after ' + note.subject + '.');
    return '';
  }
  function computeRisks(ctx) {
    const advisor = [];
    ctx.deg.advisorNotes.forEach(function (n) {
      const applies = !n.major || n.major === ctx.opt.majorName;
      const flagSlot = ctx.slots.find(function (s) { return !s.pending && s.code === n.subject; }) || null;
      if (!applies && !flagSlot) return;
      const h = prereqHint(ctx, n, flagSlot);
      advisor.push({ note: n, applies: applies, flagSlot: flagSlot, hint: hintText(n, h, flagSlot), resolvedByChoice: !!(h && h.type === 'have-before' && h.slot.chosen) });
    });
    const live = ctx.slots.filter(function (s) { return !s.pending && s.offer; });
    const tbc = live.filter(function (s) { return s.offer.tbc; });
    const y2026 = live.filter(function (s) { return s.offer.y2026 && !s.offer.tbc; });
    const notOffered = live.filter(function (s) { return s.offer.none; });
    let campus = [];
    let onlineOnly = [];
    if (state.campus) {
      live.forEach(function (s) {
        if (s.offer.tbc || s.offer.none) return;
        const here = s.offer.codes.indexOf(state.campus) >= 0;
        const online = s.offer.codes.indexOf('ON') >= 0;
        if (!here && !online) campus.push(s);
        else if (!here && online) onlineOnly.push(s);
      });
    }
    const pending = ctx.slots.filter(function (s) { return s.pending; });
    return { advisor: advisor, tbc: tbc, y2026: y2026, notOffered: notOffered, campus: campus, onlineOnly: onlineOnly, pending: pending };
  }

  // ======================================================================== timeline (FT / PT)
  function timeline(ctx, load) {
    const years = {};
    function slotIn(y, sess, s) {
      years[y] = years[y] || { year: y, Autumn: [], Spring: [] };
      years[y][sess].push(s);
    }
    if (load !== 'PT') {
      ctx.slots.forEach(function (s) { slotIn(s.year, s.session, s); });
    } else {
      // Indicative part-time reflow: each full-time session is split into two 20 CP halves. The first
      // half runs in part-time year 2y-1 and the second in year 2y, always in the same session type,
      // so every subject stays in a session it is offered in.
      const groups = {};
      ctx.slots.forEach(function (s) { (groups[s.year + s.session] = groups[s.year + s.session] || []).push(s); });
      Object.keys(groups).forEach(function (k) {
        const list = groups[k].slice().sort(function (a, b) { return a.raw.slot - b.raw.slot; });
        let cum = 0;
        let second = false;
        list.forEach(function (s) {
          if (!second && cum + s.cp <= LOAD_CP.PT) { cum += s.cp; slotIn(s.year * 2 - 1, s.session, s); }
          else { second = true; slotIn(s.year * 2, s.session, s); }
        });
      });
    }
    return Object.keys(years).map(Number).sort(function (a, b) { return a - b; }).map(function (y) { return years[y]; });
  }

  // ======================================================================== render: pieces
  function pill(code, opts) {
    opts = opts || {};
    const name = CAMPUS_NAMES[code] || code;
    let cls = 'pill cp-' + code;
    if (state.campus && code !== 'TBC') cls += (code === state.campus || code === 'ON') ? ' on' : ' dim';
    const actionable = PRIMARY_CAMPUSES.indexOf(code) >= 0 && !opts.static;
    const tip = name + (code === state.campus ? ' (your campus: click to clear)' : actionable ? ' (click to set as your campus)' : '');
    // only legend pills take keyboard focus; the Primary campus selector covers the rest
    return '<span class="' + cls + '"' + (opts.focus ? ' tabindex="0"' : '') + ' data-tip="' + esc(tip) + '"' + (actionable ? ' role="button" data-action="campus-pill" data-campus="' + code + '"' : '') + ' aria-label="' + esc(name) + '">' + esc(code) + '</span>';
  }
  function pillsFor(offer) {
    if (!offer) return '<span class="muted small">Custom</span>';
    if (offer.tbc) return pill('TBC') + (offer.y2026 ? '<span class="pill pill-y2026" data-tip="2026 session data">2026</span>' : '');
    if (offer.none) return '<span class="muted small" title="Not offered in this session">Not offered</span>';
    return offer.codes.map(function (c) { return pill(c); }).join('') +
      (offer.y2026 ? '<span class="pill pill-y2026" data-tip="2027 session not yet published: 2026 session shown">2026</span>' : '');
  }
  const LOCK_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

  function builtInMajor(deg) {
    const m = deg.components.map(function (c) { return /^(\w{4}) (.+?), (Testamur Major|Major|Minor)/.exec(c); }).filter(Boolean)[0];
    return m ? m[1] + ' ' + m[2] + ', ' + m[3] : null;
  }

  function renderControls(ctx) {
    const deg = ctx.deg;
    const single = DEGREES.filter(function (d) { return d.code === '2848'; });
    const dbl = DEGREES.filter(function (d) { return d.code !== '2848'; });
    function degOpt(d) { return '<option value="' + d.code + '"' + (d.code === deg.code ? ' selected' : '') + '>' + esc(d.label) + '</option>'; }
    const degSelect = '<div class="select-wrap"><select id="sel-degree" aria-label="Degree">' +
      '<optgroup label="Single degree">' + single.map(degOpt).join('') + '</optgroup>' +
      '<optgroup label="Double degrees">' + dbl.map(degOpt).join('') + '</optgroup></select></div>';

    let majorField;
    if (deg.fixedStructure) {
      const built = builtInMajor(deg);
      majorField = '<div class="locked" id="major-locked">' + LOCK_ICON + '<span><b>Fixed structure.</b> No major or minor to choose' + (built ? '; built-in: ' + esc(built) : '') + '.</span></div>';
    } else {
      const opts = deg.options.map(function (k) { return OPT[k]; });
      const letters = Array.from(new Set(opts.map(function (o) { return o.groupLetter; })));
      const optHtml = function (o) { return '<option value="' + esc(o.pathwayKey) + '"' + (o.pathwayKey === ctx.key ? ' selected' : '') + '>' + esc(o.majorLabel) + '</option>'; };
      let inner;
      if (letters.length > 1) {
        inner = letters.map(function (L) {
          return '<optgroup label="Pathway ' + L + '">' + opts.filter(function (o) { return o.groupLetter === L; }).map(optHtml).join('') + '</optgroup>';
        }).join('');
      } else {
        inner = opts.map(optHtml).join('');
      }
      majorField = '<div class="select-wrap"><select id="sel-major" aria-label="Major or minor">' + inner + '</select></div>';
    }
    const home = deg.campusList.map(function (n) { return Object.keys(META.campuses).find(function (c) { return META.campuses[c] === n; }); }).filter(Boolean);
    const others = PRIMARY_CAMPUSES.filter(function (c) { return home.indexOf(c) < 0; });
    const campOpt = function (c) { return '<option value="' + c + '"' + (state.campus === c ? ' selected' : '') + '>' + c + ' · ' + esc(META.campuses[c]) + '</option>'; };
    const campusSelect = '<div class="select-wrap"><select id="sel-campus" aria-label="Primary campus">' +
      '<option value="">All campuses</option>' +
      '<optgroup label="This degree\'s campuses">' + home.map(campOpt).join('') + '</optgroup>' +
      '<optgroup label="Other campuses">' + others.map(campOpt).join('') + '</optgroup></select></div>';

    const load = '<div class="segmented" role="group" aria-label="Enrolment load">' +
      '<button type="button" data-action="load" data-load="FT" aria-pressed="' + (state.load === 'FT') + '" title="40 CP per session">Full-time</button>' +
      '<button type="button" data-action="load" data-load="PT" aria-pressed="' + (state.load === 'PT') + '" title="20 CP per session (indicative)">Part-time</button></div>';
    const track = '<label class="switch"><input type="checkbox" id="tg-track"' + (state.track ? ' checked' : '') + '><span class="track"></span>Track progress</label>';

    $('#controls').innerHTML =
      '<div class="controls-grid">' +
      '<div class="field"><label for="sel-degree">Degree</label>' + degSelect + '</div>' +
      '<div class="field">' + (deg.fixedStructure ? '<span class="field-label">Major / minor</span>' : '<label for="sel-major">Major / minor</label>') + majorField + '</div>' +
      '</div><div class="controls-sub">' +
      '<div class="field"><label for="sel-campus">Primary campus</label>' + campusSelect + '</div>' +
      '<div class="field"><span class="field-label">Enrolment load</span>' + load + '</div>' +
      '<div class="field"><span class="field-label">Checklist</span>' + track + '</div>' +
      '</div>' +
      '<div class="pathway-badge-row">' + pathwayBadge(ctx) + '</div>';
  }

  function groupDiff(ctx) {
    const other = ctx.deg.options.map(function (k) { return OPT[k]; }).find(function (o) { return o.groupLetter !== ctx.opt.groupLetter; });
    if (!other) return null;
    function sig(key) {
      const m = {};
      PATH[key].forEach(function (r) {
        if (r.kind !== 'fixed' || (r.type !== 'Law' && r.type !== 'Non-law')) return;
        const k = r.year + ' ' + r.session;
        (m[k] = m[k] || []).push(r.code);
      });
      Object.keys(m).forEach(function (k) { m[k] = m[k].sort().join('|'); });
      return m;
    }
    const a = sig(ctx.key);
    const b = sig(other.pathwayKey);
    const keys = Array.from(new Set(Object.keys(a).concat(Object.keys(b)))).sort();
    return { other: other.groupLetter, diffs: keys.filter(function (k) { return a[k] !== b[k]; }) };
  }
  function pathwayBadge(ctx) {
    const o = ctx.opt;
    const deg = ctx.deg;
    if (!o.groupLetter) {
      const why = deg.fixedStructure
        ? '<b>Single recommended pathway.</b> ' + deg.code + ' has a fixed structure, so one WSLSA Autumn/Spring sequence covers every student.'
        : '<b>Single recommended pathway.</b> One Autumn/Spring sequence fits all ' + plural(deg.options.length, (o.majorKind === 'Minor' ? 'minor' : 'major')) + ' in ' + deg.code + ' against the published 2027 offerings; only the ' + (o.majorKind === 'Minor' ? 'minor' : 'major') + ' subjects change.';
      return '<span class="pbadge pbadge-single">Single pathway</span><p class="pbadge-why">' + why + '</p>';
    }
    const kind = (o.majorKind || 'major').toLowerCase().replace('testamur ', '');
    const d = groupDiff(ctx);
    const shared = o.groupUsedFor.map(function (n) { return n === o.majorName ? '<b>' + esc(n) + '</b>' : esc(n); }).join(', ');
    let diffText = '';
    if (d) {
      diffText = d.diffs.length
        ? ' Compared with Pathway ' + d.other + ', the core law and non-law subjects move in ' + d.diffs.map(function (k) { return 'Y' + k; }).join(', ') + ' to make room for ' + kind + ' subjects in the sessions they run.'
        : ' Core law and non-law subjects sit in the same sessions as Pathway ' + d.other + '; only the ' + kind + ' and choice slots move.';
    }
    return '<span class="pbadge pbadge-' + o.groupLetter + '">Pathway ' + o.groupLetter + '</span><p class="pbadge-why"><b>Why Pathway ' + o.groupLetter + '?</b> ' + deg.code + ' needs ' + deg.pathwayGroups + ' recommended pathways so every ' + kind + ' fits the published Autumn/Spring offerings. Pathway ' + o.groupLetter + ' is used for ' + shared + '.' + diffText + '</p>';
  }

  function renderHero(ctx) {
    $('#hero-title').textContent = ctx.deg.title;
    $('#hero-lede').textContent = META.explorerIntro.replace(' in the yellow box', '');
    document.title = 'WSLSA 2027 · ' + ctx.deg.code + ' ' + ctx.deg.title;
  }

  function renderFacts(ctx) {
    const d = ctx.deg;
    const okCP = ctx.totalCP === d.cp;
    $('#facts').innerHTML =
      '<dl class="fact"><dt>Credit points</dt><dd class="fact-big">' + d.cp + ' CP</dd><dd><small>' + (okCP ? 'Pathway sums to ' + ctx.totalCP + ' ✓' : 'Pathway sums to ' + ctx.totalCP + ' CP') + '</small></dd></dl>' +
      '<dl class="fact"><dt>Duration</dt><dd>' + fmt(d.ftYears) + ' years full-time<small>' + fmt(d.ptYears) + ' years part-time</small></dd></dl>' +
      '<dl class="fact"><dt>Intake</dt><dd>' + esc(d.intake) + (d.intakeList.length === 1 ? '<small>' + esc(d.intakeList[0]) + ' entry only</small>' : '') + '</dd></dl>' +
      '<dl class="fact"><dt>Campuses</dt><dd>' + esc(d.campuses) + '</dd></dl>' +
      '<dl class="fact"><dt>Students</dt><dd>' + esc(d.students) + '</dd></dl>' +
      '<dl class="fact"><dt>CRICOS</dt><dd>' + (d.cricos ? esc(d.cricos) : '<span class="muted">Not listed</span>') + '</dd></dl>' +
      '<div class="fact-qr">' + (d.qrSvg ? '<div class="qr-box" aria-hidden="true">' + d.qrSvg + '</div>' : '') +
      '<div><span class="small muted" style="display:block;font-weight:600;letter-spacing:.07em;text-transform:uppercase;font-size:11.5px">2027 Handbook</span><a href="' + esc(d.handbook) + '" target="_blank" rel="noopener">Course ' + d.code + ' ↗</a></div></div>';
  }

  function renderProgress(ctx) {
    const el = $('#progress');
    if (!state.track) { el.innerHTML = ''; return; }
    const total = ctx.deg.cp;
    const done = ctx.doneCP;
    const remaining = Math.max(total - done, 0);
    const per = LOAD_CP[state.load];
    const sessions = Math.ceil(remaining / per);
    const pct = total ? Math.min(100, Math.round(done / total * 100)) : 0;
    el.innerHTML = '<div class="card progress-card">' +
      '<div class="progress-num" id="progress-num">' + done + ' / ' + total + ' <small>CP completed</small></div>' +
      '<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="' + done + '" aria-label="Credit points completed"><span style="width:' + pct + '%"></span></div>' +
      '<div class="progress-meta"><b>' + remaining + ' CP</b> remaining' + (remaining ? ' ≈ <b>' + plural(sessions, 'session') + '</b> at ' + (state.load === 'FT' ? 'full-time' : 'part-time') + ' load (' + per + ' CP/session)' : ': all done') + '</div></div>';
  }

  function renderRisks(ctx) {
    const r = ctx.risks;
    const chips = [];
    chips.push(r.advisor.length
      ? '<a href="#risk-advisor" class="risk-chip rc-advisor"><span class="dot"></span>' + plural(r.advisor.length, 'advisor prerequisite gap') + '</a>'
      : '<span class="risk-chip rc-ok"><span class="dot"></span>No advisor prerequisite gaps flagged</span>');
    if (r.tbc.length) chips.push('<a href="#risk-tbc" class="risk-chip rc-tbc"><span class="dot"></span>' + plural(r.tbc.length, 'subject') + ' with session TBC</a>');
    if (r.pending.length) chips.push('<button type="button" class="risk-chip rc-pending" data-action="jump" data-slot="' + r.pending[0].id + '"><span class="dot"></span>' + plural(r.pending.length, 'choice slot') + ' still open</button>');
    else chips.push('<span class="risk-chip rc-ok"><span class="dot"></span>All choices made</span>');
    if (state.campus) chips.push('<span class="risk-chip rc-campus"><span class="dot"></span>' + (r.campus.length ? plural(r.campus.length, 'subject') + ' not at ' + esc(META.campuses[state.campus]) + ' or online' : 'Everything runs at ' + esc(META.campuses[state.campus]) + ' or online') + '</span>');
    if (r.y2026.length) chips.push('<span class="risk-chip rc-2026"><span class="dot"></span>' + plural(r.y2026.length, 'subject') + ' using 2026 session data</span>');

    let html = '<div class="risk-summary">' + chips.join('') + '</div>';

    if (r.advisor.length) {
      html += '<div class="alert alert-advisor" id="risk-advisor"><h3>⚠ Advisor prerequisite gaps</h3><ul>' + r.advisor.map(function (a) {
        const scope = a.applies
          ? '<span class="note-scope">' + (a.note.major ? 'Applies to your ' + esc(a.note.majorKind.replace('Testamur ', '').toLowerCase()) : 'Applies to this degree') + '</span>'
          : '<span class="note-scope related">Flagged for the ' + esc(a.note.major) + ' ' + esc(a.note.majorKind.replace('Testamur ', '').toLowerCase()) + '; ' + esc(a.note.subject) + ' is also in your pathway</span>';
        return '<li>' + scope + '<br>' + (a.flagSlot ? '<button type="button" class="where" data-action="jump" data-slot="' + a.flagSlot.id + '">' + where(a.flagSlot) + '</button>' : '<span class="where">Not in your plan</span>') +
          esc(a.note.text) + (a.hint ? '<span class="hint">' + (a.resolvedByChoice ? '<b>Your choice helps:</b> ' : '<b>From your plan:</b> ') + esc(a.hint) + '</span>' : '') + '</li>';
      }).join('') + '</ul></div>';
    }
    if (r.tbc.length) {
      html += '<div class="alert alert-tbc" id="risk-tbc"><h3>⏳ 2027 session not yet published (TBC)</h3>' +
        '<p>WSLSA placed these subjects in the session shown, but WSU has not published their 2027 offering yet. Check the <a href="' + esc(ctx.deg.handbook) + '" target="_blank" rel="noopener">2027 Handbook</a> again closer to enrolment.</p>' +
        '<div class="tbc-list">' + r.tbc.map(function (s) {
          return '<button type="button" class="tbc-item" data-action="jump" data-slot="' + s.id + '"><code>' + esc(s.code) + '</code>' + esc(s.title) + ' <span>' + where(s) + (s.chosen ? ' · your choice' : '') + '</span></button>';
        }).join('') + '</div></div>';
    }
    const extra = [];
    if (state.campus && (r.campus.length || r.onlineOnly.length)) {
      extra.push('<div><h4>Campus check: ' + esc(META.campuses[state.campus]) + '</h4>' +
        (r.campus.length ? '<p>Not offered at your campus or online in the planned session: ' + r.campus.map(function (s) { return '<button type="button" class="linkish" data-action="jump" data-slot="' + s.id + '">' + esc(s.code) + '</button> (' + s.offer.codes.join(' ') + ', ' + where(s) + ')'; }).join('; ') + '.</p>' : '') +
        (r.onlineOnly.length ? '<p>Available to you online only: ' + r.onlineOnly.map(function (s) { return esc(s.code); }).join(', ') + '.</p>' : '') + '</div>');
    }
    if (r.y2026.length) {
      extra.push('<div><h4>2026 session data shown</h4><p>The 2027 session is not yet published for ' + r.y2026.map(function (s) { return esc(s.code) + ' ' + esc(s.title) + ' (' + where(s) + ')'; }).join('; ') + '. The campuses shown are from 2026.</p></div>');
    }
    if (r.notOffered.length) {
      extra.push('<div><h4>Not offered in the planned session</h4><p>' + r.notOffered.map(function (s) { return esc(s.code) + ' (' + where(s) + ')'; }).join('; ') + '. The catalogue lists no ' + 'campus for that session.</p></div>');
    }
    if (r.pending.length) {
      extra.push('<div><h4>Open choices</h4><p>' + r.pending.map(function (s) { return '<button type="button" class="linkish" data-action="jump" data-slot="' + s.id + '">' + where(s) + '</button>'; }).join(', ') + '.</p></div>');
    }
    if (extra.length) html += '<details class="more"><summary>More checks for this plan</summary><div class="more-body">' + extra.join('') + '</div></details>';
    $('#risks').innerHTML = html;
  }

  function renderLegend() {
    const types = ['law', 'nonlaw', 'major', 'llb', 'choice', 'elective'];
    $('#legend').innerHTML =
      '<div class="legend-group"><span class="legend-title">Unit type</span>' + types.map(function (t) {
        return '<span class="swatch"><i style="background:var(--t-' + t + '-bg);border-color:var(--t-' + t + ')"></i>' + TYPE_LABEL[t] + '</span>';
      }).join('') + '</div>' +
      '<div class="legend-group"><span class="legend-title">Campus</span>' + Object.keys(META.campuses).map(function (c) { return pill(c, { focus: true }); }).join('') + pill('TBC', { focus: true }) +
      (state.campus ? ' <button type="button" class="linkish small" data-action="campus-clear">Clear campus filter</button>' : '') + '</div>';
  }

  function slotHTML(s, ctx) {
    const cls = ['slot', 't-' + s.group];
    if (s.pending) cls.push('pending');
    if (s.done) cls.push('is-done');
    const offCampus = state.campus && ctx.risks.campus.indexOf(s) >= 0;
    if (offCampus) cls.push('offcampus');
    const flags = [];
    if (s.offer && s.offer.tbc) flags.push('<span class="flag flag-tbc" title="2027 session not yet published">TBC</span>');
    if (s.offer && s.offer.y2026 && !s.offer.tbc) flags.push('<span class="flag flag-2026" title="2027 session not yet published; 2026 session shown">2026 data</span>');
    if (s.chosen) flags.push('<span class="flag flag-chosen">Your choice</span>');
    if (s.custom) flags.push('<span class="flag flag-chosen">Custom</span>');
    if (offCampus) flags.push('<span class="flag flag-campus">Not at ' + state.campus + '</span>');
    if (ctx.risks.advisor.some(function (a) { return a.flagSlot === s; })) flags.push('<a class="flag flag-warn" href="#risk-advisor">Check prerequisite</a>');
    if (s.offer && s.offer.none && !s.pending) flags.push('<span class="flag flag-warn">Not offered this session</span>');

    let body = '';
    if (s.kind === 'inline' && s.raw.options.length > 1) {
      body += '<div class="inline-opts" role="group" aria-label="Choose one">' + s.raw.options.map(function (o) {
        const sel = s.code === o.code && !s.pending;
        const clash = !sel && usedElsewhere(ctx, o.code, s.id);
        const off = offerFor(ctx.deg, o.code, s.session);
        const tip = clash ? 'Already in your plan' : (off && off.codes.length ? 'Offered ' + s.session + ': ' + off.codes.join(' ') : (o.tbcFlag || (off && off.tbc) ? 'Session TBC' : ''));
        return '<button type="button" class="inline-opt" data-action="inline" data-slot="' + s.id + '" data-code="' + esc(o.code) + '" aria-pressed="' + sel + '"' + (clash ? ' disabled' : '') + ' title="' + esc(tip) + '">' +
          '<span class="io-code">' + esc(o.code) + (o.tbcFlag ? ' · TBC' : '') + '</span><span class="io-title">' + esc(o.title) + '</span></button>';
      }).join('') + '</div>';
    } else if (s.kind === 'inline' && s.auto) {
      body += '<div class="slot-note">Only option listed for this ' + s.session + ' slot.</div>';
    }
    if (s.kind === 'llb' || s.kind === 'pool' || s.kind === 'option' || s.kind === 'elective') {
      const label = s.kind === 'llb' ? (s.pending ? 'Choose LLB Alternate' : 'Change')
        : s.kind === 'elective' ? (s.pending ? 'Choose elective' : 'Change')
        : s.kind === 'option' ? 'Swap option'
        : (s.pending ? 'Choose subject' : 'Change');
      body += '<div class="slot-actions"><button type="button" class="slot-btn" data-action="picker-open" data-slot="' + s.id + '">' + label + (s.kind === 'llb' || s.kind === 'pool' ? ' · ' + s.session : '') + '</button>' +
        ((s.pick && !s.pending) ? '<button type="button" class="slot-btn subtle" data-action="clear" data-slot="' + s.id + '">' + (s.kind === 'option' ? 'Reset to WSLSA pick' : 'Clear') + '</button>' : '') + '</div>';
    } else if (s.kind === 'inline' && s.chosen) {
      body += '<div class="slot-actions"><button type="button" class="slot-btn subtle" data-action="clear" data-slot="' + s.id + '">Clear choice</button></div>';
    }
    if (s.kind === 'fixed' && s.cp === 0) body += '<div class="slot-note">0 CP placement/requirement</div>';

    const check = state.track ? '<input type="checkbox" data-action="done" data-slot="' + s.id + '"' + (s.done ? ' checked' : '') + ' aria-label="Mark ' + esc((s.code || '') + ' ' + (s.title || '')) + ' complete">' : '';
    return '<div class="' + cls.join(' ') + '" id="slot-' + s.id + '" data-slot="' + s.id + '">' +
      '<div class="slot-check">' + check + '</div>' +
      '<div class="slot-main"><div class="slot-top"><span class="code">' + esc(s.pending ? (s.kind === 'llb' ? 'LLB ALT' : s.kind === 'elective' ? 'ELECTIVE' : 'CHOICE') : s.code) + '</span><span class="type-tag">' + esc(s.typeLabel) + '</span>' + flags.join('') + '</div>' +
      '<div class="slot-title">' + esc(s.title) + '</div>' + body + '</div>' +
      '<div class="slot-side"><div class="pills">' + (s.pending ? '' : pillsFor(s.offer)) + '</div><span class="slot-cp">' + s.cp + ' CP</span></div></div>';
  }

  function renderGrid(ctx) {
    const years = timeline(ctx, state.load);
    let html = '';
    if (state.load === 'PT') {
      html += '<p class="pt-note"><b>Part-time view (indicative).</b> Each full-time session is split into two 20 CP sessions, keeping every subject in the session type it is offered in. This lengthens the pathway to about ' + fmt(ctx.deg.ptYears) + ' years and can shift prerequisite timing, so confirm your sequence with the Academic Program Advisor.</p>';
    }
    years.forEach(function (y) {
      const all = y.Autumn.concat(y.Spring);
      const ycp = all.reduce(function (a, s) { return a + s.cp; }, 0);
      const ydone = all.reduce(function (a, s) { return a + (s.done ? s.cp : 0); }, 0);
      html += '<article class="year" aria-label="Year ' + y.year + '"><header class="year-head"><h2>Year ' + y.year + (state.load === 'PT' ? ' <span class="muted small">(part-time)</span>' : '') + '</h2>' +
        '<span class="meta">' + (state.track ? ydone + ' / ' : '') + ycp + ' CP</span></header><div class="sessions">';
      SESSIONS.forEach(function (sess) {
        const list = y[sess].slice().sort(function (a, b) { return orderIdx(a.year, a.session) - orderIdx(b.year, b.session) || a.raw.slot - b.raw.slot; });
        const cp = list.reduce(function (a, s) { return a + s.cp; }, 0);
        const allDone = list.length && list.every(function (s) { return s.done; });
        html += '<section class="session" aria-label="' + sess + '"><div class="session-head"><h3>' + sess + '</h3><div class="session-actions">' +
          (state.track && list.length ? '<button type="button" class="linkish small" data-action="session-done" data-ids="' + list.map(function (s) { return s.id; }).join(',') + '">' + (allDone ? 'Unmark all' : 'Mark all done') + '</button>' : '') +
          '<span class="cp-total">' + cp + ' CP</span></div></div><div class="slots">' +
          (list.length ? list.map(function (s) { return slotHTML(s, ctx); }).join('') : '<div class="slot-empty">No subjects scheduled</div>') + '</div></section>';
      });
      html += '</div></article>';
    });
    $('#grid').innerHTML = html;
  }

  function statusClass(st) {
    if (!st) return 'status-non';
    if (/^Essential/.test(st)) return 'status-essential';
    if (/Relates to Major/.test(st)) return 'status-major';
    return 'status-non';
  }

  function renderDetails(ctx) {
    const tabs = [['structure', 'Structure & accreditation'], ['catalogue', 'Full subject catalogue'], ['sources', 'Data & sources']];
    let html = '<div class="tabs" role="tablist">' + tabs.map(function (t) {
      return '<button type="button" class="tab" role="tab" id="tab-' + t[0] + '" data-action="tab" data-tab="' + t[0] + '" aria-selected="' + (ui.tab === t[0]) + '">' + t[1] + '</button>';
    }).join('') + '</div><div class="tab-panel" role="tabpanel">';
    const d = ctx.deg;
    if (ui.tab === 'structure') {
      const max = Math.max.apply(null, d.structure.map(function (c) { return c.cp; }));
      html += '<div class="two-col"><div><h3 class="panel-h">Program structure</h3>' +
        d.structure.map(function (c) {
          return '<div class="structure-row"><span>' + esc(c.component) + '</span><span class="cpv">' + c.cp + ' CP</span><span class="sbar"><span style="width:' + (c.cp / max * 100) + '%"></span></span></div>';
        }).join('') +
        '<div class="structure-row structure-total"><span>Total credit points</span><span class="cpv">' + d.structureTotal + ' CP</span></div>' +
        '<dl class="kv" style="margin-top:18px"><dt>Assumed knowledge / admission</dt><dd>' + esc(d.assumedKnowledge) + '</dd></dl>' +
        '<dl class="kv"><dt>Major / minor choices</dt><dd>' + esc(d.majorChoices) + ' · ' + plural(d.pathwayGroups, 'pathway group') + '</dd></dl></div>' +
        '<div><h3 class="panel-h">External accreditation</h3><ul class="acc-list">' + d.accreditation.map(function (a) {
          return '<li><span>' + esc(a.name) + '</span><span class="status ' + statusClass(a.status) + '">' + esc(a.status || '') + '</span></li>';
        }).join('') + '</ul>' +
        '<h3 class="panel-h" style="margin-top:20px">Exit awards</h3><ul class="exit-list">' + d.exitAwards.map(function (e) {
          return '<li><span>' + (e.code ? '<b class="code" style="color:var(--slate)">' + e.code + '</b> ' : '') + esc(e.name) + '</span>' + (e.exitOnly ? '<span class="status status-non">Exit only</span>' : '') + '</li>';
        }).join('') + '</ul></div></div>';
    } else if (ui.tab === 'catalogue') {
      html += '<p class="cat-count">' + esc(d.catalogueNote || '') + '</p>' +
        '<div class="cat-filters">' +
        '<div class="field"><label for="cat-q">Search</label><input class="input" id="cat-q" type="search" placeholder="Code or title, e.g. LAWS 4008 or Revenue" value="' + esc(ui.cat.q) + '"></div>' +
        '<div class="field"><label for="cat-comp">Component</label><div class="select-wrap"><select id="cat-comp"><option value="">All components</option>' + d.components.map(function (c) { return '<option' + (ui.cat.comp === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div></div>' +
        '<div class="field"><label for="cat-session">Session</label><div class="select-wrap"><select id="cat-session"><option value="">Any session</option><option value="Autumn"' + (ui.cat.session === 'Autumn' ? ' selected' : '') + '>Offered in Autumn</option><option value="Spring"' + (ui.cat.session === 'Spring' ? ' selected' : '') + '>Offered in Spring</option><option value="TBC"' + (ui.cat.session === 'TBC' ? ' selected' : '') + '>Session TBC</option></select></div></div>' +
        '<div class="field"><span class="field-label">Campus</span><div class="locked" style="min-height:40px;border-style:solid">' + (state.campus ? 'Highlighting ' + esc(META.campuses[state.campus]) : 'Set a primary campus above to highlight') + '</div></div>' +
        '<label class="check-row" style="padding-bottom:10px"><input type="checkbox" id="cat-inplan"' + (ui.cat.inPlan ? ' checked' : '') + '>In my plan</label>' +
        '</div><div id="cat-results"></div>';
    } else {
      const c = META.counts;
      html += '<div class="two-col"><div><h3 class="panel-h">How this guide is built</h3>' +
        '<p>' + esc(d.sheetIntro) + '</p><p class="muted">' + esc(META.overviewNote) + '</p>' +
        '<ul class="src-list"><li>Workbook: <b>' + esc(META.sourceWorkbook) + '</b> (extracted ' + esc(META.extractedOn) + ')</li>' +
        '<li>' + c.degrees + ' degrees, ' + c.majorOptions + ' degree/major combinations, ' + c.pathways + ' pathways</li>' +
        '<li>' + c.pathwayRows.toLocaleString('en-AU') + ' pathway slots and ' + c.catalogueRows.toLocaleString('en-AU') + ' catalogue rows</li>' +
        '<li>Handbook: <a href="' + esc(d.handbook) + '" target="_blank" rel="noopener">' + esc(d.handbook) + '</a></li></ul></div>' +
        '<div><h3 class="panel-h">All advisor notes for ' + d.code + '</h3>' +
        (d.advisorNotes.length ? '<ul class="src-list">' + d.advisorNotes.map(function (n) { return '<li>' + esc(n.text) + '</li>'; }).join('') + '</ul>' : '<p class="muted">The workbook lists no advisor notes for this degree.</p>') +
        '<h3 class="panel-h" style="margin-top:18px">Session TBC subjects (Overview)</h3><p>' + esc(d.tbcSubjects.join(', ')) + '</p></div></div>';
    }
    html += '</div>';
    $('#details').innerHTML = html;
    if (ui.tab === 'catalogue') renderCatalogueRows(ctx);
  }

  function renderCatalogueRows(ctx) {
    const d = ctx.deg;
    const q = ui.cat.q.trim().toLowerCase();
    const rows = d.catalogue.filter(function (c) {
      if (ui.cat.comp && c.component !== ui.cat.comp) return false;
      if (q && (c.code + ' ' + c.title).toLowerCase().indexOf(q) < 0) return false;
      if (ui.cat.inPlan && !ctx.used[c.code]) return false;
      if (ui.cat.session === 'TBC') return c.autumn === 'TBC' || c.spring === 'TBC';
      if (ui.cat.session) { const v = sessionValue(c, ui.cat.session); return v && v !== '—' && v !== 'TBC'; }
      return true;
    });
    function cell(v) { const o = parseOffered(v); return o.none ? '<span class="muted">—</span>' : '<span class="pills" style="justify-content:flex-start">' + pillsFor(o) + '</span>'; }
    $('#cat-results').innerHTML = '<p class="cat-count">' + rows.length + ' of ' + d.catalogue.length + ' subjects</p><div class="table-scroll"><table class="cat"><thead><tr><th>Code</th><th>Title</th><th>Component</th><th>Level</th><th>Autumn</th><th>Spring</th><th>CP</th><th>Data source</th></tr></thead><tbody>' +
      rows.map(function (c) {
        const inPlan = !!ctx.used[c.code];
        return '<tr class="' + (inPlan ? 'in-plan' : '') + '"><td class="c-code">' + esc(c.code) + '</td><td>' + esc(c.title) + (inPlan ? ' <span class="status status-major">In plan</span>' : '') + '</td><td class="c-comp">' + esc(c.component) + '</td><td class="small">' + esc(c.level) + '</td><td>' + cell(c.autumn) + '</td><td>' + cell(c.spring) + '</td><td class="small">' + c.cp + '</td><td class="small muted">' + esc(c.source) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function disclaimerText() {
    const ex = META.explorerIntro.match(/Pathways are[^.]*\./);
    const sheet = DEGREES[0].sheetIntro.match(/The recommended pathway[^]*$/);
    const src = META.overviewNote.match(/^Source:[^]*?Degree Guides\./);
    return [sheet ? sheet[0] : '', ex ? ex[0] : '', src ? src[0] : '', 'Confirm enrolment decisions, prerequisites and any flagged gaps with the Academic Program Advisor.'].filter(Boolean).join(' ');
  }

  function renderFoot() {
    $('#site-foot').innerHTML = '<p><b>WSLSA disclaimer.</b> ' + esc(disclaimerText()) + '</p>' +
      '<p>' + esc(META.legend.replace(/^Legend:\s*/, '').replace('tinted rows are law subjects. ', '')) + '</p>';
  }

  // ======================================================================== render: main
  let lastCtx = null;
  function render() {
    const active = document.activeElement && document.activeElement.id;
    const ctx = buildContext();
    lastCtx = ctx;
    document.body.classList.toggle('has-campus', !!state.campus);
    renderHero(ctx);
    renderControls(ctx);
    renderFacts(ctx);
    renderProgress(ctx);
    renderRisks(ctx);
    renderLegend();
    renderGrid(ctx);
    renderDetails(ctx);
    renderFoot();
    if (active && document.getElementById(active) && /^(sel-|tg-|cat-)/.test(active)) document.getElementById(active).focus({ preventScroll: true });
    saveState();
    syncHash();
    if (ui.modal === 'export') renderExportPreview();
  }

  // ======================================================================== mutations
  function setPick(slotId, pick) {
    const key = currentKey();
    state.picks[key] = state.picks[key] || {};
    if (pick) state.picks[key][slotId] = pick; else delete state.picks[key][slotId];
    if (!Object.keys(state.picks[key]).length) delete state.picks[key];
  }
  function setMajor(newKey) {
    const prev = currentKey();
    state.majorFor[state.degree] = newKey;
    // carry LLB alternate and elective picks into the new pathway where the same slot is still free
    const prevPicks = state.picks[prev] || {};
    PATH[newKey].forEach(function (raw) {
      const oldRaw = PATH[prev].find(function (r) { return r.id === raw.id; });
      const p = prevPicks[raw.id];
      if (!p || !oldRaw || oldRaw.kind !== raw.kind || (raw.kind !== 'llb' && raw.kind !== 'elective')) return;
      state.picks[newKey] = state.picks[newKey] || {};
      if (!state.picks[newKey][raw.id]) state.picks[newKey][raw.id] = p;
    });
  }
  function flashSlot(id) {
    const el = document.getElementById('slot-' + id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  // ======================================================================== picker modal
  function openPicker(slotId) {
    ui.modal = 'picker';
    ui.picker = { slotId: slotId, q: '', campusOnly: !!state.campus, showOff: false, level: '' };
    renderPicker(true);
  }
  function closeModal() {
    ui.modal = null;
    ui.picker = null;
    $('#modal-root').innerHTML = '';
    document.body.style.overflow = '';
  }
  function pickerTitle(s) {
    if (s.kind === 'llb') return 'Choose an LLB Alternate subject';
    if (s.kind === 'elective') return 'Choose an elective';
    if (s.kind === 'option') return 'Swap this major option';
    return 'Choose: ' + cleanPoolTitle(s.raw.title);
  }
  function renderPicker(first) {
    const ctx = lastCtx;
    const s = ctx.byId[ui.picker.slotId];
    const p = ui.picker;
    const levels = s.kind === 'llb' || s.kind === 'elective' ? ['Level 2', 'Level 3', 'Level 4'] : [];
    let tools = '<div class="tool-row"><input class="input" id="pick-q" type="search" placeholder="Search code or title" value="' + esc(p.q) + '" style="flex:1;min-width:200px" aria-label="Search subjects"></div><div class="tool-row">';
    if (state.campus) tools += '<button type="button" class="chip" data-action="pick-campus" aria-pressed="' + p.campusOnly + '">' + esc(META.campuses[state.campus]) + ' or online only</button>';
    levels.forEach(function (l) { tools += '<button type="button" class="chip" data-action="pick-level" data-level="' + l + '" aria-pressed="' + (p.level === l) + '">' + l + '</button>'; });
    tools += '<button type="button" class="chip" data-action="pick-off" aria-pressed="' + p.showOff + '">Show subjects not offered in ' + s.session + '</button></div>';

    const custom = s.kind === 'elective'
      ? '<div class="pick-section"><h4>Any WSU subject</h4><form class="custom-form" id="custom-form"><div class="field"><label for="cu-code">Code</label><input class="input" id="cu-code" placeholder="e.g. HUMN 1052" maxlength="12" value="' + esc(s.custom ? s.code : '') + '"></div><div class="field"><label for="cu-title">Title</label><input class="input" id="cu-title" placeholder="Subject title" maxlength="120" value="' + esc(s.custom ? s.title : '') + '"></div><button type="submit" class="btn btn-primary">Use subject</button></form><p class="small muted" style="margin:4px 8px 0">Check prerequisites and session availability in the 2027 Handbook. Many law students use electives for extra LLB Alternates, listed below.</p></div>'
      : '';

    $('#modal-root').innerHTML = '<div class="modal-backdrop" data-action="backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="picker-h">' +
      '<div class="modal-head"><div><h2 id="picker-h">' + esc(pickerTitle(s)) + '</h2><p>' + where(s) + ' · ' + s.cp + ' CP · ' + esc(ctx.deg.code) + ' ' + esc(ctx.opt.majorCode !== 'BASE' ? ctx.opt.majorLabel : ctx.deg.title) + '</p></div><button type="button" class="modal-x" data-action="modal-close" aria-label="Close">×</button></div>' +
      '<div class="modal-tools">' + tools + '</div>' +
      '<div class="modal-body">' + custom + '<div id="pick-results"></div></div>' +
      '<div class="modal-foot"><span class="small muted">Subjects already in your plan are disabled. TBC = 2027 session not yet published.</span><div style="display:flex;gap:8px">' +
      (s.pick ? '<button type="button" class="btn" data-action="pick-clear">' + (s.kind === 'option' ? 'Reset to WSLSA pick' : 'Clear choice') + '</button>' : '') +
      '<button type="button" class="btn btn-ghost" data-action="modal-close">Cancel</button></div></div></div></div>';
    document.body.style.overflow = 'hidden';
    renderPickerResults();
    if (first) { const q = $('#pick-q'); if (q && window.matchMedia('(pointer:fine)').matches) q.focus(); }
  }
  function renderPickerResults() {
    const ctx = lastCtx;
    const s = ctx.byId[ui.picker.slotId];
    const p = ui.picker;
    const q = p.q.trim().toLowerCase();
    const entries = poolEntries(ctx, s.raw);
    const groups = { offered: [], tbc: [], off: [] };
    let hiddenByCampus = 0;
    entries.forEach(function (e) {
      if (q && (e.code + ' ' + e.title).toLowerCase().indexOf(q) < 0) return;
      if (p.level && e.level !== p.level) return;
      const off = offerFor(ctx.deg, e.code, s.session);
      if (off.tbc) groups.tbc.push({ e: e, off: off });
      else if (off.none) groups.off.push({ e: e, off: off });
      else {
        if (p.campusOnly && state.campus && off.codes.indexOf(state.campus) < 0 && off.codes.indexOf('ON') < 0) { hiddenByCampus++; return; }
        groups.offered.push({ e: e, off: off });
      }
    });
    function row(item, disabledReason) {
      const e = item.e;
      const current = s.code === e.code && !s.pending;
      const clash = !current && usedElsewhere(ctx, e.code, s.id);
      const dis = clash || disabledReason;
      const other = sessionValue(e, s.session === 'Autumn' ? 'Spring' : 'Autumn');
      return '<button type="button" class="pick" data-action="pick" data-code="' + esc(e.code) + '"' + (dis ? ' disabled' : '') + (current ? ' aria-current="true"' : '') + '>' +
        '<span class="p-code">' + esc(e.code) + '</span><span class="p-title">' + esc(e.title) + '</span>' +
        '<span class="p-side"><span class="pills">' + pillsFor(item.off) + '</span>' + (current ? '<span class="status status-essential">Selected</span>' : clash ? '<span class="status status-non">In plan</span>' : '') + '</span>' +
        '<span class="p-meta"><span>' + esc(e.level || '') + '</span><span>' + esc(e.source || '') + '</span>' + (other && other !== '—' ? '<span>' + (s.session === 'Autumn' ? 'Spring' : 'Autumn') + ': ' + esc(other) + '</span>' : '') + (s.kind !== 'llb' && s.kind !== 'elective' ? '<span>' + esc(e.component.replace(/^.*?: /, '')) + '</span>' : '') + '</span></button>';
    }
    let html = '';
    html += '<div class="pick-section"><h4><span>Offered in ' + s.session + ' 2027</span><span>' + groups.offered.length + (hiddenByCampus ? ' · ' + hiddenByCampus + ' hidden by campus filter' : '') + '</span></h4><div class="pick-list">' +
      (groups.offered.length ? groups.offered.map(function (i) { return row(i); }).join('') : '<div class="pick-empty">No matching subjects offered in ' + s.session + '.</div>') + '</div></div>';
    if (groups.tbc.length) html += '<div class="pick-section"><h4><span>Session TBC (not yet published for 2027)</span><span>' + groups.tbc.length + '</span></h4><div class="pick-list">' + groups.tbc.map(function (i) { return row(i); }).join('') + '</div></div>';
    if (p.showOff && groups.off.length) html += '<div class="pick-section"><h4><span>Not offered in ' + s.session + '</span><span>' + groups.off.length + '</span></h4><div class="pick-list">' + groups.off.map(function (i) { return row(i, 'off'); }).join('') + '</div></div>';
    else if (groups.off.length) html += '<p class="small muted" style="margin:10px 8px">' + plural(groups.off.length, 'subject') + ' in this list run only in ' + (s.session === 'Autumn' ? 'Spring' : 'Autumn') + '.</p>';
    $('#pick-results').innerHTML = html;
  }
  function choosePick(code) {
    const ctx = lastCtx;
    const s = ctx.byId[ui.picker.slotId];
    const e = poolEntries(ctx, s.raw).find(function (x) { return x.code === code; });
    if (!e) return;
    if (s.kind === 'option' && code === s.raw.code) setPick(s.id, null);
    else setPick(s.id, { code: e.code, title: e.title });
    closeModal();
    render();
    toast(e.code + ' ' + e.title + ' set for ' + where(s));
    flashSlot(s.id);
  }

  // ======================================================================== share / reset
  function share() {
    const url = planUrl();
    const done = function () { toast('Plan link copied. It restores this degree, choices and progress.'); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(done, function () { showShare(url); });
    } else {
      showShare(url);
    }
  }
  function showShare(url) {
    ui.modal = 'share';
    $('#modal-root').innerHTML = '<div class="modal-backdrop" data-action="backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="share-h"><div class="modal-head"><div><h2 id="share-h">Plan link</h2><p>Copy this link to reopen or share this exact plan.</p></div><button type="button" class="modal-x" data-action="modal-close" aria-label="Close">×</button></div><div class="modal-body" style="padding:16px 20px"><textarea class="input" id="share-url" rows="4" readonly style="font:12px var(--mono);resize:vertical">' + esc(url) + '</textarea></div><div class="modal-foot"><span></span><button type="button" class="btn btn-ghost" data-action="modal-close">Close</button></div></div></div>';
    const ta = $('#share-url');
    ta.focus();
    ta.select();
  }

  // ======================================================================== PDF / print engine
  function pdPill(c, hl) { return '<span class="pp pp-' + c + (hl ? ' pp-hl' : '') + '">' + c + '</span>'; }
  function pdOffer(offer) {
    if (!offer) return '<span class="pp-26">custom</span>';
    if (offer.tbc) return pdPill('TBC');
    if (offer.none) return '<span class="pp-26">n/a</span>';
    return offer.codes.map(function (c) { return pdPill(c, state.campus && c === state.campus); }).join('') + (offer.y2026 ? '<span class="pp-26">2026</span>' : '');
  }
  function pdHeader(ctx) {
    const d = ctx.deg;
    const o = ctx.opt;
    const badge = o.groupLetter ? 'Pathway ' + o.groupLetter : 'Single recommended pathway';
    const sel = o.majorCode === 'BASE' ? 'No major or minor (fixed structure)' : esc(o.majorLabel);
    const facts = [
      ['Credit points', d.cp + ' CP'],
      ['Duration', fmt(d.ftYears) + ' yrs FT / ' + fmt(d.ptYears) + ' yrs PT'],
      ['Intake', esc(d.intake)],
      ['Campuses', esc(d.campuses)],
      ['Students', esc(d.students)],
      ['CRICOS', d.cricos ? esc(d.cricos) : 'Not listed'],
    ];
    return '<header class="pd-head"><div class="pd-head-grid"><div>' +
      '<div class="pd-eyebrow"><span class="pd-mark">WSLSA</span>2027 Degree Guide · Western Sydney University</div>' +
      '<h1>' + esc(d.title) + '</h1>' +
      '<div class="pd-sub"><b>Course ' + d.code + '</b> · ' + (o.majorCode === 'BASE' ? '' : (o.majorKind === 'Minor' ? 'Minor: ' : 'Major: ')) + '<b>' + sel + '</b> · <span class="pd-badge">' + esc(badge) + '</span>' + (state.campus ? ' · Primary campus: <b>' + esc(META.campuses[state.campus]) + '</b>' : '') + '</div>' +
      '<dl class="pd-facts">' + facts.map(function (f) { return '<div><dt>' + f[0] + '</dt><dd>' + f[1] + '</dd></div>'; }).join('') + '</dl>' +
      '<div class="pd-link"><b>Official 2027 WSU Handbook:</b> <a href="' + esc(d.handbook) + '">' + esc(d.handbook.replace(/^https?:\/\//, '')) + '</a></div></div>' +
      '<div class="pd-qr">' + (d.qrSvg || '') + '<div class="pd-url"><b>Scan for the</b>2027 Handbook</div></div>' +
      '</div></header>';
  }
  function pdLegend() {
    const types = [['law', 'Law core'], ['nonlaw', 'Non-law core'], ['major', 'Major / minor'], ['llb', 'LLB alternate'], ['choice', 'Choice'], ['elective', 'Elective']];
    const colours = { law: '#1f3a68', nonlaw: '#6b5a43', major: '#2c6656', llb: '#990033', choice: '#8f600c', elective: '#574a85' };
    const bgs = { law: '#e7ecf5', nonlaw: '#f3eee4', major: '#e1efe8', llb: '#f8e7ed', choice: '#fbefd5', elective: '#ece9f5' };
    return '<div class="pd-legend"><span class="pd-lt">Unit type</span>' + types.map(function (t) {
      return '<span class="pd-sw"><i style="background:' + bgs[t[0]] + ';border-color:' + colours[t[0]] + '"></i>' + t[1] + '</span>';
    }).join('') + '<span class="pd-sw">◆ your selection</span><span class="pd-sw">italic = still to choose</span></div>';
  }
  function pdTable(sess, list, o) {
    const cp = list.reduce(function (a, s) { return a + s.cp; }, 0);
    const ticks = o.ticks && state.track;
    let html = '<table class="pd-t"><colgroup>' + (ticks ? '<col class="c-tick">' : '') + '<col class="c-code"><col><col class="c-camp"><col class="c-cp"></colgroup>' +
      '<thead><tr><th colspan="' + (ticks ? 5 : 4) + '">' + sess + '<span class="pd-cpt">' + cp + ' CP</span></th></tr></thead><tbody>';
    if (!list.length) html += '<tr><td class="pd-empty" colspan="' + (ticks ? 5 : 4) + '">No subjects scheduled</td></tr>';
    list.forEach(function (s) {
      const cls = 'r-' + s.group + (s.pending ? ' r-pending' : '') + (s.done ? ' r-done' : '');
      let title = esc(s.pending ? pendingPrintTitle(s) : s.title);
      if (s.chosen) title = '◆ ' + title;
      html += '<tr class="' + cls + '">' + (ticks ? '<td class="pd-tick">' + (s.done ? '✓' : '') + '</td>' : '') +
        '<td class="pd-code">' + esc(s.pending ? '—' : s.code) + '</td><td class="pd-title">' + title + '</td>' +
        '<td class="pd-camp">' + (s.pending ? '' : pdOffer(s.offer)) + '</td><td class="pd-cp">' + s.cp + '</td></tr>';
    });
    return html + '</tbody></table>';
  }
  function pendingPrintTitle(s) {
    if (s.kind === 'llb') return 'LLB Alternate subject: to choose';
    if (s.kind === 'elective') return 'Elective (any WSU subject)';
    if (s.kind === 'inline') return 'Choose: ' + s.raw.options.map(function (x) { return x.code; }).join(' or ');
    return cleanPoolTitle(s.raw.title);
  }
  function pdGrid(ctx, o) {
    return timeline(ctx, 'FT').map(function (y) {
      return '<div class="pd-year"><div class="pd-ylabel">Year ' + y.year + '</div>' +
        SESSIONS.map(function (sess) { return pdTable(sess, y[sess].slice().sort(function (a, b) { return a.raw.slot - b.raw.slot; }), o); }).join('') + '</div>';
    }).join('');
  }
  function pdWarnings(ctx) {
    const r = ctx.risks;
    let html = '';
    html += '<div class="pd-box pd-warn"><h3>Advisor prerequisite warnings</h3>' + (r.advisor.length ? '<ul>' + r.advisor.map(function (a) {
      return '<li>' + (a.flagSlot ? '<span class="pd-where">' + where(a.flagSlot) + ':</span> ' : '') + (a.applies ? '' : '<i>Flagged for the ' + esc(a.note.major) + ' ' + esc(a.note.majorKind.replace('Testamur ', '').toLowerCase()) + '; ' + esc(a.note.subject) + ' is also in this pathway.</i> ') + esc(a.note.text) + (a.hint ? ' <i>' + esc(a.hint) + '</i>' : '') + '</li>';
    }).join('') + '</ul>' : '<p>No advisor prerequisite gaps are flagged in the workbook for this selection.</p>') + '</div>';
    const tbcText = r.tbc.length ? r.tbc.map(function (s) { return '<b>' + esc(s.code) + '</b> ' + esc(s.title) + ' (' + where(s) + ')'; }).join('; ') : '';
    const lines = [];
    if (tbcText) lines.push('<li><b>Session TBC:</b> ' + tbcText + '. WSU has not yet published the 2027 session; verify closer to enrolment.</li>');
    if (r.y2026.length) lines.push('<li><b>2026 session shown:</b> ' + r.y2026.map(function (s) { return esc(s.code) + ' (' + where(s) + ')'; }).join('; ') + '.</li>');
    if (state.campus && r.campus.length) lines.push('<li><b>Not at ' + esc(META.campuses[state.campus]) + ' or online:</b> ' + r.campus.map(function (s) { return esc(s.code) + ' (' + s.offer.codes.join(' ') + ')'; }).join('; ') + '.</li>');
    if (r.pending.length) lines.push('<li><b>Still to choose:</b> ' + plural(r.pending.length, 'slot') + ' (' + r.pending.map(where).join(', ') + ').</li>');
    if (lines.length) html += '<div class="pd-box pd-tbcbox"><h3>Session &amp; availability checks</h3><ul>' + lines.join('') + '</ul></div>';
    return html;
  }
  function pdAccreditation(ctx, withAssumed) {
    const d = ctx.deg;
    return '<div class="pd-cols"><div class="pd-box pd-acc"><h3>Professional accreditation</h3><ul>' + d.accreditation.map(function (a) {
      return '<li><b>' + esc(a.name) + '</b> <span class="st' + (/^Essential/.test(a.status || '') ? ' st-e' : '') + '">' + esc(a.status || '') + '</span></li>';
    }).join('') + '</ul></div><div class="pd-box"><h3>Exit awards</h3><ul>' + d.exitAwards.map(function (e) {
      return '<li>' + (e.code ? e.code + ' ' : '') + esc(e.name) + (e.exitOnly ? ' (exit only)' : '') + '</li>';
    }).join('') + '</ul>' + (withAssumed ? '<h3 style="margin-top:1.6mm">Assumed knowledge / admission</h3><p>' + esc(d.assumedKnowledge) + '</p>' : '') + '</div></div>';
  }
  function pdCampusLegend() {
    return '<div class="pd-box"><h3>Campus codes</h3><div class="pd-camp-legend">' + Object.keys(META.campuses).map(function (c) {
      return '<span>' + pdPill(c) + esc(META.campuses[c]) + '</span>';
    }).join('') + '<span>' + pdPill('TBC') + 'No 2027 session published yet</span><span><span class="pp-26" style="margin:0 1mm 0 0">2026</span>2027 session not yet published, 2026 session shown</span></div></div>';
  }
  function pdDisclaimer(ctx) {
    const o = ctx.opt;
    return '<div class="pd-disclaimer"><b>WSLSA disclaimer.</b> ' + esc(disclaimerText()) + ' Generated ' + esc(today()) + ' from ' + esc(META.sourceWorkbook) + ' for ' + esc(ctx.deg.code) + (o.majorCode === 'BASE' ? '' : ' · ' + esc(o.majorCode)) + '. Units marked ◆ are the student\'s own selections.</div>';
  }
  function shortSource(src) {
    if (/^2027/.test(src || '')) return '2027';
    if (/^2026/.test(src || '')) return '2026';
    return src ? 'Unpublished' : '';
  }
  // Landscape pages are too short for 60 rows in one column, so long lists split into two
  // side-by-side tables there; portrait keeps a single full-width table.
  function pdCatalogueTable(ctx, entries, o, title, sub) {
    const plan = ctx.used;
    const split = o.orient === 'landscape' && entries.length > 24;
    const cellFor = function (v) { const off = parseOffered(v); return off.none ? '<span class="na">—</span>' : pdOffer(off); };
    const table = function (list) {
      const camp = split ? 19 : o.orient === 'landscape' ? 34 : 24;
      return '<table class="pd-cat"><colgroup><col style="width:' + (split ? 16 : 17) + 'mm"><col><col style="width:' + (split ? 7 : 13) + 'mm"><col style="width:' + camp + 'mm"><col style="width:' + camp + 'mm"><col style="width:' + (split ? 15 : o.orient === 'landscape' ? 40 : 24) + 'mm"></colgroup>' +
        '<thead><tr><th>Code</th><th>Title</th><th>' + (split ? 'Lvl' : 'Level') + '</th><th>Autumn</th><th>Spring</th><th>' + (split ? 'Source' : 'Data source') + '</th></tr></thead><tbody>' +
        list.map(function (e) {
          const inPlan = !!plan[e.code];
          const src = split ? shortSource(e.source) : (e.source || '').replace(' (2027 not yet published)', '');
          return '<tr class="' + (inPlan ? 'inplan' : '') + '"><td class="c">' + (inPlan ? '<span class="mark">◆</span> ' : '') + esc(e.code) + '</td><td>' + esc(e.title) + '</td><td>' + esc((e.level || '').replace('Level ', 'L')) + '</td><td class="s">' + cellFor(e.autumn) + '</td><td class="s">' + cellFor(e.spring) + '</td><td class="src">' + esc(src) + '</td></tr>';
        }).join('') + '</tbody></table>';
    };
    const half = Math.ceil(entries.length / 2);
    return '<div class="pd-sec-h"><h2>' + esc(title) + '</h2><span>' + sub + '</span></div>' +
      (split ? '<div class="pd-cat-split">' + table(entries.slice(0, half)) + table(entries.slice(half)) + '</div>' : table(entries));
  }
  function llbFiltered(ctx, o) {
    const all = ctx.deg.byComp[ctx.deg.llbComponent] || [];
    const sessions = o.llbSession === 'all' ? SESSIONS : [o.llbSession];
    return all.filter(function (e) {
      return sessions.some(function (sess) {
        const off = parseOffered(sessionValue(e, sess));
        if (off.none) return false;
        if (off.tbc) return o.llbTbc;
        if (o.llbCampus && state.campus) return off.codes.indexOf(state.campus) >= 0 || off.codes.indexOf('ON') >= 0;
        return true;
      });
    });
  }
  function buildPrintDoc(ctx, o) {
    const head = pdHeader(ctx) + pdLegend();
    const grid = '<section class="pd-grid">' + pdGrid(ctx, o) + '</section>';
    if (o.mode === 'A') {
      return '<article class="pdoc pdoc-a ' + o.orient + '">' + head + grid + '<section class="pd-foot">' + pdWarnings(ctx) + pdAccreditation(ctx, false) + pdCampusLegend() + pdDisclaimer(ctx) + '</section></article>';
    }
    const llb = llbFiltered(ctx, o);
    const total = (ctx.deg.byComp[ctx.deg.llbComponent] || []).length;
    const filters = [];
    filters.push(o.llbSession === 'all' ? 'Autumn and Spring' : 'Offered in ' + o.llbSession);
    if (o.llbCampus && state.campus) filters.push('at ' + META.campuses[state.campus] + ' or online');
    if (!o.llbTbc) filters.push('excluding session TBC');
    const sub = esc(ctx.deg.code) + ' · ' + esc(filters.join(', ')) + ' · ' + llb.length + ' of ' + total + ' subjects · ◆ in your plan';
    const pools = {};
    ctx.slots.forEach(function (s) { if ((s.kind === 'pool' || s.kind === 'option') && s.raw.pool) s.raw.pool.forEach(function (p) { pools[p] = 1; }); });
    const poolHtml = Object.keys(pools).map(function (p) {
      return '<div class="pd-pool">' + pdCatalogueTable(ctx, ctx.deg.byComp[p] || [], o, cleanPoolTitle(p), 'Choice pool used in this pathway') + '</div>';
    }).join('');
    const portrait = o.orient === 'portrait';
    return '<article class="pdoc pdoc-b ' + o.orient + '">' + head + grid +
      (portrait ? '<section class="pd-foot">' + pdWarnings(ctx) + '</section>' : '') +
      '<div class="pd-page-break"></div>' +
      pdCatalogueTable(ctx, llb, o, 'LLB Alternate Subjects', sub) + '<p class="pd-note">' + esc(ctx.deg.catalogueNote || '') + '</p>' + poolHtml +
      '<section class="pd-foot" style="margin-top:3mm">' + (portrait ? '' : pdWarnings(ctx)) + pdAccreditation(ctx, true) + pdCampusLegend() + pdDisclaimer(ctx) + '</section></article>';
  }
  function setPageSize(orient) { $('#page-size').textContent = '@page { size: A4 ' + orient + '; margin: 12mm; }'; }
  function preparePrint() {
    const ctx = buildContext();
    setPageSize(state.exp.orient);
    $('#print-root').innerHTML = buildPrintDoc(ctx, state.exp);
  }
  function doPrint() {
    preparePrint();
    window.print();
  }
  window.addEventListener('beforeprint', preparePrint);

  // ---- export modal with live A4 preview
  function openExport() {
    ui.modal = 'export';
    const e = state.exp;
    const radio = function (name, val, title, desc) {
      return '<label class="opt-card"><input type="radio" name="' + name + '" value="' + val + '"' + (e[name.replace('exp-', '')] === val ? ' checked' : '') + '><b>' + title + '</b><span>' + desc + '</span></label>';
    };
    $('#modal-root').innerHTML = '<div class="modal-backdrop" data-action="backdrop"><div class="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="export-h">' +
      '<div class="modal-head"><div><h2 id="export-h">Export degree guide to PDF</h2><p>Vector-sharp A4 output through your browser\'s print engine. Choose <b>Save as PDF</b> as the destination.</p></div><button type="button" class="modal-x" data-action="modal-close" aria-label="Close">×</button></div>' +
      '<div class="export-layout"><div class="export-settings">' +
      '<fieldset><legend>Guide type</legend>' +
      radio('exp-mode', 'A', 'Mode A · Custom student pathway', '1–2 pages. Your selected units, campus codes, CP totals, warnings, accreditation and disclaimer.') +
      radio('exp-mode', 'B', 'Mode B · Complete handbook sheet', 'Pathway on page 1, the full LLB Alternate Subjects table on page 2, plus any choice pools used.') +
      '</fieldset>' +
      '<fieldset><legend>Orientation</legend><div class="segmented" role="group"><button type="button" data-action="exp-orient" data-v="portrait" aria-pressed="' + (e.orient === 'portrait') + '">A4 portrait</button><button type="button" data-action="exp-orient" data-v="landscape" aria-pressed="' + (e.orient === 'landscape') + '">A4 landscape</button></div></fieldset>' +
      '<fieldset><legend>Options</legend>' +
      '<label class="check-row"><input type="checkbox" name="exp-ticks"' + (e.ticks ? ' checked' : '') + (state.track ? '' : ' disabled') + '><span>Show completion ticks' + (state.track ? '' : ' (turn on Track progress first)') + '</span></label></fieldset>' +
      '<fieldset id="exp-llb"' + (e.mode === 'B' ? '' : ' disabled') + '><legend>LLB Alternate table (Mode B)</legend>' +
      '<div class="select-wrap"><select name="exp-llbSession" aria-label="Session filter"><option value="all"' + (e.llbSession === 'all' ? ' selected' : '') + '>Autumn and Spring</option><option value="Autumn"' + (e.llbSession === 'Autumn' ? ' selected' : '') + '>Offered in Autumn</option><option value="Spring"' + (e.llbSession === 'Spring' ? ' selected' : '') + '>Offered in Spring</option></select></div>' +
      '<label class="check-row"><input type="checkbox" name="exp-llbCampus"' + (e.llbCampus ? ' checked' : '') + (state.campus ? '' : ' disabled') + '><span>Only at ' + (state.campus ? esc(META.campuses[state.campus]) : 'my campus') + ' or online' + (state.campus ? '' : ' (set a primary campus first)') + '</span></label>' +
      '<label class="check-row"><input type="checkbox" name="exp-llbTbc"' + (e.llbTbc ? ' checked' : '') + '><span>Include subjects with session TBC</span></label></fieldset>' +
      '<p class="export-help"><b>Tips.</b> Paper size A4, scale 100%, margins default. Background tints are forced on with <code>print-color-adjust</code>; if a browser still drops them, tick <b>Background graphics</b> in its print dialog.</p>' +
      '<button type="button" class="btn btn-primary" data-action="export-print" style="min-height:44px">Save as PDF / Print</button>' +
      '</div><div class="export-preview" id="export-preview"><div class="preview-meta"><span id="preview-pages">Preview</span><span>A4 · 12 mm margins</span></div><div class="preview-stage" id="preview-stage"></div></div></div></div></div>';
    document.body.style.overflow = 'hidden';
    renderExportPreview();
  }
  function renderExportPreview() {
    const stage = $('#preview-stage');
    if (!stage) return;
    const ctx = lastCtx || buildContext();
    stage.innerHTML = buildPrintDoc(ctx, state.exp);
    const llbSet = $('#exp-llb');
    if (llbSet) llbSet.disabled = state.exp.mode !== 'B';
    requestAnimationFrame(function () {
      const box = $('#export-preview');
      const doc = stage.firstElementChild;
      if (!box || !doc) return;
      const avail = box.clientWidth - 36;
      const scale = Math.min(1, avail / doc.offsetWidth);
      stage.style.transform = 'scale(' + scale + ')';
      stage.style.height = (doc.offsetHeight * scale) + 'px';
      stage.style.width = (doc.offsetWidth) + 'px';
      const pages = estimatePages(doc, state.exp.orient);
      $('#preview-pages').textContent = 'Estimated length: ' + plural(pages, 'A4 page') + ' (' + state.exp.orient + ')';
    });
  }
  // Packs the document's unbreakable blocks into A4 pages the way the print engine does
  // (break-inside: avoid on headers, year blocks and footer boxes; table rows may split).
  function estimatePages(doc, orient) {
    const mm = doc.offsetWidth / (orient === 'landscape' ? 297 : 210);
    const pageH = (orient === 'landscape' ? 186 : 273) * mm;
    const pad = 12 * mm;
    const blocks = doc.querySelectorAll('.pd-head, .pd-legend, .pd-year, .pd-foot > *, .pd-page-break, .pd-sec-h, .pd-cat-split, table.pd-cat thead, table.pd-cat tbody tr, .pd-note');
    let pages = 1;
    let start = pad;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const top = b.getBoundingClientRect().top - doc.getBoundingClientRect().top;
      const scale = doc.getBoundingClientRect().width / doc.offsetWidth || 1;
      const t = top / scale;
      const h = b.getBoundingClientRect().height / scale;
      if (b.classList.contains('pd-page-break')) {
        pages++;
        const next = blocks[i + 1];
        start = next ? (next.getBoundingClientRect().top - doc.getBoundingClientRect().top) / scale : t;
        continue;
      }
      if (t + h - start > pageH + 0.5) {
        pages++;
        start = t;
      }
    }
    return pages;
  }

  // ======================================================================== events
  document.addEventListener('click', function (ev) {
    const el = ev.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    const ctx = lastCtx;
    switch (a) {
      case 'top': ev.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); break;
      case 'backdrop': if (ev.target === el) closeModal(); break;
      case 'modal-close': closeModal(); break;
      case 'share': share(); break;
      case 'reset': {
        const key = currentKey();
        if (!window.confirm('Clear all choices and progress for ' + key.replace('|BASE', '') + '?')) return;
        delete state.picks[key];
        delete state.done[key];
        render();
        toast('Pathway reset to the WSLSA recommendation.');
        break;
      }
      case 'export-open': openExport(); break;
      case 'export-print': doPrint(); break;
      case 'exp-orient': state.exp.orient = el.dataset.v; el.parentElement.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b === el)); }); saveState(); renderExportPreview(); break;
      case 'load': state.load = el.dataset.load; render(); break;
      case 'campus-pill': {
        const c = el.dataset.campus;
        state.campus = state.campus === c ? '' : c;
        render();
        toast(state.campus ? 'Highlighting ' + META.campuses[c] + ' (and online).' : 'Campus filter cleared.');
        break;
      }
      case 'campus-clear': state.campus = ''; render(); break;
      case 'tab': ui.tab = el.dataset.tab; renderDetails(ctx); $('#tab-' + ui.tab).focus(); break;
      case 'jump': ev.preventDefault(); flashSlot(el.dataset.slot); break;
      case 'picker-open': openPicker(el.dataset.slot); break;
      case 'inline': {
        const s = ctx.byId[el.dataset.slot];
        const code = el.dataset.code;
        if (s.code === code && !s.pending && s.chosen) setPick(s.id, null);
        else {
          const o = s.raw.options.find(function (x) { return x.code === code; });
          setPick(s.id, { code: o.code, title: o.title });
        }
        render();
        break;
      }
      case 'clear': setPick(el.dataset.slot, null); render(); break;
      case 'session-done': {
        const key = currentKey();
        const ids = el.dataset.ids.split(',');
        state.done[key] = state.done[key] || {};
        const all = ids.every(function (id) { return state.done[key][id]; });
        ids.forEach(function (id) { if (all) delete state.done[key][id]; else state.done[key][id] = 1; });
        render();
        break;
      }
      case 'pick': choosePick(el.dataset.code); break;
      case 'pick-clear': { const id = ui.picker.slotId; setPick(id, null); closeModal(); render(); flashSlot(id); break; }
      case 'pick-campus': ui.picker.campusOnly = !ui.picker.campusOnly; el.setAttribute('aria-pressed', ui.picker.campusOnly); renderPickerResults(); break;
      case 'pick-off': ui.picker.showOff = !ui.picker.showOff; el.setAttribute('aria-pressed', ui.picker.showOff); renderPickerResults(); break;
      case 'pick-level': {
        ui.picker.level = ui.picker.level === el.dataset.level ? '' : el.dataset.level;
        document.querySelectorAll('[data-action="pick-level"]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.level === ui.picker.level)); });
        renderPickerResults();
        break;
      }
      default: break;
    }
  });

  document.addEventListener('submit', function (ev) {
    if (ev.target.id !== 'custom-form') return;
    ev.preventDefault();
    const code = $('#cu-code').value.trim().toUpperCase().replace(/\s+/g, ' ');
    const title = $('#cu-title').value.trim();
    if (!code || !title) { toast('Enter both a subject code and a title.'); return; }
    const id = ui.picker.slotId;
    setPick(id, { code: code.slice(0, 16), title: title.slice(0, 140), custom: true });
    closeModal();
    render();
    flashSlot(id);
  });

  document.addEventListener('change', function (ev) {
    const t = ev.target;
    if (t.id === 'sel-degree') { state.degree = t.value; render(); }
    else if (t.id === 'sel-major') { setMajor(t.value); render(); }
    else if (t.id === 'sel-campus') { state.campus = t.value; render(); }
    else if (t.id === 'tg-track') { state.track = t.checked; render(); }
    else if (t.dataset && t.dataset.action === 'done') {
      const key = currentKey();
      state.done[key] = state.done[key] || {};
      if (t.checked) state.done[key][t.dataset.slot] = 1; else delete state.done[key][t.dataset.slot];
      render();
    } else if (t.id === 'cat-comp') { ui.cat.comp = t.value; renderCatalogueRows(lastCtx); }
    else if (t.id === 'cat-session') { ui.cat.session = t.value; renderCatalogueRows(lastCtx); }
    else if (t.id === 'cat-inplan') { ui.cat.inPlan = t.checked; renderCatalogueRows(lastCtx); }
    else if (t.name && t.name.indexOf('exp-') === 0) {
      const k = t.name.slice(4);
      state.exp[k] = t.type === 'checkbox' ? t.checked : t.value;
      saveState();
      renderExportPreview();
    }
  });

  document.addEventListener('input', function (ev) {
    const t = ev.target;
    if (t.id === 'pick-q') { ui.picker.q = t.value; renderPickerResults(); }
    else if (t.id === 'cat-q') { ui.cat.q = t.value; renderCatalogueRows(lastCtx); }
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && ui.modal) { closeModal(); return; }
    const el = ev.target;
    if ((ev.key === 'Enter' || ev.key === ' ') && el.getAttribute && el.getAttribute('role') === 'button' && el.dataset.action) {
      ev.preventDefault();
      el.click();
    }
  });

  window.addEventListener('resize', function () { if (ui.modal === 'export') renderExportPreview(); });

  // ======================================================================== boot
  applyHash();
  render();

  // test hook: lets the automated checks drive the app without relying on UI layout
  window.WSLSA = {
    state: function () { return JSON.parse(JSON.stringify(state)); },
    context: function () { return buildContext(); },
    keys: function () { return Object.keys(PATH); },
    select: function (key) { const d = key.split('|')[0]; state.degree = d; state.majorFor[d] = key; render(); },
    buildPrintDoc: function (opts) { return buildPrintDoc(buildContext(), Object.assign({}, state.exp, opts || {})); },
    preparePrint: function (opts) { Object.assign(state.exp, opts || {}); preparePrint(); },
  };
})();
