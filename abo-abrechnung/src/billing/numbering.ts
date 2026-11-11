/**
 * Nächste freie Nummer nach Muster, z. B. "RE-{YYYY}-{NNN}" oder "K-{NNNN}".
 * {YYYY} wird durch das Jahr ersetzt, {N…} ist die laufende Nummer mit fester Breite.
 */
export function suggestNumber(pattern: string, existing: string[], year: number): string {
  const nMatch = /\{(N+)\}/.exec(pattern);
  const withYear = pattern.replace(/\{YYYY\}/g, String(year));
  if (!nMatch) return withYear;
  const width = nMatch[1].length;
  const [prefix, suffix] = withYear.split(nMatch[0]);
  // Prefix/Suffix werden vollständig escaped.
  // eslint-disable-next-line @rushstack/security/no-unsafe-regexp
  const re = new RegExp(`^${escapeRe(prefix)}(\\d+)${escapeRe(suffix)}$`, 'i');
  let max = 0;
  for (const e of existing) {
    const m = re.exec(e.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  let num = String(max + 1);
  while (num.length < width) num = `0${num}`;
  return `${prefix}${num}${suffix}`;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
