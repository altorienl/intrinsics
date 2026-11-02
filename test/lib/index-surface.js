/* Runs index.html's grading path in Node, offline, against a fixture.
 *
 * WHY this is built by cutting source out of index.html instead of by
 * reimplementing it: the 165-row desync happened because a grading rule was
 * changed on one surface and the suite was comparing copies of the benchmark
 * tables rather than running the code. A test that holds its own copy of the
 * logic is a test of the copy. Everything that decides a letter here --
 * the benchmark table, the sector mapping, the ratio gates in processData,
 * the per-ratio good/ok/bad comparison, and the A+/A/B+/B/C/D ladder -- is
 * the literal text of index.html, extracted by anchored regex and evaluated.
 * If any of those blocks is edited or moved, the extraction throws rather
 * than silently falling back to a stale copy.
 *
 * WHAT THIS PROVES: given the six FMP payloads, the shipped code assigns this
 * letter. The arithmetic, the gating and the thresholds are real.
 *
 * WHAT IT DOES NOT PROVE: that a browser renders that letter. There is no DOM,
 * no CSS and no fetch here. The network layer of analyze() -- the Promise.all,
 * the 'Premium' sniff, the JSON.parse fallbacks, the Array.isArray unwrapping --
 * is reproduced in fromPayloads() below rather than extracted, because it is
 * interleaved with awaits that cannot run offline. A bug in that layer is out
 * of this test's reach; a bug in anything downstream of it is not.
 */
'use strict';
var fs = require('fs');
var path = require('path');

/* Overridable so the mutation harness can point the whole suite at a mutated
   copy in a temp directory instead of editing the real file. */
var INDEX_HTML = process.env.INTRINSICS_INDEX_HTML ||
    path.join(__dirname, '..', '..', 'index.html');

/* Anchored on text that cannot change without the grading changing too, so a
   refactor fails loudly here instead of quietly testing nothing. */
var REGIONS = {
    fmt:            /\n    function fmt\(n\) \{[\s\S]*?\n    \}\n/,
    benchmarks:     /\n    var SECTOR_BENCHMARKS = \{[\s\S]*?\n    \};\n/,
    sectorMap:      /\n    function fmpSectorMap\(sector\) \{[\s\S]*?\n    \}\n/,
    ttmAssembly:    /var recent4 = isArr\.slice\(0, 4\);[\s\S]*?ttm\.priorRevenue = priorRev;\s*\n\s*\}\s*\n\s*\}/,
    forwardEps:     /var forwardEps = null;[\s\S]*?\n            \}\n/,
    processData:    /\n    function processData\(bs, ttm, prof, ticker, ratiosTtm, forwardEps, keyMetrics\) \{[\s\S]*?\n        renderQuickPicks\(ticker, sector\);\n    \}\n/,
    defs:           /\n        var defs = \[\n[\s\S]*?\n        \];\n/,
    /* gradeOf() is the single good/ok/bad rule. The scoring loop used to
       carry an identical copy of it and was extracted alone; when the
       negative-equity rule landed in the rule that copy kept the old
       behaviour, so the loop is a call now and this region has to travel
       with it.

       It is matched at module indent, not inside buildOneLiner. It briefly
       lived as a closure there while the scoring loop called it from
       renderResults -- a sibling scope that cannot see it -- and every
       ticker threw "g is not defined" in the browser while this suite
       stayed green, because the harness below evaluates the region in a
       flat scope where the name always resolves. See test-scope.js, which
       runs the real file instead. */
    grader:         /\n    function gradeOf\(key, ratios, defs, benchmarks\) \{[\s\S]*?\n    \}\n/,
    scoreAndLadder: /\n        var scores = \[\];\n[\s\S]*?Proceed with caution\.'; \}\n/
};

function extract(src, name) {
    var m = REGIONS[name].exec(src);
    if (!m) {
        throw new Error(
            'index-surface.js could not find the "' + name + '" block in ' + INDEX_HTML + '.\n' +
            '  The block was renamed, reindented or restructured. Re-anchor REGIONS.' + name +
            ' in test/lib/index-surface.js.\n' +
            '  Do NOT work around this by pasting a copy of the logic into the test --\n' +
            '  that is the exact failure that let the 165-row desync ship.');
    }
    return m[0];
}

