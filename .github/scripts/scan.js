#!/usr/bin/env node
// scan.js — Scans all S&P 500 stocks via FMP API, grades them, writes grades.json
// Uses only built-in Node.js modules (no npm dependencies).

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// S&P 500 tickers (all ~500 current constituents as of May 2025)
// ---------------------------------------------------------------------------
const SP500_TICKERS = [
  // ~503 S&P 500 constituents as of May 2025.
  // Removed: ATVI (acquired by MSFT 2023), SIVB (failed 2023), SBNY (failed 2023),
  //          PXD (acquired by XOM 2024), CTLT (acquired 2024), FLT (renamed CPAY).
  // Added recent constituents: GEV, PLTR, UBER, KVUE, SOLV, VLTO, CRWD, SMCI, etc.
  'AAPL','ABBV','ABT','ACN','ADBE','ADI','ADM','ADP','ADSK','AEE',
  'AEP','AES','AFL','AIG','AIZ','AJG','AKAM','ALB','ALGN','ALK',
  'ALL','ALLE','AMAT','AMCR','AMD','AME','AMGN','AMP','AMT','AMZN',
  'ANET','ANSS','AON','AOS','APA','APD','APH','APTV','ARE','ATO',
  'AVGO','AVY','AWK','AXP','AZO','BA','BAC','BAX','BBWI',
  'BBY','BDX','BEN','BF.B','BG','BIIB','BIO','BK','BKNG','BKR',
  'BLDR','BLK','BMY','BR','BRK.B','BRO','BSX','BWA','BX','BXP',
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
  'FRT','FSLR','FTNT','FTV','GD','GDDY','GE','GEHC','GEN','GEV',
  'GILD','GIS','GL','GLW','GM','GNRC','GOOG','GOOGL','GPC','GPN',
  'GRMN','GS','GWW','HAL','HAS','HBAN','HCA','HD','HOLX','HON',
  'HPE','HPQ','HRL','HSIC','HST','HSY','HUBB','HUM','HWM','IBM',
  'ICE','IDXX','IEX','IFF','ILMN','INCY','INTC','INTU','INVH','IP',
  'IPG','IQV','IR','IRM','ISRG','IT','ITW','IVZ','J','JBHT',
  'JBL','JCI','JKHY','JNJ','JNPR','JPM','K','KDP','KEY','KEYS',
  'KHC','KIM','KLAC','KMB','KMI','KMX','KO','KR','KVUE','L',
  'LDOS','LEN','LH','LHX','LIN','LKQ','LLY','LMT','LNT','LOW',
  'LRCX','LULU','LUV','LVS','LW','LYB','LYV','MA','MAA','MAR',
  'MAS','MCD','MCHP','MCK','MCO','MDLZ','MDT','MET','META','MGM',
  'MHK','MKC','MKTX','MLM','MMC','MMM','MNST','MO','MOH','MOS',
  'MPC','MPWR','MRK','MRNA','MS','MSCI','MSFT','MSI','MTB','MTCH',
  'MTD','MU','NCLH','NDAQ','NDSN','NEE','NEM','NFLX','NI','NKE',
  'NOC','NOW','NRG','NSC','NTAP','NTRS','NUE','NVDA','NVR','NWS',
  'NWSA','NXPI','O','ODFL','OKE','OMC','ON','ORCL','ORLY','OTIS',
  'OXY','PANW','PARA','PAYC','PAYX','PCAR','PCG','PEG','PEP','PFE',
  'PFG','PG','PGR','PH','PHM','PKG','PLD','PLTR','PM','PNC',
  'PNR','PNW','PODD','POOL','PPG','PPL','PRU','PSA','PSX','PTC',
  'PVH','PWR','PYPL','QCOM','QRVO','RCL','REG','REGN','RF','RHI',
  'RJF','RL','RMD','ROK','ROL','ROP','ROST','RSG','RTX','RVTY',
  'SBAC','SBUX','SCHW','SEE','SHW','SJM','SLB','SMCI','SNA',
  'SNPS','SO','SOLV','SPG','SPGI','SRE','STE','STLD','STT','STX',
  'STZ','SWK','SWKS','SYF','SYK','SYY','T','TAP','TDG','TDY',
  'TECH','TEL','TER','TFC','TFX','TGT','TJX','TMO','TMUS','TPR',
  'TRGP','TRMB','TROW','TRV','TSCO','TSLA','TSN','TT','TTWO','TXN',
  'TXT','TYL','UAL','UBER','UDR','UHS','ULTA','UNH','UNP','UPS',
  'URI','USB','V','VICI','VLO','VLTO','VMC','VRSK','VRSN','VRTX',
  'VTR','VTRS','VZ','WAB','WAT','WBA','WBD','WDC','WEC','WELL',
  'WFC','WM','WMB','WMT','WRB','WRK','WST','WTW','WY','WYNN',
  'XEL','XOM','XRAY','XYL','YUM','ZBH','ZBRA','ZION','ZTS'
];

