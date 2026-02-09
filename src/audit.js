/**
 * audit.js
 * Append-only audit logging for Siemens-grade traceability.
 * Every query produces a JSONL record with full execution trace.
 */
import fs from 'node:fs';
import path from 'node:path';

const AUDIT_DIR = process.env.AUDIT_LOG_DIR || './audit';

// Ensure directory exists
try {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
} catch (_) { /* ignore */ }

function getLogPath() {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(AUDIT_DIR, `audit_${date}.jsonl`);
}

/**
 * Log a complete audit record for a query execution.
 */
export function auditLog(record) {
  const entry = {
    timestamp: new Date().toISOString(),
    request_id: record.requestId || crypto.randomUUID?.() || `${Date.now()}`,
    question: record.question || null,
    params: record.params || {},
    route: record.route || null,
    strategy: record.strategy || null,
    sql_executed: record.sql || null,
    cypher_executed: record.cypher || null,
    row_count: record.rowCount ?? null,
    answer_summary: record.answer ? String(record.answer).slice(0, 500) : null,
    duration_ms: record.durationMs || null,
    error: record.error || null,
    fallback_reason: record.fallbackReason || null,
  };

  try {
    fs.appendFileSync(getLogPath(), JSON.stringify(entry) + '\n', 'utf-8');
  } catch (e) {
    console.error('[audit] Failed to write audit log:', e.message);
  }
}
