import type { Book } from "../data/books";

export function rankBooks(query: string, books: Book[]): string[] {
  const q = query.toLowerCase().trim();
  if (q.length < 2) return [];
  const terms = q.split(/\s+/).filter((term) => term.length > 1);
  if (terms.length === 0) return [];

  const scored = books.map((book, index) => {
    const title = book.title.toLowerCase();
    const author = book.author.toLowerCase();
    const genres = (book.genres ?? []).join(" ").toLowerCase();
    const blurb = book.blurb.toLowerCase();
    let score = 0;
    let matched = 0;
    for (const term of terms) {
      let hit = false;
      if (title.includes(term)) {
        score += 5;
        hit = true;
      }
      if (author.includes(term)) {
        score += 4;
        hit = true;
      }
      if (genres.includes(term)) {
        score += 3;
        hit = true;
      }
      if (blurb.includes(term)) {
        score += 1;
        hit = true;
      }
      if (hit) matched += 1;
    }
    if (title.includes(q)) score += 8;
    if (matched === 0) score = 0;
    return { id: book.id, score, index };
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 20)
    .map((entry) => entry.id);
}
