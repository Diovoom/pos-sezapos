// Owner-web boundary: legacy/native caches can contain another store's rows.
export function employeesForStore<T>(rows: T[], storeId: string): T[] {
  return rows.filter((row) => (row as T & { store_id?: string }).store_id === storeId);
}
