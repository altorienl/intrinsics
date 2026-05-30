#!/usr/bin/env python3
"""Scan US stocks with $2B+ market cap via FMP API, grade them, write grades.json"""
import json, os, re, sys, time, urllib.request, urllib.error, urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from threading import Lock

API_KEY = os.environ.get('FMP_API_KEY', '')
BASE = 'https://financialmodelingprep.com/stable'
MIN_MARKET_CAP = 2_000_000_000
US_EXCHANGES = {
    'NYSE', 'NASDAQ', 'AMEX', 'New York Stock Exchange',
    'NASDAQ Global Select Market', 'NASDAQ Global Market',
    'NASDAQ Capital Market', 'NYSE American'
}

BENCHMARKS = {
  'Technology':              {'currentRatio':{'good':1.5,'ok':1.0},'debtToEquity':{'good':0.5,'ok':1.5},'assetTurnover':{'good':0.6,'ok':0.3},'operatingMargin':{'good':0.20,'ok':0.10},'peRatio':{'good':25,'ok':40},'revenueGrowth':{'good':0.20,'ok':0.10}},
  'Healthcare':              {'currentRatio':{'good':1.5,'ok':1.0},'debtToEquity':{'good':0.6,'ok':1.5},'assetTurnover':{'good':0.5,'ok':0.25},'operatingMargin':{'good':0.15,'ok':0.05},'peRatio':{'good':20,'ok':35},'revenueGrowth':{'good':0.15,'ok':0.07}},
  'Financial Services':      {'currentRatio':{'good':1.2,'ok':0.8},'debtToEquity':{'good':2.0,'ok':5.0},'assetTurnover':{'good':0.08,'ok':0.03},'operatingMargin':{'good':0.30,'ok':0.15},'peRatio':{'good':15,'ok':25},'revenueGrowth':{'good':0.10,'ok':0.05}},
  'Consumer Cyclical':       {'currentRatio':{'good':1.3,'ok':0.9},'debtToEquity':{'good':0.8,'ok':2.0},'assetTurnover':{'good':1.2,'ok':0.6},'operatingMargin':{'good':0.12,'ok':0.05},'peRatio':{'good':20,'ok':30},'revenueGrowth':{'good':0.12,'ok':0.05}},
  'Consumer Defensive':      {'currentRatio':{'good':1.2,'ok':0.8},'debtToEquity':{'good':1.0,'ok':2.5},'assetTurnover':{'good':1.0,'ok':0.5},'operatingMargin':{'good':0.15,'ok':0.08},'peRatio':{'good':22,'ok':30},'revenueGrowth':{'good':0.08,'ok':0.03}},
  'Energy':                  {'currentRatio':{'good':1.3,'ok':0.9},'debtToEquity':{'good':0.5,'ok':1.5},'assetTurnover':{'good':0.7,'ok':0.3},'operatingMargin':{'good':0.15,'ok':0.05},'peRatio':{'good':12,'ok':20},'revenueGrowth':{'good':0.10,'ok':0.03}},
  'Industrials':             {'currentRatio':{'good':1.5,'ok':1.0},'debtToEquity':{'good':0.7,'ok':1.8},'assetTurnover':{'good':0.8,'ok':0.4},'operatingMargin':{'good':0.12,'ok':0.06},'peRatio':{'good':18,'ok':28},'revenueGrowth':{'good':0.10,'ok':0.04}},
  'Real Estate':             {'currentRatio':{'good':1.0,'ok':0.5},'debtToEquity':{'good':1.0,'ok':2.5},'assetTurnover':{'good':0.15,'ok':0.06},'operatingMargin':{'good':0.30,'ok':0.15},'peRatio':{'good':30,'ok':50},'revenueGrowth':{'good':0.08,'ok':0.03}},
  'Utilities':               {'currentRatio':{'good':1.0,'ok':0.7},'debtToEquity':{'good':1.2,'ok':2.5},'assetTurnover':{'good':0.35,'ok':0.15},'operatingMargin':{'good':0.20,'ok':0.10},'peRatio':{'good':18,'ok':25},'revenueGrowth':{'good':0.06,'ok':0.02}},
  'Communication Services':  {'currentRatio':{'good':1.2,'ok':0.8},'debtToEquity':{'good':0.8,'ok':2.0},'assetTurnover':{'good':0.5,'ok':0.25},'operatingMargin':{'good':0.20,'ok':0.10},'peRatio':{'good':20,'ok':35},'revenueGrowth':{'good':0.12,'ok':0.05}},
  'Basic Materials':         {'currentRatio':{'good':1.5,'ok':1.0},'debtToEquity':{'good':0.5,'ok':1.5},'assetTurnover':{'good':0.7,'ok':0.35},'operatingMargin':{'good':0.15,'ok':0.07},'peRatio':{'good':15,'ok':25},'revenueGrowth':{'good':0.10,'ok':0.04}},
  'Default':                 {'currentRatio':{'good':1.5,'ok':1.0},'debtToEquity':{'good':0.8,'ok':2.0},'assetTurnover':{'good':0.7,'ok':0.3},'operatingMargin':{'good':0.15,'ok':0.05},'peRatio':{'good':20,'ok':35},'revenueGrowth':{'good':0.10,'ok':0.05}},
}

