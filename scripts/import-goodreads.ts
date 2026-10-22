import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { derivePhysical, fallbackPalette, paletteFromPixels } from "../src/lib/openLibrary";

const CSV = "/Users/abrish/Downloads/goodreads_library_export.csv";
const ROOT = new URL("..", import.meta.url).pathname;
const CACHE = "/tmp/goodreads-ol-cache.json";
const COVER_DIR = "/tmp/goodreads-covers";
const RGBA_DIR = "/tmp/goodreads-covers-rgba";
const UA = "all-the-books-i-read/1.0 (personal library import)";

type Row = {
  title: string;
  author: string;
  isbn: string;
  rating: number;
  publisher: string;
  pages: number;
  year: number;
  finished: string;
  dateSort: number;
  shelf: "read" | "currently-reading";
  shelves: string[];
};

type OlHit = {
  key: string;
  coverId: number;
  blurb: string;
  subjects: string[];
};

const GENRE_ORDER = ["Nonfiction", "Sci-Fi", "Mystery & Thriller", "Fantasy", "Romance", "Fiction"];
const NONFICTION = [
  "nonfiction",
  "non fiction",
  "biography",
  "biographies",
  "autobiography",
  "memoir",
  "essay",
  "essays",
  "history",
  "philosophy",
  "psychology",
  "politics",
  "political",
  "economics",
  "sociology",
  "journalism",
  "religion",
  "science",
  "physics",
  "biology",
  "mathematics",
  "travel",
  "cookbook",
  "self help",
  "business",
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function plain(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function shortBlurb(value: string): string {
  const text = plain(value);
  if (!text) return "";
  const parts = text.split(/(?<=[.!?])\s+(?=[A-Z“"'])/);
  const two = (parts.length > 1 ? parts.slice(0, 2).join(" ") : text).trim();
  if (two.length <= 460) return two;
  return `${two.slice(0, 457).replace(/\s+\S*$/, "")}…`;
}

function mapLabel(raw: string): string | null {
  const n = raw.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!n) return null;
  if (["read", "currently reading", "to read", "favorites", "owned", "books", "kindle"].includes(n)) return null;
  if (/\bscience fiction\b|\bsci fi\b|\bscifi\b|\bsf\b/.test(n)) return "Sci-Fi";
  if (/\bmystery\b|\bthriller\b|\bsuspense\b|\bdetective\b|\bcrime\b|\bwhodunit\b/.test(n)) return "Mystery & Thriller";
  if (/\bromance\b/.test(n)) return "Romance";
  if (/\bfantasy\b/.test(n)) return "Fantasy";
  if (/\bfiction\b|\bnovel\b|\bnovels\b|\bstories\b|\bliterary\b/.test(n)) return "Fiction";
  if (NONFICTION.some((word) => n.includes(word))) return "Nonfiction";
  return null;
}

function genresFor(labels: string[], title: string): string[] {
  const found = new Set<string>();
  for (const label of labels) {
    const mapped = mapLabel(label);
    if (mapped) found.add(mapped);
  }
  const specific = [...found].filter((genre) => genre !== "Fiction");
  const chosen = specific.length ? specific : found.has("Fiction") ? ["Fiction"] : [];
  if (!chosen.length) {
    if (/\b(memoirs?|essays?|biograph(?:y|ies)|autobiograph(?:y|ies)|a history|history of)\b/i.test(title)) {
      return ["Nonfiction"];
    }
    return ["Fiction"];
  }
  return chosen.sort((a, b) => GENRE_ORDER.indexOf(a) - GENRE_ORDER.indexOf(b));
}

function run(cmd: string, args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let out = "";
    let err = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk) => {
      err += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(err || `${cmd} exited ${code}`));
      else resolve(out);
    });
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

async function getJson(url: string): Promise<unknown | null> {
  let wait = 600;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(25000),
      });
      if (response.status === 404) return null;
      if (response.status === 429 || response.status >= 500) {
        await sleep(wait);
        wait *= 2;
        continue;
      }
      if (!response.ok) return null;
      return await response.json();
    } catch {
      await sleep(wait);
      wait *= 2;
    }
  }
  return null;
}

function subjectNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "name" in item && typeof item.name === "string") return item.name;
      return "";
    })
    .filter(Boolean);
}

function descriptionText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "value" in value && typeof value.value === "string") return value.value;
  return "";
}

