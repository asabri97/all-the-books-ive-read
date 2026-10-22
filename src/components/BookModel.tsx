import type { Book } from "../data/books";
import { faceFont } from "./bookFaces";

function textureFor(finish: Book["finish"]): string {
  if (finish === "cloth") {
    return "repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 3px), repeating-linear-gradient(0deg, rgba(0,0,0,0.06) 0 1px, transparent 1px 3px)";
  }
  if (finish === "gloss") {
    return "linear-gradient(180deg, rgba(255,255,255,0.16), transparent 32%, rgba(0,0,0,0.08))";
  }
  return "repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 4px)";
}

function finishSheen(finish: Book["finish"]): string {
  if (finish === "gloss") {
    return "linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.55) 36%, rgba(255,255,255,0.06) 58%, rgba(0,0,0,0.18) 100%)";
  }
  if (finish === "cloth") {
    return "linear-gradient(90deg, rgba(255,255,255,0.05), rgba(255,255,255,0.14) 46%, rgba(0,0,0,0.14) 100%)";
  }
  return "linear-gradient(90deg, rgba(255,255,255,0.03), rgba(255,255,255,0.08) 50%, rgba(0,0,0,0.1) 100%)";
}

function BandRule({
  edge,
  offset,
  color,
  opacity,
}: {
  edge: "top" | "bottom";
  offset: number;
  color: string;
  opacity: number;
}) {
  return (
    <span
      aria-hidden
      className="absolute right-[3px] left-[3px] h-px"
      style={{ [edge]: offset, background: color, opacity }}
    />
  );
}

export function BookModel({ book }: { book: Book }) {
  const titleSize = book.width >= 36 ? 13 : 10;
  const rule = book.band ?? book.ink;
  return (
    <span className="relative block h-full w-full" style={{ transformStyle: "preserve-3d" }}>
      <span
        className="absolute inset-0 overflow-hidden"
        style={{ background: book.spine, transform: "translateZ(0.4px)", backfaceVisibility: "hidden" }}
      >
        {book.cover && (
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-[58%]"
            style={{
              backgroundImage: `linear-gradient(90deg, transparent, transparent), url(${book.cover})`,
              backgroundSize: "cover",
              backgroundPosition: "left center",
              maskImage: "linear-gradient(90deg, #000 8%, transparent 80%)",
              WebkitMaskImage: "linear-gradient(90deg, #000 8%, transparent 80%)",
            }}
          />
        )}
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${book.spine} 64%, ${book.spine} 100%)`,
          }}
        />
        <BandRule edge="top" offset={7} color={rule} opacity={0.9} />
        <BandRule edge="top" offset={10} color={rule} opacity={0.42} />
        <BandRule edge="bottom" offset={7} color={rule} opacity={0.9} />
        <BandRule edge="bottom" offset={10} color={rule} opacity={0.42} />
        <span
          className={`pointer-events-none absolute top-4 left-1/2 flex -translate-x-1/2 items-stretch justify-center gap-[3px] overflow-hidden ${faceFont[book.face]}`}
          style={{
            bottom: book.width >= 30 && book.publisher ? 22 : 16,
            color: book.ink,
            opacity: 1 - book.wear * 0.28,
          }}
        >
          <span
            style={{
              writingMode: "vertical-rl",
              textOrientation: "mixed",
              fontSize: titleSize,
              lineHeight: 1.05,
              letterSpacing: book.caps ? "0.14em" : "0.01em",
              textTransform: book.caps ? "uppercase" : "none",
              fontWeight: 500,
              overflow: "hidden",
            }}
          >
            {book.title}
          </span>
          {book.width >= 44 && book.author && (
            <span
              style={{
                writingMode: "vertical-rl",
                textOrientation: "mixed",
                fontSize: 9,
                letterSpacing: "0.08em",
                opacity: 0.78,
              }}
            >
              {book.author}
            </span>
          )}
        </span>
        {book.width >= 30 && book.publisher && (
          <span
            className="absolute inset-x-0 bottom-[12px] truncate px-px text-center font-mono uppercase"
            style={{ color: book.ink, fontSize: 7, letterSpacing: "0.08em", opacity: 0.72 }}
          >
            {book.publisher}
          </span>
        )}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: textureFor(book.finish),
            mixBlendMode: "multiply",
            opacity: book.finish === "cloth" ? 0.55 : 0.28,
          }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: finishSheen(book.finish) }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: book.wear,
            background:
              "linear-gradient(180deg, rgba(255,228,190,0.7), transparent 30%, transparent 72%, rgba(0,0,0,0.45))",
          }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            boxShadow:
              "inset 1px 0 0 rgba(255,255,255,0.28), inset -1px 0 0 rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.16)",
          }}
        />
      </span>
      {book.binding === "hardcover" && (
        <span
          aria-hidden
          className="absolute top-0 left-0"
          style={{
            width: "100%",
            height: 5,
            background: book.band ?? book.spine,
            transform: "translateZ(2px)",
          }}
        />
      )}
    </span>
  );
}
