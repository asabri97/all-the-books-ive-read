import { describe, expect, it } from "vitest";
import { bindingForPages, buildBook, clamp, fallbackPalette, hashString } from "./openLibrary";
import { catalogueLine, parseModelIds, pickProvider, searchError } from "./librarySearch.functions";
import { rankBooks } from "./searchRank";
import { selectShelf } from "./selectShelf";
import { curveRotate } from "./curve";
import type { Book } from "../data/books";

const sample = (id: string, title: string, extra?: Partial<Book>): Book => ({
  id,
  title,
  author: "Ada Lovelace",
  genres: ["Fiction"],
  cover: "",
  year: 1990,
  blurb: "A quiet story about lamps, rivers, and second chances.",
  rating: 4,
  finished: "Jan 2020",
  publisher: "Press",
  binding: "paperback",
  finish: "matte",
  spine: "#333333",
  ink: "#faf7f0",
  face: "serif",
  width: 24,
  height: 220,
  lean: 0,
  depth: 0,
  wear: 0,
  ...extra,
});

describe("curveRotate", () => {
  it("keeps the center flat and bends the edges to 34 degrees", () => {
    expect(curveRotate(0)).toBe(0);
    expect(curveRotate(1)).toBe(-34);
    expect(curveRotate(-1)).toBe(34);
    expect(Math.abs(curveRotate(0.5))).toBeLessThan(17);
  });
});

describe("selectShelf", () => {
  const books = [
    sample("a", "Alpha", { genres: ["Fiction"] }),
    sample("b", "Beta", { genres: ["Fantasy"] }),
    sample("c", "Gamma", { genres: ["Fiction", "Romance"] }),
  ];

  it("returns null when nothing is filtering", () => {
    expect(selectShelf(books, null, null)).toBeNull();
  });

  it("keeps the model ranking when a genre is also selected", () => {
    expect(selectShelf(books, "Fiction", ["c", "b", "a", "missing"])?.map((book) => book.id)).toEqual(["c", "a"]);
  });

  it("sorts a genre shelf by author last name, then title, with blank authors last", () => {
    const shelf = [
      sample("zora", "Zebra", { author: "Zora Neale", genres: ["Fiction"] }),
      sample("beta", "Beta", { author: "Ada Lovelace", genres: ["Fiction"] }),
      sample("alpha", "Alpha", { author: "ada lovelace", genres: ["Fiction"] }),
      sample("beatles", "Songs", { author: "The Beatles", genres: ["Fiction"] }),
      sample("sandy", "Mistborn", { author: "Brandon Sanderson", genres: ["Fiction"] }),
      sample("vonnegut", "Slaughterhouse", { author: "Kurt Vonnegut Jr.", genres: ["Fiction"] }),
      sample("blank", "Untitled", { author: "", genres: ["Fiction"] }),
      sample("spaces", "Anonymous", { author: "   ", genres: ["Fiction"] }),
      sample("elsewhere", "Elsewhere", { author: "Aaron", genres: ["Fantasy"] }),
    ];
    const order = shelf.map((book) => book.id);

    expect(selectShelf(shelf, "Fiction", null)?.map((book) => book.id)).toEqual([
      "beatles",
      "alpha",
      "beta",
      "zora",
      "sandy",
      "vonnegut",
      "spaces",
      "blank",
    ]);
    expect(shelf.map((book) => book.id)).toEqual(order);
  });

  it("orders one author's series by number, then other titles A–Z", () => {
    const shelf = [
      sample("m2", "The Well of Ascension (Mistborn, #2)", { author: "Brandon Sanderson", genres: ["Fantasy"] }),
      sample("m3", "The Hero of Ages (Mistborn, #3)", { author: "Brandon Sanderson", genres: ["Fantasy"] }),
      sample("m1", "Mistborn: The Final Empire (Mistborn, #1)", { author: "Brandon Sanderson", genres: ["Fantasy"] }),
      sample("other", "Elantris", { author: "Brandon Sanderson", genres: ["Fantasy"] }),
      sample("vol10", "Saga Vol. 10", { author: "Brian K. Vaughan", genres: ["Fantasy"] }),
      sample("vol2", "Saga Vol. 2", { author: "Brian K. Vaughan", genres: ["Fantasy"] }),
    ];

    expect(selectShelf(shelf, "Fantasy", null)?.map((book) => book.id)).toEqual([
      "other",
      "m1",
      "m2",
      "m3",
      "vol2",
      "vol10",
    ]);
  });

  it("keeps search rank ahead of author order", () => {
    const shelf = [
      sample("aaron", "Aye", { author: "Aaron", genres: ["Fiction"] }),
      sample("zora", "Zed", { author: "Zora", genres: ["Fiction"] }),
    ];
    expect(selectShelf(shelf, "Fiction", ["zora", "aaron"])?.map((book) => book.id)).toEqual(["zora", "aaron"]);
    expect(selectShelf(shelf, null, ["zora", "aaron"])?.map((book) => book.id)).toEqual(["zora", "aaron"]);
  });
});

