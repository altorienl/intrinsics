#!/usr/bin/env node
/* Mutation testing:  node test/mutate.js
 *
 * A check that cannot fail is worse than no check, because it buys confidence
 * without paying for it. The only way to know this suite works is to break the
 * code on purpose and watch it go red. Every mutation below is a plausible
 * edit -- several are edits that were actually made, including the one that
 * desynced 165 rows -- and each must make `node test/run.js` exit non-zero.
 *
 * Nothing here touches the real index.html or scan.py. Both are copied into a
 * temp directory, broken there, and the suite is pointed at the copies with
 * INTRINSICS_INDEX_HTML and INTRINSICS_SCAN_PY. That also means two other
 * agents can be editing the real files while this runs.
 *
 * If a mutation target is not found, that is a FAILURE and not a skip: it
 * means the code moved out from under the mutation and this file is no longer
 * testing what it claims to.
 */
'use strict';
var fs = require('fs');
var os = require('os');
var path = require('path');
var child = require('child_process');

var TEST_DIR = __dirname;
var REPO = path.join(TEST_DIR, '..');
var REAL_INDEX = path.join(REPO, 'index.html');
var REAL_SCAN = path.join(REPO, '.github', 'scripts', 'scan.py');

var MUTATIONS = [
    /* ---- the debt figure, which is what test-debt.js exists for ---- */
    {
        id: 'IDX-DEBT-REVERT', file: 'index',
        what: 'revert the totalDebt fix so the printed figure omits lease obligations again',
        from: "var debtVal = (typeof bs.totalDebt === 'number')\n            ? bs.totalDebt",
        to:   "var debtVal = (typeof bs.totalDebt === 'number')\n            ? ((bs.longTermDebt || 0) + (bs.shortTermDebt || 0))"
    },
    {
        id: 'IDX-DEBT-FALLBACK', file: 'index',
        what: 'drop leases from the fallback branch, where no fixture has totalDebt',
        from: "((bs.longTermDebt || 0) + (bs.shortTermDebt || 0) + (bs.capitalLeaseObligations || 0));",
        to:   "((bs.longTermDebt || 0) + (bs.shortTermDebt || 0));"
    },

    /* ---- THE INCIDENT, replayed. A grading rule changed on one surface. ---- */
    {
        id: 'IDX-GRADE-NEGATIVE-PE', file: 'index',
        what: 'grade a negative trailing P/E on the card only -- this is literally the ' +
              'change that made 165 of 2,620 rows render a different letter than the screener',
        from: "if (sector !== 'Real Estate' && fmpPE && fmpPE > 0) {",
        to:   "if (sector !== 'Real Estate' && typeof fmpPE === 'number' && fmpPE !== 0) {"
    },
    {
        id: 'SCAN-GRADE-NEGATIVE-PE', file: 'scan',
        what: 'the same change on the screener only, in the other direction',
        from: "(grade_lower(pe, bench['peRatio']) if pe and pe > 0 else None)",
        to:   "(grade_lower(pe, bench['peRatio']) if pe else None)"
    },

    /* ---- benchmark tables, one side at a time ---- */
    {
        id: 'IDX-BENCHMARK', file: 'index',
        what: "move Technology operatingMargin good from 0.20 to 0.50 in index.html only",
        from: "'Technology': { currentRatio: { good: 1.5, ok: 1.0 }, debtToEquity: { good: 0.5, ok: 1.5 }, assetTurnover: { good: 0.6, ok: 0.3 }, operatingMargin: { good: 0.20, ok: 0.10 }",
        to:   "'Technology': { currentRatio: { good: 1.5, ok: 1.0 }, debtToEquity: { good: 0.5, ok: 1.5 }, assetTurnover: { good: 0.6, ok: 0.3 }, operatingMargin: { good: 0.50, ok: 0.10 }"
    },
    {
        id: 'SCAN-BENCHMARK', file: 'scan',
        what: "the same threshold moved in scan.py only",
        from: "'Technology':              {'currentRatio':{'good':1.5,'ok':1.0},'debtToEquity':{'good':0.5,'ok':1.5},'assetTurnover':{'good':0.6,'ok':0.3},'operatingMargin':{'good':0.20,'ok':0.10}",
        to:   "'Technology':              {'currentRatio':{'good':1.5,'ok':1.0},'debtToEquity':{'good':0.5,'ok':1.5},'assetTurnover':{'good':0.6,'ok':0.3},'operatingMargin':{'good':0.50,'ok':0.10}"
    },

    /* ---- the letter ladder, one side at a time ---- */
    {
        id: 'IDX-LADDER', file: 'index',
        what: 'widen the B band on the card from badCount <= 1 to <= 2, which promotes MSFT',
        from: "else if (badCount <= 1) { overallGrade = 'B';",
        to:   "else if (badCount <= 2) { overallGrade = 'B';"
    },
    {
        id: 'SCAN-LADDER', file: 'scan',
        what: 'widen the same band in scan.py',
        from: "elif bad <= 1: overall = 'B'",
        to:   "elif bad <= 2: overall = 'B'"
    },
    {
        id: 'IDX-LADDER-APLUS', file: 'index',
        what: 'loosen A so six good metrics is enough, which should move nothing here ' +
              'and is included to check the suite is not just pattern-matching on edits',
        from: "else if (goodCount >= 6 && badCount === 0) { overallGrade = 'A';",
        to:   "else if (goodCount >= 3 && badCount === 0) { overallGrade = 'A';",
        expectRed: true,
        note: 'JPM and O both sit at badCount 0 with 1 and 4 good, so this does move letters'
    },

    /* ---- sector suppressions, which change the denominator ---- */
    {
        id: 'IDX-DROP-FS-GUARD', file: 'index',
        what: "stop suppressing FCF Yield for financials on the card",
        from: "if (typeof fcfy === 'number' && sector !== 'Financial Services') {",
        to:   "if (typeof fcfy === 'number') {"
    },
    {
        id: 'SCAN-DROP-FS-GUARD', file: 'scan',
        what: 'stop suppressing FCF Yield and EV/Revenue for financials in the screener',
        from: "skip_ev = sector == 'Financial Services'",
        to:   "skip_ev = False"
    },
    {
        id: 'IDX-DROP-REIT-GUARD', file: 'index',
        what: 'stop suppressing P/E for REITs on the card',
        from: "if (sector !== 'Real Estate' && fmpPE && fmpPE > 0) {",
        to:   "if (fmpPE && fmpPE > 0) {"
    },
    {
        id: 'SCAN-DROP-REIT-GUARD', file: 'scan',
        what: 'stop suppressing P/E for REITs in the screener',
        from: "'peRatio': None if sector == 'Real Estate' else",
        to:   "'peRatio': None if False else"
    },

    /* ---- the negative-equity rule, which is already split between the two ---- */
    {
        /* Was IDX-DROP-ABS, which removed a Math.abs that is now gone.
           Inverted: putting the magnitude back is the regression to guard. */
        id: 'IDX-RESTORE-ABS', file: 'index',
        what: 'store the magnitude of a negative D/E again, hiding the sign from the grader',
        from: "ratios.debtToEquity = deApi < 0 ? {\n                value: deApi,",
        to:   "ratios.debtToEquity = deApi < 0 ? {\n                value: Math.abs(deApi),"
    },
    {
        id: 'IDX-DROP-NEGATIVE-GUARD', file: 'index',
        what: 'drop the card rule that forces a negative D/E to bad, so it grades good on a lower-is-better scale',
        from: "            if (key === 'debtToEquity' && r.value < 0) return 'bad';\n",
        to:   ""
    },
    {
        id: 'IDX-REDUPLICATE-GRADER', file: 'index',
        what: 'give the scoring loop its own copy of the comparison again, so a rule added to g() silently misses the cards',
        from: "            var grade = g(def.key);\n            scores.push(grade);",
        to:   "            var grade;\n            if (def.higherBetter) {\n                grade = ratio.value >= bench.good ? 'good' : ratio.value >= bench.ok ? 'ok' : 'bad';\n            } else {\n                grade = ratio.value <= bench.good ? 'good' : ratio.value <= bench.ok ? 'ok' : 'bad';\n            }\n            scores.push(grade);"
    },
    {
        id: 'SCAN-DROP-NEGATIVE-DE', file: 'scan',
        what: 'drop the screener rule that forces a negative D/E to bad',
        from: "'debtToEquity': 'bad' if (de is not None and de < 0) else grade_lower(de, bench['debtToEquity']),",
        to:   "'debtToEquity': grade_lower(de, bench['debtToEquity']),"
    },

    /* ---- units ---- */
    {
        id: 'IDX-PERCENT-TWICE', file: 'index',
        what: 'store operating margin as a percentage instead of a decimal, which is the ' +
              'classic double-apply: the grade survives it, the rendered card does not',
        from: "value: (typeof rt.operatingProfitMarginTTM === 'number' && rt.operatingProfitMarginTTM !== 0) ? rt.operatingProfitMarginTTM : (opIncome / revenue),",
        to:   "value: (typeof rt.operatingProfitMarginTTM === 'number' && rt.operatingProfitMarginTTM !== 0) ? rt.operatingProfitMarginTTM * 100 : (opIncome / revenue),"
    },
    {
        id: 'IDX-FORMATTER', file: 'index',
        what: 'drop the x100 out of the operating margin formatter, so 47.1% renders as 0.5%',
        from: "format: function(v) { return (v * 100).toFixed(1) + '%'; }, barMax: 0.4, higherBetter: true },\n            { key: 'peRatio'",
        to:   "format: function(v) { return v.toFixed(1) + '%'; }, barMax: 0.4, higherBetter: true },\n            { key: 'peRatio'"
    },

    /* ---- revenue growth, the one ratio both surfaces compute themselves ---- */
    {
        id: 'SCAN-GROWTH-WINDOW', file: 'scan',
        what: 'compare 4 quarters against 3 in the screener instead of 4 against 4',
        from: "prior = sum(q.get('revenue', 0) for q in incomes[4:8])",
        to:   "prior = sum(q.get('revenue', 0) for q in incomes[4:7])"
    },
    {
        id: 'IDX-GROWTH-WINDOW', file: 'index',
        what: 'the same window error on the card',
        from: "var prior4 = isArr.slice(4, 8);",
        to:   "var prior4 = isArr.slice(4, 7);"
    },

    /* ---- the pinned checks. A pin records known-wrong behavior, so the way
           it earns its place is by going red when someone fixes the bug. If
           these two survive, every pin in the suite is decoration. ---- */
        {
        id: 'PIN-FIX-NULL-REVENUE', file: 'scan',
        what: 'actually FIX the JSON-null revenue crash in scan.py, which must turn the ' +
              'MSFT_NULL_REVENUE pin red because the screener stops raising',
        from: "recent = sum(q.get('revenue', 0) for q in incomes[:4])",
        to:   "recent = sum(q.get('revenue') or 0 for q in incomes[:4])"
    },

    {
        id: 'PIN-FIX-FORWARD-PE-CURRENCY', file: 'index',
        what: 'actually FIX the forward P/E currency hole, which must turn the NVO pin red ' +
              'because the line disappears on a DKK reporter',
        from: "if (price && forwardEps && forwardEps > 0 && ratios.peRatio) {",
        to:   "if (price && forwardEps && forwardEps > 0 && ratios.peRatio && cur === 'USD') {"
    },
    {
        id: 'IDX-FORWARD-EPS-ROW', file: 'index',
        what: 'walk the analyst estimates forwards instead of backwards, so the card picks ' +
              'the furthest-out year rather than the nearest future one',
        from: "for (var ei = estimates.length - 1; ei >= 0; ei--) {",
        to:   "for (var ei = 0; ei < estimates.length; ei++) {"
    },

    /* ---- and finally: does the harness itself fail loudly when the code moves? ---- */
    {
        id: 'META-EXTRACTION-MOVED', file: 'index',
        what: 'rename processData, to confirm the extractor throws instead of quietly ' +
              'falling back to a stale copy of the logic',
        from: "function processData(bs, ttm, prof, ticker, ratiosTtm, forwardEps, keyMetrics) {",
        to:   "function processDataRenamed(bs, ttm, prof, ticker, ratiosTtm, forwardEps, keyMetrics) {"
    }
];

