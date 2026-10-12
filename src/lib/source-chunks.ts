// Conservative sequencing hints; every returned chunk still needs AI extraction
// and human review. Do not split titles, parentheses, reactions or corrections.
export function splitCaptureNote(note: string): string[] {
  const boundaries: [number, number][] = [];
  let quote: string | null = null;
  let depth = 0;
  for (let i = 0; i < note.length; i++) {
    const char = note[i]!;
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (
      ['"', "“", "”", "‘"].includes(char) ||
      (char === "'" &&
        (i === 0 || !/[\p{L}\p{N}]/u.test(note[i - 1]!)) &&
        note.slice(i + 1).includes("'"))
    ) {
      quote = char === "“" ? "”" : char === "‘" ? "’" : char;
    } else if (char === "(") depth++;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (!depth && char === ";") {
      const match = /^;\s*(?:and\s+)?then\b\s*/i.exec(note.slice(i));
      if (
        match &&
        !/^(?:actually|not\b|loved\b|liked\b|hated\b|felt\b|changed my mind\b)/i.test(
          note.slice(i + match[0].length),
        )
      )
        boundaries.push([i, i + match[0].length]);
    }
  }
  const chunks: string[] = [];
  let start = 0;
  for (const [end, next] of boundaries) {
    chunks.push(note.slice(start, end).trim());
    start = next;
  }
  chunks.push(note.slice(start).trim());
  return chunks.length > 8 || chunks.some((chunk) => !chunk) ? [note] : chunks;
}
