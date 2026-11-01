# intrinsics-api

Holds the FMP key so the page does not have to.

Intrinsics is a static site on GitHub Pages. A static site cannot keep a secret,
so for its first five months the FMP key shipped to every visitor in plain text
inside `index.html`, and sat in the public git history from the initial commit.
That key is burned; rotating it without moving it would only have published a
new one on the next deploy. This Worker is where it lives now.

## Deploy

```sh
npx wrangler deploy
npx wrangler secret put FMP_API_KEY     # paste the key, it is never written to disk
```

`ALLOWED_ORIGINS` is a var in `wrangler.toml`. `FMP_API_KEY` is a secret and
must never become a var: vars are readable in the dashboard and committed here
in plain text.

## Rotating the key

Two places hold it, and missing either breaks something quietly:

1. `npx wrangler secret put FMP_API_KEY` — the page goes blank without this.
2. GitHub → repo Settings → Secrets → Actions → `FMP_API_KEY` — the nightly
   `scan.yml` grade refresh silently stops without this, and nothing reports it.

## Checks

```sh
curl https://intrinsics-api.altorien.workers.dev/health
# {"ok":true,"keyed":true}  -- keyed:false means the secret is missing

curl -H 'Origin: https://intrinsics.altorien.com' \
  'https://intrinsics-api.altorien.workers.dev/fmp/quote?symbol=AAPL'
```

Requests with no `Origin`, or an origin outside the allowlist, get a 403.

## Local development

`localhost` is deliberately absent from the production allowlist: an `Origin`
header is trivially forged by anything that is not a browser, so a localhost
entry there is a standing bypass. Run against a local Worker instead:

```sh
npx wrangler dev --var ALLOWED_ORIGINS:http://localhost:8000
```

## Adding an endpoint

`ENDPOINTS` in `worker.js` is an exact-match allowlist mapping each path to its
cache TTL. A call added to `index.html` without a matching entry here returns
404. That is deliberate — an allowlist that grows on its own is not one.

The cache is what protects the paid allowance. Most traffic is the same few
tickers, so repeats are answered at the edge and never reach FMP. It guards the
quota by making requests cheaper rather than by turning real users away.
