/* The debt figure printed beside the debt-to-equity ratio.
 *
 * The card showed FMP's debtToEquityRatioTTM and, next to it, a "Total Debt"
 * built as longTermDebt + shortTermDebt. FMP's numerator is totalDebt, which
 * also includes capitalLeaseObligations -- so for MSFT the card read 0.28x
 * beside $35.5B and $470.5B, and dividing those two gives 0.0755. A reader
 * checking the arithmetic found it wrong, which is the worst way for a
 * finance tool to be wrong.
 *
 * Offline, against a captured fixture, because a test that calls the live API
 * fails every time the market moves and teaches people to ignore it.
 */
var fs = require('fs'), path = require('path');
var F = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures-msft.json'), 'utf8'));
var src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

var pass = 0, fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; console.log('  FAIL  ' + name + (extra ? '\n          ' + extra : '')); }
}

/* Lifted out of index.html rather than retyped, so the test cannot drift away
   from the shipped expression the way a copy would. */
var m = /var debtVal = \(typeof bs\.totalDebt[\s\S]*?\);/.exec(src);
check('the debt expression is still where this test reads it', !!m);
if (!m) { console.log('\nFAILED 1 of 1'); process.exit(1); }
var debtOf = new Function('bs', m[0] + ' return debtVal;');

var msft = F.MSFT;
check('MSFT: the figure shown is total debt, not just borrowings',
      debtOf(msft) === msft.totalDebt,
      'got ' + debtOf(msft) + ', wanted ' + msft.totalDebt);
check('...which is the old figure plus the lease obligations',
      debtOf(msft) === msft.shortTermDebt + msft.longTermDebt + msft.capitalLeaseObligations);

/* The point of the whole fix: a reader can divide the two printed numbers and
   land on the printed ratio. Four decimals is well past what the card shows. */
var derived = debtOf(msft) / msft.totalStockholdersEquity;
check('a reader dividing the two printed figures gets the printed ratio',
      Math.abs(derived - msft.debtToEquityRatioTTM) < 1e-9,
      derived.toFixed(6) + ' vs ' + msft.debtToEquityRatioTTM.toFixed(6));
/* The exact arithmetic the owner did by hand when he reported this. */
check('...and specifically NOT the 0.0755 that was reported as the bug',
      Math.abs(derived - 0.0755) > 0.2, derived.toFixed(4));

var aapl = F.AAPL_no_leases;
check('a company with no leases is unaffected by the change',
      debtOf(aapl) === aapl.shortTermDebt + aapl.longTermDebt);
check('...and still reconciles to its own ratio',
      Math.abs(debtOf(aapl) / aapl.totalStockholdersEquity - aapl.debtToEquityRatioTTM) < 1e-9);

/* Older payloads omit totalDebt. The fallback has to include leases too, or
   the bug comes straight back for exactly those rows. */
var old = F.MISSING_totalDebt;
check('when totalDebt is absent the fallback still counts leases',
      debtOf(old) === 7000000000, 'got ' + debtOf(old));
check('a payload with nothing at all yields 0 rather than NaN',
      debtOf({}) === 0, String(debtOf({})));

console.log('\n' + (fail ? 'FAILED ' + fail + ' of ' + (pass + fail)
                         : 'ALL ' + pass + ' CHECKS PASSED'));
process.exitCode = fail ? 1 : 0;
