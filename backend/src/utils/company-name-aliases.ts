/**
 * Some legacy records store `User.company` as a free-text string.
 * In practice the same company can be saved with slightly different spacing / hyphen styles:
 * - "ONIX ENGINEERING CONSULTANCY - DUBAI"
 * - "ONIX ENGINEERING CONSULTANCY-DUBAI"
 * - multiple spaces, etc.
 *
 * This helper generates a small, safe set of aliases so company-scoped queries
 * don't silently return 0 employees due to formatting differences.
 */
export function buildCompanyNameAliases(rawName: string | null | undefined): string[] {
  const base = String(rawName ?? '').trim();
  if (!base) return [];

  const collapseSpaces = (s: string) => s.replace(/\s+/g, ' ').trim();
  const normalizeHyphenTight = (s: string) => s.replace(/\s*-\s*/g, '-').trim();
  const normalizeHyphenSpaced = (s: string) => s.replace(/\s*-\s*/g, ' - ').trim();

  const a = collapseSpaces(base);
  const b = collapseSpaces(normalizeHyphenTight(base));
  const c = collapseSpaces(normalizeHyphenSpaced(base));

  const out = [base, a, b, c]
    .map((x) => String(x || '').trim())
    .filter(Boolean);

  // de-dupe case-insensitively while preserving original order
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const n of out) {
    const k = n.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(n);
  }
  return uniq;
}

/**
 * Company-scoped filtering needs to include parent-company name for branch companies,
 * because many legacy users store `User.company` as the parent company string.
 */
export function buildCompanyScopeAliases(
  companyName: string | null | undefined,
  parentCompanyName?: string | null | undefined,
): string[] {
  // Heuristic: some branch-like company records are saved as "<BASE>-<CITY>" but employees are stored under "<BASE>".
  // Example in this DB: company.name="ONIX ENGINEERING CONSULTANCY-DUBAI" while users.company="ONIX ENGINEERING CONSULTANCY".
  const baseFromDashSuffix = (() => {
    const raw = String(companyName ?? '').trim();
    if (!raw) return null;
    if (!/\bONIX ENGINEERING CONSULTANCY\b/i.test(raw)) return null;
    if (!/\bDUBAI\b/i.test(raw)) return null;
    if (/\bBRANCH OF\b/i.test(raw)) return null;

    const m = raw.match(/^(.*?)(?:\s*-\s*DUBAI)\s*$/i);
    const candidate = (m?.[1] || '').trim();
    return candidate || null;
  })();

  const out = [
    ...buildCompanyNameAliases(companyName),
    ...buildCompanyNameAliases(parentCompanyName),
    ...buildCompanyNameAliases(baseFromDashSuffix),
  ];
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const n of out) {
    const k = n.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(n);
  }
  return uniq;
}