function coverIdFromUrl(url: string | undefined): number {
  const match = url?.match(/\/b\/id\/(\d+)-[LMS]\.jpg/);
  return match ? Number(match[1]) : 0;
}

function emptyHit(): OlHit {
  return { key: "", coverId: 0, blurb: "", subjects: [] };
}

function mergeHit(data: unknown, details: unknown): OlHit {
  const hit = emptyHit();
  if (data && typeof data === "object") {
    const record = data as { key?: string; cover?: { large?: string }; subjects?: unknown };
    hit.key = record.key ?? "";
    hit.coverId = coverIdFromUrl(record.cover?.large);
    hit.subjects.push(...subjectNames(record.subjects));
  }
  if (details && typeof details === "object") {
    const record = details as {
      subjects?: unknown;
      details?: {
        key?: string;
        covers?: number[];
        description?: unknown;
        works?: { key?: string }[];
        subjects?: unknown;
      };
    };
    const edition = record.details;
    hit.subjects.push(...subjectNames(record.subjects), ...subjectNames(edition?.subjects));
    if (!hit.coverId && edition?.covers?.[0]) hit.coverId = edition.covers[0];
    const blurb = shortBlurb(descriptionText(edition?.description));
    if (blurb) hit.blurb = blurb;
    const work = edition?.works?.[0]?.key;
    if (work) hit.key = work;
    else if (!hit.key && edition?.key) hit.key = edition.key;
  }
  return hit;
}

async function lookupBatch(isbns: string[], cache: Map<string, OlHit>): Promise<void> {
  const pending = isbns.filter((isbn) => isbn && !cache.has(isbn));
  if (!pending.length) return;
  const bib = pending.map((isbn) => `ISBN:${isbn}`).join(",");
  const [data, details] = await Promise.all([
    getJson(`https://openlibrary.org/api/books?bibkeys=${bib}&format=json&jscmd=data`),
    getJson(`https://openlibrary.org/api/books?bibkeys=${bib}&format=json&jscmd=details`),
  ]);
  if (!data && !details) return;
  const dataMap = (data ?? {}) as Record<string, unknown>;
  const detailMap = (details ?? {}) as Record<string, unknown>;
  for (const isbn of pending) {
    const key = `ISBN:${isbn}`;
    if (!dataMap[key] && !detailMap[key]) cache.set(isbn, emptyHit());
    else cache.set(isbn, mergeHit(dataMap[key], detailMap[key]));
  }
}

async function searchFill(row: Row, hit: OlHit): Promise<OlHit> {
  if (hit.coverId && hit.blurb) return hit;
  const query = encodeURIComponent(`${row.title} ${row.author}`.trim());
  const payload = await getJson(
    `https://openlibrary.org/search.json?q=${query}&limit=5&fields=key,title,cover_i,subject,first_sentence`,
  );
  const docs = (payload as { docs?: Record<string, unknown>[] } | null)?.docs ?? [];
  const doc = docs.find((item) => item.cover_i) ?? docs[0];
  if (!doc) return hit;
  const next = { ...hit, subjects: [...hit.subjects] };
  if (!next.key && typeof doc.key === "string") next.key = doc.key;
  if (!next.coverId && typeof doc.cover_i === "number") next.coverId = doc.cover_i;
  next.subjects.push(...subjectNames(doc.subject));
  if (!next.blurb) {
    const sentence = Array.isArray(doc.first_sentence) ? doc.first_sentence[0] : doc.first_sentence;
    if (typeof sentence === "string") next.blurb = shortBlurb(sentence);
  }
  return next;
}

async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function downloadCover(id: number, dest: string): Promise<boolean> {
  if (!id || existsSync(dest)) return existsSync(dest) && readFileSync(dest).length > 400;
  const url = `https://covers.openlibrary.org/b/id/${id}-L.jpg`;
  try {
    const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) return false;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 400) return false;
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    const png = bytes[0] === 0x89 && bytes[1] === 0x50;
    if (!jpeg && !png) return false;
    writeFileSync(dest, bytes);
    return true;
  } catch {
    return false;
  }
}

function readRgba(path: string): { width: number; height: number; pixels: Uint8Array } | null {
  if (!existsSync(path)) return null;
  const buf = readFileSync(path);
  if (buf.length < 8) return null;
  const width = buf.readUInt32LE(0);
  const height = buf.readUInt32LE(4);
  const pixels = buf.subarray(8);
  if (width < 1 || height < 1 || pixels.length < width * height * 4) return null;
  return { width, height, pixels };
}

