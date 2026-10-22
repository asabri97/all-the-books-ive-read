import type { Book } from "../data/books";

const textOrder = { sensitivity: "base", numeric: true } as const;
const NAME_SUFFIX = /^(jr|sr|ii|iii|iv|phd|md)\.?$/i;
const SERIES_NUMBER = /\(([^)]+?)\s*#(\d+(?:\.\d+)?)(?:\s*-\s*\d+(?:\.\d+)?)?\)\s*$/;

function authorLastName(author: string): string {
  const parts = author.trim().split(/\s+/).filter(Boolean);
  while (parts.length > 1 && NAME_SUFFIX.test(parts[parts.length - 1].replace(/,$/, ""))) {
    parts.pop();
  }
  return parts.at(-1) ?? "";
}

function titleSortKey(title: string): string {
  const match = title.match(SERIES_NUMBER);
  if (!match) return title;
  const name = match[1].replace(/,\s*$/, "").trim();
  const number = match[2].padStart(6, "0");
  return `${name} ${number} ${title}`;
}

function compareAuthorThenTitle(a: Book, b: Book): number {
  const lastA = authorLastName(a.author);
  const lastB = authorLastName(b.author);
  if (lastA && lastB) {
    const byLast = lastA.localeCompare(lastB, undefined, textOrder);
    if (byLast !== 0) return byLast;
    const byAuthor = a.author.localeCompare(b.author, undefined, textOrder);
    if (byAuthor !== 0) return byAuthor;
  } else if (lastA !== lastB) {
    return lastA ? -1 : 1;
  }
  return titleSortKey(a.title).localeCompare(titleSortKey(b.title), undefined, textOrder);
}

export function selectShelf(
  books: Book[],
  genre: string | null,
  rankedIds: string[] | null,
): Book[] | null {
  if (!genre && !rankedIds) return null;
  if (!rankedIds) return books.filter((book) => book.genres?.includes(genre!)).sort(compareAuthorThenTitle);
  const byId = new Map(books.map((book) => [book.id, book]));
  return rankedIds
    .map((id) => byId.get(id))
    .filter((book): book is Book => !!book && (!genre || !!book.genres?.includes(genre)));
}

export function genresByCount(books: Book[]): string[] {
  const counts = new Map<string, number>();
  for (const book of books) {
    for (const genre of book.genres ?? []) {
      counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([genre]) => genre);
}
