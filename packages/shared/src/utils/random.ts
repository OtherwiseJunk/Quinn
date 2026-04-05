/** Randomly sample up to `limit` items from an array using Fisher-Yates. */
export function sampleRandom<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) return items;
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, limit);
}
