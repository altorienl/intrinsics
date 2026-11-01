/* The two surfaces must award the same letter to the same company.
 *
 * This is the test the repo did not have. A screener row is click-through to
 * the card, so when index.html and scan.py disagree a user clicks a "B" and
 * lands on a "C". That happened: a negative trailing P/E was regraded in
 * index.html only, and 165 of 2,620 rows changed letter on the card without
 * changing on the screener. The suite at the time compared the two copies of
 * the sector benchmark table, found them identical, and passed -- because the
 * tables were identical. The rule that moved was not in a table.
 *
 * So this file compares letters, not tables. For each fixture it runs the
 * real grading code of both surfaces and asserts three things, loosest first:
 *   1. the letter, which is the thing a user can see disagree;
 *   2. the good/ok/bad/total counts, because two different score sheets can
 *      land on the same letter by luck -- MSFT_NO_INCOME does exactly that;
 *   3. the eight per-ratio grades, which localizes any break to one ratio.
 *
 * HOW THE TWO LANGUAGES ARE BRIDGED, and what that is worth:
 *   - The JavaScript side cuts the benchmark table, the sector map, the ratio
 *     gates in processData, the per-ratio comparison and the letter ladder out
 *     of index.html as source text and evaluates them. See lib/index-surface.js.
 *   - The Python side imports .github/scripts/scan.py and calls the real
 *     grade_stock. Only rate_limited_fetch is replaced. See lib/scan-surface.py.
 *   - The two meet as JSON over a subprocess pipe. The same fixture object is
 *     fed to both, so neither side can be fed a convenient variant.
 *
 * WHAT THE BRIDGE PROVES: both bodies of grading logic, as shipped, assign the
 * same letter to the same inputs. If either is edited alone, this goes red.
 *
 * WHAT IT DOES NOT PROVE:
 *   - That a browser renders the letter the JS computed. There is no DOM here.
 *   - That the live fetch layer in analyze() hands processData the same objects
 *     this test hands it. That layer is awaits and Promise.all; it is
 *     reproduced in index-surface.js, not extracted, and is the one seam where
 *     a copy still exists.
 *   - That scan.py's discovery and eligibility phases pick the right tickers.
 *     Everything upstream of grade_stock is untested here.
 *   - Agreement on any company whose data does not resemble one of these
 *     fifteen cases.
 */
'use strict';
var H = require('./lib/harness.js');
var I = require('./lib/index-surface.js');
var D = require('./lib/derived.js');

var F = H.loadFixtures();
var s = new H.Suite('test-cross-surface.js  -- the card and the screener must agree');

var RATIO_KEYS = ['currentRatio', 'debtToEquity', 'assetTurnover', 'operatingMargin',
                  'peRatio', 'revenueGrowth', 'fcfYield', 'evToSales'];

/* Everything goes to python3 in one batch, so a broken bridge fails once and
   loudly instead of eight times and confusingly. */
var derived = D.build(F);
var batch = {};
Object.keys(F).forEach(function (t) { batch[t] = F[t]; });
Object.keys(derived).forEach(function (k) { batch[k] = derived[k].payloads; });

var py = H.gradeWithScanPy(batch);
console.log('  (scan.py under test: ' + py.scanPy + ')');
console.log('  (index.html under test: ' + I.indexHtmlPath + ')');

function jsGrade(name) {
    try { return { ok: true, r: I.grade(name, batch[name]) }; }
    catch (e) { return { ok: false, error: e.message }; }
}

function pyGrade(name) {
    var g = py.grades[name];
    if (!g) return { ok: false, error: 'scan-surface.py returned nothing for ' + name };
    return g.ok ? { ok: true, r: g.result } : { ok: false, error: g.error };
}

function counts(o) { return o.good + '/' + o.ok + '/' + o.bad + ' of ' + o.total; }

/* ---------------------------------------------------------------- *
 * 1. The eight real tickers. These agree today and must keep doing. *
 * ---------------------------------------------------------------- */

Object.keys(F).forEach(function (t) {
    var j = jsGrade(t), p = pyGrade(t);
    if (!s.check(t + ': both surfaces produce a grade', j.ok && p.ok,
                 (j.ok ? '' : 'card: ' + j.error) + (p.ok ? '' : ' screener: ' + p.error))) return;

    s.check(t + ': the card letter and the screener letter are the same',
            j.r.letter === p.r.grade,
            'card ' + j.r.letter + ', screener ' + p.r.grade +
            '  -- a user clicking this row would land on a different grade');

    s.check(t + ': ...and they got there on the same score sheet',
            j.r.good === p.r.scores.good && j.r.bad === p.r.scores.bad &&
            j.r.total === p.r.scores.total,
            'card ' + counts(j.r) + ', screener ' + counts(p.r.scores));

    var differ = RATIO_KEYS.filter(function (k) {
        return (j.r.ratioGrades[k] || null) !== (p.r.ratioGrades[k] || null);
    });
    s.check(t + ': ...and on all eight per-ratio grades', differ.length === 0,
            differ.map(function (k) {
                return k + ' card=' + j.r.ratioGrades[k] + ' screener=' + p.r.ratioGrades[k];
            }).join('; '));
});

