# QueryWeaver and Postgres Guide

## 1. Viewing Postgres Tables

You can list the tables in the `shop` schema using the `psql` command line tool.

### Command
```bash
# Uses the password 'shop_pass' (default in dev)
PGPASSWORD=shop_pass psql -d shop -U shop_user -h localhost -c "\dt shop.*"
```

### Key Tables
From our exploration, the key tables in the `shop` schema include:
- `shop.jb_Jobs`: Job definitions.
- `shop.jb_JobOperations`: Operations within a job.
- `shop.core.required_tools`: Tools required for operations (view).
- `shop.core.tool_inventory`: Current tool inventory (view).

## 2. Combining LLM Graph and SQL Queries with QueryWeaver

QueryWeaver allows you to map natural language "questions" to specific data retrieval strategies. To combine SQL and Graph (Cypher) queries, you can use the **`hybrid`** or **`sql_then_graph_optional`** strategies.

### How it Works
1.  **User asks a question** map to a **Route ID** based on keywords.
2.  **Route** specifies a **Strategy** (`hybrid`, `sql_only`, etc.).
3.  **Strategy** executes configured **SQL Template** and/or **Cypher Template**.

### Example: Hybrid Strategy ("Tool Usage for Job")

This existing example shows how to fetch SQL data for a job and then enrich/augment it with Graph data.

#### 1. Configuration (`config/queryweaver.config.json`)
Define the route and link the templates.
```json
{
  "id": "tool_usage_for_job",
  "match": ["tool usage", "job"],
  "strategy": "hybrid",
  "sqlTemplate": "tool_usage_for_job",     // Defined in sql_templates.js
  "cypherTemplate": "job_operation_machine_chain" // Defined in cypher_templates.js
}
```

#### 2. SQL Template (`src/queryweaver/sql_templates.js`)
Fetches relational data (operations, required tools).
```javascript
tool_usage_for_job: `
  SELECT
    o.job_num, o.oper_seq, o.operation_key, o.machine_code,
    r.assembly_id, r.qty_needed, r.criticality
  FROM core.operations o
  JOIN core.required_tools r ON r.operation_key = o.operation_key
  WHERE o.job_num = $1::text
  ORDER BY o.oper_seq
`,
```

#### 3. Cypher Template (`src/queryweaver/cypher_templates.js`)
Fetches graph relationships (Job -> Operation -> Machine).
```javascript
job_operation_machine_chain: (jobNumSafe) => `
  MATCH (j:Job {JobNum: "${jobNumSafe}"} )-[:HAS_OPERATION]->(o:Operation)-[:USES_MACHINE]->(m:Machine)
  RETURN j.JobNum AS job_num, o.JobOperKey AS operation_key, m.MachineAlias AS machine
  ORDER BY o.JobOperKey
`
```

### Steps to Add a New Combined Query
1.  **Identify your Goal**: e.g., "Find alternatives for missing tools".
2.  **Add Route** in `queryweaver.config.json`:
    -   Set `strategy` to `"hybrid"` (parallel/independent) or `"sql_then_graph_optional"` (SQL results feed Graph query).
3.  **Add SQL Template** in `sql_templates.js`.
4.  **Add Cypher Template** in `cypher_templates.js`.
