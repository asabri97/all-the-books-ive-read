import type { Book } from "../data/books";

const textOrder = { sensitivity: "base" } as const;

function compareAuthorThenTitle(a: Book, b: Book): number {
  const authorA = a.author.trim();
  const authorB = b.author.trim();
  if (authorA && authorB) {
    const byAuthor = a.author.localeCompare(b.author, undefined, textOrder);
    if (byAuthor !== 0) return byAuthor;
  } else if (authorA !== authorB) {
    return authorA ? -1 : 1;
  }
  return a.title.localeCompare(b.title, undefined, textOrder);
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
