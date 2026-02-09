/**
 * llm_hybrid.js — LLM-powered hybrid SQL + Cypher query engine
 * 
 * The LLM decides the query strategy (sql, graph, hybrid) and generates
 * the actual queries. No templates, no keyword matching — pure LLM routing.
 */
import { chatCompletionJSON } from '../offline_llm_client.js';
import { chatCompletion } from '../offline_llm_client.js';
import { auditLog } from '../audit.js';

const ROUTER_SYSTEM = `You route queries to SQL (PostgreSQL) and/or Cypher (FalkorDB graph).
Return JSON: {"strategy":"sql"|"graph"|"hybrid","reasoning":"why","sql":"SELECT.."|null,"cypher":"MATCH.."|null}

SQL tables (core schema, snake_case):
- core.jobs: job_num, customer_id, part_num, job_status, priority, qty_ordered, due_date
- core.operations: job_num, oper_seq, operation_key, machine_code, operation_desc, status
- core.required_tools: job_num, operation_key, machine_code, assembly_id, qty_needed, criticality
- core.tool_inventory: assembly_id, qty_available, qty_reserved, qty_free
- core.machine_magazine: machine_code, pocket_no, assembly_id, estimated_life_remaining_min
- core.customers: customer_id, customer_name, industry
- core.parts: part_num, description, sell_price
- core.employees: employee_id, employee_name, role, shift

Cypher nodes (PascalCase): Customer, Part, Job, Machine, Employee, Operation
Cypher rels: PLACED, PRODUCES, HAS_OPERATION, USES_MACHINE, WORKED_ON
Cypher props: CustomerName, JobNum, JobStatus, MachineAlias, PartNum, OperSeq, OperationDesc

Rules: SQL=SELECT only. Cypher=MATCH only. Add LIMIT. No GROUP BY in Cypher. Return JSON only.`;

export async function handleHybridQuery({ question, pgPool, redisClient, graphName }) {
  const startTime = Date.now();
  const requestId = `hyb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Step 1: LLM decides strategy and generates queries
  let routerOutput;
  try {
    const raw = await chatCompletion({
      system: ROUTER_SYSTEM,
      user: question,
      temperature: 0,
      maxTokens: 1024
    });

    // Extract JSON from response
    let jsonStr = raw;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];

    routerOutput = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`LLM router failed: ${e.message}`);
  }

  const { strategy, reasoning, sql, cypher } = routerOutput;
  const results = { strategy, reasoning, sql_query: null, cypher_query: null, sql_data: null, graph_data: null };

  // Step 2: Execute SQL if needed
  if ((strategy === 'sql' || strategy === 'hybrid') && sql) {
    // Safety check
    if (/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE)\b/i.test(sql)) {
      throw new Error('SAFETY: LLM generated write SQL — rejected');
    }
    results.sql_query = sql;
    const client = await pgPool.connect();
    try {
      await client.query('SET statement_timeout = 10000');
      const res = await client.query(sql);
      results.sql_data = res.rows;
    } finally {
      client.release();
    }
  }

  // Step 3: Execute Cypher if needed
  if ((strategy === 'graph' || strategy === 'hybrid') && cypher) {
    if (/\b(CREATE|MERGE|DELETE|SET|REMOVE|DROP)\b/i.test(cypher)) {
      throw new Error('SAFETY: LLM generated write Cypher — rejected');
    }
    results.cypher_query = cypher;
    const graphResult = await Promise.race([
      redisClient.call('GRAPH.QUERY', graphName, cypher),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Graph timeout')), 10000))
    ]);
    results.graph_data = graphResult;
  }

  // Step 4: Format results directly (no extra LLM call for speed)
  let answer = '';

  if (results.sql_data && results.sql_data.length > 0) {
    const rows = results.sql_data;
    if (rows.length === 1 && Object.keys(rows[0]).length <= 2) {
      // Single aggregate result
      const entries = Object.entries(rows[0]);
      answer = entries.map(([k, v]) => `**${k}:** ${v}`).join(' | ');
    } else {
      const keys = Object.keys(rows[0]);
      const header = keys.join(' | ');
      const lines = rows.slice(0, 15).map(r => keys.map(k => r[k] ?? '-').join(' | '));
      answer = `${header}\n${lines.join('\n')}`;
      if (rows.length > 15) answer += `\n... and ${rows.length - 15} more rows`;
    }
  }

  if (results.graph_data) {
    const gStr = JSON.stringify(results.graph_data).slice(0, 800);
    if (answer) answer += '\n\n**Graph Data:**\n';
    // Parse FalkorDB raw response
    try {
      const headers = results.graph_data[0];
      const rows = results.graph_data[1];
      if (Array.isArray(headers) && Array.isArray(rows)) {
        answer += headers.join(' | ') + '\n';
        answer += rows.slice(0, 10).map(r => r.join(' | ')).join('\n');
      } else {
        answer += gStr;
      }
    } catch {
      answer += gStr;
    }
  }

  if (!answer) answer = 'Query executed but returned no results.';

  const durationMs = Date.now() - startTime;

  auditLog({
    requestId, question,
    route: 'llm_hybrid', strategy,
    sql: results.sql_query,
    cypher: results.cypher_query,
    rowCount: (results.sql_data?.length || 0) + (results.graph_data ? 1 : 0),
    answer: answer?.slice(0, 500),
    durationMs,
  });

  return {
    answer,
    strategy,
    reasoning,
    evidence: {
      sql_query: results.sql_query,
      cypher_query: results.cypher_query,
      sql_rows: results.sql_data?.length || 0,
      graph_data: results.graph_data ? true : false,
    },
    timing: durationMs,
    source: 'llm_hybrid'
  };
}
