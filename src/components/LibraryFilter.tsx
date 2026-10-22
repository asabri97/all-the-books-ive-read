import { useEffect, useMemo, useRef, useState } from "react";
import type { Book } from "../data/books";
import { smartSearch } from "../lib/librarySearch";
import { genresByCount, selectShelf } from "../lib/selectShelf";

export function LibraryFilter({
  books,
  onChange,
}: {
  books: Book[];
  onChange: (next: Book[] | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState<string | null>(null);
  const [rankedIds, setRankedIds] = useState<string[] | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const reqId = useRef(0);
  const genres = useMemo(() => genresByCount(books), [books]);
  const visible = useMemo(() => selectShelf(books, genre, rankedIds), [books, genre, rankedIds]);

  useEffect(() => {
    onChange(visible);
  }, [visible, onChange]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      reqId.current += 1;
      setRankedIds(null);
      setPhase("idle");
      setError("");
      return;
    }
    const id = ++reqId.current;
    setPhase("loading");
    const timer = window.setTimeout(() => {
      void smartSearch(trimmed).then((result) => {
        if (id !== reqId.current) return;
        if ("error" in result) {
          setRankedIds(null);
          setError(result.error);
          setPhase("error");
          return;
        }
        setRankedIds(result.ids);
        setPhase("ready");
      });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [query]);

  const count = visible?.length ?? 0;
  const status =
    phase === "loading" ? "Reading the shelves…" : phase === "error" ? error : phase === "ready" ? `${count} found` : "";

  return (
    <div className="mt-10">
      <label htmlFor="library-search" className="sr-only">
        Search the library
      </label>
      <input
        id="library-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="What are you looking for?"
        autoComplete="off"
        className="w-full border-0 border-b border-foreground/20 bg-transparent pb-2 font-display text-3xl font-bold tracking-tight text-foreground outline-none placeholder:text-foreground/30"
      />
      <p className="mt-3 min-h-4 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase" aria-live="polite">
        {status}
      </p>
      <div className="no-scrollbar mt-4 flex flex-nowrap gap-2 overflow-x-auto">
        <GenrePill active={genre === null} onClick={() => setGenre(null)}>
          All
        </GenrePill>
        {genres.map((item) => (
          <GenrePill key={item} active={genre === item} onClick={() => setGenre(item)}>
            {item}
          </GenrePill>
        ))}
      </div>
    </div>
  );
}

function GenrePill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 border px-3 py-1 font-mono text-[10px] tracking-[0.16em] uppercase ${
        active ? "border-foreground bg-foreground text-background" : "border-foreground/15 text-foreground/70"
      }`}
    >
      {children}
    </button>
  );
}