/* ------------------------------------------------------------------ *
 * 2. The incident itself. A negative trailing P/E is dropped by BOTH  *
 *    surfaces today. The 165-row desync was created by changing that  *
 *    on one side only, so this is the specific regression guard.      *
 * ------------------------------------------------------------------ */

['RIVN', 'ACHR'].forEach(function (t) {
    var j = jsGrade(t), p = pyGrade(t);
    var pe = F[t]['ratios-ttm'][0].priceToEarningsRatioTTM;
    s.check(t + ': the fixture really does carry a negative trailing P/E',
            typeof pe === 'number' && pe < 0, 'got ' + pe);
    s.check(t + ': the card drops negative P/E from the denominator',
            j.r.ratioGrades.peRatio === null, 'card graded it ' + j.r.ratioGrades.peRatio);
    s.check(t + ': the screener drops it too -- changing one without the other is the 165-row bug',
            p.r.ratioGrades.peRatio === null, 'screener graded it ' + p.r.ratioGrades.peRatio);
    s.check(t + ': so the denominator matches on both sides',
            j.r.total === p.r.scores.total,
            'card out of ' + j.r.total + ', screener out of ' + p.r.scores.total);
});

/* ------------------------------------------------------------- *
 * 3. Sector suppressions, which change the denominator and so    *
 *    the band. Both surfaces must suppress the same ones.        *
 * ------------------------------------------------------------- */

var jpm = jsGrade('JPM'), jpmPy = pyGrade('JPM');
s.check('JPM: a financial has FCF Yield and EV/Revenue suppressed on the card',
        jpm.r.ratioGrades.fcfYield === null && jpm.r.ratioGrades.evToSales === null);
s.check('JPM: ...and on the screener, so both grade out of 6 and not 8',
        jpmPy.r.ratioGrades.fcfYield === null && jpmPy.r.ratioGrades.evToSales === null &&
        jpm.r.total === 6 && jpmPy.r.scores.total === 6,
        'card ' + jpm.r.total + ', screener ' + jpmPy.r.scores.total);

var o = jsGrade('O'), oPy = pyGrade('O');
s.check('O: a REIT has P/E suppressed on the card', o.r.ratioGrades.peRatio === null);
s.check('O: ...and on the screener, both out of 7',
        oPy.r.ratioGrades.peRatio === null && o.r.total === 7 && oPy.r.scores.total === 7,
        'card ' + o.r.total + ', screener ' + oPy.r.scores.total);
s.check('O: the REIT suppression is a rule, not missing data -- FMP did send a P/E',
        typeof F.O['ratios-ttm'][0].priceToEarningsRatioTTM === 'number' &&
        F.O['ratios-ttm'][0].priceToEarningsRatioTTM > 0,
        'fixture P/E is ' + F.O['ratios-ttm'][0].priceToEarningsRatioTTM);

/* --------------------------------------------------------------------- *
 * 4. Known live divergences, pinned.                                     *
 *                                                                        *
 *    These are real defects, confirmed by running both surfaces, and     *
 *    none of them is in scope for this change. Pinning the exact current *
 *    behavior keeps the suite green today and turns it red the instant   *
 *    anyone touches the rule -- including the agent who fixes it, who    *
 *    then gets told in the failure message what to change here. A skip   *
 *    would be the thing the brief calls a test that cannot fail.         *
 * --------------------------------------------------------------------- */

console.log('');
console.log('  Four divergences below are PINNED, not passing: the card and the');
console.log('  screener disagree today and this suite records exactly how.');

function pinDivergence(name, cardLetter, screenerLetter, whenFixed) {
    var j = jsGrade(name), p = pyGrade(name);
    var got = (j.ok ? j.r.letter : 'THREW') + ' vs ' + (p.ok ? p.r.grade : 'RAISED');
    s.pinned(name + ': card says ' + cardLetter + ', screener says ' + screenerLetter,
             (j.ok ? j.r.letter : 'THREW') === cardLetter &&
             (p.ok ? p.r.grade : 'RAISED') === screenerLetter,
             whenFixed);
    return got;
}

