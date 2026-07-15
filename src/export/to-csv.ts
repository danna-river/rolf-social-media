import { writeCsv } from '../common/csv';
import type { AccountSnapshot, PostRow } from '../config/schema';
import { ACCOUNT_COLUMNS, POST_COLUMNS } from './workbook-map';

export function exportPostsCsv(rows: PostRow[], filePath: string): void {
  writeCsv(
    filePath,
    rows as unknown as Array<Record<string, unknown>>,
    POST_COLUMNS as unknown as string[],
  );
}

export function exportAccountsCsv(rows: AccountSnapshot[], filePath: string): void {
  writeCsv(
    filePath,
    rows as unknown as Array<Record<string, unknown>>,
    ACCOUNT_COLUMNS as unknown as string[],
  );
}
