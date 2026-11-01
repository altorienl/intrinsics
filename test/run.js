#!/usr/bin/env node
/* One command for the whole suite:  node test/run.js
 *
 * Each test file runs as its own process, so a crash in one is a failure of
 * that file and not a silent truncation of the run. The exit code is the
 * number of failing files, capped at 1, and it is set with process.exit so
 * nothing downstream can overwrite it.
 *
 * WHY THAT IS SPELLED OUT: a sibling project shipped a suite that printed its
 * failures in red and exited 0 for weeks, so CI stayed green over a broken
 * build. The two ways that happens are a runner that forgets to propagate the
 * child's status, and a test file that prints FAIL without setting one. This
 * runner guards the first; every test file here ends with
 * `process.exitCode = s.done() ? 1 : 0;` to guard the second; and
 * `node test/mutate.js` exists to prove both, by breaking the code on purpose
 * and confirming this command goes red.
 */
'use strict';
var path = require('path');
var child = require('child_process');

var TESTS = [
    'test-debt.js',
    'test-negative-equity.js',
    'test-ratios.js',
    'test-cross-surface.js'
];

var quiet = process.argv.indexOf('--quiet') !== -1;
var results = [];

TESTS.forEach(function (file) {
    var full = path.join(__dirname, file);
    var r = child.spawnSync(process.execPath, [full], {
        stdio: quiet ? 'pipe' : 'inherit',
        env: process.env
    });
    var status = r.status === null ? 1 : r.status;
    if (quiet && status !== 0) {
        process.stdout.write(r.stdout || '');
        process.stderr.write(r.stderr || '');
    }
    if (r.error) {
        console.error('could not run ' + file + ': ' + r.error.message);
        status = 1;
    }
    results.push({ file: file, status: status });
});

var failed = results.filter(function (r) { return r.status !== 0; });

console.log('='.repeat(68));
results.forEach(function (r) {
    console.log((r.status === 0 ? '  ok    ' : '  FAIL  ') + r.file);
});
console.log('='.repeat(68));

if (failed.length) {
    console.log(failed.length + ' of ' + results.length + ' test files failed.');
    process.exit(1);
}
console.log('All ' + results.length + ' test files passed.');
process.exit(0);
