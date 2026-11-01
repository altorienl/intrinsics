/* The eight ratios, through index.html's real grading code, offline.
 *
 * Expected letters and per-ratio grades were worked out by hand from the
 * fixture numbers against the sector benchmark table, and only afterwards
 * compared with the grades.json the nightly job published the same day. All
 * eight tickers matched on the letter, the counts and every ratio, so these
 * are the shipped system's own answers rather than a restatement of the
 * thresholds. The derivation for each is in EXPECTED below.
 *
 * Nothing here retunes a benchmark. Thresholds are read, never asserted to be
 * correct values -- that call is the owner's and was ruled out of scope.
 */
'use strict';
var H = require('./lib/harness.js');
var I = require('./lib/index-surface.js');
var D = require('./lib/derived.js');

var F = H.loadFixtures();
var s = new H.Suite('test-ratios.js  -- the eight ratios on the index.html path');

/* good / ok / bad / total, then the eight grades in card order. The "why"
   line names the one number that decides the band, so a failure here can be
   read without recomputing the whole sheet. */
var EXPECTED = {
    MSFT: { letter: 'C', g: 2, o: 4, b: 2, t: 8,
        why: 'Technology: FCF Yield 1.5% is under the 2% ok floor and EV/Rev 11.5x is over the 10x ok ceiling, so two bads put it in C',
        grades: { currentRatio: 'ok', debtToEquity: 'good', assetTurnover: 'ok', operatingMargin: 'good',
                  peRatio: 'ok', revenueGrowth: 'ok', fcfYield: 'bad', evToSales: 'bad' } },
    AAPL: { letter: 'B', g: 2, o: 5, b: 1, t: 8,
        why: 'Technology: same table as MSFT, but FCF Yield 2.7% clears the 2% floor, so one bad instead of two',
        grades: { currentRatio: 'ok', debtToEquity: 'ok', assetTurnover: 'good', operatingMargin: 'good',
                  peRatio: 'ok', revenueGrowth: 'ok', fcfYield: 'ok', evToSales: 'bad' } },
    JPM: { letter: 'B', g: 1, o: 5, b: 0, t: 6,
        why: 'Financial Services: FCF Yield and EV/Rev suppressed, so 6 ratios; nothing bad, so the badCount<=1 branch gives B on a single good metric',
        grades: { currentRatio: 'ok', debtToEquity: 'ok', assetTurnover: 'ok', operatingMargin: 'ok',
                  peRatio: 'good', revenueGrowth: 'ok', fcfYield: null, evToSales: null } },
    RIVN: { letter: 'D', g: 1, o: 2, b: 4, t: 7,
        why: 'Consumer Cyclical loss-maker: trailing P/E -5.4 is dropped entirely, and four bads clear the C ceiling',
        grades: { currentRatio: 'good', debtToEquity: 'ok', assetTurnover: 'bad', operatingMargin: 'bad',
                  peRatio: null, revenueGrowth: 'ok', fcfYield: 'bad', evToSales: 'bad' } },
    SBUX: { letter: 'D', g: 1, o: 2, b: 5, t: 8,
        why: 'Consumer Cyclical with negative equity: D/E -2.92 is negative, so both surfaces force bad -- this used to pass for the wrong reason, because the magnitude also cleared the 2.0 ceiling',
        grades: { currentRatio: 'bad', debtToEquity: 'bad', assetTurnover: 'good', operatingMargin: 'ok',
                  peRatio: 'bad', revenueGrowth: 'bad', fcfYield: 'ok', evToSales: 'bad' } },
    O: { letter: 'B', g: 4, o: 3, b: 0, t: 7,
        why: 'Real Estate: P/E suppressed by sector, nothing bad, but 4 good is short of the 5 needed for B+',
        grades: { currentRatio: 'good', debtToEquity: 'good', assetTurnover: 'ok', operatingMargin: 'ok',
                  peRatio: null, revenueGrowth: 'good', fcfYield: 'good', evToSales: 'ok' } },
    NVO: { letter: 'C', g: 4, o: 2, b: 2, t: 8,
        why: 'Healthcare: current ratio 0.87 under the 1.0 floor and revenue growth 5.6% under the 7% floor make two bads',
        grades: { currentRatio: 'bad', debtToEquity: 'ok', assetTurnover: 'good', operatingMargin: 'good',
                  peRatio: 'good', revenueGrowth: 'bad', fcfYield: 'ok', evToSales: 'good' } },
    ACHR: { letter: 'D', g: 2, o: 0, b: 4, t: 6,
        why: 'Industrials pre-revenue: P/E negative and revenue growth undefined on a zero prior year, so 6 ratios, four of them bad',
        grades: { currentRatio: 'good', debtToEquity: 'good', assetTurnover: 'bad', operatingMargin: 'bad',
                  peRatio: null, revenueGrowth: null, fcfYield: 'bad', evToSales: 'bad' } }
};

