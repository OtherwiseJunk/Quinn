/** Strip spaces and common separator characters used to evade filters. */
function stripSeparators(text: string): string {
  return text.replace(/[\s.\-_*|/\\]/g, "");
}

/** Case-insensitive substring check against a list of forbidden words. */
export function containsForbiddenWord(
  text: string,
  forbiddenWords: string[]
): boolean {
  const lower = text.toLowerCase();
  const stripped = stripSeparators(lower);
  return forbiddenWords.some((word) => {
    const w = word.toLowerCase();
    return lower.includes(w) || stripped.includes(stripSeparators(w));
  });
}
