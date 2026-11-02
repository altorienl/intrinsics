/* Run the real page, and call the real renderResults.
 *
 * Every other suite in here evaluates index.html in PIECES: index-surface.js
 * lifts regions out by regex and re-stitches them into a flat scope of its
 * own, and writes its own renderResults to capture the arguments. That is the
 * right tool for asking whether a ratio is computed correctly, and it is
 * structurally incapable of asking whether the shipped file RUNS -- because
 * in a flat scope every name resolves, no matter which function it was
 * actually declared in.
 *
 * That gap shipped. The good/ok/bad rule lived as a closure inside
 * buildOneLiner, the ratio-card loop in renderResults was changed to call it,
 * and renderResults cannot see a function scoped to a sibling. Every ticker
 * threw "g is not defined" before a single card drew, while all four suites
 * stayed green and the deploy went out.
 *
 * So this one does the opposite of clever: load the actual <script> bodies
 * into one context, stub the browser thinly, and invoke the entry point the
 * app invokes. It asserts almost nothing about the output. It only asserts
 * that the function the whole page depends on can be called at all, which is
 * the single thing no other test here was in a position to check.
 */
'use strict';
var fs = require('fs'), vm = require('vm'), path = require('path');
var ROOT = path.join(__dirname, '..');

var pass = 0, fail = 0;
function check(n, c, extra) {
    if (c) { pass++; console.log('  PASS  ' + n); }
    else { fail++; console.log('  FAIL  ' + n + (extra ? '\n          ' + extra : '')); }
}

/* A DOM only as real as the render path touches. Deliberately thin: the point
   is to surface ReferenceErrors in the page's own code, so anything the page
   asks the browser for returns something harmless rather than throwing and
   masking the thing we came to find. */
function el() {
    var o = { innerHTML: '', textContent: '', value: '', style: {}, dataset: {},
        classList: { add: function () {}, remove: function () {}, toggle: function () {},
                     contains: function () { return false; } },
        addEventListener: function () {}, removeEventListener: function () {},
        appendChild: function () {}, removeChild: function () {}, remove: function () {},
        setAttribute: function () {}, getAttribute: function () { return null; },
        insertAdjacentHTML: function () {}, focus: function () {}, blur: function () {},
        click: function () {}, scrollIntoView: function () {},
        querySelector: function () { return el(); }, querySelectorAll: function () { return []; },
        getBoundingClientRect: function () { return { top: 0, left: 0, width: 0, height: 0 }; } };
    o.parentElement = o; o.parentNode = o; o.children = []; o.firstChild = null;
    return o;
}

function loadPage() {
    var src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    var blocks = [], re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g, m;
    while ((m = re.exec(src))) blocks.push(m[1]);

    var doc = { getElementById: function () { return el(); }, querySelector: function () { return el(); },
        querySelectorAll: function () { return []; }, createElement: function () { return el(); },
        addEventListener: function () {}, body: el(), head: el(), documentElement: el(),
        cookie: '', title: '', readyState: 'complete' };

    var ctx = { document: doc, console: { log: function () {}, warn: function () {}, error: function () {} },
        localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
        sessionStorage: { getItem: function () { return null; }, setItem: function () {} },
        fetch: function () { return Promise.resolve({ ok: true, json: function () { return Promise.resolve({}); } }); },
        addEventListener: function () {}, removeEventListener: function () {},
        setTimeout: function () { return 0; }, setInterval: function () { return 0; },
        clearTimeout: function () {}, clearInterval: function () {},
        requestAnimationFrame: function () { return 0; },
        location: { href: '', search: '', hash: '', pathname: '/' },
        history: { replaceState: function () {}, pushState: function () {} },
        navigator: { userAgent: 'node', clipboard: { writeText: function () {} } },
        matchMedia: function () { return { matches: false, addEventListener: function () {} }; },
        alert: function () {}, Chart: function () { return { destroy: function () {}, update: function () {} }; },
        URLSearchParams: URLSearchParams };
    ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
    vm.createContext(ctx);

    /* Top-level listener registration and similar boot work is allowed to
       fail; the page is not in a browser. A failure HERE is not the signal.
       The signal is whether the entry points exist afterwards. */
    blocks.forEach(function (b, i) {
        try { vm.runInContext(b, ctx, { filename: 'index.html[script' + i + ']' }); } catch (e) {}
    });
    return ctx;
}

console.log('index.html actually runs');
var page = loadPage();

check('the inline script defines renderResults', typeof page.renderResults === 'function');
check('the inline script defines gradeOf',       typeof page.gradeOf === 'function');
check('the inline script defines processData',   typeof page.processData === 'function');

/* Every ratio the defs table grades, with the shape processData builds.
   forwardPE and forwardEps travel together in the page (index.html guards
   both behind `forwardEps > 0`), so the fixture pairs them too -- a fixture
   that sets one without the other tests a state the app cannot reach. */
var ratios = {
    currentRatio: { value: 1.8 }, debtToEquity: { value: 0.4 }, assetTurnover: { value: 0.9 },
    operatingMargin: { value: 0.25 }, peRatio: { value: 22, forwardPE: 19, forwardEps: 5.26 },
    revenueGrowth: { value: 0.12 }, fcfYield: { value: 0.05 }, evToSales: { value: 4.2 },
    grossMargin: { value: 0.55 }, netMargin: { value: 0.18 }, roe: { value: 0.22 },
    quickRatio: { value: 1.2 }, interestCoverage: { value: 12 }, inventoryTurnover: { value: 6 }
};
var benchmarks = {};
Object.keys(ratios).forEach(function (k) { benchmarks[k] = { good: 1, ok: 2 }; });
var prof = { companyName: 'Test Co', sector: 'Technology', image: '' };
var filing = { period: 'Q3', year: '2026', filed: '2026-10-01' };

function callRender(label, r) {
    try {
        page.renderResults('TEST', prof, 'Technology', benchmarks, r, 100, filing);
        check(label, true);
    } catch (e) {
        check(label, false, e.name + ': ' + e.message
            + '\n          ' + String(e.stack).split('\n')[1]);
    }
}

callRender('renderResults runs end to end on a full set of ratios', ratios);

/* The negative-equity company, through the REAL path rather than through a
   lifted copy of the rule. This is the case the cross-surface suite grades
   in its own harness; running it here means the shipped call site is exercised
   too, not just the rule it calls. */
var neg = JSON.parse(JSON.stringify(ratios));
neg.debtToEquity.value = -1.37;
callRender('renderResults runs with negative equity (the FICO case)', neg);

/* A sparse response. Most tickers are missing something, and the card loop
   returns early for an absent ratio -- a path that never reaches the grader
   and so has its own chance to break. */
callRender('renderResults runs when most ratios are absent',
    { peRatio: { value: 18 }, operatingMargin: { value: 0.1 } });

/* Grading through the shipped function, not a regex-lifted copy. */
var defs = [{ key: 'debtToEquity', higherBetter: false }];
var bench = { debtToEquity: { good: 0.5, ok: 1.5 } };
check('gradeOf is callable from module scope and grades negative equity bad',
    typeof page.gradeOf === 'function'
        && page.gradeOf('debtToEquity', { debtToEquity: { value: -1.37 } }, defs, bench) === 'bad',
    typeof page.gradeOf !== 'function' ? 'gradeOf is not in module scope' : undefined);

console.log('');
if (fail) { console.log('FAILED ' + fail + ' of ' + (pass + fail)); process.exit(1); }
console.log('ALL ' + pass + ' CHECKS PASSED');