function build() {
    var src = fs.readFileSync(INDEX_HTML, 'utf8');
    var p = {};
    Object.keys(REGIONS).forEach(function (k) { p[k] = extract(src, k); });

    /* The grading loop writes into #ratioGrid and calls renderCard; neither
       affects the letter, so both are stubbed. renderResults is replaced by a
       capture, which is how the test reaches the ratios and benchmarks
       processData chose -- that is where every gating decision was made. */
    var body = [
        'var document = { getElementById: function () { return { innerHTML: "" }; } };',
        'function renderCard() { return ""; }',
        'function renderQuickPicks() {}',
        'var CAPTURED = null;',
        'function renderResults(ticker, prof, sector, benchmarks, ratios, currentPrice, filingInfo) {',
        '    CAPTURED = { ticker: ticker, sector: sector, benchmarks: benchmarks, ratios: ratios };',
        '}',
        p.fmt,
        p.benchmarks,
        p.sectorMap,
        p.processData,
        'return function (payloads) {',
        '    var isArr = payloads.incomeStatement;',
        '    var estimates = payloads.estimates;',
        '    ' + p.ttmAssembly,
        '    ' + p.forwardEps,
        '    CAPTURED = null;',
        '    processData(payloads.balanceSheet, ttm, payloads.profile, payloads.ticker,',
        '                payloads.ratiosTtm, forwardEps, payloads.keyMetrics);',
        '    if (!CAPTURED) throw new Error("processData never reached renderResults");',
        '    var ticker = CAPTURED.ticker, sector = CAPTURED.sector;',
        '    var benchmarks = CAPTURED.benchmarks, ratios = CAPTURED.ratios;',
        '    ' + p.defs,
        '    ' + p.grader,
        '    ' + p.scoreAndLadder,
        /* scores[] arrives in defs order, for present ratios only, under the
           same presence test the loop above just applied, so zipping it back
           onto the keys is bookkeeping and not a second implementation of the
           good/ok/bad comparison. */
        '    var byRatio = {}, si = 0;',
        '    defs.forEach(function (def) {',
        '        byRatio[def.key] = ratios[def.key] ? scores[si++] : null;',
        '    });',
        '    if (si !== scores.length) throw new Error("scores did not zip back onto defs");',
        /* def.format is the shipped formatter. Calling it is how the suite
           checks that a percentage is applied exactly once: the stored value
           stays a decimal and only the formatter multiplies by 100, so a
           double-apply shows up here as "4710.4%" rather than "47.1%". */
        '    var values = {}, components = {}, formatted = {};',
        '    defs.forEach(function (def) {',
        '        var r = ratios[def.key];',
        '        values[def.key] = r ? r.value : null;',
        '        components[def.key] = r ? r.components : null;',
        '        formatted[def.key] = r ? def.format(r.value) : null;',
        '    });',
        '    return {',
        '        ticker: ticker, sector: sector, letter: overallGrade,',
        '        good: goodCount, bad: badCount, total: total,',
        '        ok: total - goodCount - badCount,',
        '        ratioGrades: byRatio, values: values, components: components,',
        '        formatted: formatted, benchmarks: benchmarks,',
        '        forwardPE: ratios.peRatio ? (ratios.peRatio.forwardPE || null) : null,',
        '        summary: overallText',
        '    };',
        '};'
    ].join('\n');

    /* SECTOR_BENCHMARKS is handed back alongside the runner so a test can
       compare the table against scan.py's copy without reparsing the HTML. */
    return {
        run: new Function(body)(),
        benchmarks: new Function(p.benchmarks + '\nreturn SECTOR_BENCHMARKS;')()
    };
}

var built = build();
var run = built.run;

/* Mirrors what analyze() does to the six raw responses before processData sees
   them: take [0] of each single-row payload, keep the income statement as an
   array, and tolerate a missing endpoint as {} or []. A dropped endpoint is a
   real production state -- the worker answers a rate limit with valid
   non-array JSON -- so the suite has to be able to express it. */
function fromPayloads(ticker, raw) {
    function one(v) { return (Array.isArray(v) && v.length) ? v[0] : {}; }
    function many(v) { return Array.isArray(v) ? v : []; }
    return run({
        ticker: ticker,
        balanceSheet: one(raw['balance-sheet-statement']),
        incomeStatement: many(raw['income-statement']),
        profile: one(raw['profile']),
        ratiosTtm: one(raw['ratios-ttm']),
        estimates: many(raw['analyst-estimates']),
        keyMetrics: one(raw['key-metrics-ttm'])
    });
}

module.exports = {
    grade: fromPayloads,
    benchmarks: built.benchmarks,
    indexHtmlPath: INDEX_HTML
};
