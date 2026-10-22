import { books, type Book } from "../data/books";

export type SearchEnv = {
  openai?: string;
  gemini?: string;
  anthropic?: string;
};

export type SearchResponse =
  | { ids: string[] }
  | { error: string; status: number }
  | { fallback: true };

const SYSTEM = `You match a reader's natural-language request against a personal library. Each catalogue line is: id :: title :: author :: year :: genres :: blurb. Return ONLY {"ids":["id1","id2"]} with the best match first, at most 20 ids copied from the catalogue. If nothing fits, return {"ids":[]}.`;

export function catalogueLine(book: Book): string {
  const genres = (book.genres ?? []).join(", ");
  return `${book.id} :: ${book.title} :: ${book.author} :: ${book.year} :: ${genres} :: ${book.blurb.slice(0, 160)}`;
}

export function searchError(status: number): string | null {
  if (status === 429) return "Too many searches…";
  if (status === 402) return "Search credits exhausted.";
  return null;
}

export function parseModelIds(content: string, catalogue: { id: string }[]): string[] {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end < start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.slice(start, end + 1));
  } catch {
    return [];
  }
  const ids = (parsed as { ids?: unknown }).ids;
  if (!Array.isArray(ids)) return [];
  const known = new Set(catalogue.map((book) => book.id));
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id === "string" && known.has(id) && !out.includes(id)) out.push(id);
    if (out.length >= 20) break;
  }
  return out;
}

type Provider = {
  url: string;
  headers: Record<string, string>;
  body: (query: string, catalogue: string) => unknown;
  read: (payload: unknown) => string;
};

export function pickProvider(env: SearchEnv): Provider | null {
  const openai = env.openai?.trim();
  const gemini = env.gemini?.trim();
  const anthropic = env.anthropic?.trim();
  const catalogueBody = (query: string, catalogue: string) => ({
    model: openai ? "gpt-4o-mini" : "gemini-2.5-flash",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Request: ${query}\n\nCatalogue:\n${catalogue}` },
    ],
  });
  const readChat = (payload: unknown) => {
    const data = payload as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? "";
  };
  if (openai) {
    return {
      url: "https://api.openai.com/v1/chat/completions",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openai}` },
      body: catalogueBody,
      read: readChat,
    };
  }
  if (gemini) {
    return {
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${gemini}` },
      body: catalogueBody,
      read: readChat,
    };
  }
  if (anthropic) {
    return {
      url: "https://api.anthropic.com/v1/messages",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropic,
        "anthropic-version": "2023-06-01",
      },
      body: (query, catalogue) => ({
        model: "claude-haiku-4-5",
        max_tokens: 400,
        system: SYSTEM,
        messages: [{ role: "user", content: `Request: ${query}\n\nCatalogue:\n${catalogue}` }],
      }),
      read: (payload) => {
        const data = payload as { content?: { text?: string }[] };
        return (data.content ?? []).map((part) => part.text ?? "").join("");
      },
    };
  }
  return null;
}

export async function searchCatalogue(query: string, env: SearchEnv): Promise<SearchResponse> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { ids: [] };
  const provider = pickProvider(env);
  if (!provider) return { fallback: true };
  const catalogue = books.map(catalogueLine).join("\n");
  try {
    const response = await fetch(provider.url, {
      method: "POST",
      headers: provider.headers,
      body: JSON.stringify(provider.body(trimmed, catalogue)),
    });
    if (!response.ok) {
      return {
        error: searchError(response.status) ?? "The shelves couldn't be read just now.",
        status: response.status,
      };
    }
    const payload: unknown = await response.json();
    return { ids: parseModelIds(provider.read(payload), books) };
  } catch {
    return { error: "The shelves couldn't be read just now.", status: 502 };
  }
}
