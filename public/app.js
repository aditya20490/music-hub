const $ = (s) => document.querySelector(s);
const tabs = document.querySelectorAll(".tab");
const hints = {
  lyrics: "Song or artist name…",
  cover: "Album, movie, app, podcast…",
  music: "Song or artist name…",
};
let mode = "lyrics";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const setStatus = (t = "") => ($("#status").textContent = t);
const fmt = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

async function api(path) {
  const r = await fetch(path);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}

function setMode(m) {
  mode = m;
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.mode === m));
  $("#q").placeholder = hints[m];
  $("#entity").hidden = m !== "cover";
  $("#results").innerHTML = "";
  $("#lyrics").hidden = true;
  setStatus();
}

tabs.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));

$("#form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("#q").value.trim();
  if (!q) return;
  setStatus("Searching…");
  $("#results").innerHTML = "";
  $("#lyrics").hidden = true;
  try {
    let data;
    if (mode === "lyrics") {
      data = await api(`/api/lyrics/search?q=${encodeURIComponent(q)}`);
      $("#results").innerHTML = data.map(lyricCard).join("");
    } else if (mode === "cover") {
      const entity = $("#entity").value;
      data = await api(`/api/artwork?q=${encodeURIComponent(q)}&entity=${entity}`);
      $("#results").innerHTML = data.map(coverCard).join("");
    } else {
      data = await api(`/api/music?q=${encodeURIComponent(q)}`);
      $("#results").innerHTML = data.map(musicCard).join("");
    }
    setStatus(data.length ? "" : "No results found.");
  } catch (err) {
    setStatus(err.message);
  }
});

const lyricCard = (t) => `
  <div class="card">
    <img src="${esc(t.image)}" alt="">
    <div class="t">${esc(t.title)}</div>
    <div class="s">${esc(t.artist)}</div>
    <button data-act="lyrics" data-id="${esc(t.id)}" data-title="${esc(t.title)} – ${esc(t.artist)}">View lyrics</button>
  </div>`;

const coverCard = (a) => `
  <div class="card">
    <img src="${esc(a.thumb)}" alt="">
    <div class="t">${esc(a.title)}</div>
    <div class="s">${esc(a.artist)}</div>
    <a class="btn" href="${esc(a.full)}" target="_blank" rel="noopener">Open full size</a>
  </div>`;

const musicCard = (m) => `
  <div class="card">
    <img src="${esc(m.image)}" alt="">
    <div class="t">${esc(m.title)}</div>
    <div class="s">${esc(m.artist)} · ${esc(m.album)}</div>
    ${m.preview ? `<audio controls preload="none" src="${esc(m.preview)}"></audio>` : ""}
    <button data-act="find" data-query="${esc(m.title)} ${esc(m.artist)}">Find lyrics</button>
    <a class="btn" href="${esc(m.link)}" target="_blank" rel="noopener">Open in Apple Music</a>
  </div>`;

$("#results").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  if (btn.dataset.act === "lyrics") showLyrics(btn.dataset.id, btn.dataset.title);
  if (btn.dataset.act === "find") {
    setMode("lyrics");
    $("#q").value = btn.dataset.query;
    $("#form").requestSubmit();
  }
});

async function showLyrics(id, title) {
  const box = $("#lyrics");
  box.hidden = false;
  box.innerHTML = `<h2>${esc(title)}</h2><p>Loading lyrics…</p>`;
  box.scrollIntoView({ behavior: "smooth" });
  try {
    const { lyrics } = await api(`/api/lyrics/${encodeURIComponent(id)}`);
    const synced = lyrics.syncType === "LINE_SYNCED";
    box.innerHTML =
      `<h2>${esc(title)}</h2>` +
      lyrics.lines
        .map((l) => `<p class="line">${synced ? `<time>${fmt(l.startTimeMs)}</time>` : ""}${esc(l.words) || "&nbsp;"}</p>`)
        .join("");
  } catch (err) {
    box.innerHTML = `<h2>${esc(title)}</h2><p>${esc(err.message)}</p>`;
  }
}