// ---------------------------------------------------------------------------
// Sector benchmarks
// ---------------------------------------------------------------------------
const SECTOR_BENCHMARKS = {
  'Technology': {
    currentRatio:    { good: 1.5,  ok: 1.0  },
    debtToEquity:    { good: 0.5,  ok: 1.5  },
    assetTurnover:   { good: 0.6,  ok: 0.3  },
    operatingMargin: { good: 0.20, ok: 0.10 },
    peRatio:         { good: 25,   ok: 40   },
    revenueGrowth:   { good: 0.20, ok: 0.10 },
  },
  'Healthcare': {
    currentRatio:    { good: 1.5,  ok: 1.0  },
    debtToEquity:    { good: 0.6,  ok: 1.5  },
    assetTurnover:   { good: 0.5,  ok: 0.25 },
    operatingMargin: { good: 0.15, ok: 0.05 },
    peRatio:         { good: 20,   ok: 35   },
    revenueGrowth:   { good: 0.15, ok: 0.07 },
  },
  'Financial Services': {
    currentRatio:    { good: 1.2,  ok: 0.8  },
    debtToEquity:    { good: 2.0,  ok: 5.0  },
    assetTurnover:   { good: 0.08, ok: 0.03 },
    operatingMargin: { good: 0.30, ok: 0.15 },
    peRatio:         { good: 15,   ok: 25   },
    revenueGrowth:   { good: 0.10, ok: 0.05 },
  },
  'Consumer Cyclical': {
    currentRatio:    { good: 1.3,  ok: 0.9  },
    debtToEquity:    { good: 0.8,  ok: 2.0  },
    assetTurnover:   { good: 1.2,  ok: 0.6  },
    operatingMargin: { good: 0.12, ok: 0.05 },
    peRatio:         { good: 20,   ok: 30   },
    revenueGrowth:   { good: 0.12, ok: 0.05 },
  },
  'Consumer Defensive': {
    currentRatio:    { good: 1.2,  ok: 0.8  },
    debtToEquity:    { good: 1.0,  ok: 2.5  },
    assetTurnover:   { good: 1.0,  ok: 0.5  },
    operatingMargin: { good: 0.15, ok: 0.08 },
    peRatio:         { good: 22,   ok: 30   },
    revenueGrowth:   { good: 0.08, ok: 0.03 },
  },
  'Energy': {
    currentRatio:    { good: 1.3,  ok: 0.9  },
    debtToEquity:    { good: 0.5,  ok: 1.5  },
    assetTurnover:   { good: 0.7,  ok: 0.3  },
    operatingMargin: { good: 0.15, ok: 0.05 },
    peRatio:         { good: 12,   ok: 20   },
    revenueGrowth:   { good: 0.10, ok: 0.03 },
  },
  'Industrials': {
    currentRatio:    { good: 1.5,  ok: 1.0  },
    debtToEquity:    { good: 0.7,  ok: 1.8  },
    assetTurnover:   { good: 0.8,  ok: 0.4  },
    operatingMargin: { good: 0.12, ok: 0.06 },
    peRatio:         { good: 18,   ok: 28   },
    revenueGrowth:   { good: 0.10, ok: 0.04 },
  },
  'Real Estate': {
    currentRatio:    { good: 1.0,  ok: 0.5  },
    debtToEquity:    { good: 1.0,  ok: 2.5  },
    assetTurnover:   { good: 0.15, ok: 0.06 },
    operatingMargin: { good: 0.30, ok: 0.15 },
    peRatio:         { good: 30,   ok: 50   },
    revenueGrowth:   { good: 0.08, ok: 0.03 },
  },
  'Utilities': {
    currentRatio:    { good: 1.0,  ok: 0.7  },
    debtToEquity:    { good: 1.2,  ok: 2.5  },
    assetTurnover:   { good: 0.35, ok: 0.15 },
    operatingMargin: { good: 0.20, ok: 0.10 },
    peRatio:         { good: 18,   ok: 25   },
    revenueGrowth:   { good: 0.06, ok: 0.02 },
  },
  'Communication Services': {
    currentRatio:    { good: 1.2,  ok: 0.8  },
    debtToEquity:    { good: 0.8,  ok: 2.0  },
    assetTurnover:   { good: 0.5,  ok: 0.25 },
    operatingMargin: { good: 0.20, ok: 0.10 },
    peRatio:         { good: 20,   ok: 35   },
    revenueGrowth:   { good: 0.12, ok: 0.05 },
  },
  'Basic Materials': {
    currentRatio:    { good: 1.5,  ok: 1.0  },
    debtToEquity:    { good: 0.5,  ok: 1.5  },
    assetTurnover:   { good: 0.7,  ok: 0.35 },
    operatingMargin: { good: 0.15, ok: 0.07 },
    peRatio:         { good: 15,   ok: 25   },
    revenueGrowth:   { good: 0.10, ok: 0.04 },
  },
  'Default': {
    currentRatio:    { good: 1.5,  ok: 1.0  },
    debtToEquity:    { good: 0.8,  ok: 2.0  },
    assetTurnover:   { good: 0.7,  ok: 0.3  },
    operatingMargin: { good: 0.15, ok: 0.05 },
    peRatio:         { good: 20,   ok: 35   },
    revenueGrowth:   { good: 0.10, ok: 0.05 },
  },
};

