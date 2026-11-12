/** Nächste freie Kundennummer im Format K-NNNN (höchste vorhandene + 1). */
export function nextKundennummer(existing: string[]): string {
  let max = 0;
  for (const e of existing) {
    const m = /^K-(\d+)$/i.exec(e.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  const num = String(max + 1);
  return `K-${'0000'.substring(Math.min(4, num.length))}${num}`;
}