describe("rankBooks", () => {
  const books = [
    sample("morrie", "Tuesdays with Morrie", { author: "Mitch Albom", genres: ["Nonfiction"], blurb: "A memoir." }),
    sample("other", "The Left Hand", { blurb: "Morrie is mentioned once in passing." }),
  ];

  it("ranks a title match ahead of a blurb mention", () => {
    expect(rankBooks("morrie", books)[0]).toBe("morrie");
  });

  it("ignores tiny queries", () => {
    expect(rankBooks("a", books)).toEqual([]);
  });
});

describe("library search parsing", () => {
  it("keeps only real ids, in order, capped at 20", () => {
    const catalogue = Array.from({ length: 25 }, (_, index) => ({ id: `id-${index}` }));
    const ids = parseModelIds(
      `sure {"ids":["id-2","nope","id-2","id-0",${Array.from({ length: 30 }, (_, index) => `"id-${index}"`).join(",")}]}`,
      catalogue,
    );
    expect(ids[0]).toBe("id-2");
    expect(ids[1]).toBe("id-0");
    expect(ids).toHaveLength(20);
    expect(ids).not.toContain("nope");
  });

  it("maps provider failures and picks a configured model", () => {
    expect(searchError(429)).toBe("Too many searches…");
    expect(searchError(402)).toBe("Search credits exhausted.");
    expect(pickProvider({})).toBeNull();
    expect(pickProvider({ openai: "sk-test" })?.url).toContain("api.openai.com");
    expect(pickProvider({ gemini: "gem" })?.url).toContain("generativelanguage.googleapis.com");
  });

  it("truncates blurbs in the catalogue line", () => {
    const line = catalogueLine(sample("long", "Long", { blurb: "x".repeat(400) }));
    const blurb = line.split(" :: ").at(-1) ?? "";
    expect(blurb).toHaveLength(160);
  });
});

describe("buildBook", () => {
  it("derives binding, finish, and a stable spine from the page count", async () => {
    const heavy = await buildBook({
      key: "/works/OL1W",
      title: "A Long History",
      author: "Someone",
      year: 2001,
      cover: "",
      pages: 500,
      publisher: "House",
    });
    const again = await buildBook({
      key: "/works/OL1W",
      title: "A Long History",
      author: "Someone",
      year: 2001,
      cover: "",
      pages: 500,
      publisher: "House",
    });
    expect(heavy.binding).toBe("hardcover");
    expect(heavy.finish).toBe("cloth");
    expect(heavy.height).toBeGreaterThanOrEqual(236);
    expect(heavy.height).toBeLessThanOrEqual(254);
    expect(heavy.width).toBeGreaterThanOrEqual(16);
    expect(heavy.width).toBeLessThanOrEqual(58);
    expect(heavy.lean).toBeGreaterThanOrEqual(-5);
    expect(heavy.lean).toBeLessThanOrEqual(0);
    expect(heavy.depth).toBeGreaterThanOrEqual(-7);
    expect(heavy.depth).toBeLessThanOrEqual(7);
    expect(heavy.wear).toBeGreaterThanOrEqual(0);
    expect(heavy.wear).toBeLessThanOrEqual(0.35);
    expect(again).toEqual(heavy);
    expect(bindingForPages(200)).toBe("mass");
    expect(bindingForPages(300)).toBe("paperback");
    expect(clamp(80, 16, 58)).toBe(58);
    expect(fallbackPalette("/works/OL1W").ink).toMatch(/^#/);
    expect(hashString("same")).toBe(hashString("same"));
  });
});
