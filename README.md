# Grimnir :: The Hooded One

A dark, cyberpunk cybersecurity news aggregator. Static site. Self-updating via RSS. Built for monetization with display ads, affiliate links, merch, and a paid job board.

## What it does

- **Aggregates** 20 curated cybersecurity feeds (Krebs, BleepingComputer, CISA KEV, NVD, vendor research, opinion).
- **Auto-updates** every 30 minutes via a GitHub Action that runs `scripts/fetch-feeds.js` and commits the cached JSON.
- **Searches and filters** the feed client-side (keyword search with phrase support, category chips).
- **Monetizes** via four streams: display ads, affiliate links, merch (Printful), and paid job listings.
- **Stays cheap.** Static hosting on Netlify / Cloudflare Pages / Vercel free tiers handles it.

## Quick start

```bash
# 1. Install deps
npm install

# 2. Generate the first feed cache
npm run fetch

# 3. Preview locally
npm run serve     # opens at http://localhost:8080
```

## Deploy

### Netlify (recommended, easiest)

1. Push this folder to a GitHub repo.
2. In Netlify: New site from Git, pick the repo. Build command and publish dir come from `netlify.toml`.
3. Add the GitHub Action secret `GITHUB_TOKEN` (auto-provided) so the bot can commit the refreshed cache. The Action runs every 30 minutes by default; tighten or loosen the cron in `.github/workflows/fetch-feeds.yml`.

### Cloudflare Pages

1. New project, connect repo. Build command: `npm install && npm run fetch`. Output dir: `/`.
2. Use a Cloudflare Worker Cron Trigger if you'd rather not use GitHub Actions.

### Vercel

1. Import repo. Framework: "Other". Output dir: `/`.
2. Schedule the fetch via Vercel Cron (`vercel.json` example below).

## Configuring monetization

### Display ads

Open `index.html`, `merch.html`, `deals.html`, `jobs.html`. Find `<!-- AdSense (paste your publisher ID) -->` and the `<div class="ad-slot">` placeholders. Replace each placeholder with your AdSense / Ezoic / Mediavine snippet. Slot names already in `data-slot=""` map cleanly to most ad managers.

### Affiliate links

Open `deals.html`. Replace `https://YOUR-AFFILIATE-LINK/...` and `https://amzn.to/YOUR-AFFILIATE-CODE-X` with your real links. Keep the `// affiliate link` disclosure visible (FTC requirement). Affiliate networks to register for:

- Amazon Associates (hardware and books)
- Impact / ShareASale / PartnerStack (software vendors like 1Password, Bitwarden, Proton, NordLayer, etc.)
- Direct programs from vendors (Yubico, Mullvad, etc.)

### Merch (Printful)

1. Sign up at printful.com, create products using the SVG in `assets/img/logo.svg`.
2. Either embed the Printful storefront iframe in `merch.html`, or use product page URLs (`https://your-store.printful.me/product/...`).
3. Pricing already targets a 40% margin. See "Pricing calculator" below.

### Paid job board

Each posting at $199 (basic) / $349 (featured) for 30 days. Replace the `mailto:` links with a Stripe Payment Link or Tally form. Roughly: 5 listings/month at $199 = $995/month with effectively zero marginal cost.

### Bonus stream: tip jar

Replace `YOUR_HANDLE` in the About page with your Buy Me A Coffee or Ko-fi handle. Optional but a nice low-friction recurring income stream.

## Pricing calculator (40% margin)

The retail price formula:

```
retail = ceil( (cost + shipping_baseline) / (1 - 0.40) )
        = ceil( (cost + shipping_baseline) / 0.60 )
```

Where `cost` is Printful's per-unit cost and `shipping_baseline` is your average shipping for that category (typically $4–6 US domestic, more for international). Round to the nearest dollar (or `.99`/`.00` to taste).

Example values used in `merch.html`:

| Item                  | Printful cost | Baseline ship | Retail | Margin |
| --------------------- | ------------- | ------------- | ------ | ------ |
| Shadow Hoodie         | $28.50        | $4.00         | $54    | ~40%   |
| Hooded One Tee        | $13.50        | $4.00         | $28    | ~37%   |
| Cipher Cap            | $11.95        | $4.00         | $26    | ~38%   |
| Operator Mug          | $7.95         | $4.00         | $18    | ~34%   |
| Sticker Pack (5)      | $4.50         | $1.50         | $10    | ~40%   |
| Operator Tote         | $9.95         | $4.00         | $22    | ~37%   |

(Verify against current Printful prices in your dashboard before going live.)

## Customizing feeds

Edit `feeds.json`. Each entry needs `name`, `category`, `url`. Categories used by the UI: `news`, `alerts`, `cves`, `opinion`, `research`, `bugbounty`. Add or remove sources as you like; the next scheduled fetch will pick them up.

## Customizing branding

- Logo: `assets/img/logo.svg`
- Favicon: `assets/img/favicon.svg`
- Colors / fonts: `assets/css/style.css` (see `:root` block at the top)
- Tagline / copy: `index.html` hero block

## File map

```
grimnir/
├── index.html              ← homepage with feed + search
├── merch.html              ← Printful merch grid
├── deals.html              ← affiliate / arsenal page
├── jobs.html               ← paid cybersecurity job board
├── about.html
├── disclaimer.html         ← liability disclaimer (full)
├── privacy.html
├── terms.html
├── feeds.json              ← list of RSS sources
├── cache/feed.json         ← generated by fetch-feeds.js
├── scripts/fetch-feeds.js  ← server-side aggregator
├── assets/
│   ├── css/style.css
│   ├── js/app.js           ← client app (feed render, search, filters)
│   ├── js/effects.js       ← matrix rain + glitch + ticker
│   └── img/{logo,favicon}.svg
├── .github/workflows/fetch-feeds.yml   ← every-30-min scheduler
├── netlify.toml
├── robots.txt
└── sitemap.xml
```

## Maintenance

This is designed for near-zero upkeep. Realistic monthly tasks:

- 2 min: skim the GitHub Action runs, fix any feed that 404'd.
- 5 min: rotate one or two affiliate placements based on your dashboard.
- 5 min: reply to any merch / job board emails.

That's it. The site is happy on its own otherwise.

## Income stream summary

| Stream                    | Setup time | Recurring effort | Realistic monthly $ (10k pageviews) |
| ------------------------- | ---------- | ---------------- | ----------------------------------- |
| Display ads (AdSense)     | 1 hour     | None             | $30 – $120                          |
| Display ads (Ezoic/Mediavine, 50k+ pv) | 2 hours | None  | $300 – $1,200                       |
| Affiliate links           | 4 hours    | Light            | $50 – $400                          |
| Merch (Printful)          | 6 hours    | None             | $40 – $300                          |
| Job board ($199/post)     | 2 hours    | Light            | $200 – $1,500                       |
| Tip jar (BMC/Ko-fi)       | 15 min     | None             | $10 – $80                           |

Numbers are illustrative; results depend on traffic, niche depth, and SEO.

## Legal notes

The disclaimer page (`disclaimer.html`) is intentionally aggressive and covers: AS-IS warranty disclaimer, no endorsement, no professional advice, user responsibility for lawful use, limitation of liability ($100 cap), affiliate / advertising disclosure, merch fulfillment, job board listings, security research conduct, DMCA, indemnification, governing law. Have a lawyer review before going live.

— Don the hood. Watch the wires.
