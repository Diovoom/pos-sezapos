/** Keyset pagination continues until an empty page, including server caps below pageSize. */
export async function collectExportRows<T extends { id: string }>(fetchPage: (after: string | null) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  let after: string | null = null;
  for (;;) {
    const result = await fetchPage(after);
    if (result.error) throw result.error;
    const page = result.data ?? [];
    if (!page.length) return rows;
    const next = page[page.length - 1].id;
    if (!next || next === after) throw new Error("Export could not advance to the next page");
    rows.push(...page);
    after = next;
  }
}
