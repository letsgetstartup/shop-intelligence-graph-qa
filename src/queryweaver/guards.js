export function enforceMaxRows(sql, maxRows) {
  const hasLimit = /\blimit\s+\d+/i.test(sql);
  return hasLimit ? sql : `${sql}\nLIMIT ${Number(maxRows)}`;
}

/**
 * Reject write operations in natural language questions.
 * Prevents prompt injection attempts targeting SQL writes.
 */
export function forbidWriteOperations(question) {
  const bad = /(delete|update|insert|drop|alter|truncate|create\s+table)/i;
  if (bad.test(question)) {
    const err = new Error("Read-only mode: write operations are not allowed.");
    err.code = "READ_ONLY_VIOLATION";
    throw err;
  }
}

/**
 * Reject write operations in generated SQL queries.
 * Defense-in-depth: catches LLM-generated write SQL before execution.
 */
export function forbidWriteSQL(sql) {
  const bad = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE)\b/i;
  if (bad.test(sql)) {
    const err = new Error("SAFETY: Write SQL operation rejected (read-only mode).");
    err.code = "SQL_WRITE_REJECTED";
    throw err;
  }
}

/**
 * Reject write operations in generated Cypher queries.
 * Defense-in-depth: catches LLM-generated write Cypher before execution.
 */
export function forbidWriteCypher(cypher) {
  const bad = /\b(CREATE|MERGE|DELETE|SET|REMOVE|DROP)\b/i;
  if (bad.test(cypher)) {
    const err = new Error("SAFETY: Write Cypher operation rejected (read-only mode).");
    err.code = "CYPHER_WRITE_REJECTED";
    throw err;
  }
}

export function safeGraphName(name) {
  if (!/^[a-zA-Z0-9_\-]+$/.test(name)) {
    const err = new Error("Invalid graph name.");
    err.code = "INVALID_GRAPH_NAME";
    throw err;
  }
  return name;
}
