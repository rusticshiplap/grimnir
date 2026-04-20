#!/usr/bin/env node
/**
 * Grimnir feed fetcher
 * ---------------------
 * Reads feeds.json, fetches every RSS/Atom source, parses, dedupes,
 * sorts by date, and writes cache/feed.json. Run on a schedule (GitHub
 * Action, Netlify cron, Cloudflare Cron Trigger, or Vercel cron).
 *
 * Deps: `rss-parser` only.
 *   npm i rss-parser
 */
const fs = require("fs/promises");
const path = require("path");
const Parser = require("rss-parser");

const ROOT = path.resolve(__dirname, "..");
const FEEDS_FILE = path.join(ROOT, "feeds.json");
const CACHE_DIR = path.join(ROOT, "cache");
const OUT_FILE = path.join(CACHE_DIR, "feed.json");

const MAX_PER_SOURCE = 25;     // keep this many newest items per source
const MAX_TOTAL = 400;         // final cap across all sources
const TIMEOUT_MS = 12_000;

const parser = new Parser({
  timeout: TIMEOUT_MS,
  headers: { "User-Agent": "GrimnirBot/1.0 (+https://grimnir.example)" }
});

const stripHtml = (s = "") =>
  s.replace(/<[^>]*>/g, " ")
   .replace(/&nbsp;/g, " ")
   .replace(/&amp;/g, "&")
   .replace(/\s+/g, " ")
   .trim();

const hashKey = (s) =>
  (s || "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 80);

// Extract image URL from various RSS/Atom formats
const extractImage = (item) => {
  // Try media:content (Atom)
  if (item.media?.content?.[0]?.url) return item.media.content[0].url;
  
  // Try media:thumbnail
  if (item.media?.thumbnail?.[0]?.url) return item.media.thumbnail[0].url;
  
  // Try enclosure (Atom)
  if (item.enclosure?.url && item.enclosure.type?.startsWith("image")) {
    return item.enclosure.url;
  }
  
  // Try image object (some feeds)
  if (item.image?.url) return item.image.url;
  
  // Try first <img src> in content
  const content = item.content || item.contentSnippet || "";
  const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/);
  if (imgMatch) return imgMatch[1];
  
  return null;
};

async function fetchSource(src) {
  try {
    const feed = await parser.parseURL(src.url);
    const items = (feed.items || [])
      .slice(0, MAX_PER_SOURCE)
      .map(it => {
        const image = extractImage(it);
        return {
          title: (it.title || "").trim(),
          link: it.link || it.guid || "",
          description: stripHtml(
            it.contentSnippet || it.content || it.summary || ""
          ).slice(0, 600),
          pubDate: it.isoDate || it.pubDate || new Date().toISOString(),
          source: src.name,
          category: src.category || "news",
          image: image || null
        };
      })
      .filter(i => i.title && i.link);
    console.log(`  ✓ ${src.name} (${items.length})`);
    return items;
  } catch (e) {
    console.warn(`  ✗ ${src.name}: ${e.message}`);
    return [];
  }
}

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

  // newest first, then cap
  all.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  all = all.slice(0, MAX_TOTAL);

  await fs.mkdir(CACHE_DIR, { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    count: all.length,
    sources: cfg.sources.map(s => s.name),
    items: all
  };
  await fs.writeFile(OUT_FILE, JSON.stringify(payload, null, 2));
  console.log(`\nWrote ${all.length} items to ${path.relative(ROOT, OUT_FILE)}`);
})().catch(err => { console.error(err); process.exit(1); });