var RATIO_KEYS = ['currentRatio', 'debtToEquity', 'assetTurnover', 'operatingMargin',
                  'peRatio', 'revenueGrowth', 'fcfYield', 'evToSales'];

var R = {};
Object.keys(F).forEach(function (t) { R[t] = I.grade(t, F[t]); });

/* ---------------------------------------------------- *
 * 1. Letters and score sheets across the six archetypes *
 * ---------------------------------------------------- */

Object.keys(EXPECTED).forEach(function (t) {
    var e = EXPECTED[t], r = R[t];
    s.check(t + ': grades ' + e.letter + ' -- ' + e.why, r.letter === e.letter,
            'got ' + r.letter);
    s.check(t + ': ' + e.g + ' good / ' + e.o + ' ok / ' + e.b + ' bad of ' + e.t,
            r.good === e.g && r.ok === e.o && r.bad === e.b && r.total === e.t,
            'got ' + r.good + '/' + r.ok + '/' + r.bad + ' of ' + r.total);
    var wrong = RATIO_KEYS.filter(function (k) { return r.ratioGrades[k] !== e.grades[k]; });
    s.check(t + ': all eight per-ratio grades', wrong.length === 0,
            wrong.map(function (k) {
                return k + ' expected ' + e.grades[k] + ', got ' + r.ratioGrades[k];
            }).join('; '));
});

/* ------------------------------------------------------------------ *
 * 2. Every displayed value traces to the FMP field it claims to be.   *
 *    Six of the eight ratios are taken straight from the API while    *
 *    the card prints components the app computed itself, so an exact  *
 *    identity check here is what stops the two pipelines drifting.    *
 * ------------------------------------------------------------------ */

var SOURCED_FROM = {
    currentRatio:    ['ratios-ttm', 'currentRatioTTM'],
    debtToEquity:    ['ratios-ttm', 'debtToEquityRatioTTM'],
    assetTurnover:   ['ratios-ttm', 'assetTurnoverTTM'],
    operatingMargin: ['ratios-ttm', 'operatingProfitMarginTTM'],
    peRatio:         ['ratios-ttm', 'priceToEarningsRatioTTM'],
    fcfYield:        ['key-metrics-ttm', 'freeCashFlowYieldTTM'],
    evToSales:       ['key-metrics-ttm', 'evToSalesTTM']
};

Object.keys(F).forEach(function (t) {
    var r = R[t], mismatched = [];
    Object.keys(SOURCED_FROM).forEach(function (key) {
        if (r.values[key] === null) return;
        var src = SOURCED_FROM[key];
        var api = F[t][src[0]][0][src[1]];
        /* No exception any more. A negative D/E used to be stored as its
           absolute value, which is what this line allowed for; the sign is
           kept now, so every graded value is simply the field it claims. */
        var want = api;
        if (r.values[key] !== want) mismatched.push(key + ': card ' + r.values[key] + ' vs ' + src[1] + ' ' + api);
    });
    s.check(t + ': every graded value is bit-for-bit the FMP field it claims',
            mismatched.length === 0, mismatched.join('; '));
});

/* Revenue growth is the one ratio index.html computes itself, from the eight
   quarterly statements, so it gets its own identity rather than a lookup. */
