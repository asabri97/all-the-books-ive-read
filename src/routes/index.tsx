import { useCallback, useState } from "react";
import { books, type Book } from "../data/books";
import { LibraryFilter } from "../components/LibraryFilter";
import { Shelf } from "../components/Shelf";
import { TypedTitle } from "../components/TypedTitle";

function sameShelf(current: Book[] | null, next: Book[] | null): boolean {
  if (current === next) return true;
  if (!current || !next) return false;
  if (current.length !== next.length) return false;
  return current.every((book, index) => book.id === next[index]?.id);
}

export function LibraryPage() {
  const [shown, setShown] = useState<Book[] | null>(null);
  const onChange = useCallback((next: Book[] | null) => {
    setShown((current) => (sameShelf(current, next) ? current : next));
  }, []);

  const shelfBooks = shown ?? books;
  const filtering = shown !== null;
  const volumeLabel = books.length === 1 ? "1 volume" : `${books.length} volumes`;

  return (
    <div className="grain min-h-screen bg-background text-foreground">
      <div
        aria-hidden
        className="animate-drift pointer-events-none absolute -inset-[12%]"
        style={{
          background:
            "radial-gradient(ellipse 55% 36% at 50% -12%, color-mix(in oklch, var(--primary) 32%, transparent), transparent 64%)",
        }}
      />
      <header className="relative z-20 mx-auto max-w-6xl px-6 pt-14 sm:pt-20">
        <div className="flex items-end justify-between gap-6">
          <p className="font-sans text-[11px] font-semibold tracking-[0.28em] text-muted-foreground uppercase">
            A personal archive
          </p>
          <p className="font-sans text-[11px] font-semibold tracking-[0.22em] uppercase">{volumeLabel}</p>
        </div>
        <div className="mt-5">
          <TypedTitle />
        </div>
        <LibraryFilter books={books} onChange={onChange} />
      </header>
      <main className="relative z-10 mt-2 pb-10">
        {books.length === 0 && !filtering ? (
          <section className="px-6 pt-16 pb-20">
            <div className="mx-auto max-w-xl text-center">
              <p className="font-display text-4xl font-bold tracking-tight">The shelf is waiting.</p>
              <p className="mt-4 font-sans text-sm leading-relaxed text-muted-foreground">
                Finished books will stand here once the library is imported.
              </p>
            </div>
            <div className="pointer-events-none mt-20">
              <div className="h-px w-full bg-gradient-to-r from-transparent via-foreground/30 to-transparent" />
              <div className="mx-auto h-10 max-w-5xl bg-gradient-to-b from-black/70 to-transparent" />
            </div>
          </section>
        ) : shelfBooks.length === 0 ? (
          <p className="px-6 py-24 text-center font-display text-4xl font-bold tracking-tight">No books match</p>
        ) : (
          <Shelf books={shelfBooks} />
        )}
      </main>
    </div>
  );
}
