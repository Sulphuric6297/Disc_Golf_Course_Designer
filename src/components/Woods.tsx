// The woods behind the app (Woodland glass): a forest at sunrise, blurred and dimmed, under the
// glass bars and panels, so they take its colors. (A small picture blurred before it's served: a
// phone draws it without effort.)

/** `inset`: inside a panel of its own (the Design step's page), not behind the whole window. */
export function Woods({ inset }: { inset?: boolean }) {
  return <div className={`woods ${inset ? "!absolute !-z-10" : ""}`} aria-hidden style={{ backgroundImage: `url(${import.meta.env.BASE_URL}backdrop/forest-soft.jpg)` }} />;
}