// FMP sector names map directly; anything unrecognised falls back to Default.
function lookupBenchmark(fmpSector) {
  if (SECTOR_BENCHMARKS[fmpSector]) return SECTOR_BENCHMARKS[fmpSector];
  return SECTOR_BENCHMARKS['Default'];
}

// ---------------------------------------------------------------------------
// HTTP helper — returns parsed JSON, works with both http and https
// ---------------------------------------------------------------------------
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse error for ${url}: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
  });
}

// ---------------------------------------------------------------------------
// Grading helpers
// ---------------------------------------------------------------------------
function gradeHigherBetter(value, thresholds) {
  if (value == null || isNaN(value)) return null;
  if (value >= thresholds.good) return 'good';
  if (value >= thresholds.ok)   return 'ok';
  return 'bad';
}

function gradeLowerBetter(value, thresholds) {
  if (value == null || isNaN(value)) return null;
  if (value <= thresholds.good) return 'good';
  if (value <= thresholds.ok)   return 'ok';
  return 'bad';
}

function gradeDebtToEquity(value, thresholds) {
  if (value == null || isNaN(value)) return null;
  if (value < 0) return 'bad'; // negative equity
  return gradeLowerBetter(value, thresholds);
}

function gradePeRatio(value, thresholds) {
  if (value == null || isNaN(value) || value <= 0) return null; // only count if > 0
  return gradeLowerBetter(value, thresholds);
}

