/* =====================================================================
   THE ASHVALE FILES — application
   ===================================================================== */

import { CASES, ALL_LESSONS, RANKS } from './cases.js';
import { TABLE_DOCS } from './data.js';
import * as E from './engine.js';
import { portrait, skyline, startRain, stamp, caseSeal, progressRing, esc, ICON } from './art.js';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const SAVE_KEY = 'ashvale.save.v1';

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const state = {
  solved: new Set(),
  assisted: new Set(),
  closed: new Set(),
  xp: 0,
  sound: true,
  current: ALL_LESSONS[0].id,
  schema: []
};

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      solved: [...state.solved], assisted: [...state.assisted],
      closed: [...state.closed], xp: state.xp, sound: state.sound, current: state.current
    }));
  } catch { /* private window — play on without a save */ }
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    state.solved = new Set(d.solved || []);
    state.assisted = new Set(d.assisted || []);
    state.closed = new Set(d.closed || []);
    state.xp = d.xp || 0;
    state.sound = d.sound !== false;
    if (d.current && ALL_LESSONS.some(l => l.id === d.current)) state.current = d.current;
  } catch { /* corrupt save — start fresh */ }
}

const lessonById = id => ALL_LESSONS.find(l => l.id === id);
const caseById   = id => CASES.find(c => c.id === id);
const caseOf     = lesson => caseById(lesson.caseId);

function caseDone(c) { return c.lessons.every(l => state.solved.has(l.id)); }

/** A case unlocks when the previous case is closed. */
function caseUnlocked(c) {
  const i = CASES.indexOf(c);
  return i === 0 || state.closed.has(CASES[i - 1].id);
}

/** A lesson unlocks when its case is open and the lesson before it is solved. */
function lessonUnlocked(lesson) {
  const c = caseOf(lesson);
  if (!caseUnlocked(c)) return false;
  if (lesson.index === 0) return true;
  return state.solved.has(c.lessons[lesson.index - 1].id);
}

function rank() {
  const n = state.solved.size;
  let r = RANKS[0];
  for (const x of RANKS) if (n >= x.at) r = x;
  return r.title;
}

/* ------------------------------------------------------------------ */
/* Sound — a few synthesised blips, no audio files                     */
/* ------------------------------------------------------------------ */

