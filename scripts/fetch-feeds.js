#!/usr/bin/env node
/**
 * Grimnir feed fetcher
 * ---------------------
 * Reads feeds.json, fetches every RSS/Atom source, parses, dedupes,
 * sorts by date, and writes cache/feed.json.
 *
 * Images: pulled from media:content, media:thumbnail, content:encoded,
 * and og:image page-fetch fallback for sources that embed nothing in RSS.
 *
 * Deps: rss-parser only (node built-ins for OG fetch).
 */
const fs      = require("fs/promises");
const https   = require("https");
const http    = require("http");
const path    = require("path");
const Parser  = require("rss-parser");

const ROOT       = path.resolve(__dirname, "..");
const FEEDS_FILE = path.join(ROOT, "feeds.json");
const CACHE_DIR  = path.join(ROOT, "cache");
const OUT_FILE   = path.join(CACHE_DIR, "feed.json");

const MAX_PER_SOURCE         = 25;
const MAX_TOTAL              = 400;
const FEED_TIMEOUT_MS        = 10_000;
const OG_TIMEOUT_MS          = 5_000;
const OG_CONCURRENCY         = 8;    // parallel OG fetches at once
const MAX_OG_BYTES           = 32_768; // read first 32 KB looking for og:image
const MAX_CONTENT_PARSE_LEN  = 15_000;

// ── parser with all needed custom fields ────────────────────────────────────
const parser = new Parser({
  timeout: FEED_TIMEOUT_MS,
  headers: { "User-Agent": "GrimnirBot/1.0 (+https://grimnir.net)" },
  maxRedirects: 5,
  customFields: {
    item: [
      ["media:content",   "mediaContent"],
      ["media:thumbnail", "mediaThumbnail"],
      ["content:encoded", "contentEncoded"],
    ],
  },
});

// ── hard-kill timeout wrapper ────────────────────────────────────────────────
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    promise.then(v => { clearTimeout(t); resolve(v); },
                 e => { clearTimeout(t); reject(e); });
  });
}

// ── strip HTML tags ──────────────────────────────────────────────────────────
const stripHtml = (s = "") =>
  s.replace(/<[^>]*>/g, " ")
   .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
   .replace(/\s+/g, " ").trim();

const hashKey = (s) =>
  (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 80);

