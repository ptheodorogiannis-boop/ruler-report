/** Search text without accents or case: "Κόστος" → "κοστος", "Café" → "cafe" (the list filters, the app search, the metric picker). */
export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