function computeOverallGrade(grades) {
  // grades is an array of 'good'|'ok'|'bad'|null
  const scored = grades.filter((g) => g !== null);
  const total = scored.length;
  if (total === 0) return { grade: '?', good: 0, ok: 0, bad: 0, total: 0 };

  const goodCount = scored.filter((g) => g === 'good').length;
  const okCount   = scored.filter((g) => g === 'ok').length;
  const badCount  = scored.filter((g) => g === 'bad').length;

  let overallGrade;
  if (goodCount >= 5)                        overallGrade = 'A';
  else if (goodCount >= 4 && badCount === 0) overallGrade = 'B+';
  else if (badCount <= 1)                    overallGrade = 'B';
  else if (badCount <= 2)                    overallGrade = 'C';
  else                                       overallGrade = 'D';

  return { grade: overallGrade, good: goodCount, ok: okCount, bad: badCount, total };
}

// ---------------------------------------------------------------------------
// Process a single stock
// ---------------------------------------------------------------------------
async function processStock(ticker, apiKey) {
  const base = 'https://financialmodelingprep.com/stable';
  const urls = [
    `${base}/balance-sheet-statement?symbol=${ticker}&period=quarter&limit=1&apikey=${apiKey}`,
    `${base}/income-statement?symbol=${ticker}&period=quarter&limit=8&apikey=${apiKey}`,
    `${base}/profile?symbol=${ticker}&apikey=${apiKey}`,
    `${base}/ratios-ttm?symbol=${ticker}&apikey=${apiKey}`,
  ];

  const [bsArr, isArr, profileArr, ratiosTtmArr] = await Promise.all(urls.map(fetchJSON));

  // Normalise — API returns arrays for some, objects/arrays for others
  const bs         = Array.isArray(bsArr)        ? bsArr[0]        : bsArr;
  const incomes    = Array.isArray(isArr)         ? isArr           : [];
  const profile    = Array.isArray(profileArr)    ? profileArr[0]   : profileArr;
  const ratiosTtm  = Array.isArray(ratiosTtmArr)  ? ratiosTtmArr[0] : ratiosTtmArr;

  if (!profile || !profile.companyName) {
    throw new Error(`No profile data for ${ticker}`);
  }

  const sector    = profile.sector || 'Default';
  const bench     = lookupBenchmark(sector);
  const currency  = profile.currency || 'USD';

  // ---- Ratio values ----

  // currentRatio
  let currentRatio = ratiosTtm?.currentRatioTTM;
  if (currentRatio == null && bs?.totalCurrentAssets && bs?.totalCurrentLiabilities) {
    currentRatio = bs.totalCurrentAssets / bs.totalCurrentLiabilities;
  }

  // debtToEquity
  let debtToEquity = ratiosTtm?.debtToEquityRatioTTM;
  // (fallback not specified beyond "manual" — rely on TTM)

  // assetTurnover
  let assetTurnover = ratiosTtm?.assetTurnoverTTM;

  // operatingMargin
  let operatingMargin = ratiosTtm?.operatingProfitMarginTTM;

  // peRatio
  let peRatio = ratiosTtm?.priceToEarningsRatioTTM;
  if (peRatio == null && currency === 'USD' && profile.price && profile.price > 0) {
    // Compute TTM EPS from income statements (sum last 4 quarters)
    const last4 = incomes.slice(0, 4);
    if (last4.length === 4) {
      const ttmEPS = last4.reduce((sum, q) => sum + (q.epsDiluted ?? q.epsdiluted ?? q.eps ?? 0), 0);
      if (ttmEPS > 0) {
        peRatio = profile.price / ttmEPS;
      }
    }
  }

  // revenueGrowth — always manual
  let revenueGrowth = null;
  if (incomes.length >= 8) {
    const recent = incomes.slice(0, 4).reduce((s, q) => s + (q.revenue || 0), 0);
    const prior  = incomes.slice(4, 8).reduce((s, q) => s + (q.revenue || 0), 0);
    if (prior > 0) {
      revenueGrowth = (recent - prior) / prior;
    }
  }

  // ---- Grade each ratio ----
  const grades = [
    gradeHigherBetter(currentRatio, bench.currentRatio),
    gradeDebtToEquity(debtToEquity, bench.debtToEquity),
    gradeHigherBetter(assetTurnover, bench.assetTurnover),
    gradeHigherBetter(operatingMargin, bench.operatingMargin),
    gradePeRatio(peRatio, bench.peRatio),
    gradeHigherBetter(revenueGrowth, bench.revenueGrowth),
  ];

  const { grade, good, ok, bad, total } = computeOverallGrade(grades);

  // FMP profile fields: price, changes (dollar change), mktCap (or marketCap depending on endpoint version)
  const price     = profile.price ?? null;
  const change    = profile.changes ?? profile.change ?? null;
  const mktCap    = profile.mktCap ?? profile.marketCap ?? null;

  // Compute changePct from price and change
  let changePct = null;
  if (change != null && price != null && (price - change) !== 0) {
    changePct = parseFloat(((change / (price - change)) * 100).toFixed(2));
  }

  return {
    ticker,
    name:      profile.companyName,
    sector,
    grade,
    price,
    change,
    changePct,
    marketCap: mktCap,
    scores:    { good, ok, bad, total },
  };
}