# Rate limiter: 300 calls/min
call_times = []
call_lock = Lock()

def rate_limited_fetch(url):
    with call_lock:
        now = time.time()
        # Remove calls older than 60s
        while call_times and call_times[0] < now - 60:
            call_times.pop(0)
        if len(call_times) >= 295:
            wait = 60 - (now - call_times[0]) + 0.5
            if wait > 0:
                time.sleep(wait)
        call_times.append(time.time())
    req = urllib.request.Request(url, headers={'User-Agent': 'Intrinsics/1.0'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def discover_tickers():
    try:
        data = rate_limited_fetch(f"{BASE}/stock-list?apikey={API_KEY}")
        if isinstance(data, list):
            return [s['symbol'] for s in data if 'symbol' in s]
    except Exception as e:
        print(f"WARNING: stock-list fetch failed — {e}")
    return []

def grade_higher(v, t):
    if v is None: return None
    return 'good' if v >= t['good'] else 'ok' if v >= t['ok'] else 'bad'

def grade_lower(v, t):
    if v is None: return None
    return 'good' if v <= t['good'] else 'ok' if v <= t['ok'] else 'bad'

def check_profile(ticker):
    sym = urllib.parse.quote(ticker)
    prof_arr = rate_limited_fetch(f"{BASE}/profile?symbol={sym}&apikey={API_KEY}")
    prof = prof_arr[0] if isinstance(prof_arr, list) and prof_arr else {}
    if not prof.get('companyName'):
        return None
    mc = prof.get('marketCap') or 0
    if mc < MIN_MARKET_CAP:
        return None
    if prof.get('exchange', '') not in US_EXCHANGES:
        return None
    if prof.get('isFund') or prof.get('isEtf'):
        return None
    name = (prof.get('companyName') or '').lower()
    junk_names = re.compile(r'trust|fund|etf|acquisition corp|blank check|spac|closed.end|royalty', re.IGNORECASE)
    if junk_names.search(name):
        return None
    return prof

def grade_stock(ticker, prof):
    sym = urllib.parse.quote(ticker)
    bs_arr = rate_limited_fetch(f"{BASE}/balance-sheet-statement?symbol={sym}&period=quarter&limit=1&apikey={API_KEY}")
    is_arr = rate_limited_fetch(f"{BASE}/income-statement?symbol={sym}&period=quarter&limit=8&apikey={API_KEY}")
    rt_arr = rate_limited_fetch(f"{BASE}/ratios-ttm?symbol={sym}&apikey={API_KEY}")

    bs = bs_arr[0] if isinstance(bs_arr, list) and bs_arr else {}
    incomes = is_arr if isinstance(is_arr, list) else []
    rt = rt_arr[0] if isinstance(rt_arr, list) and rt_arr else {}

    sector = prof.get('sector', 'Default')
    bench = BENCHMARKS.get(sector, BENCHMARKS['Default'])

    cr = rt.get('currentRatioTTM')
    de = rt.get('debtToEquityRatioTTM')
    at = rt.get('assetTurnoverTTM')
    om = rt.get('operatingProfitMarginTTM')
    pe = rt.get('priceToEarningsRatioTTM')

    rg = None
    if len(incomes) >= 8:
        recent = sum(q.get('revenue', 0) for q in incomes[:4])
        prior = sum(q.get('revenue', 0) for q in incomes[4:8])
        if prior > 0:
            rg = (recent - prior) / prior

    ratio_grades = {
        'currentRatio': grade_higher(cr, bench['currentRatio']),
        'debtToEquity': 'bad' if (de is not None and de < 0) else grade_lower(de, bench['debtToEquity']),
        'assetTurnover': grade_higher(at, bench['assetTurnover']),
        'operatingMargin': grade_higher(om, bench['operatingMargin']),
        'peRatio': grade_lower(pe, bench['peRatio']) if pe and pe > 0 else None,
        'revenueGrowth': grade_higher(rg, bench['revenueGrowth']),
    }

    scored = [g for g in ratio_grades.values() if g is not None]
    total = len(scored)
    good = scored.count('good')
    bad = scored.count('bad')

    if total < 4: overall = '?'
    elif good == total: overall = 'A+'
    elif good >= 5: overall = 'A'
    elif good >= 4 and bad == 0: overall = 'B+'
    elif bad <= 1: overall = 'B'
    elif bad <= 2: overall = 'C'
    else: overall = 'D'

    mc = prof.get('marketCap') or 0
    return {
        'ticker': ticker,
        'name': prof.get('companyName', ticker),
        'sector': sector,
        'grade': overall,
        'price': prof.get('price'),
        'change': prof.get('change'),
        'changePct': prof.get('changePercentage'),
        'marketCap': mc,
        'scores': {'good': good, 'ok': scored.count('ok'), 'bad': bad, 'total': total},
        'ratioGrades': ratio_grades
    }

def main():
    if not API_KEY:
        print('ERROR: FMP_API_KEY not set'); sys.exit(1)

    print("Discovering tickers from FMP stock-list...")
    discovered = discover_tickers()
    junk_re = re.compile(r'etf|fund|trust|bond|treasury|proshares|ishares|vanguard|spdr|warrant|right|unit|preferred', re.IGNORECASE)
    discovered = [t for t in discovered if len(t) <= 5 and not junk_re.search(t)]
    print(f"Found {len(discovered)} candidates from stock-list")

    tickers = sorted(set(discovered))
    print(f"Total unique tickers to scan: {len(tickers)}")

    # Phase 1: parallel profile checks (1 call per ticker)
    print("\n--- Phase 1: Screening by market cap & exchange ---")
    qualified = []
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {pool.submit(check_profile, t): t for t in tickers}
        done = 0
        for f in as_completed(futures):
            done += 1
            if done % 200 == 0:
                print(f"  Screened {done}/{len(tickers)}...")
            try:
                prof = f.result()
                if prof:
                    qualified.append((futures[f], prof))
            except:
                pass

    print(f"\nPhase 1 done: {len(qualified)} stocks pass $2B+ US filter out of {len(tickers)} checked")

    # Phase 2: parallel grading (3 calls per ticker)
    print("\n--- Phase 2: Grading qualified stocks ---")
    results = []
    failed = 0
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {pool.submit(grade_stock, t, p): t for t, p in qualified}
        done = 0
        for f in as_completed(futures):
            done += 1
            if done % 100 == 0:
                print(f"  Graded {done}/{len(qualified)}...")
            try:
                r = f.result()
                if r:
                    results.append(r)
            except Exception as e:
                failed += 1

    print(f"Phase 2 done: {len(results)} graded, {failed} failed")

    results.sort(key=lambda x: x['ticker'])
    out = {'updated': __import__('datetime').datetime.utcnow().isoformat() + 'Z', 'stocks': results}
    out_path = Path(__file__).resolve().parent.parent.parent / 'grades.json'
    out_path.write_text(json.dumps(out, indent=2))
    print(f"\nDone! {len(results)} stocks graded (${MIN_MARKET_CAP/1e9:.0f}B+ market cap). Output: {out_path}")

if __name__ == '__main__':
    main()
