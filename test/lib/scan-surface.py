#!/usr/bin/env python3
"""Runs scan.py's grade_stock offline against the same fixtures index.html gets.

WHY it imports the real module instead of copying the logic: grades.json is
what the screener renders, and grades.json is whatever this exact function
returns. A reimplementation would be a second thing to keep in sync, which is
the disease, not the cure. scan.py guards main() behind __main__, so importing
it executes nothing but the module-level constants -- including the real
BENCHMARKS table.

Only one thing is replaced: rate_limited_fetch. Everything downstream of it --
the sector lookup, grade_higher/grade_lower, the Financial Services and Real
Estate suppressions, the negative-D/E rule, the eight-quarter revenue growth,
and the A+/A/B+/B/C/D ladder -- is the shipped code.

WHAT THIS PROVES: given these payloads, the nightly job writes this letter.
WHAT IT DOES NOT PROVE: anything about discover_tickers, check_profile's
eligibility filters, the thread pool, the rate limiter it replaces, or the
file write. Those are the scan's plumbing, not its judgment.

Called by test-cross-surface.js as a subprocess; prints one JSON object on
stdout so the Node side never has to parse Python.
"""
import importlib.util
import json
import os
import sys
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
SCAN_PY = os.environ.get(
    'INTRINSICS_SCAN_PY',
    os.path.join(HERE, '..', '..', '.github', 'scripts', 'scan.py'))


def load_scan():
    spec = importlib.util.spec_from_file_location('intrinsics_scan', SCAN_PY)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# grade_stock builds four URLs off BASE; route on the path and the symbol only,
# so the fixture is keyed the same way index.html's payloads are.
ENDPOINTS = ('balance-sheet-statement', 'income-statement',
             'ratios-ttm', 'key-metrics-ttm', 'profile')


def make_router(payloads):
    def rate_limited_fetch(url):
        path = urllib.parse.urlparse(url).path.rsplit('/', 1)[-1]
        if path not in ENDPOINTS:
            raise AssertionError(
                'scan.py asked for an endpoint the fixture does not carry: %r.\n'
                'Add it to the fixture rather than letting it fall through.' % path)
        if path not in payloads:
            # A deliberately dropped endpoint. The worker answers a rate limit
            # with valid non-array JSON, so that is what the fixture returns.
            return {'error': 'Upstream error', 'status': 429}
        return payloads[path]
    return rate_limited_fetch


def grade_one(scan, ticker, payloads):
    scan.rate_limited_fetch = make_router(payloads)
    prof_rows = payloads.get('profile') or []
    prof = prof_rows[0] if isinstance(prof_rows, list) and prof_rows else {}
    return scan.grade_stock(ticker, prof)


def main():
    scan = load_scan()
    request = json.load(sys.stdin)
    out = {}
    for name, payloads in request.items():
        try:
            out[name] = {'ok': True, 'result': grade_one(scan, name, payloads)}
        except Exception as exc:
            # A raise is a real outcome: scan.py drops that ticker from
            # grades.json while the card still renders. The Node side asserts
            # on it rather than treating it as a harness failure.
            out[name] = {'ok': False,
                         'error': type(exc).__name__ + ': ' + str(exc)}
    json.dump({'scanPy': os.path.realpath(SCAN_PY),
               'benchmarks': scan.BENCHMARKS,
               'grades': out}, sys.stdout)


if __name__ == '__main__':
    main()
