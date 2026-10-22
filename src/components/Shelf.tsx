import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { Book } from "../data/books";
import { curveRotate } from "../lib/curve";
import { BookSpine } from "./BookSpine";
import { BookDetail, type SpineRect } from "./BookDetail";

const LOOP_AT = 2600;

function rowWidth(books: Book[]): number {
  if (books.length === 0) return 0;
  return books.reduce((sum, book) => sum + book.width, 0) + (books.length - 1) * 2;
}

export function Shelf({
  books,
  justAdded,
}: {
  books: Book[];
  justAdded?: string | null;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ down: false, x: 0, left: 0, moved: false });
  const [overflowing, setOverflowing] = useState(false);
  const [shelving, setShelving] = useState<string | null>(null);
  const [open, setOpen] = useState<{ index: number; rect: SpineRect } | null>(null);
  const copies = rowWidth(books) > LOOP_AT ? 3 : 1;
  const primary = copies === 3 ? 1 : 0;

  const paintCurve = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const view = el.getBoundingClientRect();
    const mid = view.left + view.width / 2;
    const half = Math.max(1, view.width / 2);
    el.querySelectorAll<HTMLElement>("[data-spine]").forEach((node) => {
      const rect = node.getBoundingClientRect();
      const ratio = (rect.left + rect.width / 2 - mid) / half;
      node.style.setProperty("--ry", `${curveRotate(ratio)}deg`);
    });
  };

  const wrapScroll = () => {
    const el = scrollerRef.current;
    if (!el || copies !== 3) return;
    const segment = el.scrollWidth / 3;
    if (segment <= 0) return;
    if (el.scrollLeft < segment * 0.02) el.scrollLeft += segment;
    else if (el.scrollLeft > segment * 1.98) el.scrollLeft -= segment;
  };

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (copies === 3) el.scrollLeft = el.scrollWidth / 3;
    paintCurve();
  }, [copies, books]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      wrapScroll();
      paintCurve();
    };
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      el.scrollLeft += event.deltaY;
    };
    const onKey = (event: KeyboardEvent) => {
      if (open) return;
      if (document.querySelector("[data-detail-open], [data-recommend-open]")) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (event.key === "ArrowRight") el.scrollBy({ left: 320, behavior: "smooth" });
      if (event.key === "ArrowLeft") el.scrollBy({ left: -320, behavior: "smooth" });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", paintCurve);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", paintCurve);
    };
  }, [copies, books, open]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const check = () => setOverflowing(el.scrollWidth > el.clientWidth + 2);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [books, copies]);

  useEffect(() => {
    if (!justAdded) return;
    const el = scrollerRef.current;
    const target = el?.querySelector<HTMLElement>(`[data-book-id="${CSS.escape(justAdded)}"][data-copy="${primary}"]`);
    if (el && target) {
      const shelf = el.getBoundingClientRect();
      const book = target.getBoundingClientRect();
      el.scrollLeft += book.left + book.width / 2 - (shelf.left + shelf.width / 2);
    }
    setShelving(justAdded);
    const timer = window.setTimeout(() => setShelving(null), 1100);
    return () => window.clearTimeout(timer);
  }, [justAdded, primary]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const el = scrollerRef.current;
    if (!el) return;
    drag.current = { down: true, x: event.clientX, left: el.scrollLeft, moved: false };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    if (!el || !drag.current.down) return;
    const dx = event.clientX - drag.current.x;
    if (!drag.current.moved && Math.abs(dx) > 5) {
      drag.current.moved = true;
      el.setPointerCapture(event.pointerId);
    }
    if (drag.current.moved) el.scrollLeft = drag.current.left - dx;
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    drag.current.down = false;
    if (el?.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
    window.setTimeout(() => {
      drag.current.moved = false;
    }, 0);
  };

  const openAt = (index: number, element: HTMLElement) => {
    if (drag.current.moved) return;
    const rect = element.getBoundingClientRect();
    setOpen({
      index,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    });
  };

  const centered = copies === 1 && !overflowing;
  const showEdges = copies === 3 || overflowing;
  const openBook = open && books[open.index] ? books[open.index] : null;

  return (
    <section className="relative">
      <div className="relative">
        {showEdges && (
          <>
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-background to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-background to-transparent" />
          </>
        )}
        <div
          ref={scrollerRef}
          className={`no-scrollbar flex items-end gap-[2px] pt-16 pb-6 ${centered ? "justify-center" : ""} cursor-grab overflow-x-auto select-none active:cursor-grabbing`}
          style={{ perspective: "1400px", perspectiveOrigin: "50% 65%", transformStyle: "preserve-3d" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {Array.from({ length: copies }, (_, copy) => (
            <div
              key={copy}
              className="flex shrink-0 items-end gap-[2px]"
              aria-hidden={copies === 3 && copy !== primary}
            >
              {books.map((book, index) => {
                const arriving = shelving === book.id && copy === primary;
                const style = {
                  width: book.width,
                  height: book.height,
                  minWidth: 0,
                  "--spine-w": `${book.width}px`,
                } as CSSProperties;
                return (
                  <div
                    key={`${copy}-${book.id}`}
                    data-book-id={book.id}
                    data-copy={copy}
                    className={arriving ? "animate-shelve-in" : "shrink-0"}
                    style={style}
                  >
                    <BookSpine book={book} onOpen={(element) => openAt(index, element)} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="pointer-events-none px-8 pb-2">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-foreground/25 to-transparent" />
        <div className="mx-auto h-10 max-w-5xl bg-gradient-to-b from-foreground/8 to-transparent blur-md" />
      </div>
      {open && openBook && (
        <BookDetail
          book={openBook}
          rect={open.rect}
          hasNeighbors={books.length > 1}
          onClose={() => setOpen(null)}
          onPrev={() =>
            setOpen((current) =>
              current ? { ...current, index: (current.index - 1 + books.length) % books.length } : current,
            )
          }
          onNext={() =>
            setOpen((current) => (current ? { ...current, index: (current.index + 1) % books.length } : current))
          }
        />
      )}
    </section>
  );
}