/* ------------------------------------------------------------------ */

var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'intrinsics-mutate-'));
var baseIndex = fs.readFileSync(REAL_INDEX, 'utf8');
var baseScan = fs.readFileSync(REAL_SCAN, 'utf8');

function runSuite(env) {
    var r = child.spawnSync(process.execPath, [path.join(TEST_DIR, 'run.js'), '--quiet'], {
        encoding: 'utf8', env: Object.assign({}, process.env, env),
        maxBuffer: 64 * 1024 * 1024
    });
    return { status: r.status === null ? 1 : r.status, out: (r.stdout || '') + (r.stderr || '') };
}

/* Individual check failures, not run.js's per-file summary lines -- those are
   bare filenames and say nothing about what broke. */
function failingChecks(out) {
    return out.split('\n')
        .filter(function (l) { return /^\s+FAIL\s/.test(l); })
        .map(function (l) { return l.trim().replace(/^FAIL\s+/, ''); })
        .filter(function (l) { return !/^[\w.-]+\.js$/.test(l); });
}

console.log('Mutation testing the suite. Nothing below edits the real repo files;');
console.log('mutants live in ' + tmp);
console.log('');

/* The suite must be green before any of this means anything. */
var clean = runSuite({});
if (clean.status !== 0) {
    console.error('The suite is already failing on unmutated code. Fix that first.');
    console.error(clean.out);
    process.exit(1);
}
console.log('baseline: suite is green on unmutated code, exit 0');
console.log('');

