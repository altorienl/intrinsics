/* A company whose liabilities exceed its equity must not be graded well.
 *
 * The card stored Math.abs(debtToEquityRatioTTM), so FICO's -1.37 became
 * 1.37 and was compared against a Technology benchmark whose acceptable
 * band runs to 1.5. The card called it "Moderate debt levels. Not unusual,
 * but worth watching." The nightly screener never agreed -- scan.py has
 * always forced 'bad' when the ratio is negative -- so the screener listed
 * BKNG and OTIS at C and FICO at B on a bad leverage grade, and the card
 * each row clicks through to said something kinder.
 *
 * Two things are asserted here and they are different: that the sign
 * survives into the grade, and that the two files state the SAME rule.
 * The second is the one that was missing. A previous suite compared the
 * benchmark tables between the files and passed while the grading rules
 * disagreed, which is how a divergence lived in production.
 */
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
var src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
var scan = fs.readFileSync(path.join(ROOT, '.github/scripts/scan.py'), 'utf8');

var pass = 0, fail = 0;
function check(n, c, extra) {
    if (c) { pass++; console.log('  PASS  ' + n); }
    else { fail++; console.log('  FAIL  ' + n + (extra ? '\n          ' + extra : '')); }
}

/* Lifted from the shipped file, not retyped, so the test cannot drift.
   Anchored on the module-level rule and its full signature, not on `function
   g(`, which for a while matched a one-line delegate inside buildOneLiner and
   then ran on into the statements after it. */
var m = /function gradeOf\(key, ratios, defs, benchmarks\) \{[\s\S]*?\n    \}/.exec(src);
check('the grader is still where this test reads it', !!m);
if (!m) { console.log('\nFAILED 1 of 1'); process.exit(1); }

var grade = new Function('key', 'ratios', 'defs', 'benchmarks',
    m[0].replace(/^\s*function gradeOf\([^)]*\) \{/, '').replace(/\}\s*$/, ''));
var defs = [{ key: 'debtToEquity', higherBetter: false }];
var bench = { debtToEquity: { good: 0.5, ok: 1.5 } };
var at = function (v) { return grade('debtToEquity', { debtToEquity: { value: v } }, defs, bench); };

/* The real numbers, live on the day this was found. */
check('FICO at -1.37 grades bad, not ok', at(-1.3663) === 'bad', at(-1.3663));
check('BKNG at -1.92 grades bad', at(-1.9191) === 'bad', at(-1.9191));
check('OTIS at -1.60 grades bad', at(-1.6011) === 'bad', at(-1.6011));
/* The one that the old absolute-value code got MOST wrong: a small negative
   ratio looked like a conservative balance sheet. */
check('a small negative ratio is still bad, not good', at(-0.30) === 'bad', at(-0.30));
/* And nothing above zero changed. */
check('0.20 is still good', at(0.20) === 'good', at(0.20));
check('1.00 is still ok', at(1.00) === 'ok', at(1.00));
check('3.00 is still bad', at(3.00) === 'bad', at(3.00));

/* The cross-file claim. Comparing the rules, not the thresholds -- the
   thresholds already matched while the behaviour did not. */
check('scan.py forces bad on a negative ratio',
      /'bad' if \(de is not None and de < 0\)/.test(scan));
check('index.html forces bad on a negative ratio',
      /key === 'debtToEquity' && r\.value < 0\) return 'bad'/.test(src));

/* The grader can only force 'bad' if the sign reaches it. Restoring
   Math.abs() at the assignment would hand the grader 1.37 and every check
   above would still pass -- which it did, until this one was added. */
check('the negative branch stores the signed ratio, not its magnitude',
      /ratios\.debtToEquity = deApi < 0 \? \{\s*value: deApi,/.test(src),
      'Math.abs at the assignment defeats every grading check in this file');
check('...and Math.abs is gone from that branch entirely',
      !/deApi < 0 \? \{[\s\S]{0,120}Math\.abs/.test(src));

/* A negative multiple is not a figure anybody can act on. */
var f = /format: function\(v\) \{ return v < 0 \? 'n\/m'/.test(src);
check('a negative ratio displays as n/m rather than a multiple', f);
check('the explanation is driven by the sign, not by a magnitude guess',
      /explain: function\(v, g\) \{ return v < 0 \?/.test(src));

console.log('\n' + (fail ? 'FAILED ' + fail + ' of ' + (pass + fail)
                         : 'ALL ' + pass + ' CHECKS PASSED'));
process.exitCode = fail ? 1 : 0;
