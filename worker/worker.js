// Intrinsics data proxy.
//
// The page used to call FMP directly, which meant shipping the API key to every
// visitor. A static site cannot hold a secret, so the key moved here and the
// browser now asks this Worker instead. The browser never sees a credential.
//
// Two things keep this from becoming an open FMP relay for the whole internet:
// an exact-match endpoint allowlist, and an edge cache. The cache matters more
// than it looks -- most traffic is the same few tickers, so repeat requests are
// answered by Cloudflare and never reach FMP at all. That protects the paid
// allowance while making the app faster, rather than by turning real users away.

// Exactly the endpoints index.html calls, nothing more. Adding a call to the
// page means adding it here too, which is deliberate: an allowlist that drifts
// open on its own is not an allowlist.
var ENDPOINTS = {
    'quote':                      60,
    'aftermarket-trade':          60,
    'biggest-gainers':            60,
    'biggest-losers':             60,
    'search-symbol':             300,
    'search-name':               300,
    'historical-chart/5min':     300,
    'earnings-calendar':         900,
    'historical-price-eod/light': 900,
    'balance-sheet-statement':  3600,
    'income-statement':         3600,
    'profile':                  3600,
    'ratios-ttm':               3600,
    'analyst-estimates':        3600,
    'key-metrics-ttm':          3600,
    'earnings':                 3600,
    'price-target-consensus':   3600,
    'stock-peers':              3600
};

var UPSTREAM = 'https://financialmodelingprep.com/stable/';

// Params the page is allowed to forward. apikey is deliberately absent: the
// caller's value is dropped and ours is set after this loop, so a caller cannot
// substitute their own key or read ours back out of an echo.
var PARAMS = ['symbol', 'query', 'limit', 'period', 'from', 'to'];

function originOk(req, env) {
    var allowed = (env.ALLOWED_ORIGINS || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!allowed.length) return false;   // fail closed; an unset var must not open the door
    var origin = req.headers.get('Origin');
    if (!origin) return false;
    return allowed.indexOf(origin) !== -1;
}

function cors(origin) {
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Vary': 'Origin'
    };
}

function json(body, status, headers) {
    return new Response(JSON.stringify(body), {
        status: status,
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {})
    });
}

export default {
    async fetch(req, env, ctx) {
        var url = new URL(req.url);
        var origin = req.headers.get('Origin') || '';

        if (req.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: cors(originOk(req, env) ? origin : 'null') });
        }

        // Unauthenticated liveness check. Says nothing a caller could not guess,
        // and costs no upstream call -- so it stays reachable from anywhere.
        if (url.pathname === '/health') {
            return json({ ok: true, keyed: !!env.FMP_API_KEY }, 200, { 'Access-Control-Allow-Origin': '*' });
        }

        if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405, {});
        if (!originOk(req, env)) return json({ error: 'Forbidden' }, 403, {});

        if (!url.pathname.startsWith('/fmp/')) return json({ error: 'Not found' }, 404, cors(origin));
        var endpoint = url.pathname.slice('/fmp/'.length);
        if (!Object.prototype.hasOwnProperty.call(ENDPOINTS, endpoint)) {
            return json({ error: 'Unknown endpoint' }, 404, cors(origin));
        }
        if (!env.FMP_API_KEY) return json({ error: 'Not configured' }, 503, cors(origin));

        // Build the upstream URL from scratch rather than forwarding the caller's.
        // Only known params survive, each re-encoded, so nothing a caller sends
        // can reshape the request or append a second apikey.
        var up = new URL(UPSTREAM + endpoint);
        for (var i = 0; i < PARAMS.length; i++) {
            var v = url.searchParams.get(PARAMS[i]);
            if (v !== null && v !== '') up.searchParams.set(PARAMS[i], v);
        }

        // Cache key is the upstream URL *without* the key, so the cached entry is
        // never a place the credential could be read back from.
        var cacheKey = new Request(up.toString(), { method: 'GET' });
        var cache = caches.default;
        var hit = await cache.match(cacheKey);
        if (hit) {
            var h = new Headers(hit.headers);
            var ch = cors(origin);
            for (var k in ch) h.set(k, ch[k]);
            h.set('X-Cache', 'HIT');
            return new Response(hit.body, { status: hit.status, headers: h });
        }

        up.searchParams.set('apikey', env.FMP_API_KEY);

        var res;
        try {
            res = await fetch(up.toString(), { headers: { 'Accept': 'application/json' } });
        } catch (e) {
            return json({ error: 'Upstream unavailable' }, 502, cors(origin));
        }

        var body = await res.text();

        // Never pass an upstream error body through unread: FMP echoes the query
        // string in some error payloads, and that query string holds the key.
        if (!res.ok) {
            return json({ error: 'Upstream error', status: res.status }, res.status === 429 ? 429 : 502, cors(origin));
        }

        var ttl = ENDPOINTS[endpoint];
        var headers = new Headers({
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=' + ttl
        });
        ctx.waitUntil(cache.put(cacheKey, new Response(body, { status: 200, headers: new Headers(headers) })));

        var ch2 = cors(origin);
        for (var k2 in ch2) headers.set(k2, ch2[k2]);
        headers.set('X-Cache', 'MISS');
        return new Response(body, { status: 200, headers: headers });
    }
};
