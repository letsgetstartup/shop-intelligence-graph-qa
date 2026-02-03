// Minimal Cypher literal encoder for UNWIND batches.
// NOTE: This is intentionally conservative. For very large data volumes,
// you should switch to a bulk loader / CSV import pipeline.

function escapeString(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

export function cypherValue(v) {
  if (v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return 'null';
    return String(v);
  }
  if (v instanceof Date) return `'${v.toISOString()}'`;
  // Postgres timestamps often come back as string in ISO format
  if (typeof v === 'string') {
    // normalize empty strings as null (optional)
    if (v.trim() === '') return 'null';
    return `'${escapeString(v)}'`;
  }
  // Fallback: JSON stringify objects
  return `'${escapeString(JSON.stringify(v))}'`;
}

export function cypherMap(obj) {
  const entries = Object.entries(obj)
    .filter(([, v]) => v !== undefined) // keep nulls
    .map(([k, v]) => `${k}: ${cypherValue(v)}`);
  return `{ ${entries.join(', ')} }`;
}

export function cypherListOfMaps(rows) {
  return `[${rows.map(cypherMap).join(', ')}]`;
}
