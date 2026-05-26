#!/usr/bin/env python3
"""Scan S&P 500 stocks via FMP API, grade them, write grades.json"""
import json, os, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

API_KEY = os.environ.get('FMP_API_KEY', '')
BASE = 'https://financialmodelingprep.com/stable'

SP500 = [
  'AAPL','ABBV','ABT','ACN','ADBE','ADI','ADM','ADP','ADSK','AEE',
  'AEP','AES','AFL','AIG','AIZ','AJG','AKAM','ALB','ALGN','ALK',
  'ALL','ALLE','AMAT','AMCR','AMD','AME','AMGN','AMP','AMT','AMZN',
  'ANET','ANSS','AON','AOS','APA','APD','APH','APTV','ARE','ATO',
  'AVGO','AVY','AWK','AXP','AZO','BA','BAC','BAX','BBWI',
  'BBY','BDX','BEN','BG','BIIB','BIO','BK','BKNG','BKR',
  'BLDR','BLK','BMY','BR','BRK-B','BRO','BSX','BWA','BX','BXP',
  'C','CAG','CAH','CARR','CAT','CB','CBOE','CBRE','CCI','CCL',
  'CDNS','CDW','CE','CEG','CF','CFG','CHD','CHRW','CHTR','CI',
  'CINF','CL','CLX','CMA','CMCSA','CME','CMG','CMI','CMS','CNC',
  'CNP','COF','COO','COP','COR','COST','CPAY','CPB','CPRT','CPT',
  'CRL','CRM','CRWD','CSCO','CSGP','CSX','CTAS','CTRA','CTSH',
  'CTVA','CVS','CVX','CZR','D','DAL','DAY','DD','DE','DECK',
  'DFS','DG','DGX','DHI','DHR','DIS','DLTR','DOV','DOW','DPZ',
  'DRI','DTE','DUK','DVA','DVN','DXCM','EA','EBAY','ECL','ED',
  'EFX','EIX','EL','EMN','EMR','ENPH','EOG','EPAM','EQIX','EQR',
  'EQT','ERIE','ES','ESS','ETN','ETR','EVRG','EW','EXC','EXPD',
  'EXPE','EXR','F','FANG','FAST','FBHS','FCX','FDS','FDX','FE',
  'FFIV','FI','FICO','FIS','FISV','FITB','FMC','FOX','FOXA',
  'FRT','FSLR','FTNT','FTV','GD','GDDY','GE','GEHC','GEN','GILD',
  'GIS','GL','GLW','GM','GNRC','GOOG','GOOGL','GPC','GPN','GRMN',
  'GS','GWW','HAL','HAS','HBAN','HCA','HD','HOLX','HON','HPE',
  'HPQ','HRL','HSIC','HST','HSY','HUBB','HUM','HWM','IBM','ICE',
  'IDXX','IEX','IFF','ILMN','INCY','INTC','INTU','INVH','IP','IPG',
  'IQV','IR','IRM','ISRG','IT','ITW','IVZ','J','JBHT','JBL',
  'JCI','JKHY','JNJ','JNPR','JPM','K','KDP','KEY','KEYS','KHC',
  'KIM','KLAC','KMB','KMI','KMX','KO','KR','KVUE','L','LDOS',
  'LEN','LH','LHX','LIN','LKQ','LLY','LMT','LNT','LOW','LRCX',
  'LULU','LUV','LVS','LW','LYB','LYV','MA','MAA','MAR','MAS',
  'MCD','MCHP','MCK','MCO','MDLZ','MDT','MET','META','MGM','MHK',
  'MKC','MKTX','MLM','MMC','MMM','MNST','MO','MOH','MOS','MPC',
  'MPWR','MRK','MRNA','MS','MSCI','MSFT','MSI','MTB','MTCH','MTD',
  'MU','NCLH','NDAQ','NDSN','NEE','NEM','NFLX','NI','NKE','NOC',
  'NOW','NRG','NSC','NTAP','NTRS','NUE','NVDA','NVR','NWS','NWSA',
  'NXPI','O','ODFL','OKE','OMC','ON','ORCL','ORLY','OTIS','OXY',
  'PANW','PARA','PAYC','PAYX','PCAR','PCG','PEG','PEP','PFE','PFG',
  'PG','PGR','PH','PHM','PKG','PLD','PM','PNC','PNR','PNW',
  'PODD','POOL','PPG','PPL','PRU','PSA','PSX','PTC','PVH','PWR',
  'PYPL','QCOM','QRVO','RCL','REG','REGN','RF','RHI','RJF',
  'RL','RMD','ROK','ROL','ROP','ROST','RSG','RTX','RVTY','SBAC',
  'SBUX','SCHW','SEE','SHW','SJM','SLB','SMCI','SNA',
  'SNPS','SO','SOLV','SPG','SPGI','SRE','STE','STLD','STT','STX',
  'STZ','SWK','SWKS','SYF','SYK','SYY','T','TAP','TDG','TDY',
  'TECH','TEL','TER','TFC','TFX','TGT','TJX','TMO','TMUS','TPR',
  'TRGP','TRMB','TROW','TRV','TSCO','TSLA','TSN','TT','TTWO','TXN',
  'TXT','TYL','UAL','UBER','UDR','UHS','ULTA','UNH','UNP','UPS',
  'URI','USB','V','VICI','VLO','VLTO','VMC','VRSK','VRSN','VRTX',
  'VTR','VTRS','VZ','WAB','WAT','WBA','WBD','WDC','WEC','WELL',
  'WFC','WM','WMB','WMT','WRB','WRK','WST','WTW','WY','WYNN',
  'XEL','XOM','XRAY','XYL','YUM','ZBH','ZBRA','ZION','ZTS'
]

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

    sector = prof.get('sector', 'Default')
    bench = BENCHMARKS.get(sector, BENCHMARKS['Default'])

    cr = rt.get('currentRatioTTM')
    de = rt.get('debtToEquityRatioTTM')
    at = rt.get('assetTurnoverTTM')
    om = rt.get('operatingProfitMarginTTM')
    pe = rt.get('priceToEarningsRatioTTM')

    # Revenue growth — manual from income statements
    rg = None
    if len(incomes) >= 8:
        recent = sum(q.get('revenue', 0) for q in incomes[:4])
        prior = sum(q.get('revenue', 0) for q in incomes[4:8])
        if prior > 0:
            rg = (recent - prior) / prior

    # Grade each ratio
    grades = [
        grade_higher(cr, bench['currentRatio']),
        'bad' if (de is not None and de < 0) else grade_lower(de, bench['debtToEquity']),
        grade_higher(at, bench['assetTurnover']),
        grade_higher(om, bench['operatingMargin']),
        grade_lower(pe, bench['peRatio']) if pe and pe > 0 else None,
        grade_higher(rg, bench['revenueGrowth']),
    ]

    scored = [g for g in grades if g is not None]
    total = len(scored)
    good = scored.count('good')
    bad = scored.count('bad')

    if total == 0: overall = '?'
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
        'marketCap': prof.get('marketCap'),
        'scores': {'good': good, 'ok': scored.count('ok'), 'bad': bad, 'total': total}
    }

def main():
    if not API_KEY:
        print('ERROR: FMP_API_KEY not set'); sys.exit(1)

    BATCH = 70
    results = []
    total_batches = (len(SP500) + BATCH - 1) // BATCH

    for b in range(total_batches):
        batch = SP500[b*BATCH:(b+1)*BATCH]
        print(f"Batch {b+1}/{total_batches}: scanning {len(batch)} stocks...")

        graded = 0; failed = 0
        for t in batch:
            try:
                r = process_stock(t)
                if r:
                    results.append(r); graded += 1
                else:
                    failed += 1
            except Exception as e:
                print(f"  WARNING: {t} failed — {e}"); failed += 1

        print(f"Batch {b+1} complete: {graded} graded, {failed} failed")
        if b < total_batches - 1:
            print("Waiting 60s (rate limit)...")
            time.sleep(60)

    results.sort(key=lambda x: x['ticker'])
    out = {'updated': __import__('datetime').datetime.utcnow().isoformat() + 'Z', 'stocks': results}
    out_path = Path(__file__).resolve().parent.parent.parent / 'grades.json'
    out_path.write_text(json.dumps(out, indent=2))
    print(f"\nDone! {len(results)} stocks graded. Output: {out_path}")

if __name__ == '__main__':
    main()