let actx = null;
function tone(freq, dur = 0.09, type = 'sine', gain = 0.05) {
  if (!state.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(gain, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(); o.stop(actx.currentTime + dur);
  } catch { /* no audio available */ }
}
const sfx = {
  ok:    () => { tone(660, .08, 'sine', .05); setTimeout(() => tone(880, .14, 'sine', .05), 80); },
  nope:  () => { tone(180, .16, 'sawtooth', .035); },
  click: () => tone(420, .035, 'square', .02),
  stamp: () => { tone(110, .22, 'triangle', .09); setTimeout(() => tone(70, .3, 'triangle', .06), 60); },
  open:  () => { [330, 440, 550, 660].forEach((f, i) => setTimeout(() => tone(f, .12, 'sine', .04), i * 90)); }
};

/* ------------------------------------------------------------------ */
/* Editor (CodeMirror when it loads, textarea when it does not)        */
/* ------------------------------------------------------------------ */

let editor = null;

function dedent(sql) {
  const lines = String(sql).replace(/\t/g, '  ').split('\n');
  const indents = lines.filter(l => l.trim()).slice(1).map(l => l.match(/^ */)[0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return lines.map((l, i) => (i === 0 ? l.trim() : l.slice(cut))).join('\n').trim();
}

function makeEditor(host, onSubmit) {
  const ta = document.createElement('textarea');
  ta.className = 'sql-input';
  ta.spellcheck = false;
  ta.setAttribute('aria-label', 'SQL query editor');
  host.appendChild(ta);

  if (window.CodeMirror) {
    const cm = window.CodeMirror.fromTextArea(ta, {
      mode: 'text/x-sqlite', theme: 'ashvale', lineNumbers: true,
      lineWrapping: true, matchBrackets: true, autofocus: false,
      extraKeys: {
        'Ctrl-Enter': onSubmit, 'Cmd-Enter': onSubmit,
        'Tab': cmInst => cmInst.replaceSelection('  ')
      }
    });
    cm.setSize('100%', '100%');
    return {
      get: () => cm.getValue(),
      set: v => { cm.setValue(v); cm.refresh(); },
      focus: () => cm.focus(),
      refresh: () => cm.refresh()
    };
  }
  ta.addEventListener('keydown', ev => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') { ev.preventDefault(); onSubmit(); }
  });
  return { get: () => ta.value, set: v => { ta.value = v; }, focus: () => ta.focus(), refresh: () => {} };
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  load();
  $('#rain') && startRain($('#rain'));
  $('#skyline-host').innerHTML = skyline();

  try {
    state.schema = await E.boot(msg => { $('#boot-msg').textContent = msg; });
  } catch (err) {
    $('#boot-msg').innerHTML =
      `<strong>The records server is unreachable.</strong><br>` +
      `<span class="muted">${esc(E.cleanError(err))}</span><br><br>` +
      `This game loads its SQL engine from a public CDN. Check your connection ` +
      `(or your content blocker) and reload.`;
    $('#boot').classList.add('failed');
    return;
  }

  if (new URLSearchParams(location.search).has('selftest')) return selfTest();

  buildUI();
  $('#boot').classList.add('done');
  setTimeout(() => $('#boot').remove(), 700);

  if (state.solved.size > 0) enterGame(false);
  else $('#title').classList.add('show');
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

function buildUI() {
  $('#title-start').addEventListener('click', () => { sfx.open(); enterGame(true); });
  $('#title-continue').addEventListener('click', () => { sfx.click(); enterGame(false); });
  $('#title-continue').hidden = state.solved.size === 0;

  $('#btn-sound').addEventListener('click', () => {
    state.sound = !state.sound; save(); paintSound(); if (state.sound) sfx.click();
  });
  paintSound();

  $('#btn-reset').addEventListener('click', () => {
    if (!confirm('Wipe your badge, your rank and every solved case, and start again from Case 1?')) return;
    state.solved.clear(); state.assisted.clear(); state.closed.clear();
    state.xp = 0; state.current = ALL_LESSONS[0].id;
    save(); renderAll(); window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  $$('.tabs').forEach(tabs => {
    tabs.addEventListener('click', ev => {
      const b = ev.target.closest('[data-tab]');
      if (!b) return;
      sfx.click();
      $$('[data-tab]', tabs).forEach(x => x.classList.toggle('on', x === b));
      const panel = tabs.closest('.pane');
      $$('[data-panel]', panel).forEach(p => { p.hidden = p.dataset.panel !== b.dataset.tab; });
      if (b.dataset.tab === 'editor') editor && editor.refresh();
    });
  });

  editor = makeEditor($('#editor-host'), onSubmit);
  $('#btn-run').addEventListener('click', onRun);
  $('#btn-submit').addEventListener('click', onSubmit);
  $('#btn-hint').addEventListener('click', onHint);
  $('#btn-reveal').addEventListener('click', onReveal);
  $('#btn-reset-editor').addEventListener('click', () => {
    const l = lessonById(state.current);
    editor.set(l.starter || ''); editor.focus();
  });
  $('#btn-next').addEventListener('click', onNext);

  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') $$('.overlay.show').forEach(o => o.classList.remove('show'));
  });

  renderAll();
}

function paintSound() {
  $('#btn-sound').innerHTML = (state.sound ? ICON.sound : ICON.mute) +
    `<span>${state.sound ? 'Sound on' : 'Muted'}</span>`;
}

function enterGame(fromStart) {
  $('#title').classList.remove('show');
  $('#app').classList.add('show');
  const l = lessonById(state.current);
  if (fromStart && l.index === 0) showCaseIntro(caseOf(l));
  openLesson(state.current, true);
}

function renderAll() { renderHeader(); renderNav(); renderLesson(); renderSchema(); renderBoard(); }

function renderHeader() {
  const total = ALL_LESSONS.length, done = state.solved.size;
  $('#hdr-rank').textContent = rank();
  $('#hdr-xp').textContent = state.xp.toLocaleString();
  $('#hdr-progress').innerHTML = progressRing(done, total, 40);
  $('#hdr-count').textContent = `${done} / ${total} chapters`;
}

/* ------------------------------------------------------------------ */
/* Navigator                                                           */
/* ------------------------------------------------------------------ */

function renderNav() {
  const cur = lessonById(state.current);
  $('#nav').innerHTML = CASES.map(c => {
    const unlocked = caseUnlocked(c);
    const done = c.lessons.filter(l => state.solved.has(l.id)).length;
    const open = c.id === cur.caseId;
    return `
    <section class="nav-case ${unlocked ? '' : 'locked'} ${open ? 'open' : ''}"
             style="--accent:${c.accent}">
      <button class="nav-case-head" data-case="${c.id}" ${unlocked ? '' : 'disabled'}>
        <span class="nav-num">${String(c.number).padStart(2, '0')}</span>
        <span class="nav-title">
          <strong>${esc(c.title)}</strong>
          <small>${unlocked ? esc(c.tagline) : 'Sealed'}</small>
        </span>
        <span class="nav-meta">
          ${state.closed.has(c.id) ? `<span class="chip closed">closed</span>`
            : unlocked ? `<span class="chip">${done}/${c.lessons.length}</span>`
            : ICON.lock}
        </span>
      </button>
      <ol class="nav-lessons">
        ${c.lessons.map(l => {
          const ok = state.solved.has(l.id);
          const can = lessonUnlocked(l);
          return `<li>
            <button class="nav-lesson ${ok ? 'done' : ''} ${l.id === cur.id ? 'current' : ''}"
                    data-lesson="${l.id}" ${can ? '' : 'disabled'}>
              <span class="dot">${ok ? ICON.tick : can ? '' : ICON.lock}</span>
              <span class="nl-text">
                <span class="nl-chapter">${esc(l.chapter)}</span>
                <span class="nl-title">${esc(l.title)}</span>
              </span>
            </button></li>`;
        }).join('')}
      </ol>
    </section>`;
  }).join('');

  $$('#nav [data-lesson]').forEach(b => b.addEventListener('click', () => {
    sfx.click(); openLesson(b.dataset.lesson);
  }));
  $$('#nav [data-case]').forEach(b => b.addEventListener('click', () => {
    const c = caseById(b.dataset.case);
    const next = c.lessons.find(l => !state.solved.has(l.id)) || c.lessons[0];
    sfx.click(); openLesson(next.id);
  }));
}

/* ------------------------------------------------------------------ */
/* Lesson view                                                         */
/* ------------------------------------------------------------------ */

function openLesson(id, silent) {
  const l = lessonById(id);
  if (!l || !lessonUnlocked(l)) return;
  state.current = id; save();
  renderNav(); renderLesson();
  if (!silent) $('#stage').scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => editor && editor.focus(), 60);
}

function renderLesson() {
  const l = lessonById(state.current);
  const c = caseOf(l);
  const solved = state.solved.has(l.id);
  document.documentElement.style.setProperty('--accent', c.accent);

  $('#lesson-eyebrow').innerHTML =
    `<span class="case-tag">Case ${String(c.number).padStart(2, '0')} · ${esc(c.title)}</span>
     <span class="sep">/</span>
     <span class="chapter-tag">${esc(l.chapter)}</span>
     ${solved ? `<span class="chip closed">solved</span>` : ''}`;
  $('#lesson-title').textContent = l.title;
  $('#lesson-story').innerHTML = l.story;
  $('#lesson-task').innerHTML = `<h4>Your query</h4>${l.task}`;

  $('#manual').innerHTML = `
    <h3>${esc(l.chapter)}</h3>
    <div class="prose">${l.concept}</div>
    <h4>Syntax</h4>
    <pre class="code">${esc(l.syntax)}</pre>
    <h4>Example</h4>
    <pre class="code">${esc(l.example)}</pre>
    ${l.note ? `<div class="note"><strong>Note</strong><div>${l.note}</div></div>` : ''}
    ${l.setup ? `<div class="note setup"><strong>Already run for you</strong>
        <pre class="code">${esc(dedent(l.setup))}</pre></div>` : ''}`;

  editor.set(l.starter || '');
  $('#feedback').className = 'feedback';
  $('#feedback').innerHTML = '';
  $('#results').innerHTML = emptyResults();
  $('#btn-next').hidden = !solved;
  $('#btn-submit').textContent = solved ? 'Check again' : 'Submit to the Bureau';
  $('#reveal-row').hidden = false;

  highlightTables(l.tables || []);
}

function emptyResults() {
  return `<div class="results-empty">${ICON.db}<p>Run a query and the records will appear here.</p></div>`;
}

function renderTable(results) {
  if (!results || !results.length) {
    return `<div class="results-empty ok">${ICON.tick}
      <p>Statement executed. It returned no rows — which is normal for
      INSERT, UPDATE, DELETE, CREATE and DROP.</p></div>`;
  }
  const r = results[results.length - 1];
  const extra = results.length > 1
    ? `<div class="results-note">${results.length} statements ran; showing the last result.</div>` : '';
  const cap = 200;
  const rows = r.values.slice(0, cap);
  return `${extra}
    <div class="table-wrap">
      <table class="grid">
        <thead><tr>${r.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(row => `<tr>${row.map(v =>
          v === null ? `<td class="null">NULL</td>` : `<td>${esc(v)}</td>`
        ).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="results-note">${r.values.length} row${r.values.length === 1 ? '' : 's'}${
      r.values.length > cap ? ` · showing the first ${cap}` : ''}</div>`;
}

function onRun() {
  const l = lessonById(state.current);
  const out = E.tryQuery(l, editor.get());
  if (!out.ok) {
    sfx.nope();
    $('#results').innerHTML = `<div class="results-error"><strong>SQLite says:</strong> ${esc(out.error)}</div>`;
    return;
  }
  sfx.click();
  $('#results').innerHTML = renderTable(out.results);
}

function onSubmit() {
  const l = lessonById(state.current);
  const res = E.grade(l, editor.get());
  const fb = $('#feedback');

  if (res.ok) {
    $('#results').innerHTML = renderTable(res.results);
    fb.className = 'feedback good';
    fb.innerHTML = `<strong>${ICON.tick} Confirmed.</strong> <span>${esc(l.reveal)}</span>`;
    if (!state.solved.has(l.id)) {
      state.solved.add(l.id);
      state.xp += state.assisted.has(l.id) ? 6 : 10;
      sfx.ok();
      burst();
    } else { sfx.click(); }
    save();
    $('#btn-next').hidden = false;
    $('#btn-submit').textContent = 'Check again';
    renderHeader(); renderNav(); renderBoard();

    const c = caseOf(l);
    if (l.isAccusation && !state.closed.has(c.id) && caseDone(c)) {
      setTimeout(() => showLineup(c), 650);
    }
    return;
  }

  sfx.nope();
  if (res.results) $('#results').innerHTML = renderTable(res.results);
  fb.className = 'feedback bad';
  const label = res.kind === 'sql' ? 'SQLite rejected that'
    : res.kind === 'mismatch' ? 'Not the result the Bureau has on file'
    : res.kind === 'empty' ? 'Nothing submitted' : 'Not yet';
  fb.innerHTML = `<strong>${esc(label)}.</strong> <span>${esc(res.message)}</span>`;
  fb.animate(
    [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' },
     { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }],
    { duration: 220 }
  );
}

function onHint() {
  const l = lessonById(state.current);
  state.assisted.add(l.id); save();
  sfx.click();
  const fb = $('#feedback');
  fb.className = 'feedback hint';
  fb.innerHTML = `<strong>${ICON.bulb} Addo leans over.</strong>
    <span>"Try it like this."</span><pre class="code">${esc(dedent(l.hint))}</pre>`;
}

function onReveal() {
  const l = lessonById(state.current);
  if (!confirm('Fill the terminal with the Bureau\'s own query? You will still need to submit it, and the chapter scores fewer points.')) return;
  state.assisted.add(l.id); save();
  editor.set(dedent(l.solution));
  editor.focus();
  const fb = $('#feedback');
  fb.className = 'feedback hint';
  fb.innerHTML = `<strong>Answer filled in.</strong> <span>Read it line by line before you submit it — that is the part that sticks.</span>`;
}

function onNext() {
  const l = lessonById(state.current);
  const c = caseOf(l);
  const next = c.lessons[l.index + 1];
  if (next) { sfx.click(); openLesson(next.id); return; }
  const ci = CASES.indexOf(c);
  const nc = CASES[ci + 1];
  if (nc && caseUnlocked(nc)) { sfx.click(); openLesson(nc.lessons[0].id); showCaseIntro(nc); }
  else if (!nc) showFinale();
}

/* ------------------------------------------------------------------ */
/* Records panel                                                       */
/* ------------------------------------------------------------------ */

function renderSchema() {
  $('#schema').innerHTML = state.schema.map(t => `
    <details class="tbl" data-table="${esc(t.name)}">
      <summary>
        <span class="tbl-name">${esc(t.name)}</span>
        <span class="tbl-rows">${t.rows}</span>
      </summary>
      <p class="tbl-doc">${esc(TABLE_DOCS[t.name] || '')}</p>
      <ul class="cols">
        ${t.columns.map(c => `<li>
          <code>${esc(c.name)}</code>
          <span class="ty">${esc(c.type)}</span>
          ${c.pk ? `<span class="flag pk">PK</span>` : ''}
          ${c.notnull && !c.pk ? `<span class="flag">NOT NULL</span>` : ''}
        </li>`).join('')}
      </ul>
      <button class="peek" data-peek="${esc(t.name)}">${ICON.play} Peek at 5 rows</button>
    </details>`).join('');

  $$('#schema [data-peek]').forEach(b => b.addEventListener('click', ev => {
    ev.preventDefault();
    const sql = `SELECT * FROM ${b.dataset.peek} LIMIT 5;`;
    const out = E.scratchQuery(sql);
    sfx.click();
    $('#results').innerHTML = out.ok
      ? `<div class="results-note">${esc(sql)}</div>` + renderTable(out.results)
      : `<div class="results-error">${esc(out.error)}</div>`;
  }));
}

function highlightTables(names) {
  $$('#schema .tbl').forEach(d => {
    const on = names.includes(d.dataset.table);
    d.classList.toggle('relevant', on);
    if (on) d.open = true;
  });
}

/* ------------------------------------------------------------------ */
/* Evidence board                                                      */
/* ------------------------------------------------------------------ */

function suspectRows() {
  const out = E.scratchQuery('SELECT * FROM suspects ORDER BY suspect_id;');
  if (!out.ok || !out.results.length) return [];
  const { columns, values } = out.results[0];
  return values.map(v => Object.fromEntries(columns.map((c, i) => [c, v[i]])));
}

let SUSPECTS = null;

function renderBoard() {
  SUSPECTS = SUSPECTS || suspectRows();
  const caught = new Map();
  for (const c of CASES) if (state.closed.has(c.id)) caught.set(c.culprit, c);

  $('#board').innerHTML = `
    <p class="board-intro">Fourteen files. Pin a face to a case and the thread goes red.</p>
    <div class="board-grid">
      ${SUSPECTS.map(s => {
        const c = caught.get(s.suspect_id);
        return `<figure class="susp ${c ? 'caught' : ''}">
          ${portrait(s, 92)}
          ${c ? `<span class="caught-tag">Case ${String(c.number).padStart(2, '0')}</span>` : ''}
          <figcaption>
            <strong>${esc(s.name)}</strong>
            <small>${esc(s.alias || '—')} · ${esc(s.occupation)}</small>
            <small class="dist">${esc(s.district)}</small>
          </figcaption>
        </figure>`;
      }).join('')}
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Case intro / lineup / verdict                                       */
/* ------------------------------------------------------------------ */

function overlay(id, html, onClose) {
  const el = $(id);
  el.innerHTML = html;
  el.classList.add('show');
  $$('[data-close]', el).forEach(b => b.addEventListener('click', () => {
    el.classList.remove('show');
    onClose && onClose();
  }));
  return el;
}

function showCaseIntro(c) {
  sfx.open();
  overlay('#overlay', `
    <div class="sheet case-file" style="--accent:${c.accent}">
      <div class="file-head">
        ${caseSeal(c.number, c.accent)}
        <div>
          <p class="kicker">Bureau of Forensic Data · Ashvale</p>
          <h2>${esc(c.title)}</h2>
          <p class="file-meta">${esc(c.place)} &nbsp;·&nbsp; ${esc(c.date)}</p>
        </div>
      </div>
      <div class="prose">${c.brief}</div>
      <p class="chapters"><strong>Chapters in this case:</strong> ${esc(c.chapters)}</p>
      <button class="btn primary" data-close>Open the file</button>
    </div>`);
}

function showLineup(c) {
  sfx.open();
  const people = c.lineup.map(id => SUSPECTS.find(s => s.suspect_id === id)).filter(Boolean);
  overlay('#overlay', `
    <div class="sheet lineup" style="--accent:${c.accent}">
      <p class="kicker">Case ${String(c.number).padStart(2, '0')} · ${esc(c.title)}</p>
      <h2>Make the accusation</h2>
      <p class="lead">You have the evidence. Name the one the queries point to —
        and be sure, because the Bureau writes this down.</p>
      <div class="lineup-grid">
        ${people.map(s => `
          <button class="pick" data-pick="${s.suspect_id}">
            ${portrait(s, 110)}
            <span class="pick-name">${esc(s.name)}</span>
            <span class="pick-job">${esc(s.occupation)}</span>
          </button>`).join('')}
      </div>
      <p class="lineup-foot" id="lineup-foot"></p>
    </div>`);

  $$('#overlay [data-pick]').forEach(b => b.addEventListener('click', () => {
    const id = Number(b.dataset.pick);
    if (id === c.culprit) {
      b.classList.add('right');
      sfx.stamp(); burst();
      state.closed.add(c.id); state.xp += 25; save();
      setTimeout(() => { $('#overlay').classList.remove('show'); showVerdict(c); }, 600);
    } else {
      b.classList.add('wrong');
      b.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' },
                 { transform: 'translateX(7px)' }, { transform: 'translateX(0)' }], { duration: 260 });
      sfx.nope();
      $('#lineup-foot').textContent =
        'That one does not fit the evidence. Re-read the result of your last query.';
    }
  }));
}

function showVerdict(c) {
  const culprit = SUSPECTS.find(s => s.suspect_id === c.culprit);
  const isLast = CASES.indexOf(c) === CASES.length - 1;
  overlay('#overlay', `
    <div class="sheet verdict" style="--accent:${c.accent}">
      <div class="stamp-holder">${stamp('CASE CLOSED', c.accent)}</div>
      <div class="verdict-body">
        <div class="verdict-face">${portrait(culprit, 150)}</div>
        <div>
          <p class="kicker">Case ${String(c.number).padStart(2, '0')} · ${esc(c.title)}</p>
          <h2>${esc(culprit.name)}</h2>
          <div class="prose">${c.verdict}</div>
          <p class="earned">+25 commendation points · rank: <strong>${esc(rank())}</strong></p>
        </div>
      </div>
      <button class="btn primary" data-close>${isLast ? 'File the final report' : 'Next case'}</button>
    </div>`, () => {
    renderAll();
    if (isLast) { showFinale(); return; }
    const nc = CASES[CASES.indexOf(c) + 1];
    if (nc) { openLesson(nc.lessons[0].id); showCaseIntro(nc); }
  });
}

function showFinale() {
  const total = ALL_LESSONS.length;
  const clean = total - state.assisted.size;
  sfx.open();
  overlay('#overlay', `
    <div class="sheet finale">
      <div class="stamp-holder">${stamp('COMMENDED', '#f4b942')}</div>
      <h2>Chief of Forensic Data</h2>
      <p class="lead">Five cases. ${total} chapters of SQL. One archivist in a holding cell
        on the ground floor, insisting the database is wrong.</p>
      <div class="finale-stats">
        <div><strong>${state.solved.size}/${total}</strong><span>chapters</span></div>
        <div><strong>${clean}</strong><span>solved unaided</span></div>
        <div><strong>${state.xp.toLocaleString()}</strong><span>points</span></div>
      </div>
      <p>You have now used every clause in the W3Schools SQL curriculum against a real database:
        <code>SELECT</code> through <code>JOIN</code>, <code>GROUP BY</code> through
        <code>CASE</code>, and the whole of DDL and DML. The same queries work in PostgreSQL,
        MySQL and SQL Server, give or take the dialect notes you were warned about.</p>
      <p class="lead">Every table is still here. Open the Records panel and keep asking it questions.</p>
      <button class="btn primary" data-close>Back to the file room</button>
    </div>`);
}

/* A short burst of paper confetti on a correct answer. */
function burst() {
  const host = document.createElement('div');
  host.className = 'burst';
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('i');
    p.style.setProperty('--dx', (Math.random() * 2 - 1).toFixed(2));
    p.style.setProperty('--dy', (-0.4 - Math.random()).toFixed(2));
    p.style.setProperty('--rot', Math.floor(Math.random() * 360) + 'deg');
    p.style.setProperty('--d', (Math.random() * 0.18).toFixed(2) + 's');
    host.appendChild(p);
  }
  $('#stage').appendChild(host);
  setTimeout(() => host.remove(), 1400);
}

/* ------------------------------------------------------------------ */
/* Self-test — ?selftest=1 grades every reference solution             */
/* ------------------------------------------------------------------ */

function selfTest() {
  const lines = [];
  let pass = 0, fail = 0;

  // sanity: engine features the curriculum depends on
  for (const [label, sql] of [
    ['RIGHT JOIN', 'SELECT s.name, v.plate FROM vehicles v RIGHT JOIN suspects s ON s.suspect_id = v.suspect_id LIMIT 1;'],
    ['FULL OUTER JOIN', 'SELECT s.name FROM suspects s FULL OUTER JOIN vehicles v ON v.suspect_id = s.suspect_id LIMIT 1;'],
    ['pragma_table_info', "SELECT name FROM pragma_table_info('suspects') LIMIT 1;"],
    ['sqlite_version', 'SELECT sqlite_version();']
  ]) {
    const out = E.scratchQuery(sql);
    lines.push(`${out.ok ? 'OK  ' : 'FAIL'}  engine: ${label}` +
      (out.ok ? (label === 'sqlite_version' ? ' = ' + out.results[0].values[0][0] : '') : ' — ' + out.error));
    out.ok ? pass++ : fail++;
  }

  for (const l of ALL_LESSONS) {
    const r = E.grade(l, l.solution);
    if (r.ok) { pass++; lines.push(`OK    ${l.id}  ${l.chapter} — ${r.rowCount} row(s)`); }
    else { fail++; lines.push(`FAIL  ${l.id}  ${l.chapter} — [${r.kind}] ${r.message}`); }

    // the hint must also be a sensible fragment, and the starter must not error
    const st = E.tryQuery(l, (l.starter || '').trim() || 'SELECT 1;');
    if (!st.ok && (l.starter || '').trim().replace(/--[^\n]*/g, '').trim()) {
      fail++; lines.push(`FAIL  ${l.id}  starter does not parse — ${st.error}`);
    }
  }

  document.body.innerHTML =
    `<pre style="padding:24px;font:12px/1.6 ui-monospace,monospace;color:#cfe;background:#0b0e14;min-height:100vh">` +
    `SELF TEST\n${pass} passed, ${fail} failed\n\n${lines.join('\n')}</pre>`;
  console.log(`selftest: ${pass} passed, ${fail} failed`);
}

main();
