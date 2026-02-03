export function enforceMaxRows(sql, maxRows) {
  const hasLimit = /\blimit\s+\d+/i.test(sql);
  return hasLimit ? sql : `${sql}\nLIMIT ${Number(maxRows)}`;
}

export function forbidWriteOperations(question) {
  const bad = /(delete|update|insert|drop|alter|truncate|create\s+table)/i;
  if (bad.test(question)) {
    const err = new Error("Read-only mode: write operations are not allowed.");
    err.code = "READ_ONLY_VIOLATION";
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
