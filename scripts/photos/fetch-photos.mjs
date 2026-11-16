// Fetches real photos for places and hubs from Wikimedia Commons, pre-sized so next/image serves them as-is.
//
//   npm run photos
//
// Reads scripts/photos/sources.json (curated Wikipedia titles), writes the crops to public/photos/
// the credits to src/data/photos.json and the hub crops (small enough for client bundles) to
// src/data/hub-photos.json. Commit all three. Re-run only when sources.json changes.
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT_DIR = path.join(ROOT, "public/photos");
const MANIFEST = path.join(ROOT, "src/data/photos.json");
const HUB_MANIFEST = path.join(ROOT, "src/data/hub-photos.json");
// Originals are cached so a re-run after editing sources.json only downloads what changed.
const CACHE = path.join(ROOT, "node_modules/.cache/andiamo-photos");
const UA = { "User-Agent": "andiamo-photo-fetch/1.0 (one-off build script)" };

// Crops from docs/design-system.md, at 4x the largest box they're shown in.
const SHAPES = {
  square: { width: 336, height: 336 }, // stop cards 84px, thumbnails 56-64px
  portrait: { width: 704, height: 896 }, // hub cards 176x224, 4:5
  wide: { width: 1920, height: 480 }, // trip banner, 4:1
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, as = "json") {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { headers: UA });
    if (res.status === 429 || res.status >= 500) {
      await sleep(Number(res.headers.get("retry-after")) * 1000 || 5000 * 2 ** attempt);
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return as === "json" ? res.json() : Buffer.from(await res.arrayBuffer());
  }
  throw new Error(`gave up on ${url}`);
}

const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

/** Wikipedia title -> { file, page } for titles whose lead image is freely licensed. */
async function leadImages(titles) {
  const found = new Map();
  for (const batch of chunks(titles, 50)) {
    const q = new URLSearchParams({
      action: "query", format: "json", formatversion: "2", redirects: "1",
      prop: "pageimages", piprop: "name", pilicense: "free", titles: batch.join("|"),
    });
    const j = await get(`https://en.wikipedia.org/w/api.php?${q}`);
    const alias = new Map();
    for (const { from, to } of [...(j.query.normalized ?? []), ...(j.query.redirects ?? [])]) alias.set(to, from);
    for (const p of j.query.pages) {
      // Lead images that are SVG or PNG are logos, coats of arms and maps, not photographs.
      if (!p.pageimage || /\.(svg|png|gif)$/i.test(p.pageimage)) continue;
      const hit = { file: p.pageimage, page: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replaceAll(" ", "_"))}` };
      // Map back through redirects and normalisation to the title we asked for.
      for (let t = p.title; t; t = alias.get(t)) found.set(t, hit);
    }
    await sleep(500);
  }
  return found;
}

const strip = (html = "") => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

/** Commons file name -> { url, credit, license, licenseUrl, source } */
async function fileInfo(files) {
  const info = new Map();
  for (const batch of chunks(files, 50)) {
    const q = new URLSearchParams({
      action: "query", format: "json", formatversion: "2", prop: "imageinfo",
      iiprop: "url|extmetadata", iiurlwidth: "1920", titles: batch.map((f) => `File:${f}`).join("|"),
    });
    const j = await get(`https://commons.wikimedia.org/w/api.php?${q}`);
    const back = new Map((j.query.normalized ?? []).map(({ from, to }) => [to, from]));
    for (const p of j.query.pages) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      const m = ii.extmetadata ?? {};
      const asked = (back.get(p.title) ?? p.title).replace(/^File:/, "");
      info.set(asked, {
        url: ii.thumburl ?? ii.url,
        credit: strip(m.Artist?.value) || "Unknown author",
        license: strip(m.LicenseShortName?.value) || "See source",
        licenseUrl: m.LicenseUrl?.value ?? null,
        source: ii.descriptionurl,
      });
    }
    await sleep(500);
  }
  return info;
}

async function original(url) {
  const cached = path.join(CACHE, encodeURIComponent(new URL(url).pathname.split("/").pop()));
  try {
    return await fs.readFile(cached);
  } catch {
    const buf = await get(url, "buffer");
    await fs.mkdir(CACHE, { recursive: true });
    await fs.writeFile(cached, buf);
    await sleep(2500);
    return buf;
  }
}

async function main() {
  const sources = JSON.parse(await fs.readFile(path.join(import.meta.dirname, "sources.json"), "utf8"));
  const entries = [
    ...Object.entries(sources.hubs).map(([name, titles]) => ({ key: name, hub: true, titles })),
    ...Object.entries(sources.places).map(([id, titles]) => ({ key: id, hub: false, titles })),
  ].filter((e) => e.titles);

  const leads = await leadImages([...new Set(entries.flatMap((e) => e.titles))]);
  const picked = entries
    .map((e) => {
      const title = e.titles.find((t) => leads.has(t));
      return title ? { ...e, title, ...leads.get(title) } : (console.warn(`no free photo: ${e.key} (${e.titles.join(", ")})`), null);
    })
    .filter(Boolean);

  const info = await fileInfo([...new Set(picked.map((p) => p.file))]);
  await fs.rm(OUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  const originals = new Map();
  const manifest = { places: {}, hubs: {} };
  for (const p of picked) {
    const meta = info.get(p.file);
    if (!meta) {
      console.warn(`no file info: ${p.key} (${p.file})`);
      continue;
    }
    if (!originals.has(p.file)) originals.set(p.file, await original(meta.url));
    const shapes = p.hub ? ["portrait", "wide"] : ["square"];
    const slug = p.hub ? `hub-${p.key.toLowerCase()}` : p.key;
    const src = {};
    for (const shape of shapes) {
      const name = `${slug}-${shape}.jpg`;
      await sharp(originals.get(p.file))
        .rotate()
        .resize({ ...SHAPES[shape], fit: "cover", position: sharp.strategy.attention })
        .jpeg({ quality: 78, mozjpeg: true })
        .toFile(path.join(OUT_DIR, name));
      src[shape] = `/photos/${name}`;
    }
    const credit = { title: p.title, page: p.page, file: p.file, credit: meta.credit, license: meta.license, licenseUrl: meta.licenseUrl, source: meta.source };
    if (p.hub) manifest.hubs[p.key] = { ...src, ...credit };
    else manifest.places[p.key] = { src: src.square, ...credit };
    console.log(`ok  ${p.key.padEnd(10)} ${p.title}  [${meta.license}]`);
  }

  await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  const hubs = Object.fromEntries(Object.entries(manifest.hubs).map(([k, h]) => [k, { portrait: h.portrait, wide: h.wide }]));
  await fs.writeFile(HUB_MANIFEST, JSON.stringify(hubs, null, 2) + "\n");
  console.log(`\n${Object.keys(manifest.places).length} places and ${Object.keys(manifest.hubs).length} hubs have photos.`);
}

await main();
