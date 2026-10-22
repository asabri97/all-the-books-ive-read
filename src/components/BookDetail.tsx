import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { Book } from "../data/books";

export type SpineRect = { left: number; top: number; width: number; height: number };

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function computePose(rect: SpineRect) {
  const vp = { w: window.innerWidth, h: window.innerHeight };
  const narrow = vp.w < 720;
  const coverH = narrow ? vp.h * 0.42 : Math.min(vp.h * 0.6, 480);
  const coverW = coverH * 0.66;
  const targetLeft = narrow ? Math.max(20, (vp.w - coverW) / 2) : Math.min(Math.max(48, vp.w * 0.1), 160);
  const targetTop = narrow ? 28 : Math.max(36, (vp.h - coverH) / 2 - 12);
  return { coverW, coverH, targetLeft, targetTop, narrow, vp, from: rect };
}

function Stars({ rating }: { rating: number }) {
  if (!rating) {
    return <p className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">Unrated</p>;
  }
  const filled = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <p className="font-mono text-[14px] tracking-[0.22em] text-primary" aria-label={`${filled} out of 5`}>
      {"★★★★★".slice(0, filled)}
      <span className="text-foreground/25">{"★★★★★".slice(filled)}</span>
    </p>
  );
}

export function BookDetail({
  book,
  rect,
  onClose,
  onPrev,
  onNext,
  hasNeighbors,
}: {
  book: Book;
  rect: SpineRect;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasNeighbors: boolean;
}) {
  const [out, setOut] = useState(false);
  const [tick, setTick] = useState(0);
  const closing = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => setOut(true));
    });
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onResize = () => setTick((value) => value + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const retract = () => {
    if (closing.current) return;
    closing.current = true;
    setOut(false);
    window.setTimeout(() => onCloseRef.current(), prefersReducedMotion() ? 0 : 620);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        retract();
      } else if (event.key === "ArrowLeft" && hasNeighbors) {
        event.preventDefault();
        onPrev();
      } else if (event.key === "ArrowRight" && hasNeighbors) {
        event.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const pose = useMemo(() => computePose(rect), [rect, tick]);
  const transition = prefersReducedMotion()
    ? "none"
    : "left 900ms cubic-bezier(0.16, 1, 0.3, 1), top 900ms cubic-bezier(0.16, 1, 0.3, 1), width 900ms cubic-bezier(0.16, 1, 0.3, 1), height 900ms cubic-bezier(0.16, 1, 0.3, 1)";
  const panelStyle: CSSProperties = pose.narrow
    ? {
        left: 16,
        right: 16,
        top: pose.targetTop + pose.coverH + 16,
        width: "auto",
      }
    : {
        left: pose.targetLeft + pose.coverW + 36,
        top: pose.targetTop,
        width: Math.min(440, Math.max(240, pose.vp.w - pose.targetLeft - pose.coverW - 72)),
      };

  const meta = [book.year || null, book.publisher || null].filter(Boolean).join(" · ");

  return createPortal(
    <div className="fixed inset-0 z-[200]" data-detail-open>
      <button
        type="button"
        aria-label="Close the book"
        className="absolute inset-0 border-0 bg-background/95 backdrop-blur-2xl"
        style={{
          opacity: out ? 1 : 0,
          transition: prefersReducedMotion() ? "none" : "opacity 700ms ease",
        }}
        onClick={retract}
      />
      <div
        className="fixed z-[2] overflow-hidden bg-card shadow-[0_30px_80px_-28px_rgba(0,0,0,0.7)]"
        style={{
          left: out ? pose.targetLeft : pose.from.left,
          top: out ? pose.targetTop : pose.from.top,
          width: out ? pose.coverW : pose.from.width,
          height: out ? pose.coverH : pose.from.height,
          transition,
        }}
      >
        {book.cover ? (
          <img src={book.cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col justify-between p-6" style={{ background: book.spine, color: book.ink }}>
            <p className="font-display text-3xl leading-tight font-bold">{book.title}</p>
            {book.author && <p className="font-sans text-sm">{book.author}</p>}
          </div>
        )}
      </div>
      <aside
        className="fixed z-[3] max-h-[70vh] overflow-y-auto border border-border bg-card p-6 shadow-[0_30px_80px_-28px_rgba(0,0,0,0.75)] sm:p-8"
        style={{
          ...panelStyle,
          opacity: out ? 1 : 0,
          transform: out ? "translateY(0)" : "translateY(18px)",
          transition: prefersReducedMotion()
            ? "none"
            : "opacity 800ms ease 260ms, transform 800ms cubic-bezier(0.16, 1, 0.3, 1) 260ms",
        }}
      >
        <p className="font-mono text-[10px] tracking-[0.22em] text-muted-foreground uppercase">
          {book.recommender ? `Recommended by ${book.recommender}` : book.finished ? `Finished ${book.finished}` : "On the shelf"}
        </p>
        <h2 className="mt-3 font-display text-4xl leading-[0.95] font-extrabold tracking-tight text-balance sm:text-5xl">{book.title}</h2>
        {book.author && <p className="mt-3 font-sans text-lg">{book.author}</p>}
        {meta && <p className="mt-2 font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase">{meta}</p>}
        {book.blurb && <p className="mt-5 max-w-prose font-sans text-[15px] leading-relaxed font-light text-foreground/80">{book.blurb}</p>}
        <div className="mt-5">
          <Stars rating={book.rating} />
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            className="border border-foreground/20 px-3 py-2 font-mono text-[10px] tracking-[0.18em] uppercase disabled:opacity-30"
            onClick={onPrev}
            disabled={!hasNeighbors}
          >
            Previous
          </button>
          <button
            type="button"
            className="border border-foreground/20 px-3 py-2 font-mono text-[10px] tracking-[0.18em] uppercase disabled:opacity-30"
            onClick={onNext}
            disabled={!hasNeighbors}
          >
            Next
          </button>
          <button
            type="button"
            className="border border-foreground bg-foreground px-3 py-2 font-mono text-[10px] tracking-[0.18em] text-background uppercase"
            onClick={retract}
          >
            Shelve it
          </button>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