// ── extract the first usable image URL from an rss-parser item ──────────────
function extractImage(item) {
  try {
    // media:content — rss-parser stores as object {'$':{url}} or array
    const mc = item.mediaContent;
    if (mc) {
      const url = (mc["$"] && mc["$"].url) ||
                  (Array.isArray(mc) && mc[0] && mc[0]["$"] && mc[0]["$"].url);
      if (url) return url;
    }

    // media:thumbnail
    const mt = item.mediaThumbnail;
    if (mt) {
      const url = (mt["$"] && mt["$"].url) ||
                  (Array.isArray(mt) && mt[0] && mt[0]["$"] && mt[0]["$"].url);
      if (url) return url;
    }

    // enclosure (standard RSS podcast/image attach)
    if (item.enclosure?.url && item.enclosure.type?.startsWith("image")) {
      return item.enclosure.url;
    }

    // itunes:image
    if (item.itunes?.image) return item.itunes.image;

    // <img> in content:encoded (Krebs, Microsoft, SANS, Troy Hunt …)
    const encoded = (item.contentEncoded || "").slice(0, MAX_CONTENT_PARSE_LEN);
    if (encoded) {
      const m = encoded.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (m && m[1] && !m[1].includes("pixel") && !m[1].includes("tracking") && m[1].length < 500) {
        return m[1];
      }
    }

    // <img> in content field (last resort before OG fetch)
    const content = (item.content || "").slice(0, MAX_CONTENT_PARSE_LEN);
    if (content) {
      const m = content.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (m && m[1] && !m[1].includes("pixel") && !m[1].includes("tracking") && m[1].length < 500) {
        return m[1];
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ── fetch og:image / twitter:image from article page ────────────────────────
function fetchOgImage(articleUrl) {
  return new Promise((resolve) => {
    if (!articleUrl || (!articleUrl.startsWith("http://") && !articleUrl.startsWith("https://"))) {
      return resolve(null);
    }
    const mod = articleUrl.startsWith("https") ? https : http;
    let chunks = "";
    let settled = false;
    const done = (val) => { if (!settled) { settled = true; resolve(val); } };

    const timer = setTimeout(() => done(null), OG_TIMEOUT_MS);

    try {
      const req = mod.get(articleUrl, {
        headers: {
          "User-Agent": "GrimnirBot/1.0 (+https://grimnir.net)",
          "Accept": "text/html",
        },
        timeout: OG_TIMEOUT_MS,
      }, (res) => {
        // follow one redirect
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          clearTimeout(timer);
          req.destroy();
          return fetchOgImage(res.headers.location).then(done);
        }
        if (res.statusCode !== 200) { clearTimeout(timer); return done(null); }

        res.on("data", (chunk) => {
          chunks += chunk.toString("utf8", 0, Math.min(chunk.length, MAX_OG_BYTES - chunks.length));
          if (chunks.length >= MAX_OG_BYTES) { req.destroy(); }
          // parse as soon as we see what we need
          const m = chunks.match(/<meta[^>]+(?:property=["']og:image["']|name=["']twitter:image["'])[^>]+content=["']([^"']+)["']/i)
                 || chunks.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property=["']og:image["']|name=["']twitter:image["'])/i);
          if (m && m[1]) { req.destroy(); clearTimeout(timer); done(m[1]); }
        });
        res.on("end", () => { clearTimeout(timer); done(null); });
        res.on("error", () => { clearTimeout(timer); done(null); });
      });
      req.on("error", () => { clearTimeout(timer); done(null); });
      req.on("timeout", () => { req.destroy(); clearTimeout(timer); done(null); });
    } catch {
      clearTimeout(timer);
      done(null);
    }
  });
}

// ── run OG fetch for a batch with concurrency cap ───────────────────────────
async function fillMissingImages(items) {
  const needy = items.filter(i => !i.image && i.link);
  if (!needy.length) return;

  let idx = 0;
  async function worker() {
    while (idx < needy.length) {
      const item = needy[idx++];
      item.image = await fetchOgImage(item.link);
    }
  }
  await Promise.all(Array.from({ length: OG_CONCURRENCY }, worker));
}

// ── fetch one RSS source ─────────────────────────────────────────────────────
async function fetchSource(src) {
  try {
    const feed = await withTimeout(parser.parseURL(src.url), FEED_TIMEOUT_MS);
    const items = (feed.items || [])
      .slice(0, MAX_PER_SOURCE)
      .map(it => ({
        title:       (it.title || "").trim(),
        link:        it.link || it.guid || "",
        description: stripHtml(it.contentSnippet || it.content || it.summary || "").slice(0, 600),
        pubDate:     it.isoDate || it.pubDate || new Date().toISOString(),
        source:      src.name,
        category:    src.category || "news",
        image:       extractImage(it) || null,
      }))
      .filter(i => i.title && i.link);

    // OG fallback for items still missing an image
    await fillMissingImages(items);

    const withImg = items.filter(i => i.image).length;
    console.log(`  ✓ ${src.name} (${items.length} items, ${withImg} with images)`);
    return items;
  } catch (e) {
    console.warn(`  ✗ ${src.name}: ${e.message}`);
    return [];
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
  const cfg = JSON.parse(await fs.readFile(FEEDS_FILE, "utf8"));
  console.log(`Grimnir :: fetching ${cfg.sources.length} sources`);

  const results = await Promise.allSettled(cfg.sources.map(fetchSource));
  let all = results.flatMap(r => r.status === "fulfilled" ? r.value : []);

  // dedupe by link + fuzzy title
  const seen = new Set();
  all = all.filter(i => {
    const key = hashKey(i.link) + "::" + hashKey(i.title).slice(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  all.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  all = all.slice(0, MAX_TOTAL);

  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify({
    generatedAt: new Date().toISOString(),
    count:       all.length,
    sources:     cfg.sources.map(s => s.name),
    items:       all,
  }, null, 2));

  const withImg = all.filter(i => i.image).length;
  console.log(`\nWrote ${all.length} items → ${path.relative(ROOT, OUT_FILE)}`);
  console.log(`Images: ${withImg}/${all.length} (${Math.round(100 * withImg / all.length)}%)`);
})().catch(err => { console.error(err); process.exit(1); });
