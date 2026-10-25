import "dotenv/config";
import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;
const LYRICS_BASE = process.env.LYRICSTIFY_URL || "https://api.lyricstify.vercel.app";

app.use(express.static("public"));

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

/* ---------- iTunes (artwork + music) ---------- */
async function itunes(term, entity, country = "us", limit = 24) {
  const u = new URL("https://itunes.apple.com/search");
  u.search = new URLSearchParams({ term, entity, country, limit }).toString();
  const r = await fetch(u);
  if (!r.ok) throw new Error("iTunes request failed");
  const j = await r.json();
  return j.results || [];
}

const sized = (url, size) => url.replace(/\d+x\d+bb/, `${size}x${size}bb`);

app.get("/api/artwork", wrap(async (req, res) => {
  const { q, entity = "album", country = "us" } = req.query;
  if (!q) return res.status(400).json({ error: "Missing search term" });
  const rows = await itunes(q, entity, country);
  res.json(
    rows
      .filter((r) => r.artworkUrl100)
      .map((r) => ({
        title: r.collectionName || r.trackName || r.artistName,
        artist: r.artistName,
        thumb: sized(r.artworkUrl100, 400),
        full: sized(r.artworkUrl100, 3000),
      }))
  );
}));

app.get("/api/music", wrap(async (req, res) => {
  const { q, country = "us" } = req.query;
  if (!q) return res.status(400).json({ error: "Missing search term" });
  const rows = await itunes(q, "song", country);
  res.json(
    rows
      .filter((r) => r.trackName)
      .map((r) => ({
        title: r.trackName,
        artist: r.artistName,
        album: r.collectionName,
        image: r.artworkUrl100 ? sized(r.artworkUrl100, 300) : "",
        preview: r.previewUrl || "",
        link: r.trackViewUrl,
      }))
  );
}));

/* ---------- Spotify search -> Lyricstify lyrics ---------- */
let spToken = { value: null, exp: 0 };

async function spotifyToken() {
  if (spToken.value && Date.now() < spToken.exp) return spToken.value;
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Spotify keys missing in .env");
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error("Spotify authentication failed");
  const j = await r.json();
  spToken = { value: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  return spToken.value;
}

app.get("/api/lyrics/search", wrap(async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: "Missing search term" });
  const token = await spotifyToken();
  const u = new URL("https://api.spotify.com/v1/search");
  u.search = new URLSearchParams({ q, type: "track", limit: 12 }).toString();
  const r = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error("Spotify search failed");
  const j = await r.json();
  res.json(
    (j.tracks?.items || []).map((t) => ({
      id: t.id,
      title: t.name,
      artist: t.artists.map((a) => a.name).join(", "),
      album: t.album?.name,
      image: t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || "",
    }))
  );
}));

app.get("/api/lyrics/:id", wrap(async (req, res) => {
  const r = await fetch(`${LYRICS_BASE}/v1/lyrics/${encodeURIComponent(req.params.id)}`);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    return res.status(r.status).json({ error: body.message || "Lyrics not available for this track" });
  }
  res.json(body);
}));

app.listen(PORT, () => console.log(`Music Hub running on http://localhost:${PORT}`));