Object.keys(F).forEach(function (t) {
    var rows = F[t]['income-statement'];
    var recent = rows.slice(0, 4).reduce(function (a, q) { return a + (q.revenue || 0); }, 0);
    var prior = rows.slice(4, 8).reduce(function (a, q) { return a + (q.revenue || 0); }, 0);
    if (prior <= 0) {
        s.check(t + ': zero prior-year revenue leaves Revenue Growth ungraded',
                R[t].values.revenueGrowth === null, 'got ' + R[t].values.revenueGrowth);
        return;
    }
    s.check(t + ': Revenue Growth is (recent TTM - prior TTM) / prior TTM, at full precision',
            R[t].values.revenueGrowth === (recent - prior) / prior,
            'card ' + R[t].values.revenueGrowth + ' vs ' + (recent - prior) / prior);
});

/* ------------------------------------------------------------------- *
 * 3. Units. Three ratios are decimals that the card renders as percent *
 *    and five are multiples rendered with an x. The failure this is    *
 *    guarding against is a percentage applied twice or not at all,     *
 *    which would move a grade without changing a threshold.            *
 * ------------------------------------------------------------------- */

var PERCENT_RATIOS = ['operatingMargin', 'revenueGrowth', 'fcfYield'];
var MULTIPLE_RATIOS = ['currentRatio', 'debtToEquity', 'assetTurnover', 'peRatio', 'evToSales'];

s.check('the three percentage ratios are stored as decimals, so MSFT op margin is 0.47 and not 47',
        R.MSFT.values.operatingMargin > 0 && R.MSFT.values.operatingMargin < 1 &&
        R.MSFT.values.revenueGrowth > 0 && R.MSFT.values.revenueGrowth < 1,
        'om ' + R.MSFT.values.operatingMargin + ', rg ' + R.MSFT.values.revenueGrowth);

s.check('...and their benchmarks are decimals too, so the comparison is like-for-like',
        PERCENT_RATIOS.every(function (k) {
            var b = R.MSFT.benchmarks[k];
            return b && b.good < 1 && b.ok < 1;
        }),
        JSON.stringify(PERCENT_RATIOS.map(function (k) { return R.MSFT.benchmarks[k]; })));

/* The shipped formatter is called here, not reimplemented, so a double
   multiply renders 4710.4% and this goes red. */
var FORMATTED = {
    MSFT: { currentRatio: '1.22x', debtToEquity: '0.28x', assetTurnover: '0.44x',
            operatingMargin: '47.1%', peRatio: '27.2x', revenueGrowth: '17.9%',
            fcfYield: '1.5%', evToSales: '11.5x' }
};
Object.keys(FORMATTED.MSFT).forEach(function (k) {
    s.check('MSFT ' + k + ' renders as ' + FORMATTED.MSFT[k] +
            ' -- the percent is applied once, in the formatter, never in the value',
            R.MSFT.formatted[k] === FORMATTED.MSFT[k],
            'got ' + R.MSFT.formatted[k] + ' from ' + R.MSFT.values[k]);
});

s.check('a negative percentage keeps its sign through the formatter',
        R.RIVN.formatted.operatingMargin === '-52.9%' &&
        R.RIVN.values.operatingMargin < 0,
        'got ' + R.RIVN.formatted.operatingMargin);

s.pinned('ACHR renders an operating margin of ' + R.ACHR.formatted.operatingMargin +
         ' -- FMP reports the ratio as -136.3, a multiple, not a fraction',
         R.ACHR.formatted.operatingMargin === '-13630.4%',
         'the formatter has no clamp and the bar has no cap. If a clamp is added, ' +
         'update this string. Do not "fix" it by rescaling the value: scan.py ' +
         'grades the same -136.3 and would then disagree.');

/* ------------------------------------------------------- *
 * 4. Sector rules that change the denominator, hence band  *
 * ------------------------------------------------------- */

s.check('a financial gets the Financial Services table, which has no evToSales row at all',
        R.JPM.sector === 'Financial Services' && !R.JPM.benchmarks.evToSales);
s.check('...so JPM is graded out of 6 and not 8', R.JPM.total === 6, 'got ' + R.JPM.total);
s.check('a REIT keeps all its other ratios and only loses P/E',
        R.O.sector === 'Real Estate' && R.O.total === 7 && R.O.ratioGrades.peRatio === null,
        'sector ' + R.O.sector + ', total ' + R.O.total);
s.check('a REIT P/E is suppressed by rule, not absent -- FMP sent 41.6',
        F.O['ratios-ttm'][0].priceToEarningsRatioTTM > 0);

