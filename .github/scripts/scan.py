#!/usr/bin/env python3
"""Scan US stocks with $2B+ market cap via FMP API, grade them, write grades.json"""
import json, os, sys, time, urllib.request, urllib.error, urllib.parse
from pathlib import Path

API_KEY = os.environ.get('FMP_API_KEY', '')
BASE = 'https://financialmodelingprep.com/stable'
MIN_MARKET_CAP = 2_000_000_000

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

def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Intrinsics/1.0'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def discover_tickers():
    """Fetch FMP stock-list and return unique ticker symbols."""
    try:
        data = fetch(f"{BASE}/stock-list?apikey={API_KEY}")
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

def process_stock(ticker):
    sym = urllib.parse.quote(ticker)
    urls = [
        f"{BASE}/balance-sheet-statement?symbol={sym}&period=quarter&limit=1&apikey={API_KEY}",
        f"{BASE}/income-statement?symbol={sym}&period=quarter&limit=8&apikey={API_KEY}",
        f"{BASE}/profile?symbol={sym}&apikey={API_KEY}",
        f"{BASE}/ratios-ttm?symbol={sym}&apikey={API_KEY}",
    ]
    bs_arr, is_arr, prof_arr, rt_arr = [fetch(u) for u in urls]

    bs = bs_arr[0] if isinstance(bs_arr, list) and bs_arr else {}
    incomes = is_arr if isinstance(is_arr, list) else []
    prof = prof_arr[0] if isinstance(prof_arr, list) and prof_arr else {}
    rt = rt_arr[0] if isinstance(rt_arr, list) and rt_arr else {}

    if not prof.get('companyName'):
        return None

    mc = prof.get('marketCap') or 0
    if mc < MIN_MARKET_CAP:
        return None

    exchange = prof.get('exchange', '')
    if exchange not in ('NYSE', 'NASDAQ', 'AMEX', 'New York Stock Exchange', 'NASDAQ Global Select Market',
                        'NASDAQ Global Market', 'NASDAQ Capital Market', 'NYSE American'):
        return None

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
    grades = list(ratio_grades.values())

    scored = [g for g in grades if g is not None]
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
    junk = r'etf|fund|trust|bond|treasury|proshares|ishares|vanguard|spdr|warrant|right|unit|preferred'
    import re
    junk_re = re.compile(junk, re.IGNORECASE)
    discovered = [t for t in discovered if len(t) <= 5 and not junk_re.search(t)]
    print(f"Found {len(discovered)} candidates from stock-list")

    tickers = sorted(set(discovered))
    print(f"Total unique tickers to scan: {len(tickers)}")

    BATCH = 70
    results = []
    skipped = 0
    total_batches = (len(tickers) + BATCH - 1) // BATCH

    for b in range(total_batches):
        batch = tickers[b*BATCH:(b+1)*BATCH]
        print(f"Batch {b+1}/{total_batches}: scanning {len(batch)} stocks...")

        graded = 0; failed = 0
        for t in batch:
            try:
                r = process_stock(t)
                if r:
                    results.append(r); graded += 1
                else:
                    skipped += 1
            except Exception as e:
                print(f"  WARNING: {t} failed — {e}"); failed += 1

        print(f"Batch {b+1} complete: {graded} graded, {skipped} skipped (small cap/foreign), {failed} failed")
        if b < total_batches - 1:
            print("Waiting 60s (rate limit)...")
            time.sleep(60)

    results.sort(key=lambda x: x['ticker'])
    out = {'updated': __import__('datetime').datetime.utcnow().isoformat() + 'Z', 'stocks': results}
    out_path = Path(__file__).resolve().parent.parent.parent / 'grades.json'
    out_path.write_text(json.dumps(out, indent=2))
    print(f"\nDone! {len(results)} stocks graded (${MIN_MARKET_CAP/1e9:.0f}B+ market cap). Output: {out_path}")

if __name__ == '__main__':
    main()
