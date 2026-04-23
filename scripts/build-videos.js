#!/usr/bin/env node
/**
 * Grimnir video index builder
 * Fetches all Grimnir Digest videos from YouTube API → cache/videos.json
 * Runs daily via GitHub Actions + on repository_dispatch after each upload.
 */
const fs      = require("fs/promises");
const https   = require("https");
const path    = require("path");

const API_KEY     = process.env.YOUTUBE_API_KEY;
const CHANNEL_ID  = "UCBrijOVEMVm4NI_hWTPn6qQ";
const PLAYLIST_ID = "UUBrijOVEMVm4NI_hWTPn6qQ"; // uploads playlist
const OUT_FILE    = path.resolve(__dirname, "..", "cache", "videos.json");
const MAX_RESULTS = 50; // per page, max allowed

if (!API_KEY) {
  console.error("Missing YOUTUBE_API_KEY env var");
  process.exit(1);
}

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    }).on("error", reject);
  });
}

async function fetchAllVideos() {
  const videos = [];
  let pageToken = "";

  do {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems`
      + `?part=snippet,contentDetails`
      + `&playlistId=${PLAYLIST_ID}`
      + `&maxResults=${MAX_RESULTS}`
      + `&key=${API_KEY}`
      + (pageToken ? `&pageToken=${pageToken}` : "");

    const data = await get(url);
    if (data.error) throw new Error(JSON.stringify(data.error));

    for (const item of data.items || []) {
      const sn = item.snippet;
      const videoId = sn.resourceId?.videoId;
      if (!videoId || sn.title === "Private video" || sn.title === "Deleted video") continue;

      // Parse episode number from title
      const epMatch = sn.title.match(/#(\d+)/);
      const episode = epMatch ? parseInt(epMatch[1]) : null;

      // Extract topics from description hashtags
      const topics = [...(sn.description || "").matchAll(/#([a-zA-Z]+)/g)]
        .map(m => m[1].toLowerCase())
        .filter(t => !["grimnir","cybersecurity","infosec"].includes(t))
        .slice(0, 6);

      videos.push({
        videoId,
        episode,
        title:       sn.title,
        description: sn.description?.split("\n")[0]?.trim() || "",
        publishedAt: sn.publishedAt,
        thumbnail:   sn.thumbnails?.maxres?.url
                  || sn.thumbnails?.high?.url
                  || sn.thumbnails?.medium?.url
                  || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        url:         `https://youtu.be/${videoId}`,
        topics,
      });
    }

    pageToken = data.nextPageToken || "";
  } while (pageToken);

  // Sort newest first
  videos.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  return videos;
}

(async () => {
  console.log("Building Grimnir video index...");
  const videos = await fetchAllVideos();
  console.log(`  Found ${videos.length} videos`);

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify({
    generatedAt: new Date().toISOString(),
    channelId:   CHANNEL_ID,
    channelUrl:  `https://www.youtube.com/channel/${CHANNEL_ID}`,
    count:       videos.length,
    videos,
  }, null, 2));

  console.log(`  Written → ${path.relative(process.cwd(), OUT_FILE)}`);
})().catch(e => { console.error(e); process.exit(1); });