/* ------------------------------------------------- *
 * 5. Missing and malformed fields                    *
 * ------------------------------------------------- */

var der = D.build(F);
var noKm = I.grade('MSFT_NO_KM', der.MSFT_NO_KM.payloads);
s.check('a dropped key-metrics-ttm removes exactly FCF Yield and EV/Revenue',
        noKm.ratioGrades.fcfYield === null && noKm.ratioGrades.evToSales === null &&
        noKm.total === 6, 'total ' + noKm.total);
s.check('...and because both were the bad ones, losing the call RAISES MSFT from C to B',
        R.MSFT.letter === 'C' && noKm.letter === 'B' && noKm.bad === 0,
        'full ' + R.MSFT.letter + ', degraded ' + noKm.letter);

var noIs = I.grade('MSFT_NO_INCOME', der.MSFT_NO_INCOME.payloads);
s.check('a dropped income statement removes the three ratios gated on TTM revenue',
        noIs.ratioGrades.assetTurnover === null &&
        noIs.ratioGrades.operatingMargin === null &&
        noIs.ratioGrades.revenueGrowth === null && noIs.total === 5,
        'total ' + noIs.total);

var threeQ = I.grade('MSFT_THREE_QUARTERS', der.MSFT_THREE_QUARTERS.payloads);
s.check('three quarters of income statement still grades, because the headline ' +
        'numbers come from ratios-ttm and only the evidence line is short',
        threeQ.total === 7 && threeQ.values.assetTurnover === R.MSFT.values.assetTurnover,
        'total ' + threeQ.total);
s.pinned('...and the short sum is still labelled Trailing 12 Months in the evidence',
         /Trailing|TTM Revenue/.test(threeQ.components.assetTurnover || '') &&
         threeQ.components.assetTurnover !== R.MSFT.components.assetTurnover,
         'ttm.quarters is computed and never checked. When a 4-quarter guard is ' +
         'added, the three TTM-denominated ratios should be suppressed and this ' +
         'becomes an assertion that they are absent.');

var empty = I.grade('EMPTY', {});
s.check('a payload with nothing in it grades ? rather than throwing',
        empty.letter === '?' && empty.total === 0, 'got ' + empty.letter);

/* --------------------------------------------------------------------- *
 * 6. Forward P/E and the currency it is computed in.                     *
 *                                                                         *
 *    NVO is an ADR: profile.price is USD, the statements and the analyst  *
 *    estimates are DKK. The trailing fallback guards on cur === 'USD';    *
 *    the forward line has no currency guard at all, so it divides a USD   *
 *    price by a DKK EPS and renders a stock on ~12x as if it were on      *
 *    1.8x -- cheap, in the direction a reader wants to believe.           *
 *                                                                         *
 *    Asserted as a ratio to the trailing P/E rather than as a literal,    *
 *    because the forward-EPS loop picks the nearest estimate later than   *
 *    new Date(): once 2026-12-31 passes it moves to the 2027 row and any  *
 *    hardcoded float here would start failing on the calendar instead of  *
 *    on a code change. The DKK/USD gap survives that; a literal would not.*/

s.check('NVO really is the mixed-currency case: USD price, DKK statements',
        F.NVO.profile[0].currency === 'USD' &&
        F.NVO['balance-sheet-statement'][0].reportedCurrency === 'DKK');

var nvoFwd = R.NVO.forwardPE, nvoTrail = R.NVO.values.peRatio;
s.pinned('NVO forward P/E is ' + (nvoFwd || 0).toFixed(2) + 'x against a trailing ' +
         nvoTrail.toFixed(2) + 'x -- a USD price over a DKK EPS estimate',
         typeof nvoFwd === 'number' && nvoFwd / nvoTrail < 0.25,
         'guard the forward line the way the trailing fallback is guarded, on ' +
         'prof.currency === bs.reportedCurrency, and suppress the line rather than ' +
         'render a wrong number. Then this becomes an assertion that it is absent. ' +
         'scan.py does not grade forward P/E, so this one is index.html only.');

