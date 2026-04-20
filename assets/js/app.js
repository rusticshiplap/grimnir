/* Grimnir front-end app: feed, category filters, keyword search */
(async () => {
  const feedEl = document.getElementById("feed");
  if (!feedEl) return;

  const state = {
    category: "all",
    query: ""
  };
  let stories = [];

  const fmtDate = (iso) => {
    try {
      const d = new Date(iso);
      const diff = (Date.now() - d) / 1000;
      if (diff < 60) return "just now";
      if (diff < 3600) return Math.floor(diff / 60) + "m ago";
      if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
      if (diff < 604800) return Math.floor(diff / 86400) + "d ago";
      return d.toLocaleDateString();
    } catch { return ""; }
  };

  const escapeHtml = (s = "") => s.replace(/[&<>"']/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // split query into tokens, each becomes an AND condition; quoted phrases stay together
  const tokenize = (q) => {
    const out = [];
    const re = /"([^"]+)"|(\S+)/g;
    let m;
    while ((m = re.exec(q)) !== null) out.push((m[1] || m[2]).toLowerCase());
    return out;
  };

  const highlight = (text, tokens) => {
    if (!tokens.length) return escapeHtml(text);
    let safe = escapeHtml(text);
    for (const t of tokens) {
      const re = new RegExp("(" + escapeRe(t) + ")", "ig");
      safe = safe.replace(re, '<mark class="hit">$1</mark>');
    }
    return safe;
  };

  const matches = (s, tokens) => {
    if (!tokens.length) return true;
    const hay = ((s.title || "") + " " + (s.description || "") + " " + (s.source || "") + " " + (s.category || "")).toLowerCase();
    return tokens.every(t => hay.includes(t));
  };

  const render = () => {
    const tokens = tokenize(state.query.trim());
    const list = stories
      .filter(s => state.category === "all" || s.category === state.category)
      .filter(s => matches(s, tokens));

    const countEl = document.querySelector(".searchbar .count");
    if (countEl) countEl.textContent = `${list.length} signal${list.length === 1 ? "" : "s"}`;

    if (!list.length) {
      feedEl.innerHTML = '<div class="empty">// no signals match your query //</div>';
      return;
    }

    feedEl.innerHTML = list.map(s => `
      <a class="card fade-in" href="${escapeHtml(s.link)}" target="_blank" rel="noopener nofollow">
        <div class="card-image ${s.image ? 'has-image' : 'no-image'}">
          ${s.image ? `<img src="${escapeHtml(s.image)}" alt="" loading="lazy" onerror="this.parentElement.classList.add('no-image'); this.style.display='none'">` : `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="placeholder-grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#1a3a52;stop-opacity:1" /><stop offset="100%" style="stop-color:#0f1a2e;stop-opacity:1" /></linearGradient></defs><rect width="100" height="100" fill="url(#placeholder-grad)"/><circle cx="50" cy="35" r="12" fill="#00e5ff" opacity="0.6"/><path d="M 20 70 L 50 45 L 80 70 Z" fill="none" stroke="#00e5ff" stroke-width="2" opacity="0.6"/></svg>`}
        </div>
        <div class="card-content">
          <div class="meta">
            <span class="source">${escapeHtml(s.source)}</span>
            <span>${fmtDate(s.pubDate)}</span>
          </div>
          <h3>${highlight(s.title || "", tokens)}</h3>
          <p>${highlight((s.description || "").slice(0, 240), tokens)}</p>
          <span class="read">read dispatch →</span>
        </div>
      </a>
    `).join("");
    document.querySelectorAll(".fade-in").forEach(el => el.classList.add("visible"));
  };

  const loadFeed = async () => {
    feedEl.innerHTML = '<div class="loading">// listening for signals //</div>';
    try {
      const r = await fetch("cache/feed.json?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) throw new Error("feed cache missing");
      const data = await r.json();
      stories = (data.items || []).sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
      render();
    } catch (e) {
      console.warn("Falling back to client-side fetch:", e.message);
      await clientFallback();
    }
  };

  async function clientFallback() {
    try {
      const cfg = await (await fetch("feeds.json")).json();
      const limited = cfg.sources.slice(0, 8);
      const results = await Promise.all(limited.map(async src => {
        try {
          const url = "https://api.rss2json.com/v1/api.json?rss_url=" + encodeURIComponent(src.url);
          const r = await fetch(url);
          const j = await r.json();
          if (!j.items) return [];
          return j.items.slice(0, 10).map(i => ({
            title: i.title,
            link: i.link,
            description: (i.description || "").replace(/<[^>]*>/g, ""),
            pubDate: i.pubDate,
            source: src.name,
            category: src.category,
            image: i.enclosure?.url || null
          }));
        } catch { return []; }
      }));
      stories = results.flat().sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
      render();
    } catch (e) {
      feedEl.innerHTML = '<div class="empty">// feed unavailable. please try again later //</div>';
    }
  }

  // ----- category chips -----
  document.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      state.category = chip.dataset.cat;
      render();
    });
  });

  // ----- search bar -----
  const searchEl = document.getElementById("search");
  const clearEl = document.querySelector(".searchbar .clear");
  const barEl = document.querySelector(".searchbar");
  let debounceT;
  if (searchEl) {
    const runSearch = () => {
      state.query = searchEl.value;
      if (barEl) barEl.classList.toggle("has-query", !!state.query.trim());
      clearTimeout(debounceT);
      debounceT = setTimeout(render, 120);
    };
    searchEl.addEventListener("input", runSearch);
    searchEl.addEventListener("keydown", (e) => { if (e.key === "Escape") { searchEl.value = ""; runSearch(); } });
    if (clearEl) clearEl.addEventListener("click", () => { searchEl.value = ""; runSearch(); searchEl.focus(); });

    // honor ?q= deep-links
    const params = new URLSearchParams(location.search);
    if (params.has("q")) { searchEl.value = params.get("q"); runSearch(); }

    // keyboard shortcut: "/" focuses search
    window.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
        e.preventDefault();
        searchEl.focus();
      }
    });
  }

  await loadFeed();
})();
