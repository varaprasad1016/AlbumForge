/* =====================================================================
   THE ASHVALE FILES — curriculum
   Chapter order follows the W3Schools SQL tutorial, start to finish.
   Every `solution` is executed by the self-test (?selftest=1).
   ===================================================================== */

export const CASES = [

/* ===================================================================
   CASE 1 — THE MIDNIGHT LEDGER        SQL Basics
   =================================================================== */
{
  id: 'c1',
  number: 1,
  title: 'The Midnight Ledger',
  tagline: 'Basic querying',
  place: 'Ashvale Central Bank · Riverside',
  date: '14 January 2026',
  accent: '#f4b942',
  chapters: 'SELECT · DISTINCT · WHERE · ORDER BY · AND/OR/NOT · NULL',
  brief: `<p>Rain on the river, and a vault standing open at midnight.</p>
    <p>The Ashvale Central Bank reports one item missing: the <em>midnight ledger</em>, the
    handwritten book that records every after-hours transfer in the city. No cash was touched.
    Somebody wanted the names.</p>
    <p>You are new here. The Bureau hands you a terminal and the whole of Ashvale Central Records.
    Learn to ask it questions and it will tell you everything.</p>`,
  culprit: 1,
  lineup: [1, 8, 11, 14, 2],
  verdict: `<p>Dalia Finch. Bank clerk, Riverside, no alibi, risk score 87 — and the only
    person whose keycard went <em>into</em> the building at 23:40 and back out at 00:12,
    twelve minutes after the ledger left with her.</p>
    <p>She boarded the 11:05 express the next morning with twenty-five thousand in cash.
    Case one is closed. But a ledger full of names doesn't get stolen for nothing.</p>`,

  lessons: [
  {
    id: 'c1l1', chapter: 'SQL SELECT', title: 'Asking the first question',
    tables: ['suspects'],
    concept: `<p>The <code>SELECT</code> statement is how you ask a database for data.
      You name the columns you want, then name the table they live in.</p>
      <p>Use <code>SELECT *</code> when you want <em>every</em> column — useful when you are
      getting your bearings, wasteful once you know what you are after.</p>`,
    syntax: `SELECT column1, column2\nFROM table_name;`,
    example: `SELECT name, district FROM locations;`,
    note: `SQL keywords are not case sensitive — <code>select</code> and <code>SELECT</code> are
      the same. Semicolons end a statement. Get into the habit now.`,
    story: `<p>Sergeant Addo drops a folder on your desk. "Fourteen names on the Bureau's books.
      Start by looking at who we have."</p>`,
    task: `Return the <code>name</code>, <code>occupation</code> and <code>district</code> of every row in <code>suspects</code>.`,
    starter: `-- Bureau terminal · authorised query session\n`,
    solution: `SELECT name, occupation, district FROM suspects;`,
    compareColumns: true,
    requires: [[/\bfrom\s+suspects\b/i, 'Your query has to read from the suspects table.']],
    hint: `SELECT name, occupation, district FROM suspects;`,
    reveal: `Fourteen names. One of them was inside the bank last night.`
  },
  {
    id: 'c1l2', chapter: 'SQL SELECT DISTINCT', title: 'No name twice',
    tables: ['suspects'],
    concept: `<p>A column often repeats the same value over and over. <code>SELECT DISTINCT</code>
      throws the duplicates away and returns each value once.</p>
      <p>It is the fastest way to learn the <em>vocabulary</em> of a column: which districts exist,
      which statuses a case can have, which payment methods the city uses.</p>`,
    syntax: `SELECT DISTINCT column1\nFROM table_name;`,
    example: `SELECT DISTINCT category FROM evidence;`,
    note: `<code>DISTINCT</code> applies to the whole row you selected, not to one column.
      <code>SELECT DISTINCT a, b</code> returns every unique <em>combination</em> of a and b.`,
    story: `<p>"Four districts in this city," says Addo, "and each one lies differently.
      Find out which four the records actually use."</p>`,
    task: `Return each <code>district</code> from <code>suspects</code> exactly once.`,
    starter: `-- Which districts appear in the records?\n`,
    solution: `SELECT DISTINCT district FROM suspects;`,
    compareColumns: true,
    requires: [[/\bdistinct\b/i, 'This one wants DISTINCT.']],
    hint: `SELECT DISTINCT district FROM suspects;`,
    reveal: `Riverside, Old Quay, Civic Hill, Gallery Row. The bank sits in Riverside.`
  },
  {
    id: 'c1l3', chapter: 'SQL WHERE', title: 'Narrowing the net',
    tables: ['suspects'],
    concept: `<p><code>WHERE</code> filters rows. Only rows for which the condition is true come back.</p>
      <p>Text values go in single quotes. Numbers do not.</p>
      <p>Operators you can use: <code>=</code>, <code>&lt;&gt;</code> (not equal), <code>&gt;</code>,
      <code>&lt;</code>, <code>&gt;=</code>, <code>&lt;=</code>, <code>BETWEEN</code>,
      <code>LIKE</code> and <code>IN</code>.</p>`,
    syntax: `SELECT column1, column2\nFROM table_name\nWHERE condition;`,
    example: `SELECT name FROM locations WHERE security_level = 5;`,
    note: `<code>WHERE</code> always comes after <code>FROM</code> and before <code>ORDER BY</code>.`,
    story: `<p>The bank is in Riverside. People commit crimes close to home far more often than
      the pictures suggest.</p>`,
    task: `Return the <code>name</code> and <code>occupation</code> of suspects whose <code>district</code> is <code>'Riverside'</code>.`,
    starter: `-- Who lives on the bank's doorstep?\n`,
    solution: `SELECT name, occupation FROM suspects WHERE district = 'Riverside';`,
    compareColumns: true,
    requires: [[/\bwhere\b/i, 'Filter the rows with a WHERE clause.']],
    hint: `SELECT name, occupation FROM suspects WHERE district = 'Riverside';`,
    reveal: `A bank clerk, a courier and a chemist. The clerk has keys.`
  },
  {
    id: 'c1l4', chapter: 'SQL ORDER BY', title: 'Worst first',
    tables: ['suspects'],
    concept: `<p><code>ORDER BY</code> sorts the result. Ascending (<code>ASC</code>) is the default;
      <code>DESC</code> reverses it.</p>
      <p>You can sort by several columns: the second column breaks ties in the first.</p>`,
    syntax: `SELECT column1\nFROM table_name\nORDER BY column1 ASC|DESC;`,
    example: `SELECT name, opened_year FROM locations ORDER BY opened_year DESC;`,
    note: `Without <code>ORDER BY</code>, a database is free to return rows in any order it likes.
      Never assume a sort you did not ask for.`,
    story: `<p>Every file carries a risk score out of 100. Addo wants the worst of them at the top.</p>`,
    task: `Return <code>name</code> and <code>risk_score</code> from <code>suspects</code>, highest risk score first.`,
    starter: `-- Rank them.\n`,
    solution: `SELECT name, risk_score FROM suspects ORDER BY risk_score DESC;`,
    compareColumns: true,
    requires: [[/\border\s+by\b/i, 'You need an ORDER BY clause.'], [/\bdesc\b/i, 'Highest first means DESC.']],
    hint: `SELECT name, risk_score FROM suspects ORDER BY risk_score DESC;`,
    reveal: `Dalia Finch, 87. Theo Vance, 81. Clara Dupont, 77. Remember those three.`
  },
  {
    id: 'c1l5', chapter: 'SQL AND, OR, NOT', title: 'Three conditions, one suspect list',
    tables: ['suspects'],
    concept: `<p>Combine conditions in a <code>WHERE</code> clause:</p>
      <ul>
        <li><code>AND</code> — both sides must be true</li>
        <li><code>OR</code> — at least one side must be true</li>
        <li><code>NOT</code> — flips a condition</li>
      </ul>
      <p><code>AND</code> binds tighter than <code>OR</code>, exactly like × binds tighter than +.
      Use brackets when you mix them, or you will get answers you did not ask for.</p>`,
    syntax: `SELECT column1\nFROM table_name\nWHERE condition1 AND (condition2 OR condition3);`,
    example: `SELECT name FROM locations WHERE district = 'Old Quay' AND security_level < 3;`,
    note: `<code>WHERE a = 1 OR a = 2 AND b = 3</code> reads as <code>a = 1 OR (a = 2 AND b = 3)</code>.
      That is almost never what you meant.`,
    story: `<p>"The ledger walked out on foot," says Addo. "So: Riverside or Old Quay. Nobody with an
      alibi. And leave the couriers out of it — we cleared the lot of them this morning."</p>`,
    task: `Return <code>name</code>, <code>district</code> and <code>risk_score</code> for suspects
      whose district is <code>'Riverside'</code> <strong>or</strong> <code>'Old Quay'</code>,
      <strong>and</strong> who have no alibi (<code>has_alibi = 0</code>),
      <strong>and</strong> whose occupation is <code>NOT</code> <code>'Courier'</code>.`,
    starter: `-- Mind your brackets.\n`,
    solution: `SELECT name, district, risk_score FROM suspects
               WHERE (district = 'Riverside' OR district = 'Old Quay')
                 AND has_alibi = 0
                 AND NOT occupation = 'Courier';`,
    compareColumns: true,
    requires: [
      [/\bor\b/i, 'Two districts means OR.'],
      [/\band\b/i, 'Chain the conditions with AND.'],
      [/\bnot\b/i, 'Exclude the couriers with NOT.']
    ],
    hint: `Wrap the OR in brackets: WHERE (district = 'Riverside' OR district = 'Old Quay') AND has_alibi = 0 AND NOT occupation = 'Courier';`,
    reveal: `Five names left standing. The net is closing.`
  },
  {
    id: 'c1l6', chapter: 'SQL NULL Values', title: 'The space where an answer should be',
    tables: ['suspects'],
    concept: `<p><code>NULL</code> is not zero and not an empty string. It means <em>unknown</em>.</p>
      <p>Because it is unknown, it fails every comparison — even <code>NULL = NULL</code> is not true.
      So SQL gives you two special tests:</p>
      <ul><li><code>IS NULL</code></li><li><code>IS NOT NULL</code></li></ul>`,
    syntax: `SELECT column1\nFROM table_name\nWHERE column1 IS NULL;`,
    example: `SELECT title FROM cases WHERE closed_on IS NULL;`,
    note: `<code>WHERE notes = NULL</code> returns nothing at all — not an error, just silence.
      That silence has hidden more evidence than any shredder.`,
    story: `<p>Most files have an empty notes field. The ones that don't were written by a detective
      who saw something worth writing down.</p>`,
    task: `Return <code>name</code> and <code>notes</code> for every suspect whose <code>notes</code> field is not empty.`,
    starter: `-- Find the files somebody bothered to annotate.\n`,
    solution: `SELECT name, notes FROM suspects WHERE notes IS NOT NULL;`,
    compareColumns: true,
    requires: [[/\bis\s+not\s+null\b/i, 'Use IS NOT NULL — the = operator cannot see NULLs.']],
    hint: `SELECT name, notes FROM suspects WHERE notes IS NOT NULL;`,
    reveal: `"Boarded the 11:05 express the morning after." Somebody already suspected her.`
  },
  {
    id: 'c1l7', chapter: 'Case review', title: 'Name the thief',
    tables: ['suspects'],
    isAccusation: true,
    concept: `<p>Everything in this case file is now in your hands: <code>SELECT</code> to choose columns,
      <code>WHERE</code> to filter, <code>AND</code> to stack conditions,
      <code>ORDER BY</code> to rank.</p>
      <p>Put them together and the database will give you one name.</p>`,
    syntax: `SELECT column1\nFROM table_name\nWHERE condition1 AND condition2\nORDER BY column2 DESC;`,
    example: `SELECT title FROM cases WHERE status = 'open' ORDER BY opened_on;`,
    note: `A single-row result is the sweetest thing a detective ever sees.`,
    story: `<p>The profile Addo has built: lives in Riverside, no alibi for the night, risk score
      above 80.</p>`,
    task: `Return the <code>name</code>, <code>occupation</code> and <code>risk_score</code> of
      suspects in <code>'Riverside'</code> with <code>has_alibi = 0</code> and a
      <code>risk_score</code> above <code>80</code>. There should be exactly one.`,
    starter: `-- One name. Make it the right one.\n`,
    solution: `SELECT name, occupation, risk_score FROM suspects
               WHERE district = 'Riverside' AND has_alibi = 0 AND risk_score > 80;`,
    compareColumns: true,
    requires: [[/\bwhere\b/i, 'You still need a WHERE clause.'], [/\band\b/i, 'Three conditions, joined with AND.']],
    hint: `SELECT name, occupation, risk_score FROM suspects WHERE district = 'Riverside' AND has_alibi = 0 AND risk_score > 80;`,
    reveal: `One row. One name. Make the arrest.`
  }]
},

/* ===================================================================
   CASE 2 — THE POISONED POUR          Filtering & aggregate functions
   =================================================================== */
{
  id: 'c2',
  number: 2,
  title: 'The Poisoned Pour',
  tagline: 'Limits, functions, patterns',
  place: 'The Brass Lantern · Old Quay',
  date: '2 February 2026',
  accent: '#7ee0c0',
  chapters: 'LIMIT · MIN/MAX · COUNT/AVG/SUM · LIKE · Wildcards · IN · BETWEEN · Aliases',
  brief: `<p>A bartender at The Brass Lantern collapses at 20:51 with a glass still in his hand.
    Aconite — monkshood — in a drink he poured himself.</p>
    <p>Twenty-two people were in that bar. One of them never ordered anything.</p>
    <p>This case runs on money and chemistry, so you will need the functions that summarise a
    column instead of listing it.</p>`,
  culprit: 11,
  lineup: [11, 2, 14, 7, 13],
  verdict: `<p>Clara Dupont. Chemist, Riverside, no alibi — and four hundred and fifty pounds of
    Bellweather Chemicals on her card six days before the pour.</p>
    <p>She sat at the end of the bar all evening and drank nothing. Ola Nilsen heard her ask
    which glass belonged to the barman.</p>
    <p>What she will not explain is the 320-second call she made to a radio engineer in Old Quay
    the afternoon it happened.</p>`,

  lessons: [
  {
    id: 'c2l1', chapter: 'SQL TOP / LIMIT', title: 'Only the top of the pile',
    tables: ['suspects'],
    concept: `<p>Sometimes you want the first handful of rows, not all of them.</p>
      <p>The syntax differs by database — this is one of the few places it really does:</p>
      <ul>
        <li>SQLite, MySQL, PostgreSQL: <code>LIMIT 3</code> at the end</li>
        <li>SQL Server, MS Access: <code>SELECT TOP 3 ...</code> at the start</li>
        <li>Oracle: <code>FETCH FIRST 3 ROWS ONLY</code></li>
      </ul>
      <p>This terminal runs SQLite, so you want <code>LIMIT</code>.</p>`,
    syntax: `SELECT column1\nFROM table_name\nORDER BY column1 DESC\nLIMIT number;`,
    example: `SELECT name FROM locations ORDER BY opened_year LIMIT 5;`,
    note: `<code>LIMIT</code> without <code>ORDER BY</code> gives you three arbitrary rows.
      Always sort before you limit.`,
    story: `<p>"I want the three worst," says Addo. "Not fourteen. Three."</p>`,
    task: `Return <code>name</code> and <code>risk_score</code> for the three suspects with the highest risk score.`,
    starter: `-- Top three only.\n`,
    solution: `SELECT name, risk_score FROM suspects ORDER BY risk_score DESC LIMIT 3;`,
    compareColumns: true,
    requires: [[/\blimit\b/i, 'Cap the result with LIMIT.'], [/\border\s+by\b/i, 'Sort before you limit.']],
    hint: `SELECT name, risk_score FROM suspects ORDER BY risk_score DESC LIMIT 3;`,
    reveal: `Finch is in custody. That leaves Theo Vance and Clara Dupont.`
  },
  {
    id: 'c2l2', chapter: 'SQL MIN and MAX', title: 'The smallest and the largest',
    tables: ['transactions'],
    concept: `<p><code>MIN()</code> and <code>MAX()</code> are <em>aggregate functions</em>: they read a
      whole column and return a single value.</p>
      <p>Give the result a readable name with <code>AS</code>, or your column will be called
      something like <code>MAX(amount)</code>.</p>`,
    syntax: `SELECT MIN(column1) AS alias_name\nFROM table_name;`,
    example: `SELECT MAX(credibility) AS best_witness FROM witnesses;`,
    note: `<code>MIN</code> and <code>MAX</code> work on text and dates too — alphabetically and
      chronologically.`,
    story: `<p>Before you look for one payment, learn the shape of the ledger. What is the
      smallest thing anyone in this city buys, and the largest?</p>`,
    task: `From <code>transactions</code>, return the lowest <code>amount</code> as <code>smallest</code>
      and the highest <code>amount</code> as <code>largest</code>, in that order, in one row.`,
    starter: `-- Two numbers, one row.\n`,
    solution: `SELECT MIN(amount) AS smallest, MAX(amount) AS largest FROM transactions;`,
    compareColumns: true,
    requires: [[/\bmin\s*\(/i, 'You need MIN().'], [/\bmax\s*\(/i, 'You need MAX().']],
    hint: `SELECT MIN(amount) AS smallest, MAX(amount) AS largest FROM transactions;`,
    reveal: `A five-pound newspaper, and a forty-eight-thousand-pound "unlisted transfer".`
  },
  {
    id: 'c2l3', chapter: 'SQL COUNT, AVG, SUM', title: 'Counting, averaging, totalling',
    tables: ['transactions'],
    concept: `<p>Three more aggregates, and the three you will reach for most:</p>
      <ul>
        <li><code>COUNT()</code> — how many rows. <code>COUNT(*)</code> counts rows including NULLs;
            <code>COUNT(column)</code> skips rows where that column is NULL.</li>
        <li><code>AVG()</code> — the mean of a numeric column</li>
        <li><code>SUM()</code> — the total of a numeric column</li>
      </ul>
      <p>Aggregates respect <code>WHERE</code>: filter first, then summarise.</p>`,
    syntax: `SELECT COUNT(*) AS n, AVG(col) AS mean, SUM(col) AS total\nFROM table_name\nWHERE condition;`,
    example: `SELECT COUNT(*) AS open_cases FROM cases WHERE status = 'open';`,
    note: `<code>COUNT(alias)</code> on a column full of NULLs returns 0, not NULL. Handy for spotting
      how much of a column is actually filled in.`,
    story: `<p>Clara Dupont, suspect 11. Pull her spending apart.</p>`,
    task: `For <code>suspect_id = 11</code> only, return <code>COUNT(*)</code> as <code>txn_count</code>,
      <code>AVG(amount)</code> as <code>avg_amount</code> and <code>SUM(amount)</code> as
      <code>total_amount</code>, in that order.`,
    starter: `-- Everything suspect 11 ever spent.\n`,
    solution: `SELECT COUNT(*) AS txn_count, AVG(amount) AS avg_amount, SUM(amount) AS total_amount
               FROM transactions WHERE suspect_id = 11;`,
    compareColumns: true,
    requires: [
      [/\bcount\s*\(/i, 'You need COUNT().'],
      [/\bavg\s*\(/i, 'You need AVG().'],
      [/\bsum\s*\(/i, 'You need SUM().'],
      [/\bwhere\b/i, 'Restrict it to suspect 11 with WHERE.']
    ],
    hint: `SELECT COUNT(*) AS txn_count, AVG(amount) AS avg_amount, SUM(amount) AS total_amount FROM transactions WHERE suspect_id = 11;`,
    reveal: `Four purchases. Seven hundred and fifty pounds. Two of them from a chemical supplier.`
  },
  {
    id: 'c2l4', chapter: 'SQL LIKE', title: 'Matching a fragment',
    tables: ['transactions'],
    concept: `<p><code>LIKE</code> compares text against a <em>pattern</em> instead of an exact value.</p>
      <ul>
        <li><code>'Bell%'</code> — starts with Bell</li>
        <li><code>'%Chemicals'</code> — ends with Chemicals</li>
        <li><code>'%quay%'</code> — contains quay anywhere</li>
      </ul>
      <p>In SQLite, <code>LIKE</code> ignores case for plain ASCII text.</p>`,
    syntax: `SELECT column1\nFROM table_name\nWHERE column1 LIKE 'pattern';`,
    example: `SELECT statement FROM witnesses WHERE statement LIKE '%alibi%';`,
    note: `<code>NOT LIKE</code> inverts the match. And <code>LIKE '%'</code> matches everything
      except NULL.`,
    story: `<p>Aconite is not sold over a counter. Somebody bought it from a supplier, and suppliers
      put their own names on receipts.</p>`,
    task: `From <code>transactions</code>, return <code>txn_id</code>, <code>suspect_id</code>,
      <code>merchant</code> and <code>amount</code> where the merchant ends in
      <code>'Chemicals'</code> <strong>or</strong> ends in <code>'Pharmacy'</code>.`,
    starter: `-- Who buys from chemists?\n`,
    solution: `SELECT txn_id, suspect_id, merchant, amount FROM transactions
               WHERE merchant LIKE '%Chemicals' OR merchant LIKE '%Pharmacy';`,
    compareColumns: true,
    requires: [[/\blike\b/i, 'This is a job for LIKE.'], [/%/, 'You need the % wildcard.']],
    hint: `WHERE merchant LIKE '%Chemicals' OR merchant LIKE '%Pharmacy'`,
    reveal: `Three payments. All three made by suspect 11.`
  },
  {
    id: 'c2l5', chapter: 'SQL Wildcards', title: 'The underscore',
    tables: ['vehicles'],
    concept: `<p><code>%</code> stands for any number of characters, including none.
      <code>_</code> stands for <em>exactly one</em> character.</p>
      <p>So <code>'h_t'</code> matches hat, hit and hot, but never heat.</p>
      <p>Together they let you describe a format — a number plate, a reference code, a filename —
      rather than a value.</p>`,
    syntax: `SELECT column1\nFROM table_name\nWHERE column1 LIKE 'A__-%';`,
    example: `SELECT plate FROM vehicles WHERE plate LIKE '___-440';`,
    note: `Some databases add <code>[abc]</code> and <code>[a-z]</code> character ranges.
      Those are not standard — <code>%</code> and <code>_</code> are.`,
    story: `<p>A witness saw a car pull away from the Lantern. All they kept was the prefix:
      an RVS plate, Riverside registration, three digits after the dash.</p>`,
    task: `From <code>vehicles</code>, return <code>plate</code>, <code>make</code> and
      <code>color</code> where the plate starts with <code>RVS-</code> followed by exactly three
      characters. Use the <code>_</code> wildcard, not <code>%</code>.`,
    starter: `-- RVS, dash, three characters.\n`,
    solution: `SELECT plate, make, color FROM vehicles WHERE plate LIKE 'RVS-___';`,
    compareColumns: true,
    requires: [[/like\s*'[^']*_/i, 'Use the underscore wildcard inside the LIKE pattern.']],
    forbid: [[/like\s*'[^']*%/i, 'Use _ for a single character here, not %.']],
    hint: `SELECT plate, make, color FROM vehicles WHERE plate LIKE 'RVS-___';`,
    reveal: `A grey Volvo — Finch's, already impounded — and a red Fiat registered to Clara Dupont.`
  },
  {
    id: 'c2l6', chapter: 'SQL IN', title: 'One of these',
    tables: ['suspects'],
    concept: `<p><code>IN</code> is shorthand for a chain of <code>OR</code>s against the same column.</p>
      <p>These two are identical:</p>
      <p><code>WHERE district = 'Old Quay' OR district = 'Riverside'</code><br>
         <code>WHERE district IN ('Old Quay', 'Riverside')</code></p>
      <p>The list can also be a subquery — you will do that in Case 4.</p>`,
    syntax: `SELECT column1\nFROM table_name\nWHERE column1 IN (value1, value2, value3);`,
    example: `SELECT title FROM cases WHERE status IN ('open', 'cold');`,
    note: `<code>NOT IN</code> works as you would expect — but beware: if the list contains a NULL,
      <code>NOT IN</code> returns no rows at all. That is NULL logic biting again.`,
    story: `<p>The three professions that could get hold of a plant alkaloid and know what to do
      with it, plus the one that could steal it.</p>`,
    task: `Return <code>name</code>, <code>occupation</code> and <code>district</code> for suspects whose
      occupation is <code>'Chemist'</code>, <code>'Bartender'</code> or <code>'Pickpocket'</code>. Use <code>IN</code>.`,
    starter: `-- Three occupations, one operator.\n`,
    solution: `SELECT name, occupation, district FROM suspects
               WHERE occupation IN ('Chemist', 'Bartender', 'Pickpocket');`,
    compareColumns: true,
    requires: [[/\bin\s*\(/i, 'Use the IN operator.']],
    hint: `WHERE occupation IN ('Chemist', 'Bartender', 'Pickpocket')`,
    reveal: `The chemist has no alibi. The bartender is the victim.`
  },
  {
    id: 'c2l7', chapter: 'SQL BETWEEN', title: 'Inside a range',
    tables: ['transactions'],
    concept: `<p><code>BETWEEN</code> selects values inside a range, and the range is
      <strong>inclusive</strong> at both ends.</p>
      <p>It works on numbers, text and dates:</p>
      <p><code>WHERE found_on BETWEEN '2026-01-01' AND '2026-01-31'</code></p>`,
    syntax: `SELECT column1\nFROM table_name\nWHERE column1 BETWEEN value1 AND value2;`,
    example: `SELECT name FROM suspects WHERE age BETWEEN 30 AND 40;`,
    note: `<code>BETWEEN 100 AND 500</code> is exactly <code>&gt;= 100 AND &lt;= 500</code>.
      Writing the range backwards returns nothing — low value first, always.`,
    story: `<p>Small change tells you nothing. Fortunes get noticed. It is the middle band —
      a few hundred pounds — where people buy things they would rather not discuss.</p>`,
    task: `From <code>transactions</code>, return <code>txn_id</code>, <code>suspect_id</code>,
      <code>amount</code> and <code>merchant</code> where <code>amount</code> is between
      <code>100</code> and <code>500</code> inclusive. Use <code>BETWEEN</code>.`,
    starter: `-- The awkward middle band.\n`,
    solution: `SELECT txn_id, suspect_id, amount, merchant FROM transactions
               WHERE amount BETWEEN 100 AND 500;`,
    compareColumns: true,
    requires: [[/\bbetween\b/i, 'Use BETWEEN for the range.']],
    hint: `WHERE amount BETWEEN 100 AND 500`,
    reveal: `Ten payments. One of them bought enough aconite to kill a horse.`
  },
  {
    id: 'c2l8', chapter: 'SQL Aliases', title: 'Renaming things',
    tables: ['suspects'],
    concept: `<p><code>AS</code> gives a column or a table a temporary name, for this query only.</p>
      <ul>
        <li><strong>Column alias</strong> — makes output readable:
            <code>SELECT risk_score AS threat</code></li>
        <li><strong>Table alias</strong> — saves typing, and becomes essential once you join:
            <code>FROM suspects AS s</code></li>
      </ul>
      <p>If the alias contains a space, wrap it in double quotes: <code>AS "threat level"</code>.</p>`,
    syntax: `SELECT column1 AS alias_name\nFROM table_name AS t;`,
    example: `SELECT title AS case_title, opened_on AS opened FROM cases AS c;`,
    note: `The <code>AS</code> keyword is optional in most databases — <code>risk_score threat</code>
      works. Write <code>AS</code> anyway; the next person to read your query will thank you.`,
    story: `<p>You are going to hand this to a prosecutor. Prosecutors do not read column names like
      <code>risk_score</code>.</p>`,
    task: `From <code>suspects</code>, for <code>district = 'Riverside'</code>, return
      <code>name</code> as <code>suspect</code>, <code>occupation</code> as <code>job</code> and
      <code>risk_score</code> as <code>threat</code>, in that order.`,
    starter: `-- Make it readable.\n`,
    solution: `SELECT name AS suspect, occupation AS job, risk_score AS threat
               FROM suspects WHERE district = 'Riverside';`,
    compareColumns: true,
    requires: [[/\bas\b/i, 'Rename the columns with AS.']],
    hint: `SELECT name AS suspect, occupation AS job, risk_score AS threat FROM suspects WHERE district = 'Riverside';`,
    reveal: `Clean enough for a courtroom.`
  },
  {
    id: 'c2l9', chapter: 'Case review', title: 'Name the poisoner',
    tables: ['suspects'],
    isAccusation: true,
    concept: `<p>You have the chemistry, the receipts and the pattern-matching. One query to finish it.</p>`,
    syntax: `SELECT column1 AS alias\nFROM table_name\nWHERE condition1 AND condition2;`,
    example: `SELECT name FROM suspects WHERE occupation = 'Mechanic' AND has_alibi = 1;`,
    note: `Note how the whole case reduced to two conditions once you knew what to ask.`,
    story: `<p>Someone with the training to prepare aconite, and nobody to vouch for where they were.</p>`,
    task: `Return <code>name</code>, <code>occupation</code> and <code>risk_score</code> for suspects
      whose occupation is <code>'Chemist'</code> and who have no alibi.`,
    starter: `-- Close it.\n`,
    solution: `SELECT name, occupation, risk_score FROM suspects
               WHERE occupation = 'Chemist' AND has_alibi = 0;`,
    compareColumns: true,
    requires: [[/\band\b/i, 'Two conditions, joined with AND.']],
    hint: `SELECT name, occupation, risk_score FROM suspects WHERE occupation = 'Chemist' AND has_alibi = 0;`,
    reveal: `One chemist. No alibi. Bring her in.`
  }]
},

/* ===================================================================
   CASE 3 — THE VELLICHOR HEIST        Joins and set operations
   =================================================================== */
{
  id: 'c3',
  number: 3,
  title: 'The Vellichor Heist',
  tagline: 'Joining the tables',
  place: 'Vellichor Gallery · Gallery Row',
  date: '9 March 2026',
  accent: '#c38bf5',
  chapters: 'INNER JOIN · LEFT JOIN · RIGHT JOIN · FULL JOIN · Self Join · UNION',
  brief: `<p>At 02:40 a service door at the Vellichor Gallery was propped open with a fire
    extinguisher. By 03:15 a canvas valued at two million had been cut from its frame.</p>
    <p>The alarm never sounded. Somebody inside knew the roster.</p>
    <p>Until now, every answer sat in one table. From here on, the truth is split across several —
    and that means <strong>joins</strong>.</p>`,
  culprit: 6,
  lineup: [6, 5, 4, 13, 8],
  verdict: `<p>Theo Vance. Night guard, Gallery Row, no alibi — and a keycard that swiped
    <em>out</em> at 02:38 and back <em>in</em> at 02:41. Three minutes at the service door.
    Long enough to prop it.</p>
    <p>His supervisor on the roster is Emil Vance. His brother. The self-join put the two names
    on the same row and the family resemblance stopped being a coincidence.</p>
    <p>Forty-eight thousand pounds landed in Theo's account the next morning from an
    "Unlisted Transfer". That is a wire. Wires have senders.</p>`,

  lessons: [
  {
    id: 'c3l1', chapter: 'SQL INNER JOIN', title: 'Stitching two tables together',
    tables: ['evidence', 'suspects'],
    concept: `<p>A join combines rows from two tables using a column they have in common.</p>
      <p><code>evidence.suspect_id</code> holds the same numbers as <code>suspects.suspect_id</code>.
      That shared column is the hinge.</p>
      <p><code>INNER JOIN</code> keeps only rows that match on <strong>both</strong> sides.
      An evidence item with no suspect disappears; a suspect with no evidence disappears too.</p>`,
    syntax: `SELECT a.col, b.col\nFROM table_a AS a\nINNER JOIN table_b AS b\n  ON a.key = b.key;`,
    example: `SELECT e.item, l.name\nFROM evidence AS e\nINNER JOIN locations AS l ON l.location_id = e.location_id;`,
    note: `<code>JOIN</code> on its own means <code>INNER JOIN</code>. Once two tables are in play,
      prefix every column with its table alias — otherwise an ambiguous name is an error.`,
    story: `<p>The evidence locker lists suspect numbers. Numbers do not go in a report.</p>`,
    task: `Return the <code>item</code> from <code>evidence</code> and the <code>name</code> from
      <code>suspects</code> for case <code>3</code>, matching
      <code>evidence.suspect_id</code> to <code>suspects.suspect_id</code> with an
      <code>INNER JOIN</code>.`,
    starter: `-- Two tables, one hinge.\n`,
    solution: `SELECT e.item, s.name
               FROM evidence AS e
               INNER JOIN suspects AS s ON s.suspect_id = e.suspect_id
               WHERE e.case_id = 3;`,
    compareColumns: true,
    requires: [[/\bjoin\b/i, 'You need a JOIN.'], [/\bon\b/i, 'A join needs an ON condition.']],
    hint: `FROM evidence AS e INNER JOIN suspects AS s ON s.suspect_id = e.suspect_id WHERE e.case_id = 3`,
    reveal: `Four items with an owner. The cut canvas edge has none.`
  },
  {
    id: 'c3l2', chapter: 'SQL LEFT JOIN', title: 'Keeping the orphans',
    tables: ['evidence', 'suspects'],
    concept: `<p><code>LEFT JOIN</code> keeps <strong>every</strong> row from the left table, matched or not.</p>
      <p>Where there is no match on the right, the right-hand columns come back as
      <code>NULL</code>. That is not a failure — it is the finding.</p>
      <p>"Which evidence has nobody attached to it?" is a <code>LEFT JOIN</code> question.</p>`,
    syntax: `SELECT a.col, b.col\nFROM table_a AS a\nLEFT JOIN table_b AS b\n  ON a.key = b.key;`,
    example: `SELECT s.name, v.plate\nFROM suspects AS s\nLEFT JOIN vehicles AS v ON v.suspect_id = s.suspect_id;`,
    note: `<code>LEFT JOIN</code> is also written <code>LEFT OUTER JOIN</code>. Same thing.
      Add <code>WHERE b.key IS NULL</code> to see <em>only</em> the unmatched rows.`,
    story: `<p>Run the same question again, but do not let the unclaimed evidence vanish this time.
      The gap is the point.</p>`,
    task: `Same two columns — <code>e.item</code> and <code>s.name</code> — for case <code>3</code>,
      but keep every piece of evidence even when no suspect is attached. Use a <code>LEFT JOIN</code>.`,
    starter: `-- Nothing falls off the edge.\n`,
    solution: `SELECT e.item, s.name
               FROM evidence AS e
               LEFT JOIN suspects AS s ON s.suspect_id = e.suspect_id
               WHERE e.case_id = 3;`,
    compareColumns: true,
    requires: [[/\bleft\s+(outer\s+)?join\b/i, 'Use a LEFT JOIN.']],
    hint: `FROM evidence AS e LEFT JOIN suspects AS s ON s.suspect_id = e.suspect_id WHERE e.case_id = 3`,
    reveal: `Five rows now. The cut canvas edge belongs to nobody — yet.`
  },
  {
    id: 'c3l3', chapter: 'SQL RIGHT JOIN', title: 'The other direction',
    tables: ['suspects', 'vehicles'],
    concept: `<p><code>RIGHT JOIN</code> is the mirror image: keep every row from the
      <strong>right</strong> table, matched or not.</p>
      <p><code>A RIGHT JOIN B</code> returns exactly the same rows as <code>B LEFT JOIN A</code>.
      Most people flip the tables and use <code>LEFT JOIN</code> everywhere, because keeping one
      direction in your head is easier than two.</p>
      <p>It is worth knowing because you will read other people's queries.</p>`,
    syntax: `SELECT a.col, b.col\nFROM table_a AS a\nRIGHT JOIN table_b AS b\n  ON a.key = b.key;`,
    example: `SELECT e.item, c.title\nFROM evidence AS e\nRIGHT JOIN cases AS c ON c.case_id = e.case_id;`,
    note: `MySQL, SQL Server, PostgreSQL and SQLite 3.39+ all support <code>RIGHT JOIN</code>.
      Older SQLite builds do not — which is exactly why the flip is worth remembering.`,
    story: `<p>Vehicle records first, people second. Every registered suspect must appear, whether or
      not they own a car.</p>`,
    task: `Return <code>s.name</code> and <code>v.plate</code> from <code>vehicles AS v</code>
      <code>RIGHT JOIN</code>ed to <code>suspects AS s</code> on <code>suspect_id</code>, so that
      all fourteen suspects come back.`,
    starter: `-- Right join: the right-hand table survives.\n`,
    solution: `SELECT s.name, v.plate
               FROM vehicles AS v
               RIGHT JOIN suspects AS s ON s.suspect_id = v.suspect_id;`,
    compareColumns: true,
    requires: [[/\bright\s+(outer\s+)?join\b/i, 'This lesson wants a RIGHT JOIN.']],
    hint: `FROM vehicles AS v RIGHT JOIN suspects AS s ON s.suspect_id = v.suspect_id`,
    reveal: `Fourteen suspects. Six of them have never registered a car in their lives.`
  },
  {
    id: 'c3l4', chapter: 'SQL FULL OUTER JOIN', title: 'Everything from both sides',
    tables: ['suspects', 'vehicles'],
    concept: `<p><code>FULL OUTER JOIN</code> keeps every row from <strong>both</strong> tables.
      Unmatched rows on either side come back padded with <code>NULL</code>s.</p>
      <p>It answers "show me everything, and make the holes visible" — the join you want when you
      are auditing two lists that are supposed to agree.</p>`,
    syntax: `SELECT a.col, b.col\nFROM table_a AS a\nFULL OUTER JOIN table_b AS b\n  ON a.key = b.key;`,
    example: `SELECT c.name, s.shipment_id\nFROM couriers AS c\nFULL OUTER JOIN shipments AS s ON s.courier_id = c.courier_id;`,
    note: `MySQL has no <code>FULL OUTER JOIN</code>. There you emulate it with a
      <code>LEFT JOIN</code> <code>UNION</code> a <code>RIGHT JOIN</code>.`,
    story: `<p>There is a black car in the impound with plate XXX-000 and no registered owner.
      A full outer join is the only way to see it and the carless suspects in the same result.</p>`,
    task: `Return <code>s.name</code> and <code>v.plate</code> using a <code>FULL OUTER JOIN</code>
      between <code>suspects AS s</code> and <code>vehicles AS v</code> on <code>suspect_id</code>.`,
    starter: `-- Both sides. Every row.\n`,
    solution: `SELECT s.name, v.plate
               FROM suspects AS s
               FULL OUTER JOIN vehicles AS v ON v.suspect_id = s.suspect_id;`,
    compareColumns: true,
    requires: [[/\bfull\s+(outer\s+)?join\b/i, 'Use a FULL OUTER JOIN.']],
    hint: `FROM suspects AS s FULL OUTER JOIN vehicles AS v ON v.suspect_id = s.suspect_id`,
    reveal: `Fifteen rows. The fifteenth is a black car nobody will admit to owning.`
  },
  {
    id: 'c3l5', chapter: 'SQL Self Join', title: 'A table against itself',
    tables: ['employees'],
    concept: `<p>A self join is an ordinary join where both sides are the <em>same table</em>.
      The aliases do all the work — they let SQL treat one table as two.</p>
      <p>It is how you walk a hierarchy: <code>employees.manager_id</code> points at another row in
      <code>employees</code>. One join and the staff member and their manager sit on the same line.</p>`,
    syntax: `SELECT a.col AS x, b.col AS y\nFROM table_name AS a\nJOIN table_name AS b\n  ON a.parent_id = b.id;`,
    example: `SELECT a.name, b.name\nFROM suspects AS a JOIN suspects AS b ON a.district = b.district;`,
    note: `Without distinct aliases a self join is impossible — SQL would not know which
      <code>name</code> you meant. This is the moment table aliases stop being a convenience.`,
    story: `<p>Yusuf Demir says a guard propped the door. Guards have supervisors, and supervisors
      write the rosters. Put the two together.</p>`,
    task: `Join <code>employees</code> to itself to return each employee's <code>name</code> as
      <code>staff</code> and their manager's <code>name</code> as <code>manager</code>.
      Employees without a manager should not appear.`,
    starter: `-- One table. Two aliases.\n`,
    solution: `SELECT e.name AS staff, m.name AS manager
               FROM employees AS e
               INNER JOIN employees AS m ON m.employee_id = e.manager_id;`,
    compareColumns: true,
    requires: [[/employees[\s\S]*employees/i, 'Both sides of the join are the employees table.'],
               [/\bjoin\b/i, 'You still need a JOIN.']],
    hint: `FROM employees AS e INNER JOIN employees AS m ON m.employee_id = e.manager_id`,
    reveal: `Theo Vance reports to Emil Vance. Same surname. Same gallery. Same night.`
  },
  {
    id: 'c3l6', chapter: 'SQL UNION', title: 'Stacking two result sets',
    tables: ['suspects', 'couriers'],
    concept: `<p>A join widens a result — more columns. <code>UNION</code> lengthens it — more rows.</p>
      <p>It stacks the output of two <code>SELECT</code>s, and it has rules:</p>
      <ul>
        <li>both queries need the <strong>same number of columns</strong></li>
        <li>matching columns need <strong>compatible types</strong>, in the same order</li>
        <li><code>UNION</code> removes duplicates; <code>UNION ALL</code> keeps them</li>
      </ul>
      <p>The first query's column names are the ones you get.</p>`,
    syntax: `SELECT col1, col2 FROM table_a\nUNION\nSELECT col1, col2 FROM table_b;`,
    example: `SELECT name FROM suspects\nUNION ALL\nSELECT name FROM couriers;`,
    note: `<code>UNION ALL</code> is faster — it does not have to sort and de-duplicate.
      If you know there are no duplicates, prefer it.`,
    story: `<p>Whoever moved a two-metre canvas across Ashvale had wheels. Build one list of every
      person <em>and</em> every delivery firm operating out of Old Quay.</p>`,
    task: `Return <code>name</code> as <code>party</code> and <code>district</code> for suspects in
      <code>'Old Quay'</code>, stacked with the same two columns for couriers in
      <code>'Old Quay'</code>. Use <code>UNION</code>.`,
    starter: `-- Two queries. One list.\n`,
    solution: `SELECT name AS party, district FROM suspects WHERE district = 'Old Quay'
               UNION
               SELECT name, district FROM couriers WHERE district = 'Old Quay';`,
    compareColumns: true,
    requires: [[/\bunion\b/i, 'Stack them with UNION.']],
    hint: `SELECT name AS party, district FROM suspects WHERE district = 'Old Quay' UNION SELECT name, district FROM couriers WHERE district = 'Old Quay';`,
    reveal: `Six parties in Old Quay. One of them is a courier firm with its licence revoked.`
  },
  {
    id: 'c3l7', chapter: 'Case review', title: 'Name the inside man',
    tables: ['keycard_logs', 'suspects'],
    isAccusation: true,
    concept: `<p>Join the door logs to the people. Filter to the gallery, filter to the night,
      sort by time, and read the story the swipes tell.</p>`,
    syntax: `SELECT a.col, b.col\nFROM table_a AS a\nJOIN table_b AS b ON a.key = b.key\nWHERE condition\nORDER BY a.col;`,
    example: `SELECT k.swipe_time FROM keycard_logs AS k WHERE k.swipe_time LIKE '2026-01-14%';`,
    note: `<code>LIKE '2026-03-09%'</code> is a neat way to pull one day out of a text timestamp.`,
    story: `<p>Location 3 is the Vellichor Gallery. The night of the ninth of March.
      Who touched that door, and when?</p>`,
    task: `Join <code>keycard_logs</code> to <code>suspects</code> and return <code>s.name</code>,
      <code>k.swipe_time</code> and <code>k.direction</code> for <code>location_id = 3</code> where
      <code>swipe_time</code> is on <code>2026-03-09</code>, ordered by <code>swipe_time</code>.`,
    starter: `-- Read the door.\n`,
    solution: `SELECT s.name, k.swipe_time, k.direction
               FROM keycard_logs AS k
               INNER JOIN suspects AS s ON s.suspect_id = k.suspect_id
               WHERE k.location_id = 3 AND k.swipe_time LIKE '2026-03-09%'
               ORDER BY k.swipe_time;`,
    compareColumns: true,
    requires: [[/\bjoin\b/i, 'Join the logs to the suspects.'], [/\border\s+by\b/i, 'Sort by swipe_time.']],
    hint: `WHERE k.location_id = 3 AND k.swipe_time LIKE '2026-03-09%' ORDER BY k.swipe_time`,
    reveal: `In at 01:50. Out at 02:38. In again at 02:41. Out at 03:15 with the painting.`
  }]
},

/* ===================================================================
   CASE 4 — SIGNAL IN THE STATIC       Grouping, subqueries, logic
   =================================================================== */
{
  id: 'c4',
  number: 4,
  title: 'Signal in the Static',
  tagline: 'Grouping and subqueries',
  place: 'Old Quay Radio Mast · Old Quay',
  date: '21 April 2026',
  accent: '#5bb8ff',
  chapters: 'GROUP BY · HAVING · EXISTS · ANY/ALL · Subqueries · CASE · NULL functions',
  brief: `<p>Every fourth night at ten o'clock, a shortwave transmitter on 6.215 MHz broadcasts a
    string of numbers to nobody. The listening post has logged it for a month.</p>
    <p>On the twenty-first the message changed from TRIPLE-3 to TRIPLE-9. Four hours later, a
    property developer wired eighteen thousand pounds out of Sandoval Tower.</p>
    <p>Individual rows will not show you a pattern. You need to <em>group</em> them.</p>`,
  culprit: 10,
  lineup: [10, 7, 8, 9, 14],
  verdict: `<p>Viktor Sandoval. Six calls from Priya Raman, four thousand seven hundred and ninety
    seconds of them, every one on a broadcast night.</p>
    <p>Raman built and ran the transmitter — three thousand in cash a month, deposited the morning
    after each payment night. But she was the hand, not the head. Sandoval wrote the numbers.</p>
    <p>His alibi held up. It would. Somebody at the Bureau signed it off.</p>`,

  lessons: [
  {
    id: 'c4l1', chapter: 'SQL GROUP BY', title: 'Collapsing rows into groups',
    tables: ['radio_logs'],
    concept: `<p><code>GROUP BY</code> folds rows that share a value into one row, so an aggregate can
      be computed per group instead of over the whole table.</p>
      <p>The shape is always the same: the column you group by, plus aggregates of the rest.</p>
      <p>Order of operations: <code>FROM</code> → <code>WHERE</code> → <code>GROUP BY</code> →
      <code>HAVING</code> → <code>SELECT</code> → <code>ORDER BY</code>.</p>`,
    syntax: `SELECT column1, COUNT(*) AS n\nFROM table_name\nGROUP BY column1;`,
    example: `SELECT district, COUNT(*) AS people FROM suspects GROUP BY district;`,
    note: `Any non-aggregated column in your <code>SELECT</code> must appear in the
      <code>GROUP BY</code>. SQLite is lax about this and will quietly pick a random row;
      most other databases reject the query outright.`,
    story: `<p>Eighteen broadcasts in the log. How many belong to each operator?</p>`,
    task: `From <code>radio_logs</code>, return <code>suspect_id</code> and <code>COUNT(*)</code> as
      <code>broadcasts</code>, grouped by <code>suspect_id</code>.`,
    starter: `-- One row per operator.\n`,
    solution: `SELECT suspect_id, COUNT(*) AS broadcasts FROM radio_logs GROUP BY suspect_id;`,
    compareColumns: true,
    requires: [[/\bgroup\s+by\b/i, 'Collapse the rows with GROUP BY.'], [/\bcount\s*\(/i, 'Count the rows in each group.']],
    hint: `SELECT suspect_id, COUNT(*) AS broadcasts FROM radio_logs GROUP BY suspect_id;`,
    reveal: `Suspect 7 — Priya Raman — nine broadcasts. Five more have no operator at all.`
  },
  {
    id: 'c4l2', chapter: 'SQL HAVING', title: 'Filtering the groups',
    tables: ['calls'],
    concept: `<p><code>WHERE</code> filters rows <em>before</em> grouping. <code>HAVING</code> filters
      groups <em>after</em>.</p>
      <p>That is the whole distinction, and it matters: you cannot put <code>COUNT(*) &gt; 5</code> in
      a <code>WHERE</code> clause, because when <code>WHERE</code> runs the groups do not exist yet.</p>`,
    syntax: `SELECT column1, COUNT(*) AS n\nFROM table_name\nWHERE row_condition\nGROUP BY column1\nHAVING COUNT(*) > number;`,
    example: `SELECT case_id, COUNT(*) AS items FROM evidence GROUP BY case_id HAVING COUNT(*) >= 5;`,
    note: `Use both in one query when you need to: <code>WHERE</code> to throw away rows,
      <code>HAVING</code> to throw away groups.`,
    story: `<p>Everyone makes phone calls. Only one person in this city makes them like clockwork.</p>`,
    task: `From <code>calls</code>, return <code>caller_id</code> and <code>COUNT(*)</code> as
      <code>call_count</code>, grouped by <code>caller_id</code>, keeping only callers with more
      than <code>5</code> calls.`,
    starter: `-- Who will not stop calling?\n`,
    solution: `SELECT caller_id, COUNT(*) AS call_count FROM calls
               GROUP BY caller_id HAVING COUNT(*) > 5;`,
    compareColumns: true,
    requires: [[/\bhaving\b/i, 'Filter the groups with HAVING.'], [/\bgroup\s+by\b/i, 'Group first.']],
    hint: `GROUP BY caller_id HAVING COUNT(*) > 5`,
    reveal: `Caller 7. Seven calls. Nobody else in Ashvale made more than four.`
  },
  {
    id: 'c4l3', chapter: 'SQL EXISTS', title: 'Does a matching row exist?',
    tables: ['suspects', 'radio_logs'],
    concept: `<p><code>EXISTS</code> takes a subquery and returns true the moment that subquery
      produces a single row. It does not care <em>what</em> the row contains — which is why you see
      <code>SELECT 1</code> inside it so often.</p>
      <p>The subquery is <em>correlated</em>: it refers to a column from the outer query, so it is
      evaluated once per outer row.</p>`,
    syntax: `SELECT column1\nFROM table_a AS a\nWHERE EXISTS (\n  SELECT 1 FROM table_b AS b WHERE b.key = a.key\n);`,
    example: `SELECT name FROM suspects AS s\nWHERE EXISTS (SELECT 1 FROM vehicles AS v WHERE v.suspect_id = s.suspect_id);`,
    note: `<code>NOT EXISTS</code> is the reliable way to ask "which rows have no match?" —
      and unlike <code>NOT IN</code>, it behaves correctly when NULLs are involved.`,
    story: `<p>Three transmitters, three operators. Who in the suspect list has ever keyed a
      microphone?</p>`,
    task: `Return the <code>name</code> of every suspect for whom a row exists in
      <code>radio_logs</code> with a matching <code>suspect_id</code>. Use <code>EXISTS</code>.`,
    starter: `-- Correlated subquery.\n`,
    solution: `SELECT name FROM suspects AS s
               WHERE EXISTS (SELECT 1 FROM radio_logs AS r WHERE r.suspect_id = s.suspect_id);`,
    compareColumns: true,
    requires: [[/\bexists\b/i, 'This lesson is about EXISTS.']],
    hint: `WHERE EXISTS (SELECT 1 FROM radio_logs AS r WHERE r.suspect_id = s.suspect_id)`,
    reveal: `Raman, Halloran, Pell. An engineer, a courier and a thief.`
  },
  {
    id: 'c4l4', chapter: 'SQL ANY and ALL', title: 'Comparing against a whole set',
    tables: ['suspects'],
    concept: `<p><code>ANY</code> and <code>ALL</code> compare one value against every value a subquery
      returns.</p>
      <ul>
        <li><code>x &gt; ANY (subquery)</code> — true if x beats <em>at least one</em> value</li>
        <li><code>x &gt; ALL (subquery)</code> — true if x beats <em>every</em> value</li>
      </ul>
      <p><strong>Dialect warning.</strong> SQL Server, MySQL and PostgreSQL support this syntax.
      SQLite — the engine in this terminal — does not. In SQLite you write the equivalent:</p>
      <ul>
        <li><code>= ANY (...)</code> becomes <code>IN (...)</code></li>
        <li><code>&gt; ALL (...)</code> becomes <code>&gt; (SELECT MAX(...))</code></li>
        <li><code>&gt; ANY (...)</code> becomes <code>&gt; (SELECT MIN(...))</code></li>
      </ul>
      <p>Knowing the translation is worth more than knowing the keyword.</p>`,
    syntax: `-- Standard:\nWHERE col > ALL (SELECT col FROM t WHERE ...)\n-- SQLite equivalent:\nWHERE col > (SELECT MAX(col) FROM t WHERE ...)`,
    example: `SELECT name FROM suspects WHERE age > (SELECT MAX(age) FROM suspects WHERE district = 'Old Quay');`,
    note: `This is the first dialect difference big enough to break a query outright.
      Check which engine you are on before you reach for <code>ANY</code> or <code>ALL</code>.`,
    story: `<p>Civic Hill is where the respectable people live, and the Bureau has never scored one
      of them above 44. Who is riskier than every single resident of Civic Hill?</p>`,
    task: `Return <code>name</code> and <code>risk_score</code> for suspects whose
      <code>risk_score</code> is greater than <strong>all</strong> risk scores in
      <code>'Civic Hill'</code>. Use the SQLite form: compare against
      <code>(SELECT MAX(risk_score) ...)</code>.`,
    starter: `-- Greater than all of them.\n`,
    solution: `SELECT name, risk_score FROM suspects
               WHERE risk_score > (SELECT MAX(risk_score) FROM suspects WHERE district = 'Civic Hill');`,
    compareColumns: true,
    requires: [[/\bmax\s*\(/i, 'Use MAX() inside the subquery.'], [/select[\s\S]*select/i, 'You need a subquery.']],
    hint: `WHERE risk_score > (SELECT MAX(risk_score) FROM suspects WHERE district = 'Civic Hill')`,
    reveal: `Nine names outrank the whole of Civic Hill. Not one of them lives there.`
  },
  {
    id: 'c4l5', chapter: 'SQL Subqueries', title: 'A query inside a query',
    tables: ['suspects', 'evidence'],
    concept: `<p>A subquery is a <code>SELECT</code> nested inside another statement. Three common
      shapes:</p>
      <ul>
        <li><strong>Scalar</strong> — returns one value, used with <code>=</code>,
            <code>&gt;</code>, <code>&lt;</code></li>
        <li><strong>List</strong> — returns one column of many rows, used with <code>IN</code></li>
        <li><strong>Correlated</strong> — references the outer query, used with <code>EXISTS</code></li>
      </ul>
      <p>The inner query runs first. Read from the inside out.</p>`,
    syntax: `SELECT column1\nFROM table_a\nWHERE key IN (\n  SELECT key FROM table_b WHERE condition\n);`,
    example: `SELECT name FROM suspects WHERE suspect_id IN (SELECT saw_suspect_id FROM witnesses);`,
    note: `Most subqueries can be rewritten as joins and will often run faster that way.
      Write the subquery first — it is easier to reason about — then optimise if you must.`,
    story: `<p>Case 4's evidence locker names suspect numbers. Turn the locker into a list of people
      without writing a join.</p>`,
    task: `Return the <code>name</code> of every suspect whose <code>suspect_id</code> appears in
      <code>evidence</code> for <code>case_id = 4</code>. Use <code>IN</code> with a subquery.`,
    starter: `-- Inside out.\n`,
    solution: `SELECT name FROM suspects
               WHERE suspect_id IN (SELECT suspect_id FROM evidence WHERE case_id = 4);`,
    compareColumns: true,
    requires: [[/\bin\s*\(\s*select/i, 'Put a SELECT inside the IN (...).']],
    hint: `WHERE suspect_id IN (SELECT suspect_id FROM evidence WHERE case_id = 4)`,
    reveal: `Raman, Halloran, Sandoval. The engineer, the courier and the money.`
  },
  {
    id: 'c4l6', chapter: 'SQL CASE', title: 'If-then-else, inside a column',
    tables: ['suspects'],
    concept: `<p><code>CASE</code> is SQL's conditional. It walks its <code>WHEN</code> branches in
      order, stops at the first that is true, and returns that <code>THEN</code> value.
      <code>ELSE</code> catches everything left.</p>
      <p>Without an <code>ELSE</code>, unmatched rows return <code>NULL</code>.</p>`,
    syntax: `SELECT col,\n  CASE\n    WHEN condition1 THEN 'a'\n    WHEN condition2 THEN 'b'\n    ELSE 'c'\n  END AS label\nFROM table_name;`,
    example: `SELECT title, CASE WHEN closed_on IS NULL THEN 'Active' ELSE 'Filed' END AS state FROM cases;`,
    note: `<code>CASE</code> is an expression, not a statement — it can go anywhere a value can,
      including inside <code>ORDER BY</code> and inside <code>SUM()</code>.`,
    story: `<p>The Chief wants words, not numbers. Translate the risk scores into something a press
      officer can read aloud.</p>`,
    task: `Return <code>name</code>, <code>risk_score</code>, and a <code>CASE</code> expression
      aliased <code>standing</code> that gives <code>'Primary'</code> when risk_score is
      <code>&gt;= 75</code>, <code>'Person of interest'</code> when <code>&gt;= 50</code>,
      and <code>'Cleared'</code> otherwise.`,
    starter: `-- WHEN ... THEN ... ELSE ... END\n`,
    solution: `SELECT name, risk_score,
                 CASE
                   WHEN risk_score >= 75 THEN 'Primary'
                   WHEN risk_score >= 50 THEN 'Person of interest'
                   ELSE 'Cleared'
                 END AS standing
               FROM suspects;`,
    compareColumns: true,
    requires: [[/\bcase\b/i, 'Use a CASE expression.'], [/\bwhen\b/i, 'CASE needs WHEN branches.'], [/\bend\b/i, 'Close the CASE with END.']],
    hint: `CASE WHEN risk_score >= 75 THEN 'Primary' WHEN risk_score >= 50 THEN 'Person of interest' ELSE 'Cleared' END AS standing`,
    reveal: `Four Primaries. And one man scored 12 — "cleared" before anyone looked.`
  },
  {
    id: 'c4l7', chapter: 'SQL NULL Functions', title: 'Filling in the blanks',
    tables: ['suspects'],
    concept: `<p>NULL spreads: <code>NULL + 5</code> is NULL, and <code>'A' || NULL</code> is NULL.
      One empty field poisons a whole calculation.</p>
      <p>The null functions substitute a value when they meet one. The names differ by database:</p>
      <ul>
        <li><code>IFNULL(col, fallback)</code> — SQLite, MySQL</li>
        <li><code>ISNULL(col, fallback)</code> — SQL Server</li>
        <li><code>NVL(col, fallback)</code> — Oracle</li>
        <li><code>COALESCE(col, col2, fallback)</code> — <strong>standard SQL, works everywhere</strong></li>
      </ul>
      <p><code>COALESCE</code> takes any number of arguments and returns the first non-NULL one.
      Prefer it.</p>`,
    syntax: `SELECT COALESCE(column1, 'fallback') AS alias\nFROM table_name;`,
    example: `SELECT title, COALESCE(closed_on, 'still open') AS closed FROM cases;`,
    note: `This is for display and arithmetic. To <em>filter</em> on NULLs you still need
      <code>IS NULL</code>.`,
    story: `<p>Half the suspects have no recorded alias and the report prints blanks.
      The Chief hates blanks.</p>`,
    task: `Return <code>name</code>, and the <code>alias</code> column with
      <code>'No known alias'</code> substituted wherever it is NULL, aliased as <code>alias</code>.
      Use <code>IFNULL</code> or <code>COALESCE</code>.`,
    starter: `-- No more blanks.\n`,
    solution: `SELECT name, IFNULL(alias, 'No known alias') AS alias FROM suspects;`,
    compareColumns: true,
    requires: [[/\b(ifnull|coalesce)\s*\(/i, 'Use IFNULL() or COALESCE().']],
    hint: `SELECT name, IFNULL(alias, 'No known alias') AS alias FROM suspects;`,
    reveal: `Six with no alias. Including the one calling himself The Archivist.`
  },
  {
    id: 'c4l8', chapter: 'Case review', title: 'Name the paymaster',
    tables: ['calls', 'suspects'],
    isAccusation: true,
    concept: `<p>Join, group, aggregate, sort. Four ideas in one query — which is what real SQL
      looks like.</p>`,
    syntax: `SELECT b.col, COUNT(*) AS n, SUM(a.col) AS total\nFROM table_a AS a\nJOIN table_b AS b ON a.key = b.key\nWHERE condition\nGROUP BY b.col\nORDER BY total DESC;`,
    example: `SELECT s.district, COUNT(*) AS n FROM suspects AS s GROUP BY s.district ORDER BY n DESC;`,
    note: `Follow the money, follow the minutes. Usually they point the same way.`,
    story: `<p>Priya Raman is suspect 7. Every call she makes, and who she makes it to.</p>`,
    task: `From <code>calls</code> where <code>caller_id = 7</code>, join <code>suspects</code> on
      the <code>receiver_id</code> and return the receiver's <code>name</code> as
      <code>contact</code>, <code>COUNT(*)</code> as <code>calls</code> and
      <code>SUM(duration_sec)</code> as <code>seconds</code>, grouped by the contact,
      ordered by <code>seconds</code> descending.`,
    starter: `-- Follow the minutes.\n`,
    solution: `SELECT s.name AS contact, COUNT(*) AS calls, SUM(c.duration_sec) AS seconds
               FROM calls AS c
               INNER JOIN suspects AS s ON s.suspect_id = c.receiver_id
               WHERE c.caller_id = 7
               GROUP BY s.name
               ORDER BY seconds DESC;`,
    compareColumns: true,
    requires: [
      [/\bjoin\b/i, 'Join calls to suspects.'],
      [/\bgroup\s+by\b/i, 'Group by the contact.'],
      [/\border\s+by\b/i, 'Sort by total seconds, descending.']
    ],
    hint: `GROUP BY s.name ORDER BY seconds DESC — and remember to join on receiver_id, not caller_id.`,
    reveal: `Four thousand seven hundred and ninety seconds to one man.`
  }]
},

/* ===================================================================
   CASE 5 — REWRITING HISTORY         DML, DDL, constraints, views
   =================================================================== */
{
  id: 'c5',
  number: 5,
  title: 'Rewriting History',
  tagline: 'Changing the database',
  place: 'Bureau of Forensic Data · Civic Hill',
  date: '30 May 2026',
  accent: '#ff6b6b',
  chapters: 'CREATE TABLE · Constraints · INSERT · UPDATE · DELETE · ALTER · INDEX · VIEW · DROP',
  brief: `<p>Sandoval's alibi was signed off inside this building. So you pulled the
    <code>audit_log</code> — the one table nobody can edit, because it records the edits.</p>
    <p>Fifteen entries. Eleven of them made between 23:58 and 03:05 on the night of the thirtieth,
    all from one terminal. Rows altered. Rows deleted. A witness invented out of nothing.</p>
    <p>Until now you have only <em>read</em> the database. To rebuild what was destroyed you have to
    write to it.</p>`,
  culprit: 3,
  lineup: [3, 9, 10, 5, 12],
  verdict: `<p>Marcus Thorne. Records Archivist, twenty-five years of service, and the only person
    in Ashvale who could make a man innocent by typing.</p>
    <p>He lowered his own risk score from 78 to 12. He gave himself an alibi. He deleted a
    twelve-thousand-pound wire from Sandoval, the keycard swipe that put him in this building at
    23:12, and a card from the shredder that had his name on it. Then he invented Felix Marsh to
    swear he was somewhere else.</p>
    <p>What he could not do was edit the journal that recorded him doing it.</p>
    <p>You restored every row. Eleven entries, one terminal, one login: <code>m.thorne</code>.</p>`,

  lessons: [
  {
    id: 'c5l1', chapter: 'SQL CREATE TABLE', title: 'Building somewhere to work',
    tables: ['audit_log'],
    concept: `<p><code>CREATE TABLE</code> defines a new table: a name, then a list of columns, each
      with a <em>data type</em>.</p>
      <p>The types you will meet everywhere:</p>
      <ul>
        <li><code>INTEGER</code> — whole numbers</li>
        <li><code>REAL</code> / <code>DECIMAL(p,s)</code> — numbers with a fractional part</li>
        <li><code>TEXT</code> / <code>VARCHAR(n)</code> — strings</li>
        <li><code>DATE</code>, <code>DATETIME</code> — points in time</li>
      </ul>
      <p>SQLite stores dates as <code>TEXT</code> in <code>YYYY-MM-DD</code> form, which sorts and
      compares correctly as plain text.</p>`,
    syntax: `CREATE TABLE table_name (\n  col1 INTEGER PRIMARY KEY,\n  col2 TEXT,\n  col3 INTEGER\n);`,
    example: `CREATE TABLE leads (lead_id INTEGER PRIMARY KEY, detail TEXT);`,
    note: `A <code>PRIMARY KEY</code> uniquely identifies a row. In SQLite, an
      <code>INTEGER PRIMARY KEY</code> auto-numbers itself if you leave it out of an
      <code>INSERT</code>.`,
    story: `<p>Nothing you write tonight goes into the evidence tables until it is verified.
      Build your own workbench first.</p>`,
    task: `Create a table called <code>case_notes</code> with exactly these columns, in this order:
      <code>note_id INTEGER PRIMARY KEY</code>, <code>case_id INTEGER</code>,
      <code>body TEXT</code>, <code>logged_on TEXT</code>.`,
    starter: `-- Your workbench.\n`,
    solution: `CREATE TABLE case_notes (
                 note_id   INTEGER PRIMARY KEY,
                 case_id   INTEGER,
                 body      TEXT,
                 logged_on TEXT
               );`,
    check: `SELECT name, type, pk FROM pragma_table_info('case_notes') ORDER BY cid;`,
    ordered: true,
    compareColumns: true,
    requires: [[/\bcreate\s+table\b/i, 'Use CREATE TABLE.'], [/\bprimary\s+key\b/i, 'note_id needs to be a PRIMARY KEY.']],
    hint: `CREATE TABLE case_notes (note_id INTEGER PRIMARY KEY, case_id INTEGER, body TEXT, logged_on TEXT);`,
    reveal: `Four columns and nothing in them. Good. Now fill it with the truth.`
  },
  {
    id: 'c5l2', chapter: 'SQL Constraints', title: 'Rules the data cannot break',
    tables: ['audit_log'],
    concept: `<p>Constraints are rules enforced by the database itself. They are the reason a
      well-built schema is hard to corrupt — and the reason Thorne had to go round the side.</p>
      <ul>
        <li><code>NOT NULL</code> — the column must have a value</li>
        <li><code>UNIQUE</code> — no two rows may share this value</li>
        <li><code>PRIMARY KEY</code> — <code>NOT NULL</code> and <code>UNIQUE</code> together</li>
        <li><code>FOREIGN KEY</code> — the value must exist in another table</li>
        <li><code>CHECK</code> — the value must satisfy a condition</li>
        <li><code>DEFAULT</code> — the value used when none is supplied</li>
      </ul>`,
    syntax: `CREATE TABLE t (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL UNIQUE,\n  level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 5)\n);`,
    example: `CREATE TABLE tags (tag_id INTEGER PRIMARY KEY, label TEXT NOT NULL UNIQUE);`,
    note: `A constraint is a promise the database keeps even when the application forgets.
      Push rules down into the schema wherever you can.`,
    story: `<p>A tamper register. Every flag must name a table, carry a severity between 1 and 5,
      and default to unreviewed — and no table may be flagged twice.</p>`,
    task: `Create a table <code>tamper_flags</code> with, in order:
      <code>flag_id INTEGER PRIMARY KEY</code>;
      <code>table_name TEXT NOT NULL UNIQUE</code>;
      <code>severity INTEGER NOT NULL DEFAULT 1</code> with a
      <code>CHECK (severity BETWEEN 1 AND 5)</code>;
      <code>reviewed INTEGER NOT NULL DEFAULT 0</code>.`,
    starter: `-- Rules, enforced.\n`,
    solution: `CREATE TABLE tamper_flags (
                 flag_id    INTEGER PRIMARY KEY,
                 table_name TEXT NOT NULL UNIQUE,
                 severity   INTEGER NOT NULL DEFAULT 1 CHECK (severity BETWEEN 1 AND 5),
                 reviewed   INTEGER NOT NULL DEFAULT 0
               );`,
    check: `SELECT name, type, "notnull", dflt_value, pk FROM pragma_table_info('tamper_flags') ORDER BY cid;`,
    ordered: true,
    compareColumns: true,
    requires: [
      [/\bnot\s+null\b/i, 'Two columns need NOT NULL.'],
      [/\bunique\b/i, 'table_name must be UNIQUE.'],
      [/\bcheck\s*\(/i, 'severity needs a CHECK constraint.'],
      [/\bdefault\b/i, 'Two columns need a DEFAULT.']
    ],
    hint: `severity INTEGER NOT NULL DEFAULT 1 CHECK (severity BETWEEN 1 AND 5)`,
    reveal: `Now there is one table in this building that cannot be quietly edited.`
  },
  {
    id: 'c5l3', chapter: 'SQL INSERT INTO', title: 'Restoring a deleted row',
    tables: ['evidence', 'audit_log'],
    concept: `<p><code>INSERT INTO</code> adds rows. Two forms:</p>
      <ul>
        <li><strong>Named columns</strong> — <code>INSERT INTO t (a, b) VALUES (1, 'x');</code>
            Safe, readable, survives a schema change.</li>
        <li><strong>All columns</strong> — <code>INSERT INTO t VALUES (1, 'x');</code>
            Shorter, and breaks the day somebody adds a column.</li>
      </ul>
      <p>Insert several rows at once by separating the value lists with commas.</p>`,
    syntax: `INSERT INTO table_name (col1, col2)\nVALUES (value1, value2);`,
    example: `INSERT INTO case_notes (note_id, body) VALUES (1, 'Reviewed the door logs');`,
    note: `Supply values in the same order as the columns you named. Text in single quotes,
      numbers bare, <code>NULL</code> unquoted.`,
    story: `<p><code>audit_log</code> entry 3: <code>DELETE</code>, table <code>evidence</code>,
      row 24, <code>item=Shredded index card</code>, by <code>m.thorne</code> at 00:19. The
      locker inventory confirms the rest. Put it back.</p>`,
    task: `Insert into <code>evidence</code> a row with
      <code>evidence_id = 24</code>, <code>case_id = 5</code>,
      <code>item = 'Shredded index card'</code>, <code>category = 'document'</code>,
      <code>location_id = 4</code>, <code>found_on = '2026-06-01'</code>, <code>suspect_id = 3</code>.`,
    starter: `-- Put it back where it was.\n`,
    solution: `INSERT INTO evidence (evidence_id, case_id, item, category, location_id, found_on, suspect_id)
               VALUES (24, 5, 'Shredded index card', 'document', 4, '2026-06-01', 3);`,
    check: `SELECT * FROM evidence WHERE case_id = 5 ORDER BY evidence_id;`,
    ordered: true,
    requires: [[/\binsert\s+into\b/i, 'Use INSERT INTO.'], [/\bvalues\b/i, 'You need a VALUES list.']],
    hint: `INSERT INTO evidence (evidence_id, case_id, item, category, location_id, found_on, suspect_id) VALUES (24, 5, 'Shredded index card', 'document', 4, '2026-06-01', 3);`,
    reveal: `Evidence 24 is back in the locker. It has Thorne's name on it.`
  },
  {
    id: 'c5l4', chapter: 'SQL UPDATE', title: 'Undoing the edit',
    tables: ['suspects', 'audit_log'],
    concept: `<p><code>UPDATE</code> changes values in rows that already exist. Set one column or
      several, separated by commas.</p>
      <p>The <code>WHERE</code> clause is not optional in any way that matters. Leave it off and you
      update <strong>every row in the table</strong>, instantly, with no undo.</p>`,
    syntax: `UPDATE table_name\nSET col1 = value1, col2 = value2\nWHERE condition;`,
    example: `UPDATE cases SET status = 'closed', closed_on = '2026-06-05' WHERE case_id = 1;`,
    note: `Run your <code>WHERE</code> clause as a <code>SELECT</code> first and look at the rows
      you are about to change. Every experienced engineer does this. Most learned it the hard way.`,
    story: `<p>Audit entries 1 and 2: suspect 3's risk score pushed from <code>78</code> down to
      <code>12</code>, and <code>has_alibi</code> flipped from <code>0</code> to <code>1</code>.
      Both at a minute past midnight. Both by <code>m.thorne</code>. Both about himself.</p>`,
    task: `Update <code>suspects</code> so that <code>suspect_id = 3</code> has
      <code>risk_score = 78</code> and <code>has_alibi = 0</code>. Change no other row.`,
    starter: `-- Put the number back.\n`,
    solution: `UPDATE suspects SET risk_score = 78, has_alibi = 0 WHERE suspect_id = 3;`,
    check: `SELECT suspect_id, name, has_alibi, risk_score FROM suspects ORDER BY suspect_id;`,
    ordered: true,
    requires: [[/\bupdate\b/i, 'Use UPDATE.'], [/\bset\b/i, 'UPDATE needs SET.'],
               [/\bwhere\b/i, 'Without WHERE you will rewrite all fourteen rows.']],
    hint: `UPDATE suspects SET risk_score = 78, has_alibi = 0 WHERE suspect_id = 3;`,
    reveal: `Risk 78. No alibi. He has been in the top four all along.`
  },
  {
    id: 'c5l5', chapter: 'SQL DELETE', title: 'Removing what was never real',
    tables: ['witnesses', 'audit_log'],
    concept: `<p><code>DELETE</code> removes rows. Same warning as <code>UPDATE</code>, with
      sharper teeth:</p>
      <p><code>DELETE FROM witnesses;</code> empties the table. No confirmation, no undo.</p>
      <p>Related: <code>TRUNCATE TABLE</code> (not in SQLite) empties a table far faster than
      <code>DELETE</code>, but cannot be filtered and often cannot be rolled back.</p>`,
    syntax: `DELETE FROM table_name\nWHERE condition;`,
    example: `DELETE FROM scratch_pad WHERE pad_id = 3;`,
    note: `<code>SELECT * FROM t WHERE ...</code> first. Then change <code>SELECT *</code> to
      <code>DELETE</code>. It is the cheapest safety net in this language.`,
    story: `<p>Audit entry 15: an <code>INSERT</code> into <code>witnesses</code>, row 16, at 03:05,
      by <code>m.thorne</code>. The statement reads "The archivist was with me the entire night."
      There is no Felix Marsh in Ashvale. There never was.</p>`,
    task: `Delete the row from <code>witnesses</code> where <code>witness_id = 16</code>.`,
    starter: `-- He does not exist.\n`,
    solution: `DELETE FROM witnesses WHERE witness_id = 16;`,
    check: `SELECT witness_id, name, case_id FROM witnesses ORDER BY witness_id;`,
    ordered: true,
    requires: [[/\bdelete\s+from\b/i, 'Use DELETE FROM.'], [/\bwhere\b/i, 'A DELETE without WHERE empties the table.']],
    hint: `DELETE FROM witnesses WHERE witness_id = 16;`,
    reveal: `Thorne's alibi just evaporated.`
  },
  {
    id: 'c5l6', chapter: 'SQL ALTER TABLE', title: 'Changing a table that already exists',
    tables: [],
    concept: `<p><code>ALTER TABLE</code> modifies a table's structure after the fact:</p>
      <ul>
        <li><code>ADD COLUMN col TYPE</code></li>
        <li><code>RENAME TO new_name</code></li>
        <li><code>RENAME COLUMN old TO new</code></li>
        <li><code>DROP COLUMN col</code></li>
      </ul>
      <p>Support varies: SQLite has supported <code>ADD</code> and <code>RENAME</code> for years but
      only gained <code>DROP COLUMN</code> in 3.35. Other engines also offer
      <code>ALTER COLUMN</code> to change a type outright.</p>`,
    syntax: `ALTER TABLE table_name\nADD COLUMN column_name TYPE;`,
    example: `ALTER TABLE case_notes RENAME TO detective_notes;`,
    note: `A new column is <code>NULL</code> in every existing row. If that is not acceptable,
      add it with a <code>DEFAULT</code>, or add it and <code>UPDATE</code> immediately.`,
    story: `<p>Your workbench needs one more column: a flag for whether you have verified a
      restored row against the audit journal.</p>`,
    setup: `CREATE TABLE case_notes (note_id INTEGER PRIMARY KEY, case_id INTEGER, body TEXT, logged_on TEXT);`,
    task: `Add a column <code>verified INTEGER</code> to the <code>case_notes</code> table
      (it has already been created for you).`,
    starter: `-- One more column.\n`,
    solution: `ALTER TABLE case_notes ADD COLUMN verified INTEGER;`,
    check: `SELECT name, type FROM pragma_table_info('case_notes') ORDER BY cid;`,
    ordered: true,
    compareColumns: true,
    requires: [[/\balter\s+table\b/i, 'Use ALTER TABLE.'], [/\badd\b/i, 'You are adding a column.']],
    hint: `ALTER TABLE case_notes ADD COLUMN verified INTEGER;`,
    reveal: `Five columns. Every restored row will be signed off before it counts.`
  },
  {
    id: 'c5l7', chapter: 'SQL CREATE INDEX', title: 'Making the search fast',
    tables: ['audit_log'],
    concept: `<p>An index is a lookup structure the database maintains alongside a table. Queries
      that filter or sort on an indexed column stop scanning every row and jump straight to the
      matches.</p>
      <p>The cost is paid on writes: every <code>INSERT</code>, <code>UPDATE</code> and
      <code>DELETE</code> has to maintain the index too. Index the columns you search by, not every
      column you have.</p>`,
    syntax: `CREATE INDEX index_name\nON table_name (column1);`,
    example: `CREATE UNIQUE INDEX idx_plate ON vehicles (plate);`,
    note: `<code>CREATE UNIQUE INDEX</code> both speeds up lookups and forbids duplicate values.
      Indexes are invisible to your queries — you never name one in a <code>SELECT</code>.`,
    story: `<p>You are about to read the audit journal by username over and over. Make it quick.</p>`,
    task: `Create an index named <code>idx_audit_changed_by</code> on the
      <code>audit_log</code> table's <code>changed_by</code> column.`,
    starter: `-- Speed it up.\n`,
    solution: `CREATE INDEX idx_audit_changed_by ON audit_log (changed_by);`,
    check: `SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name;`,
    ordered: true,
    requires: [[/\bcreate\s+(unique\s+)?index\b/i, 'Use CREATE INDEX.']],
    hint: `CREATE INDEX idx_audit_changed_by ON audit_log (changed_by);`,
    reveal: `Eleven rows, found instantly, every time you ask.`
  },
  {
    id: 'c5l8', chapter: 'SQL VIEW', title: 'A query you can name',
    tables: ['audit_log'],
    concept: `<p>A view is a stored <code>SELECT</code> that behaves like a table. It holds no data
      of its own — it re-runs its query every time you read it, so it is never stale.</p>
      <p>Use one to hide a complicated join behind a simple name, or to expose part of a table
      without exposing all of it.</p>
      <p><strong>On stored procedures:</strong> W3Schools covers them here too. A stored procedure
      is saved <em>code</em> you call by name, often taking parameters —
      <code>EXEC procedure_name;</code> in SQL Server. SQLite has no stored procedures at all;
      views are the closest it offers, and in practice application code does the rest.</p>`,
    syntax: `CREATE VIEW view_name AS\nSELECT col1, col2\nFROM table_name\nWHERE condition;`,
    example: `CREATE VIEW v_open_cases AS SELECT title, opened_on FROM cases WHERE status = 'open';`,
    note: `Drop one with <code>DROP VIEW view_name;</code>. Simple views can sometimes be written
      through; anything with a join or an aggregate is read-only.`,
    story: `<p>You will be quoting this list in the arrest report. Give it a name.</p>`,
    task: `Create a view called <code>v_tampering</code> that selects
      <code>audit_id</code>, <code>table_name</code>, <code>row_id</code>, <code>action</code>
      and <code>changed_at</code> from <code>audit_log</code> where
      <code>changed_by = 'm.thorne'</code>.`,
    starter: `-- Name the evidence.\n`,
    solution: `CREATE VIEW v_tampering AS
               SELECT audit_id, table_name, row_id, action, changed_at
               FROM audit_log WHERE changed_by = 'm.thorne';`,
    check: `SELECT * FROM v_tampering ORDER BY audit_id;`,
    ordered: true,
    compareColumns: true,
    requires: [[/\bcreate\s+view\b/i, 'Use CREATE VIEW.']],
    hint: `CREATE VIEW v_tampering AS SELECT audit_id, table_name, row_id, action, changed_at FROM audit_log WHERE changed_by = 'm.thorne';`,
    reveal: `Eleven edits between 23:58 and 03:05. All from one login.`
  },
  {
    id: 'c5l9', chapter: 'SQL INSERT INTO SELECT', title: 'Copying rows between tables',
    tables: ['audit_log'],
    concept: `<p><code>INSERT INTO ... SELECT</code> fills a table from a query instead of from
      literal values. The <code>SELECT</code> must produce columns matching the ones you named,
      in order.</p>
      <p>Two neighbours worth knowing:</p>
      <ul>
        <li><code>SELECT ... INTO new_table FROM ...</code> — SQL Server; creates the table <em>and</em>
            copies, in one statement</li>
        <li><code>CREATE TABLE new_table AS SELECT ...</code> — the SQLite, MySQL and PostgreSQL
            equivalent</li>
      </ul>
      <p><code>INSERT INTO ... SELECT</code> needs the destination to exist already.</p>`,
    syntax: `INSERT INTO target (col1, col2)\nSELECT colA, colB\nFROM source\nWHERE condition;`,
    example: `INSERT INTO case_notes (note_id, body) SELECT audit_id, action FROM audit_log;`,
    note: `<code>||</code> concatenates text in SQLite and PostgreSQL;
      SQL Server uses <code>+</code> and MySQL uses <code>CONCAT()</code>.`,
    story: `<p>Pull every one of Thorne's edits into your notes, one note per edit, stamped with the
      time he made it.</p>`,
    setup: `CREATE TABLE case_notes (note_id INTEGER PRIMARY KEY, case_id INTEGER, body TEXT, logged_on TEXT);`,
    task: `Insert into <code>case_notes (note_id, case_id, body, logged_on)</code> a row for every
      <code>audit_log</code> entry where <code>changed_by = 'm.thorne'</code>, selecting
      <code>audit_id</code>, the literal <code>5</code>,
      <code>'Tampered: ' || table_name</code>, and <code>changed_at</code>.`,
    starter: `-- No VALUES list this time.\n`,
    solution: `INSERT INTO case_notes (note_id, case_id, body, logged_on)
               SELECT audit_id, 5, 'Tampered: ' || table_name, changed_at
               FROM audit_log WHERE changed_by = 'm.thorne';`,
    check: `SELECT * FROM case_notes ORDER BY note_id;`,
    ordered: true,
    requires: [[/\binsert\s+into\b[\s\S]*\bselect\b/i, 'Feed the INSERT from a SELECT, with no VALUES list.']],
    forbid: [[/\bvalues\s*\(/i, 'No VALUES list — the SELECT supplies the rows.']],
    hint: `INSERT INTO case_notes (note_id, case_id, body, logged_on) SELECT audit_id, 5, 'Tampered: ' || table_name, changed_at FROM audit_log WHERE changed_by = 'm.thorne';`,
    reveal: `Eleven notes, written by the database itself. Harder to argue with than testimony.`
  },
  {
    id: 'c5l10', chapter: 'SQL DROP TABLE', title: 'Clearing the desk',
    tables: ['scratch_pad'],
    concept: `<p><code>DROP TABLE</code> removes a table, its data, its indexes and its triggers.
      Permanently.</p>
      <p>Know the three apart:</p>
      <ul>
        <li><code>DELETE FROM t WHERE ...</code> — removes <em>some</em> rows</li>
        <li><code>TRUNCATE TABLE t</code> — removes <em>all</em> rows, keeps the table</li>
        <li><code>DROP TABLE t</code> — removes the <em>table</em></li>
      </ul>
      <p><code>DROP TABLE IF EXISTS t</code> avoids an error when it is already gone.</p>`,
    syntax: `DROP TABLE table_name;`,
    example: `DROP TABLE IF EXISTS temp_results;`,
    note: `Views are dropped with <code>DROP VIEW</code>, indexes with <code>DROP INDEX</code>,
      a whole database with <code>DROP DATABASE</code>. Each one is as final as it sounds.`,
    story: `<p>Somebody has been leaving notes in the production database for years.
      "Remember to reset the terminal clock." Now you know who, and why.</p>`,
    task: `Drop the <code>scratch_pad</code> table.`,
    starter: `-- Gone for good.\n`,
    solution: `DROP TABLE scratch_pad;`,
    check: `SELECT COUNT(*) AS remaining FROM sqlite_master WHERE type = 'table' AND name = 'scratch_pad';`,
    compareColumns: true,
    requires: [[/\bdrop\s+table\b/i, 'Use DROP TABLE.']],
    hint: `DROP TABLE scratch_pad;`,
    reveal: `"Remember to reset the terminal clock." He was covering his timestamps for years.`
  },
  {
    id: 'c5l11', chapter: 'SQL Comments & Operators', title: 'Writing it so it can be read',
    tables: ['suspects'],
    concept: `<p><strong>Comments.</strong> <code>--</code> comments to the end of the line;
      <code>/* ... */</code> comments across lines. A query that will be read in a courtroom should
      explain itself.</p>
      <p><strong>Operators.</strong></p>
      <ul>
        <li>Arithmetic: <code>+</code> <code>-</code> <code>*</code> <code>/</code> <code>%</code></li>
        <li>Comparison: <code>=</code> <code>&lt;&gt;</code> (or <code>!=</code>)
            <code>&gt;</code> <code>&lt;</code> <code>&gt;=</code> <code>&lt;=</code></li>
        <li>Logical: <code>AND</code> <code>OR</code> <code>NOT</code> <code>IN</code>
            <code>BETWEEN</code> <code>LIKE</code> <code>EXISTS</code></li>
      </ul>`,
    syntax: `-- a single line comment\n/* a comment\n   across lines */\nSELECT col * 2 AS doubled FROM t WHERE col <> 0;`,
    example: `SELECT amount, amount * 0.2 AS tax FROM transactions;`,
    note: `<code>&lt;&gt;</code> is the standard "not equal". <code>!=</code> works nearly everywhere
      too, and the two are identical in every engine you are likely to meet.`,
    story: `<p>Last query before the arrest report. The Chief Inspector will read it line by line,
      so comment it and do the arithmetic in SQL rather than in your head.</p>`,
    task: `Return <code>name</code>, <code>risk_score</code>, and <code>risk_score * 2</code> as
      <code>doubled_risk</code>, for suspects with <code>risk_score &gt;= 50</code> whose
      <code>district</code> is not <code>'Civic Hill'</code> (use <code>&lt;&gt;</code>).
      Include at least one SQL comment in your query.`,
    starter: `-- Suspects outside Civic Hill, risk 50 or above\n`,
    solution: `-- Suspects outside Civic Hill, risk 50 or above
               SELECT name, risk_score, risk_score * 2 AS doubled_risk
               FROM suspects
               WHERE risk_score >= 50 AND district <> 'Civic Hill';`,
    compareColumns: true,
    requires: [
      [/--|\/\*/, 'Add a comment with -- or /* ... */.'],
      [/\*/, 'Do the doubling in SQL with the * operator.'],
      [/<>|!=/, 'Exclude Civic Hill with <> (or !=).']
    ],
    hint: `-- a comment\nSELECT name, risk_score, risk_score * 2 AS doubled_risk FROM suspects WHERE risk_score >= 50 AND district <> 'Civic Hill';`,
    reveal: `Nine names. And the tenth, the one scored 12, is sitting two floors below you.`
  },
  {
    id: 'c5l12', chapter: 'Case review', title: 'Name the archivist',
    tables: ['audit_log'],
    isAccusation: true,
    concept: `<p>One last query. Group the journal by login, count the edits, and put the worst
      offender on top.</p>
      <p>You have used every clause in this tutorial to get here.</p>`,
    syntax: `SELECT col, COUNT(*) AS n\nFROM table_name\nGROUP BY col\nORDER BY n DESC;`,
    example: `SELECT action, COUNT(*) AS n FROM audit_log GROUP BY action ORDER BY n DESC;`,
    note: `The simplest query in the case file, and the one that ends it.`,
    story: `<p>Fifteen entries in the journal. Three logins. One of them has been busy.</p>`,
    task: `From <code>audit_log</code>, return <code>changed_by</code> and <code>COUNT(*)</code>
      as <code>edits</code>, grouped by <code>changed_by</code>, ordered by <code>edits</code>
      descending.`,
    starter: `-- Who has been editing the past?\n`,
    solution: `SELECT changed_by, COUNT(*) AS edits FROM audit_log
               GROUP BY changed_by ORDER BY edits DESC;`,
    compareColumns: true,
    ordered: true,
    requires: [[/\bgroup\s+by\b/i, 'Group by the login.'], [/\border\s+by\b/i, 'Worst offender first.']],
    hint: `SELECT changed_by, COUNT(*) AS edits FROM audit_log GROUP BY changed_by ORDER BY edits DESC;`,
    reveal: `m.thorne — eleven edits. Everyone else in the building managed two.`
  }]
}
];

/* Flat lesson list, in play order. Each lesson is tagged in place, so a
   lesson reached through CASES and one reached through ALL_LESSONS are the
   same object. */
export const ALL_LESSONS = CASES.flatMap(c =>
  c.lessons.map((l, i) => Object.assign(l, { caseId: c.id, caseNumber: c.number, index: i }))
);

export const RANKS = [
  { at: 0,  title: 'Recruit' },
  { at: 4,  title: 'Clerk, Records' },
  { at: 8,  title: 'Junior Analyst' },
  { at: 14, title: 'Field Analyst' },
  { at: 20, title: 'Detective, Third Grade' },
  { at: 27, title: 'Detective, Second Grade' },
  { at: 34, title: 'Detective, First Grade' },
  { at: 40, title: 'Chief of Forensic Data' },
  { at: 43, title: 'Legend of the Bureau' }
];
