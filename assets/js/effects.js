/* Matrix rain + terminal ticker for Grimnir */
(() => {
  // ---------- Matrix rain ----------
  const canvas = document.getElementById("matrix");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    let cols, drops, w, h;
    const glyphs = "0123456789ABCDEFアカサタナハマヤラワ</>[]{}#@$%&*".split("");

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      cols = Math.floor(w / 16);
      drops = Array.from({ length: cols }, () => Math.random() * -100);
    }
    resize();
    window.addEventListener("resize", resize);

    function draw() {
      ctx.fillStyle = "rgba(2, 4, 10, 0.08)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#22d3ee";
      ctx.font = "14px 'JetBrains Mono', monospace";
      for (let i = 0; i < cols; i++) {
        const ch = glyphs[(Math.random() * glyphs.length) | 0];
        const x = i * 16;
        const y = drops[i] * 16;
        ctx.fillStyle = Math.random() > 0.985 ? "#22c55e" : "rgba(34,211,238,0.75)";
        ctx.fillText(ch, x, y);
        if (y > h && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
      requestAnimationFrame(draw);
    }
    draw();
  }

  // ---------- Terminal ticker ----------
  const tickerLine = document.querySelector(".ticker .line");
  if (tickerLine) {
    const msgs = [
      "scanning_darkweb --mode passive --out /tmp/shadow.log",
      "ingesting CVE feeds from MITRE, NVD, CISA KEV",
      "decrypting threat intel ... 87.3% complete",
      "loading Grimnir archive v9.3.1",
      "uptime: 00:00:00:0x1A  signals: 0x7F  watchers: ∞",
      "analyzing 23 RSS sources | 612 stories in last 24h",
      "zero-day radar: nominal | ransomware radar: elevated",
      "listen for footsteps in the dark ..."
    ];
    let i = 0, j = 0, current = msgs[0];
    const cursor = document.createElement("span");
    cursor.className = "cursor";
    tickerLine.innerHTML = "";
    tickerLine.appendChild(cursor);

    function type() {
      if (j <= current.length) {
        tickerLine.textContent = current.slice(0, j);
        tickerLine.appendChild(cursor);
        j++;
        setTimeout(type, 42 + Math.random() * 50);
      } else {
        setTimeout(() => {
          i = (i + 1) % msgs.length;
          current = msgs[i];
          j = 0;
          type();
        }, 2600);
      }
    }
    type();
  }

  // ---------- Fade in on scroll ----------
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => e.isIntersecting && e.target.classList.add("visible"));
  }, { threshold: 0.1 });
  document.querySelectorAll(".fade-in").forEach(el => io.observe(el));
})();
