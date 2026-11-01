/* The shared bits of the suite: the check() helper test-debt.js established,
 * fixture loading, and the subprocess bridge to scan.py.
 *
 * check() is deliberately the same shape as the one in test-debt.js rather
 * than an import into it -- that file is the idiom and is left standing on
 * its own, so it keeps running even if this directory is reorganized.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var child = require('child_process');

var TEST_DIR = path.join(__dirname, '..');

function Suite(title) {
    this.title = title;
    this.pass = 0;
    this.fail = 0;
    console.log(title);
}

Suite.prototype.check = function (name, cond, extra) {
    if (cond) { this.pass++; console.log('  PASS  ' + name); }
    else { this.fail++; console.log('  FAIL  ' + name + (extra ? '\n          ' + extra : '')); }
    return !!cond;
};

/* Same as check(), but for a defect that is confirmed present and not being
 * fixed in this change. Pinning it means the suite is green today AND goes red
 * the moment someone touches it -- which is the only honest way to leave a
 * known divergence in a repo where a silent divergence already cost 165 rows.
 * A plain skip would be the thing the brief calls a test that cannot fail.
 */
Suite.prototype.pinned = function (name, cond, whenFixed) {
    var ok = this.check('[PINNED BUG] ' + name, cond,
        'This check encodes current, known-wrong behavior. It failing most ' +
        'likely means someone fixed the bug.');
    if (ok) console.log('          when fixed: ' + whenFixed);
    return ok;
};

Suite.prototype.done = function () {
    var total = this.pass + this.fail;
    console.log(this.fail ? '  --> FAILED ' + this.fail + ' of ' + total
                          : '  --> all ' + total + ' checks passed');
    console.log('');
    return this.fail;
};

function loadFixtures() {
    var f = JSON.parse(fs.readFileSync(
        path.join(TEST_DIR, 'fixtures', 'surfaces.json'), 'utf8'));
    return f.tickers;
}

/* Deep clone so a derived case can perturb one field without the mutation
   leaking into the next test that reads the same ticker. */
function clone(o) { return JSON.parse(JSON.stringify(o)); }

/* One python3 subprocess for the whole batch. If python3 is missing or
   scan.py will not import, that is a hard failure, never a skip -- a suite
   that quietly stops testing half the system is the sibling project's bug. */
function gradeWithScanPy(cases) {
    var script = path.join(TEST_DIR, 'lib', 'scan-surface.py');
    var r = child.spawnSync('python3', [script], {
        input: JSON.stringify(cases),
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        env: Object.assign({}, process.env)
    });
    if (r.error) {
        throw new Error('could not run python3 for the scan.py surface: ' + r.error.message);
    }
    if (r.status !== 0) {
        throw new Error('scan-surface.py exited ' + r.status + '\n' + (r.stderr || ''));
    }
    var parsed;
    try { parsed = JSON.parse(r.stdout); }
    catch (e) { throw new Error('scan-surface.py did not return JSON:\n' + r.stdout + r.stderr); }
    return parsed;
}

module.exports = {
    Suite: Suite,
    loadFixtures: loadFixtures,
    clone: clone,
    gradeWithScanPy: gradeWithScanPy,
    TEST_DIR: TEST_DIR
};
