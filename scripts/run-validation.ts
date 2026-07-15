import {
  AUDIT_SAMPLE_CSV,
  VALIDATION_FLAGS_CSV,
  VALIDATION_REPORT_JSON,
} from '../src/config/constants';
import { writeCsv } from '../src/common/csv';
import { log } from '../src/common/logger';
import { loadPostRows, writeJsonFile } from '../src/common/store';
import { exportPostsCsv } from '../src/export/to-csv';
import { selectAuditSample } from '../src/qa/audit-sample';
import { dedupePostRows } from '../src/qa/dedupe';
import { validateDataset } from '../src/qa/validate';

function main(): void {
  const allRows = loadPostRows();
  if (allRows.length === 0) {
    log.warn('No post rows found (data/normalized/posts_public_metrics.json or manual_posts.csv). Nothing to validate.');
    return;
  }

  const { rows, dropped } = dedupePostRows(allRows);
  const report = validateDataset(rows, dropped.length);

  writeJsonFile(VALIDATION_REPORT_JSON, report);
  writeCsv(
    VALIDATION_FLAGS_CSV,
    [...report.errors, ...report.warnings] as unknown as Array<Record<string, unknown>>,
    ['rowKey', 'severity', 'field', 'message'],
  );
  exportPostsCsv(selectAuditSample(rows, 0.1), AUDIT_SAMPLE_CSV);

  log.info(`Rows validated:        ${report.total_rows} (duplicates dropped: ${report.duplicates_dropped})`);
  log.info(`Rows with errors:      ${report.rows_with_errors}`);
  log.info(`Rows with warnings:    ${report.rows_with_warnings}`);
  log.info(`Report:                ${VALIDATION_REPORT_JSON}`);
  log.info(`Flagged rows:          ${VALIDATION_FLAGS_CSV}`);
  log.info(`10% audit sample:      ${AUDIT_SAMPLE_CSV} — review against live pages/screenshots`);

  if (report.rows_with_errors > 0) {
    log.warn('Fix hard errors before workbook import.');
    process.exitCode = 4;
  }
}

main();