s.check('...and on a single-currency company the forward line is sane next to the trailing',
        ['MSFT', 'AAPL'].every(function (t) {
            var f = R[t].forwardPE, p = R[t].values.peRatio;
            return typeof f === 'number' && f / p > 0.5 && f / p < 1.5;
        }),
        'MSFT ' + R.MSFT.forwardPE + '/' + R.MSFT.values.peRatio +
        ', AAPL ' + R.AAPL.forwardPE + '/' + R.AAPL.values.peRatio);

/* ------------------------------------------------- *
 * 7. Negative equity and loss-makers                 *
 * ------------------------------------------------- */

s.check('SBUX really is negative-equity in the captured data',
        F.SBUX['ratios-ttm'][0].debtToEquityRatioTTM < 0 &&
        F.SBUX['balance-sheet-statement'][0].totalStockholdersEquity < 0);
/* These three pinned the bug when it was still live. It is fixed, so they
   now assert the fix: the sign survives, and the grade follows it. */
s.check('the card keeps the sign, -2.92, rather than its magnitude',
        R.SBUX.values.debtToEquity === F.SBUX['ratios-ttm'][0].debtToEquityRatioTTM,
        String(R.SBUX.values.debtToEquity));
s.check('...and swaps the components line for a negative-equity sentence',
        /Negative equity/.test(R.SBUX.components.debtToEquity),
        R.SBUX.components.debtToEquity);
s.check('a negative ratio grades bad, which is what scan.py has always said',
        R.SBUX.ratioGrades.debtToEquity === 'bad');

/* The case the magnitude bug got most wrong: small enough that |v| cleared
   the benchmark, so a balance sheet with more liabilities than equity read
   as conservative. This was a s.pinned() documenting the defect; it is a
   plain check now because the defect is gone. */
var negSmall = I.grade('NEG_DE_SMALL', der.NEG_DE_SMALL.payloads);
s.check('a company at D/E -0.30 grades bad, not good on the magnitude alone',
        negSmall.ratioGrades.debtToEquity === 'bad' &&
        negSmall.values.debtToEquity === -0.3,
        negSmall.ratioGrades.debtToEquity + ' / ' + negSmall.values.debtToEquity);

s.check('a loss-maker keeps its negative operating margin and is graded bad on it',
        R.RIVN.values.operatingMargin < 0 && R.RIVN.ratioGrades.operatingMargin === 'bad');
s.pinned('...but its negative trailing P/E is dropped rather than graded',
         R.RIVN.ratioGrades.peRatio === null &&
         F.RIVN['ratios-ttm'][0].priceToEarningsRatioTTM < 0,
         'if negative P/E is ever graded instead of dropped, scan.py must change ' +
         'in the SAME COMMIT. Doing it on one surface only is what desynced 165 rows.');

/* ------------------------------------------------------------------- *
 * 8. The two benchmark tables, compared.                              *
 *    Kept because it localizes a failure to a threshold, NOT because   *
 *    it is sufficient -- this is the check that was green while the    *
 *    165 rows were wrong. The letters in test-cross-surface.js are the *
 *    real guard; this one only says which cell moved.                  *
 * ------------------------------------------------------------------- */

var py = H.gradeWithScanPy({});
var jsB = I.benchmarks, pyB = py.benchmarks;
var tableProblems = [];
Object.keys(pyB).forEach(function (sector) {
    if (!jsB[sector]) { tableProblems.push(sector + ' missing from index.html'); return; }
    Object.keys(pyB[sector]).forEach(function (ratio) {
        var a = jsB[sector][ratio], b = pyB[sector][ratio];
        if (!a) { tableProblems.push(sector + '.' + ratio + ' missing from index.html'); return; }
        if (a.good !== b.good || a.ok !== b.ok) {
            tableProblems.push(sector + '.' + ratio + ' index=' + JSON.stringify(a) +
                               ' scan=' + JSON.stringify(b));
        }
    });
    Object.keys(jsB[sector]).forEach(function (ratio) {
        if (ratio !== 'label' && !pyB[sector][ratio]) {
            tableProblems.push(sector + '.' + ratio + ' missing from scan.py');
        }
    });
});
s.check('the two sector benchmark tables are identical (necessary, and nowhere near sufficient)',
        tableProblems.length === 0, tableProblems.join('\n          '));

process.exitCode = s.done() ? 1 : 0;
