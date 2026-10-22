import { books } from "../data/books";
import { rankBooks } from "./searchRank";

export async function smartSearch(query: string): Promise<{ ids: string[] } | { error: string }> {
  try {
    const response = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (response.status === 404) return { ids: rankBooks(query, books) };
    const data = (await response.json()) as { ids?: string[]; error?: string; fallback?: boolean };
    if (data.fallback) return { ids: rankBooks(query, books) };
    if (!response.ok) {
      return { error: data.error ?? "The shelves couldn't be read just now." };
    }
    return { ids: Array.isArray(data.ids) ? data.ids : [] };
  } catch {
    return { ids: rankBooks(query, books) };
  }
}
