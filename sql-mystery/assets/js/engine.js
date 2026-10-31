/* =====================================================================
   SQL engine — a real SQLite database compiled to WebAssembly,
   running entirely in the browser. Nothing leaves this machine.
   ===================================================================== */

import { SCHEMA_SQL, SEED_SQL } from './data.js';

const CDNS = [
  'https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/',
  'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/',
  'https://cdn.jsdelivr.net/npm/sql.js@1.11.0/dist/'
];

let SQL = null;       // the sql.js module
let pristine = null;  // Uint8Array snapshot of the seeded database

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('could not load ' + src));
    document.head.appendChild(s);
  });
}

/** Boot sql.js, build the Ashvale database and keep a pristine copy. */
export async function boot(onProgress = () => {}) {
  let lastErr = null;
  for (const base of CDNS) {
    try {
      onProgress('Contacting records server…');
      if (typeof window.initSqlJs !== 'function') {
        await loadScript(base + 'sql-wasm.js');
      }
      onProgress('Decrypting database image…');
      SQL = await window.initSqlJs({ locateFile: f => base + f });
      break;
    } catch (err) {
      lastErr = err;
      SQL = null;
    }
  }
  if (!SQL) throw lastErr || new Error('SQL engine unavailable');

  onProgress('Loading Ashvale Central Records…');
  const db = new SQL.Database();
  db.run(SCHEMA_SQL);
  db.run(SEED_SQL);
  pristine = db.export();
  db.close();
  onProgress('Ready.');
  return describeSchema();
}

export function isReady() { return !!pristine; }

/** A fresh database, identical for every attempt. */
export function freshDb() {
  if (!pristine) throw new Error('Database not loaded yet.');
  return new SQL.Database(pristine);
}

/** Run SQL and return [{columns, values}, ...]. Throws on a SQL error. */
export function run(db, sql) {
  return db.exec(sql);
}

/** Run a query against a throwaway copy of the database. */
export function scratchQuery(sql) {
  const db = freshDb();
  try {
    return { ok: true, results: db.exec(sql) };
  } catch (err) {
    return { ok: false, error: cleanError(err) };
  } finally {
    db.close();
  }
}

export function cleanError(err) {
  let m = String(err && err.message ? err.message : err);
  return m.replace(/^Error:\s*/, '').replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------ */
/* Schema introspection, for the Records panel                         */
/* ------------------------------------------------------------------ */

export function describeSchema() {
  const db = freshDb();
  const out = [];
  try {
    const tables = db.exec(
      `SELECT name FROM sqlite_master WHERE type='table'
       AND name NOT LIKE 'sqlite_%' ORDER BY name;`
    );
    const names = tables.length ? tables[0].values.map(r => r[0]) : [];
    for (const t of names) {
      const info = db.exec(`SELECT name, type, "notnull", pk FROM pragma_table_info('${t}');`);
      const count = db.exec(`SELECT COUNT(*) FROM "${t}";`);
      out.push({
        name: t,
        rows: count.length ? count[0].values[0][0] : 0,
        columns: info.length
          ? info[0].values.map(([name, type, nn, pk]) => ({ name, type, notnull: !!nn, pk: !!pk }))
          : []
      });
    }
  } finally {
    db.close();
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Grading                                                             */
/* ------------------------------------------------------------------ */

function normaliseValue(v) {
  if (v === null || v === undefined) return '␀NULL';
  if (v instanceof Uint8Array) return '␀BLOB:' + v.length;
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return String(v);
    return String(Math.round(v * 1e6) / 1e6);
  }
  const s = String(v).trim();
  // "25000" and "25000.0" should compare equal
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 1e6) / 1e6);
  }
  return s;
}

function rowKey(row) { return row.map(normaliseValue).join('\u001f'); }

/** Reduce a result set to a comparable shape. */
function canonical(result, { ordered, compareColumns }) {
  if (!result) return { cols: [], rows: [] };
  const cols = compareColumns
    ? result.columns.map(c => String(c).trim().toLowerCase())
    : result.columns.map(() => '');
  const rows = result.values.map(rowKey);
  if (!ordered) rows.sort();
  return { cols, rows };
}

