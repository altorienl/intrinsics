/* Edge cases built by perturbing exactly one thing in a real captured payload.
 *
 * These are labelled derived, not captured, and the distinction matters: the
 * numbers under them are real FMP responses, but the one field each case
 * changes is this suite's construction. Where a case asserts a divergence
 * between the two surfaces, the divergence is a property of the code, not of
 * the perturbation -- the perturbation only puts the code in a state the
 * eight real tickers happen not to reach today.
 *
 * Why synthesize at all: the archetypes that break the graders are, by
 * definition, rare. SBUX really does have negative equity, but at -2.92 the
 * magnitude clears the 'bad' band on both surfaces anyway, so it cannot show
 * the negative-equity divergence. A company at -0.30 would. Waiting for one
 * to appear in the index is not a test strategy.
 */
'use strict';

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function build(F) {
    var cases = {};

    /* Small negative debt-to-equity. index.html stores Math.abs(deApi) and
       grades the magnitude; scan.py hard-codes 'bad' for any negative. At
       -2.92 (SBUX, real) both land on 'bad' and the split is invisible. At
       -0.30 the card calls it 'good' and the screener calls it 'bad'. The
       equity figure is flipped negative too so the payload stays internally
       consistent with the ratio it carries. */
    var negDe = clone(F.MSFT);
    negDe['ratios-ttm'][0].debtToEquityRatioTTM = -0.30;
    negDe['balance-sheet-statement'][0].totalStockholdersEquity = -446436666666;
    cases.NEG_DE_SMALL = {
        payloads: negDe,
        why: 'negative equity at a magnitude that fits inside the good band'
    };

    /* key-metrics-ttm dropped. This is the ordinary failure, not a rare one:
       the worker answers an FMP rate limit with valid JSON that is not an
       array, and both surfaces read that as an empty object. FCF Yield and
       EV/Revenue disappear -- and for MSFT both of them were the 'bad' ones,
       so losing the call raises the grade. */
    var noKm = clone(F.MSFT);
    delete noKm['key-metrics-ttm'];
    cases.MSFT_NO_KM = {
        payloads: noKm,
        why: 'a single 429 deletes the two ratios that were dragging the grade down'
    };

    /* ratios-ttm dropped. index.html has a balance-sheet fallback for five of
       the eight; scan.py has none and reads straight from the payload. */
    var noRt = clone(F.MSFT);
    delete noRt['ratios-ttm'];
    cases.MSFT_NO_RATIOS = {
        payloads: noRt,
        why: 'index.html falls back to the balance sheet, scan.py does not'
    };

    /* income-statement dropped. index.html gates Asset Turnover and Operating
       Margin on TTM revenue existing; scan.py reads the TTM ratios regardless.
       The two surfaces end up grading a different number of ratios. */
    var noIs = clone(F.MSFT);
    noIs['income-statement'] = [];
    cases.MSFT_NO_INCOME = {
        payloads: noIs,
        why: 'the two surfaces gate on different fields, so the denominators part'
    };

    /* A sector string that is not an exact key in the benchmark table.
       index.html runs fmpSectorMap, which substring-matches 'financ';
       scan.py does BENCHMARKS.get(sector, Default) and compares the raw
       string to 'Financial Services' for the suppression rules. */
    var variant = clone(F.JPM);
    variant['profile'][0].sector = 'Financial';
    cases.JPM_SECTOR_VARIANT = {
        payloads: variant,
        why: 'fuzzy sector mapping on one surface, exact lookup on the other'
    };

    /* An explicit JSON null for one quarter's revenue. FMP does emit these.
       index.html coerces with (q.revenue || 0); scan.py uses
       q.get('revenue', 0), whose default never fires on a present null. */
    var nullRev = clone(F.MSFT);
    nullRev['income-statement'][2].revenue = null;
    cases.MSFT_NULL_REVENUE = {
        payloads: nullRev,
        why: 'a present null is not a missing key, and only one surface survives it'
    };

    /* Three quarters instead of four. ttm.quarters is computed and never
       checked, so index.html sums a partial year and labels it TTM. Included
       to record that this does NOT move the letter while ratios-ttm is
       present -- the headline numbers come from FMP, only the evidence line
       under them is wrong. */
    var threeQ = clone(F.MSFT);
    threeQ['income-statement'] = threeQ['income-statement'].slice(0, 3);
    cases.MSFT_THREE_QUARTERS = {
        payloads: threeQ,
        why: 'a partial-year sum labelled Trailing 12 Months'
    };

    return cases;
}

module.exports = { build: build, clone: clone };
