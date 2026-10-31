# The Ashvale Files — a SQL mystery

A noir detective game that teaches SQL from `SELECT` to `CREATE TABLE`, following the
W3Schools SQL tutorial chapter by chapter. Five cases, 43 chapters, one real SQLite
database running in the browser.

Static site — no build step, no server, no backend.

## Play locally

ES modules need to be served over HTTP (opening `index.html` from the filesystem will not work):

```bash
npx --yes serve sql-mystery
```

Then open the URL it prints.

## Deploy to Netlify

**Drag and drop** — go to <https://app.netlify.com/drop> and drop the `sql-mystery` folder.
That is the whole deployment.

**From Git** — connect the repository and set:

| Setting           | Value         |
| ----------------- | ------------- |
| Base directory    | `sql-mystery` |
| Build command     | *(empty)*     |
| Publish directory | `sql-mystery` |

`netlify.toml` in this folder already sets the publish directory, security headers and the
SPA redirect.

## Curriculum

Chapter order follows the W3Schools SQL tutorial.

| Case | Title                | Chapters |
| ---- | -------------------- | -------- |
| 1 | The Midnight Ledger  | SELECT · SELECT DISTINCT · WHERE · ORDER BY · AND/OR/NOT · NULL values |
| 2 | The Poisoned Pour    | TOP/LIMIT · MIN/MAX · COUNT/AVG/SUM · LIKE · Wildcards · IN · BETWEEN · Aliases |
| 3 | The Vellichor Heist  | INNER JOIN · LEFT JOIN · RIGHT JOIN · FULL OUTER JOIN · Self Join · UNION |
| 4 | Signal in the Static | GROUP BY · HAVING · EXISTS · ANY/ALL · Subqueries · CASE · NULL functions |
| 5 | Rewriting History    | CREATE TABLE · Constraints · INSERT · UPDATE · DELETE · ALTER · INDEX · VIEW · INSERT INTO SELECT · DROP · Comments & Operators |

Each case ends with an accusation: solve the final query, then pick the culprit from a lineup.

Where SQL Server and SQLite disagree — `SELECT TOP` vs `LIMIT`, `ANY`/`ALL`, `SELECT INTO`,
stored procedures — the Field Manual teaches the standard form *and* the SQLite equivalent,
because the engine in the browser is SQLite.

## How answers are graded

The player's query and the Bureau's reference query each run against their own fresh copy of
the database, and the two result sets are compared. **Any query that produces the correct
result is accepted** — wording, aliasing and formatting are free. On top of that:

- `requires` / `forbid` patterns make sure the chapter's actual keyword gets used (you cannot
  pass the `LEFT JOIN` chapter with a subquery);
- column names are compared where the chapter is about naming (`AS` aliases, `CASE`, aggregates);
- row order is compared only when the task asks for an `ORDER BY`;
- chapters that change the database (`INSERT`, `UPDATE`, `DROP`, …) are graded by running a
  `check` query afterwards and comparing the resulting state.

## Files

```
index.html              markup and CDN script tags
netlify.toml            publish dir, headers, SPA redirect
assets/css/style.css    the whole visual theme
assets/js/data.js       schema + seed data for Ashvale Central Records
assets/js/cases.js      all 5 cases and 43 lessons (story, concept, task, solution)
assets/js/engine.js     sql.js boot, query execution, grading
assets/js/art.js        procedural SVG: mugshots, skyline, stamps, seals; canvas rain
assets/js/app.js        UI, navigation, progress, save state, self-test
```

Graphics are generated in code — there are no image assets to host. Each suspect's mugshot is
drawn deterministically from their `suspect_id`, so a face never changes between sessions.

## Self-test

Append `?selftest=1` to the URL. Every reference solution is run through the grader and the
page prints a pass/fail line per chapter, plus engine capability checks (`RIGHT JOIN`,
`FULL OUTER JOIN`, `pragma_table_info`, SQLite version). Use it after editing `cases.js`.

## Dependencies

Loaded from CDN at runtime; nothing is bundled or installed:

- [sql.js](https://sql.js.org) 1.13.0 — SQLite compiled to WebAssembly
- [CodeMirror](https://codemirror.net) 5.65.16 — SQL editor (the game degrades to a plain
  textarea if it fails to load)
- Google Fonts — Bebas Neue, Inter, JetBrains Mono

The database is created in memory on page load and never leaves the tab. Progress is stored in
`localStorage` only.
