# Intrinsics

Any US stock, graded A to F against its own sector. Static PWA, no login, no
backend of its own.

Live at **https://intrinsics.altorien.com**.

## What runs where

| Piece | Where | Notes |
|---|---|---|
| The app | GitHub Pages, `altorienl/intrinsics`, branch `main` | `CNAME` holds the custom domain |
| Live market data | `intrinsics-api.altorien.workers.dev` | Cloudflare Worker, see `worker/` |
| Nightly grades | `.github/workflows/scan.yml` | writes `grades.json`, commits it |
| `intrinsics.app` | GoDaddy forward to the Cloudflare domain | can lapse; nothing depends on it |

## Secrets

One key, in **two places**. Rotating it means updating both, and missing
either fails quietly rather than loudly.

| Copy | Where | Set it with | Breaks if missing |
|---|---|---|---|
| Browser traffic | Cloudflare secret on `intrinsics-api` | `cd worker && npx wrangler secret put FMP_API_KEY` | every quote and search on the page |
| Nightly scan | GitHub Actions secret `FMP_API_KEY` on this repo | repo → Settings → Secrets → Actions | `grades.json` silently stops updating |

The account is **financialmodelingprep.com**, paid plan, under the personal
email — not an employer address.

> The key used to be hardcoded in `index.html` and shipped to every visitor.
> It was in the public history from the initial commit and served live for
> five months, so that value is burned. It is still in the git history and
> always will be; rotation is the only thing that fixes it, not deletion.
> See `worker/README.md` for why the proxy exists.

## Settings that live in a dashboard, not in this repo

A rebuild from a bare clone will not recreate these. Written down because
nothing else records them:

- **GitHub Pages**: source `main` / root, custom domain
  `intrinsics.altorien.com`, **Enforce HTTPS on**. With it off, Pages served
  the whole app over plaintext `http://` and `altorienl.github.io/intrinsics/`
  redirected to `http://` as well.
- **DNS**: `intrinsics.altorien.com` is a CNAME to `altorienl.github.io`, on
  Cloudflare nameservers but **grey-clouded** (DNS only, not proxied) so Pages
  terminates TLS itself.
- **Ordering trap, opposite to the Workers one:** changing `CNAME` takes the
  old hostname down the moment it is pushed, so the DNS record must exist
  *first*. A Cloudflare Workers custom domain is the reverse — it refuses to
  attach to a hostname that already has DNS records.

## Rebuilding on a new machine

```sh
gh repo clone altorienl/intrinsics && cd intrinsics
# the page is static; open index.html or serve it
python3 -m http.server 8000
```

Nothing to install and no build step. Only the Worker needs deploying, and
only when `worker/` changes.
