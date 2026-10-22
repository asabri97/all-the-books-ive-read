const FULL = "Welcome to my library";

export function TypedTitle() {
  return (
    <h1
      aria-label={FULL}
      className="font-display text-4xl leading-[1.05] font-bold tracking-tight text-foreground sm:text-6xl"
    >
      {FULL}
    </h1>
  );
}
