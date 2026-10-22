import type { Book } from "../data/books";

export const COVER_W = 178;

export const faceFont = {
  serif: "font-display",
  sans: "font-sans",
  mono: "font-mono",
} as const;

export function labelBinding(binding: Book["binding"]): string {
  if (binding === "hardcover") return "Hardcover";
  if (binding === "mass") return "Mass market";
  return "Paperback";
}
