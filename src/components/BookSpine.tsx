import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Book } from "../data/books";
import { labelBinding } from "./bookFaces";
import { BookModel } from "./BookModel";

export function BookSpine({
  book,
  onOpen,
}: {
  book: Book;
  onOpen: (element: HTMLButtonElement) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const leaveTimer = useRef<number | null>(null);
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const measure = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ x: rect.left + rect.width / 2, y: rect.top });
  };

  useEffect(() => {
    if (!hovered) return;
    measure();
    const onMove = () => measure();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [hovered]);

  useEffect(() => {
    return () => {
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    };
  }, []);

  const pull = hovered ? 96 : 0;
  const lift = hovered ? -26 : 0;
  const lean = hovered ? 0 : book.lean;
  const meta = [
    book.year || null,
    labelBinding(book.binding),
    book.rating ? `${book.rating}/5` : "Unrated",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-spine
        aria-label={`${book.title}${book.author ? ` by ${book.author}` : ""}`}
        className="relative block h-full w-full cursor-pointer appearance-none border-0 bg-transparent p-0"
        style={{
          zIndex: hovered ? 40 : 1,
          perspective: "900px",
          perspectiveOrigin: "50% 62%",
          transformStyle: "preserve-3d",
        }}
        onMouseEnter={() => {
          if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
          setHovered(true);
        }}
        onMouseLeave={() => {
          leaveTimer.current = window.setTimeout(() => setHovered(false), 90);
        }}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onClick={() => {
          setHovered(false);
          if (buttonRef.current) onOpen(buttonRef.current);
        }}
      >
        <span className="block h-full w-full" style={{ transformStyle: "preserve-3d", transform: "rotateY(var(--ry, 0deg))" }}>
          <span
            className="relative block h-full w-full"
            style={{
              transformStyle: "preserve-3d",
              transform: `rotateZ(${lean}deg) translateZ(${pull + book.depth}px) translateY(${lift}px)`,
              transition: "transform 800ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            <BookModel book={book} />
          </span>
        </span>
      </button>
      {hovered &&
        pos &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[100] w-[248px]"
            style={{ left: pos.x, top: pos.y - 14, transform: "translate(-50%, -100%)" }}
          >
            <div className="border border-border bg-card/95 px-4 py-3 shadow-[0_24px_60px_-28px_rgba(48,32,18,0.55)] backdrop-blur-md">
              <p className="font-display text-[20px] leading-tight font-medium">{book.title}</p>
              {book.author && <p className="mt-1 font-sans text-[15px] text-foreground/80">{book.author}</p>}
              <p className="mt-2 font-mono text-[14px] text-muted-foreground">{meta}</p>
              {book.genres && book.genres.length > 0 && (
                <p className="mt-1 font-sans text-[14px] text-foreground/75">{book.genres.join(" · ")}</p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
