# QueryWeaver Sample Prompts (Production)

Use these prompts against the `/queryweaver/query` endpoint.

## Next shift tooling readiness
**Question**
- "What tools are missing for the next shift per machine?"

**Optional params**
- `shift_key`: e.g. `"2026-02-03:1"` (format: `ShiftDate:ShiftID`)
If omitted, QueryWeaver will automatically choose the *next* shift (minimum shift_date >= today).

## Blocked operations
- "Which operations are blocked due to missing tool assemblies?"

## Tool usage for a job
- "Show tool usage for JobNum JOB123"

## Magazine snapshot
- "Show machines and their loaded assemblies (magazine snapshot)"

## NC vs required gap
- "Compare NC-called tools vs required tools for operation JOB123:10"