var survived = [], missing = [], killed = [];

MUTATIONS.forEach(function (m, i) {
    var base = m.file === 'index' ? baseIndex : baseScan;
    var count = base.split(m.from).length - 1;
    var label = '[' + (i + 1) + '/' + MUTATIONS.length + '] ' + m.id;

    if (count === 0) {
        console.log('  ???   ' + label + ' -- TARGET NOT FOUND');
        console.log('          ' + m.what);
        console.log('          The source moved. This mutation is no longer testing anything; re-aim it.');
        missing.push(m.id);
        return;
    }

    var mutantIndex = path.join(tmp, m.id + '-index.html');
    var mutantScan = path.join(tmp, m.id + '-scan.py');
    fs.writeFileSync(mutantIndex, m.file === 'index' ? base.split(m.from).join(m.to) : baseIndex);
    fs.writeFileSync(mutantScan, m.file === 'scan' ? base.split(m.from).join(m.to) : baseScan);

    var r = runSuite({
        INTRINSICS_INDEX_HTML: mutantIndex,
        INTRINSICS_SCAN_PY: mutantScan
    });

    if (r.status === 0) {
        var printed = failingChecks(r.out);
        console.log('  LIVED ' + label + ' -- the suite stayed green');
        console.log('          ' + m.what);
        if (printed.length) {
            /* This is the sibling project's bug exactly: red output, green
               exit, CI none the wiser. It is a worse result than no coverage. */
            console.log('          WORSE: ' + printed.length + ' checks printed FAIL and the run still ' +
                        'exited 0. A test file is not setting process.exitCode.');
            console.log('          first: ' + printed[0]);
        } else {
            console.log('          Nothing here checks this. Add a check or delete the claim.');
        }
        survived.push(m);
    } else {
        var f = failingChecks(r.out);
        console.log('  killed ' + label + ' (' + f.length + ' checks went red, exit ' + r.status + ')');
        console.log('          ' + m.what);
        if (f.length) console.log('          first: ' + f[0]);
        else console.log('          the run threw rather than failing a check, which is also red');
        killed.push({ id: m.id, red: f.length, first: f[0] || '(threw)' });
    }
});

console.log('');
console.log('='.repeat(68));
console.log('killed ' + killed.length + ' / ' + MUTATIONS.length + ' mutations');
if (missing.length) console.log('targets not found: ' + missing.join(', '));
if (survived.length) console.log('SURVIVED: ' + survived.map(function (m) { return m.id; }).join(', '));
console.log('='.repeat(68));

if (survived.length || missing.length) {
    console.log('A surviving mutation means the suite claims coverage it does not have.');
    process.exit(1);
}
console.log('Every mutation was caught. The suite can fail.');
process.exit(0);