function diffReason(got, want, lesson) {
  if (got.cols.length !== want.cols.length) {
    return `Your result has ${got.cols.length} column${got.cols.length === 1 ? '' : 's'}; ` +
           `the Bureau expected ${want.cols.length}.`;
  }
  if (lesson.compareColumns) {
    for (let i = 0; i < want.cols.length; i++) {
      if (got.cols[i] !== want.cols[i]) {
        return `Column ${i + 1} came back as "${got.cols[i]}" — it should be "${want.cols[i]}". ` +
               `Check the order of your columns and any AS aliases.`;
      }
    }
  }
  if (got.rows.length !== want.rows.length) {
    return `Your query returned ${got.rows.length} row${got.rows.length === 1 ? '' : 's'}; ` +
           `the Bureau expected ${want.rows.length}. Look again at your filter.`;
  }
  const missing = want.rows.filter(r => !got.rows.includes(r)).length;
  if (missing) {
    return `Right number of rows, wrong contents — ${missing} row${missing === 1 ? ' does' : 's do'} ` +
           `not match. Check the columns you selected and their order.`;
  }
  return `The rows are right but they are in the wrong order. This task needs a specific ORDER BY.`;
}

/**
 * Grade a submitted query.
 * Runs the player's SQL and the reference SQL against two identical
 * fresh databases, then compares — so any query producing the right
 * answer is accepted, not just a literal string match.
 */
export function grade(lesson, userSql) {
  const sql = (userSql || '').trim();
  if (!sql || /^(--[^\n]*\n?|\/\*[\s\S]*?\*\/|\s)*$/.test(sql)) {
    return { ok: false, kind: 'empty', message: 'The terminal is empty. Write a query first.' };
  }

  // Keyword requirements. Checked against the query as written, because
  // several lessons are about what goes *inside* a quoted pattern.
  for (const [re, msg] of lesson.requires || []) {
    if (!re.test(sql)) return { ok: false, kind: 'requires', message: msg };
  }
  for (const [re, msg] of lesson.forbid || []) {
    if (re.test(sql)) return { ok: false, kind: 'forbid', message: msg };
  }

  const userDb = freshDb();
  const refDb = freshDb();
  try {
    if (lesson.setup) { userDb.run(lesson.setup); refDb.run(lesson.setup); }

    let userOut;
    try {
      userOut = userDb.exec(sql);
    } catch (err) {
      return { ok: false, kind: 'sql', message: cleanError(err) };
    }

    let refOut;
    try {
      refOut = refDb.exec(lesson.solution);
    } catch (err) {
      return { ok: false, kind: 'internal', message: 'Reference query failed: ' + cleanError(err) };
    }

    // For statements that change the database, the lesson supplies a
    // `check` query; we run it on both sides and compare the aftermath.
    if (lesson.check) {
      try {
        userOut = userDb.exec(lesson.check);
      } catch (err) {
        return {
          ok: false, kind: 'sql',
          message: 'Your statement ran, but the Bureau could not verify it: ' + cleanError(err)
        };
      }
      refOut = refDb.exec(lesson.check);
    }

    const got = canonical(userOut[userOut.length - 1], lesson);
    const want = canonical(refOut[refOut.length - 1], lesson);

    const same =
      got.cols.length === want.cols.length &&
      got.cols.every((c, i) => c === want.cols[i]) &&
      got.rows.length === want.rows.length &&
      got.rows.every((r, i) => r === want.rows[i]);

    if (same) {
      return { ok: true, results: userOut, rowCount: got.rows.length };
    }
    return {
      ok: false, kind: 'mismatch',
      message: diffReason(got, want, lesson),
      results: userOut
    };
  } finally {
    userDb.close();
    refDb.close();
  }
}

/** Run a player's query for the Run button (no grading, just output). */
export function tryQuery(lesson, userSql) {
  const sql = (userSql || '').trim();
  if (!sql) return { ok: false, error: 'Nothing to run.' };
  const db = freshDb();
  try {
    if (lesson && lesson.setup) db.run(lesson.setup);
    const results = db.exec(sql);
    return { ok: true, results };
  } catch (err) {
    return { ok: false, error: cleanError(err) };
  } finally {
    db.close();
  }
}

/** Expected output for a lesson, used by the "show me" reveal. */
export function expectedOutput(lesson) {
  const db = freshDb();
  try {
    if (lesson.setup) db.run(lesson.setup);
    const direct = db.exec(lesson.solution);
    const out = lesson.check ? db.exec(lesson.check) : direct;
    return { ok: true, results: out };
  } catch (err) {
    return { ok: false, error: cleanError(err) };
  } finally {
    db.close();
  }
}