// ---------------------------------------------------------------------------
// Sleep helper
// ---------------------------------------------------------------------------
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    console.error('ERROR: FMP_API_KEY environment variable is not set.');
    process.exit(1);
  }

  const BATCH_SIZE = 70;
  const BATCH_DELAY_MS = 60_000; // 60 seconds between batches
  const tickers = SP500_TICKERS;
  const totalBatches = Math.ceil(tickers.length / BATCH_SIZE);

  console.log(`Starting S&P 500 scan: ${tickers.length} stocks, ${totalBatches} batches of up to ${BATCH_SIZE}`);

  const results = [];
  let totalGraded = 0;
  let totalFailed = 0;

  for (let b = 0; b < totalBatches; b++) {
    const start = b * BATCH_SIZE;
    const batch = tickers.slice(start, start + BATCH_SIZE);
    const batchNum = b + 1;

    console.log(`Batch ${batchNum}/${totalBatches}: scanning ${batch.length} stocks...`);

    const batchResults = await Promise.allSettled(
      batch.map((ticker) => processStock(ticker, apiKey))
    );

    let batchGraded = 0;
    let batchFailed = 0;

    for (let i = 0; i < batchResults.length; i++) {
      const r = batchResults[i];
      if (r.status === 'fulfilled') {
        results.push(r.value);
        batchGraded++;
      } else {
        console.warn(`  WARNING: ${batch[i]} failed — ${r.reason?.message || r.reason}`);
        batchFailed++;
      }
    }

    totalGraded += batchGraded;
    totalFailed += batchFailed;
    console.log(`Batch ${batchNum} complete: ${batchGraded} graded, ${batchFailed} failed`);

    // Wait between batches (but not after the last one)
    if (b < totalBatches - 1) {
      console.log(`Waiting 60 seconds before next batch (rate limit)...`);
      await sleep(BATCH_DELAY_MS);
    }
  }

  // Sort by ticker alphabetically
  results.sort((a, b) => a.ticker.localeCompare(b.ticker));

  const output = {
    updated: new Date().toISOString(),
    stocks: results,
  };

  const outPath = path.resolve(__dirname, '..', '..', 'grades.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log(`\nDone! ${totalGraded} stocks graded, ${totalFailed} failed.`);
  console.log(`Output written to ${outPath}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