/* Was a pinned divergence; the fix landed, so it is a plain agreement check
   now, exactly as the pin's own instructions said to do. index.html forces
   bad on a negative ratio, which is what scan.py always did, so the two
   surfaces give this company the same letter. */
(function () {
    var j = jsGrade('NEG_DE_SMALL'), p2 = pyGrade('NEG_DE_SMALL');
    var card = j.ok ? j.r.letter : 'THREW';
    var screener = p2.ok ? p2.r.grade : 'RAISED';
    s.check('NEG_DE_SMALL: a small negative D/E gets one letter, not two',
            card === screener, 'card ' + card + ', screener ' + screener);
    s.check('NEG_DE_SMALL: and both call the leverage bad',
            (j.ok && j.r.ratioGrades.debtToEquity === 'bad'),
            j.ok ? String(j.r.ratioGrades.debtToEquity) : 'threw');
}());

pinDivergence('MSFT_NO_RATIOS', 'C', '?',
    'index.html falls back to balance-sheet arithmetic when ratios-ttm is ' +
    'missing and scan.py has no fallback, so the card grades 8 ratios and the ' +
    'screener grades 3 and gives up. Give scan.py the same fallbacks, or make ' +
    'index.html refuse to grade on a failed call. Both files, one commit.');

pinDivergence('JPM_SECTOR_VARIANT', 'B', 'D',
    'index.html substring-maps the sector and scan.py looks it up exactly. ' +
    'Port fmpSectorMap into scan.py and route the Financial Services and Real ' +
    'Estate suppressions through it. Both files, one commit.');

pinDivergence('MSFT_NULL_REVENUE', 'D', 'RAISED',
    'scan.py does q.get(\'revenue\', 0), whose default never fires on a present ' +
    'JSON null, so it raises and the ticker silently vanishes from grades.json ' +
    'while the card still renders. Change it to q.get(\'revenue\') or 0.');

/* MSFT_NO_INCOME is the case that proves comparing letters is not enough on
   its own: both surfaces say C, and they say it off different score sheets.
   Pinned on the counts rather than the letter. */
var ni = jsGrade('MSFT_NO_INCOME'), niPy = pyGrade('MSFT_NO_INCOME');
s.check('MSFT_NO_INCOME: the letters agree here, which is the trap',
        ni.r.letter === niPy.r.grade, 'card ' + ni.r.letter + ', screener ' + niPy.r.grade);
s.pinned('MSFT_NO_INCOME: ...but off different score sheets -- card ' +
         counts(ni.r) + ', screener ' + counts(niPy.r.scores),
         ni.r.total === 5 && niPy.r.scores.total === 7 &&
         ni.r.good === 1 && niPy.r.scores.good === 2,
         'index.html gates assetTurnover and operatingMargin on TTM revenue ' +
         'existing and scan.py does not. Align the gates in both files, then ' +
         'fold this into the plain agreement check above.');

/* --------------------------------------------------------------------- *
 * 5. Provenance. The offline scan.py bridge has to reproduce what the     *
 *    nightly job really wrote, or none of the above means much: a bridge  *
 *    that quietly grades differently from production would make every     *
 *    agreement above agreement about nothing.                             *
 *                                                                         *
 *    READ THIS BEFORE "FIXING" A FAILURE HERE. The snapshot is grades.json *
 *    as published on a specific date. If you deliberately changed a        *
 *    grading rule, these SHOULD go red -- that is the suite noticing the   *
 *    screener's output moved. Re-snapshot from grades.json after the next  *
 *    nightly run; do not loosen the comparison.                            *
 * --------------------------------------------------------------------- */

var fixtureFile = require(H.TEST_DIR + '/fixtures/surfaces.json');
var prod = fixtureFile.productionGrades;
s.check('the fixture carries a production snapshot to check the bridge against',
        !!prod && Object.keys(prod).length === Object.keys(F).length);

Object.keys(prod).forEach(function (t) {
    var p = pyGrade(t);
    var want = prod[t];
    s.check(t + ': the offline scan.py bridge reproduces the published grades.json row',
            p.ok && p.r.grade === want.grade &&
            p.r.scores.good === want.scores.good &&
            p.r.scores.bad === want.scores.bad &&
            p.r.scores.total === want.scores.total,
            (p.ok ? ('bridge ' + p.r.grade + ' ' + counts(p.r.scores) +
                     ', published ' + want.grade + ' ' + counts(want.scores))
                  : p.error) +
            '\n          published ' + fixtureFile.productionGradesCapturedAt +
            '. If you changed a grading rule on purpose, re-snapshot' +
            ' productionGrades from grades.json after the next nightly run.');
});

process.exitCode = s.done() ? 1 : 0;