async function main() {
  const rows = JSON.parse(await run("python3", ["-c", pythonRows()])) as Row[];
  mkdirSync(COVER_DIR, { recursive: true });
  mkdirSync(RGBA_DIR, { recursive: true });
  const cache = new Map<string, OlHit>();
  if (existsSync(CACHE)) {
    const saved = JSON.parse(readFileSync(CACHE, "utf8")) as Record<string, OlHit>;
    for (const [isbn, hit] of Object.entries(saved)) cache.set(isbn, hit);
  }
  const isbns = [...new Set(rows.map((row) => row.isbn).filter(Boolean))];
  const batches = chunks(isbns, 20);
  console.log(`rows ${rows.length} isbns ${isbns.length} batches ${batches.length}`);
  let done = 0;
  await mapPool(batches, 2, async (batch) => {
    await lookupBatch(batch, cache);
    writeFileSync(CACHE, JSON.stringify(Object.fromEntries(cache)));
    done += 1;
    console.log(`batch ${done}/${batches.length}`);
    await sleep(200);
  });

  const hits = new Map<string, OlHit>();
  await mapPool(rows, 4, async (row) => {
    const cached = row.isbn ? (cache.get(row.isbn) ?? emptyHit()) : emptyHit();
    const filled = await searchFill(row, cached);
    hits.set(rowKey(row), filled);
  });

  const coverJobs: { id: number; src: string }[] = [];
  const seenCovers = new Set<number>();
  for (const hit of hits.values()) {
    if (!hit.coverId || seenCovers.has(hit.coverId)) continue;
    seenCovers.add(hit.coverId);
    coverJobs.push({ id: hit.coverId, src: `${COVER_DIR}/${hit.coverId}.img` });
  }
  let coversOk = 0;
  await mapPool(coverJobs, 4, async (job) => {
    const ok = await downloadCover(job.id, job.src);
    if (ok) coversOk += 1;
  });
  console.log(`covers downloaded ${coversOk}/${coverJobs.length}`);

  const rgbaJobs = coverJobs
    .filter((job) => existsSync(job.src))
    .map((job) => ({ src: job.src, dest: `${RGBA_DIR}/${job.id}.bin` }));
  await run(
    "python3",
    ["-c", pythonResize()],
    JSON.stringify(rgbaJobs),
  );

  const used = new Set<string>();
  const books = rows
    .map((row) => {
      const hit = hits.get(rowKey(row)) ?? emptyHit();
      const identity = hit.key || row.isbn || row.title;
      const physical = derivePhysical(identity, row.pages);
      const coverFile = hit.coverId ? `${COVER_DIR}/${hit.coverId}.img` : "";
      const hasCover = Boolean(coverFile && existsSync(coverFile) && readFileSync(coverFile).length > 400);
      const rgba = hasCover ? readRgba(`${RGBA_DIR}/${hit.coverId}.bin`) : null;
      const sampled = rgba ? paletteFromPixels(rgba.pixels, rgba.width, rgba.height) : null;
      const palette = sampled ?? fallbackPalette(identity);
      const cover = hasCover ? `https://covers.openlibrary.org/b/id/${hit.coverId}-L.jpg` : "";
      let id = slug(`${row.title}-${identity}`).slice(0, 72).replace(/-$/, "") || "book";
      let n = 2;
      while (used.has(id)) {
        id = `${slug(row.title).slice(0, 48)}-${n}`;
        n += 1;
      }
      used.add(id);
      return {
        sort: row.dateSort,
        book: {
          id,
          title: row.title,
          author: row.author,
          genres: genresFor([...row.shelves, ...hit.subjects], row.title),
          cover,
          year: row.year,
          blurb: hit.blurb,
          rating: row.rating,
          finished: row.finished,
          publisher: row.publisher,
          binding: physical.binding,
          finish: physical.finish,
          spine: palette.spine,
          band: palette.band,
          ink: palette.ink,
          face: physical.face,
          caps: physical.caps,
          width: physical.width,
          height: physical.height,
          lean: Number(physical.lean.toFixed(2)),
          depth: Number(physical.depth.toFixed(2)),
          wear: Number(physical.wear.toFixed(2)),
        },
      };
    })
    .sort((a, b) => b.sort - a.sort || a.book.title.localeCompare(b.book.title))
    .map((entry) => entry.book);

  const typeBlock = `export type Book = {
  id: string;
  title: string;
  author: string;
  genres?: string[];
  cover: string;
  year: number;
  blurb: string;
  rating: number;
  finished: string;
  recommender?: string;
  publisher: string;
  binding: "hardcover" | "paperback" | "mass";
  finish: "cloth" | "gloss" | "matte";
  spine: string;
  band?: string;
  ink: string;
  face: "serif" | "sans" | "mono";
  caps?: boolean;
  width: number;
  height: number;
  lean: number;
  depth: number;
  wear: number;
  spineImage?: string;
};
`;
  const outPath = `${ROOT}src/data/books.ts`;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${typeBlock}\nexport const books: Book[] = ${JSON.stringify(books, null, 2)};\n`);

  const dated = books.filter((book) => book.finished);
  const stats = {
    total: books.length,
    read: rows.filter((row) => row.shelf === "read").length,
    currentlyReading: rows.filter((row) => row.shelf === "currently-reading").length,
    covers: books.filter((book) => book.cover).length,
    coverFallback: books.filter((book) => !book.cover).length,
    blurbs: books.filter((book) => book.blurb).length,
    blurbFallback: books.filter((book) => !book.blurb).length,
    firstFinished: dated[0]?.finished ?? "",
    lastFinished: dated.at(-1)?.finished ?? "",
    undated: books.length - dated.length,
  };
  console.log(JSON.stringify(stats, null, 2));
}

function rowKey(row: Row): string {
  return `${row.isbn}|${row.title}|${row.shelf}`;
}

function pythonRows(): string {
  return `
import csv, json, re, sys
path = ${JSON.stringify(CSV)}
def clean_isbn(raw):
    s = (raw or "").strip()
    if s.startswith('="') and s.endswith('"'):
        s = s[2:-1]
    s = re.sub(r"[^0-9Xx]", "", s).upper()
    return s if len(s) in (10, 13) else ""
def year_of(raw):
    try:
        n = int(float((raw or "").strip()))
    except Exception:
        return 0
    return n if 1 <= n <= 2100 else 0
def pages_of(raw):
    try:
        n = int(float((raw or "").strip() or 0))
    except Exception:
        return 0
    return n if n > 0 else 0
def finished(raw):
    m = re.match(r"(\\d{4})/(\\d{1,2})/(\\d{1,2})", (raw or "").strip())
    if not m:
        return "", -1
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if not (1 <= mo <= 12 and 1 <= d <= 31):
        return "", -1
    names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
    return f"{names[mo-1]} {y}", y * 10000 + mo * 100 + d
rows = []
with open(path, newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        shelf = (row.get("Exclusive Shelf") or "").strip()
        if shelf not in ("read", "currently-reading"):
            continue
        isbn13 = clean_isbn(row.get("ISBN13") or "")
        isbn10 = clean_isbn(row.get("ISBN") or "")
        fin, sort = finished(row.get("Date Read") or "")
        names = []
        raw = row.get("Bookshelves with positions") or row.get("Bookshelves") or ""
        for part in raw.split(","):
            name = part.split("(")[0].strip()
            if name:
                names.append(name)
        try:
            rating = int(row.get("My Rating") or 0)
        except Exception:
            rating = 0
        rows.append({
            "title": (row.get("Title") or "").strip(),
            "author": (row.get("Author") or "").strip(),
            "isbn": isbn13 or isbn10,
            "rating": rating if rating > 0 else 0,
            "publisher": (row.get("Publisher") or "").strip(),
            "pages": pages_of(row.get("Number of Pages") or ""),
            "year": year_of(row.get("Original Publication Year") or "") or year_of(row.get("Year Published") or ""),
            "finished": fin,
            "dateSort": sort,
            "shelf": shelf,
            "shelves": names,
        })
json.dump(rows, sys.stdout)
`;
}

function pythonResize(): string {
  return `
import json, sys
from pathlib import Path
from PIL import Image
jobs = json.load(sys.stdin)
for job in jobs:
    dest = Path(job["dest"])
    try:
        im = Image.open(job["src"]).convert("RGBA")
        w = 80
        h = max(1, round(im.height / im.width * w)) if im.width else 1
        im = im.resize((w, h), Image.Resampling.LANCZOS)
        dest.write_bytes(w.to_bytes(4, "little") + h.to_bytes(4, "little") + im.tobytes())
    except Exception:
        dest.write_bytes(b"")
`;
}

void main();
