/**
 * Editions may stay unnamed while the team is still deciding, so fall back to
 * an ordinal label instead of showing an empty title.
 */
export function editionLabel(name: string | null | undefined, ordinal: number): string {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : `第 ${ordinal} 屆`;
}

/** Format an edition date for the countdown / headers. */
export function formatEditionDate(date: Date | null | undefined): string | null {
  if (!date) return null;
  return new Date(date).toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
