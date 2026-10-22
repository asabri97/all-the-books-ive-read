export type CoverPalette = {
  spine: string;
  band: string;
  ink: string;
};

export type LibraryHit = {
  key: string;
  title: string;
  author: string;
  year: number;
  cover: string;
  pages: number;
  publisher: string;
};

type SearchDoc = {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  number_of_pages_median?: number;
  publisher?: string[];
};

const FACES = ["serif", "sans", "mono"] as const;

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function unit(hash: number, salt: number): number {
  const mixed = Math.imul(hash ^ Math.imul(salt + 1, 0x9e3779b1), 0x85ebca6b) >>> 0;
  return (mixed % 10000) / 10000;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function channel(value: number): string {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0");
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

export function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function rgbToHsl(r: number, g: number, b: number): { s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  return { s, l };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

export function fallbackPalette(key: string): CoverPalette {
  const hue = hashString(key) % 360;
  const [sr, sg, sb] = hslToRgb(hue, 0.28, 0.32);
  const [br, bg, bb] = hslToRgb((hue + 24) % 360, 0.46, 0.46);
  const spine = rgbToHex(sr, sg, sb);
  const band = rgbToHex(br, bg, bb);
  const ink = luminance(sr, sg, sb) > 0.55 ? "#241f19" : "#faf7f0";
  return { spine, band, ink };
}

export function bindingForPages(pages: number): "hardcover" | "paperback" | "mass" {
  if (pages > 420) return "hardcover";
  if (pages < 260) return "mass";
  return "paperback";
}

export function paletteFromPixels(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
): CoverPalette | null {
  if (width < 1 || height < 1) return null;
  const edgeW = Math.max(1, Math.round(width * 0.06));
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < edgeW; x += 1) {
      const i = (y * width + x) * 4;
      if (pixels[i + 3] < 128) continue;
      r += pixels[i];
      g += pixels[i + 1];
      b += pixels[i + 2];
      count += 1;
    }
  }
  if (!count) return null;
  const spine = rgbToHex(r / count, g / count, b / count);
  let bestSat = -1;
  let band = spine;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (pixels[i + 3] < 128) continue;
      const { s, l } = rgbToHsl(pixels[i], pixels[i + 1], pixels[i + 2]);
      if (l < 0.18 || l > 0.82) continue;
      if (s > bestSat) {
        bestSat = s;
        band = rgbToHex(pixels[i], pixels[i + 1], pixels[i + 2]);
      }
    }
  }
  const ink = luminance(r / count, g / count, b / count) > 0.55 ? "#241f19" : "#faf7f0";
  return { spine, band, ink };
}

export function derivePhysical(key: string, pages: number) {
  const safePages = pages > 0 ? pages : 300;
  const hash = hashString(key);
  const binding = bindingForPages(safePages);
  const finish = binding === "hardcover" ? "cloth" : unit(hash, 1) >= 0.5 ? "gloss" : "matte";
  const height =
    binding === "hardcover"
      ? 236 + Math.round(unit(hash, 2) * 18)
      : binding === "mass"
        ? 196 + Math.round(unit(hash, 2) * 14)
        : 214 + Math.round(unit(hash, 2) * 16);
  const jitter = (unit(hash, 3) - 0.5) * 6;
  const width = Math.round(clamp(safePages * 0.055 + jitter, 16, 58));
  return {
    binding,
    finish,
    height,
    width,
    face: FACES[Math.floor(unit(hash, 7) * FACES.length) % FACES.length],
    caps: unit(hash, 8) >= 0.5,
    lean: -unit(hash, 4) * 5,
    depth: unit(hash, 5) * 14 - 7,
    wear: unit(hash, 6) * 0.35,
  } as const;
}

export function readCoverPalette(src: string): Promise<CoverPalette> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    const timer = window.setTimeout(() => {
      image.src = "";
      reject(new Error("cover timeout"));
    }, 8000);
    image.onload = () => {
      window.clearTimeout(timer);
      const width = 80;
      const height = Math.max(1, Math.round((image.naturalHeight / image.naturalWidth) * width));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        reject(new Error("no canvas"));
        return;
      }
      ctx.drawImage(image, 0, 0, width, height);
      const pixels = ctx.getImageData(0, 0, width, height).data;
      const palette = paletteFromPixels(pixels, width, height);
      if (!palette) {
        reject(new Error("empty cover"));
        return;
      }
      resolve(palette);
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("cover failed"));
    };
    image.src = src;
  });
}

export async function searchBooks(query: string, signal?: AbortSignal): Promise<LibraryHit[]> {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "12");
  url.searchParams.set(
    "fields",
    "key,title,author_name,first_publish_year,cover_i,number_of_pages_median,publisher",
  );
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("Open Library search failed");
  const payload = (await response.json()) as { docs?: SearchDoc[] };
  return (payload.docs ?? [])
    .filter((doc) => doc.title && doc.cover_i && doc.key)
    .map((doc) => ({
      key: doc.key ?? "",
      title: doc.title ?? "",
      author: doc.author_name?.[0] ?? "",
      year: doc.first_publish_year ?? 0,
      cover: `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`,
      pages: doc.number_of_pages_median ?? 0,
      publisher: doc.publisher?.[0] ?? "",
    }));
}

export async function buildBook(result: LibraryHit, id?: string): Promise<import("../data/books").Book> {
  const key = result.key || result.title;
  const physical = derivePhysical(key, result.pages);
  let palette = fallbackPalette(key);
  if (result.cover) {
    try {
      palette = await readCoverPalette(result.cover);
    } catch {
      palette = fallbackPalette(key);
    }
  }
  return {
    id: id ?? (result.key.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "book"),
    title: result.title,
    author: result.author,
    cover: result.cover,
    year: result.year,
    blurb: "",
    rating: 0,
    finished: "",
    publisher: result.publisher,
    binding: physical.binding,
    finish: physical.finish,
    spine: palette.spine,
    band: palette.band,
    ink: palette.ink,
    face: physical.face,
    caps: physical.caps,
    width: physical.width,
    height: physical.height,
    lean: physical.lean,
    depth: physical.depth,
    wear: physical.wear,
  };
}
