import { config } from './config.js';
import { logger } from './logger.js';
import { queryAll } from './postgres.js';
import { graphQuery } from './falkor.js';
import { cypherListOfMaps } from './cypher.js';

/**
 * Graph Builder strategy:
 * - Reads exclusively from graph_export.* views in Postgres.
 * - Builds nodes and edges deterministically.
 * - Default mode: full rebuild (safe + simple).
 */

const NODE_SPECS = [
  { view: 'graph_export.node_machines', label: 'Machine', key: 'machine_code' },
  { view: 'graph_export.node_parts', label: 'Part', key: 'part_num' },
  { view: 'graph_export.node_customers', label: 'Customer', key: 'customer_id' },
  { view: 'graph_export.node_jobs', label: 'Job', key: 'job_num' },
  { view: 'graph_export.node_operations', label: 'Operation', key: 'operation_key' },
  { view: 'graph_export.node_tools', label: 'Tool', key: 'tool_id' },
  { view: 'graph_export.node_holders', label: 'Holder', key: 'holder_id' },
  { view: 'graph_export.node_tool_assemblies', label: 'ToolAssembly', key: 'assembly_id' },
  { view: 'graph_export.node_inventory_lots', label: 'InventoryLot', key: 'lot_id' },
  { view: 'graph_export.node_cam_projects', label: 'CAMProject', key: 'cam_project_id' },
  { view: 'graph_export.node_nc_programs', label: 'NCProgram', key: 'program_id' },
  { view: 'graph_export.node_shifts', label: 'Shift', key: 'shift_id' },
];

const EDGE_SPECS = [
  // (Job)-[:FOR_PART]->(Part)
  {
    view: 'graph_export.edge_job_for_part',
    from: { label: 'Job', key: 'job_num', field: 'job_num' },
    to: { label: 'Part', key: 'part_num', field: 'part_num' },
    rel: 'FOR_PART',
    relProps: [],
  },
  // (Job)-[:FOR_CUSTOMER]->(Customer)
  {
    view: 'graph_export.edge_job_for_customer',
    from: { label: 'Job', key: 'job_num', field: 'job_num' },
    to: { label: 'Customer', key: 'customer_id', field: 'customer_id' },
    rel: 'FOR_CUSTOMER',
    relProps: [],
  },
  // (Job)-[:HAS_OPERATION]->(Operation)
  {
    view: 'graph_export.edge_job_has_operation',
    from: { label: 'Job', key: 'job_num', field: 'job_num' },
    to: { label: 'Operation', key: 'operation_key', field: 'operation_key' },
    rel: 'HAS_OPERATION',
    relProps: [],
  },
  // (Operation)-[:RUNS_ON]->(Machine)
  {
    view: 'graph_export.edge_operation_runs_on_machine',
    from: { label: 'Operation', key: 'operation_key', field: 'operation_key' },
    to: { label: 'Machine', key: 'machine_code', field: 'machine_code' },
    rel: 'RUNS_ON',
    relProps: [],
  },
  // (Operation)-[:REQUIRES]->(ToolAssembly)
  {
    view: 'graph_export.edge_operation_requires_assembly',
    from: { label: 'Operation', key: 'operation_key', field: 'operation_key' },
    to: { label: 'ToolAssembly', key: 'assembly_id', field: 'assembly_id' },
    rel: 'REQUIRES',
    relProps: ['qty_needed','criticality','source','required_from','required_to','estimated_cut_min','predicted_consumption_qty'],
  },
  // (ToolAssembly)-[:USES_TOOL]->(Tool)
  {
    view: 'graph_export.edge_assembly_uses_tool',
    from: { label: 'ToolAssembly', key: 'assembly_id', field: 'assembly_id' },
    to: { label: 'Tool', key: 'tool_id', field: 'tool_id' },
    rel: 'USES_TOOL',
    relProps: [],
  },
  // (ToolAssembly)-[:USES_HOLDER]->(Holder)
  {
    view: 'graph_export.edge_assembly_uses_holder',
    from: { label: 'ToolAssembly', key: 'assembly_id', field: 'assembly_id' },
    to: { label: 'Holder', key: 'holder_id', field: 'holder_id' },
    rel: 'USES_HOLDER',
    relProps: [],
  },
  // (Machine)-[:HAS_POCKET {pocket_no}]->(ToolAssembly)
  {
    view: 'graph_export.edge_machine_pocket_loaded',
    from: { label: 'Machine', key: 'machine_code', field: 'machine_code' },
    to: { label: 'ToolAssembly', key: 'assembly_id', field: 'assembly_id' },
    rel: 'HAS_POCKET',
    relKeyProps: ['pocket_no'],
    relProps: ['status','loaded_at','estimated_life_remaining_min'],
  },
  // (InventoryLot)-[:CONTAINS]->(ToolAssembly)
  {
    view: 'graph_export.edge_lot_contains_assembly',
    from: { label: 'InventoryLot', key: 'lot_id', field: 'lot_id' },
    to: { label: 'ToolAssembly', key: 'assembly_id', field: 'assembly_id' },
    rel: 'CONTAINS',
    relProps: ['qty_available','qty_reserved','location_bin','condition'],
  },
  // (CAMProject)-[:FOR_PART]->(Part)
  {
    view: 'graph_export.edge_cam_project_for_part',
    from: { label: 'CAMProject', key: 'cam_project_id', field: 'cam_project_id' },
    to: { label: 'Part', key: 'part_num', field: 'part_num' },
    rel: 'FOR_PART',
    relProps: [],
  },
  // (CAMProject)-[:USES {cam_operation_id,...}]->(ToolAssembly)
  {
    view: 'graph_export.edge_cam_operation_uses_assembly',
    from: { label: 'CAMProject', key: 'cam_project_id', field: 'cam_project_id' },
    to: { label: 'ToolAssembly', key: 'assembly_id', field: 'assembly_id' },
    rel: 'USES',
    relKeyProps: ['cam_operation_id'],
    relProps: ['operation_key','operation_type','material_group','estimated_cut_min','feeds_mm_min','spindle_rpm','last_generated_at'],
  },
  // (NCProgram)-[:FOR_OPERATION]->(Operation)
  {
    view: 'graph_export.edge_nc_program_for_operation',
    from: { label: 'NCProgram', key: 'program_id', field: 'program_id' },
    to: { label: 'Operation', key: 'operation_key', field: 'operation_key' },
    rel: 'FOR_OPERATION',
    relProps: ['machine_code'],
  },
  // (NCProgram)-[:CALLS {t_number, tool_call}]->(ToolAssembly)
  {
    view: 'graph_export.edge_nc_program_calls_assembly',
    from: { label: 'NCProgram', key: 'program_id', field: 'program_id' },
    to: { label: 'ToolAssembly', key: 'assembly_id', field: 'assembly_id' },
    rel: 'CALLS',
    relKeyProps: ['t_number'],
    relProps: ['tool_call','comment','last_seen_at'],
  },
  // (Shift)-[:SCHEDULED {shift_date, machine_code, planned_*}]->(Operation)
  {
    view: 'graph_export.edge_shiftplan_operation_in_shift',
    from: { label: 'Shift', key: 'shift_id', field: 'shift_id' },
    to: { label: 'Operation', key: 'operation_key', field: 'operation_key' },
    rel: 'SCHEDULED',
    relKeyProps: ['shift_date','machine_code'],
    relProps: ['planned_start','planned_end'],
  },
  // (Operation)-[:CONSUMED {event_id,...}]->(ToolAssembly)
  {
    view: 'graph_export.edge_operation_consumed_assembly',
    from: { label: 'Operation', key: 'operation_key', field: 'operation_key' },
    to: { label: 'ToolAssembly', key: 'assembly_id', field: 'assembly_id' },
    rel: 'CONSUMED',
    relKeyProps: ['event_id'],
    relProps: ['event_ts','machine_code','event_type','qty','estimated_cut_min','operator_id','notes'],
  },
];

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function ensureIndexes(falkor, graphName) {
  const stmts = [
    'CREATE INDEX FOR (n:Job) ON (n.job_num)',
    'CREATE INDEX FOR (n:Operation) ON (n.operation_key)',
    'CREATE INDEX FOR (n:Machine) ON (n.machine_code)',
    'CREATE INDEX FOR (n:ToolAssembly) ON (n.assembly_id)',
    'CREATE INDEX FOR (n:Tool) ON (n.tool_id)',
    'CREATE INDEX FOR (n:Holder) ON (n.holder_id)',
    'CREATE INDEX FOR (n:InventoryLot) ON (n.lot_id)',
    'CREATE INDEX FOR (n:NCProgram) ON (n.program_id)',
    'CREATE INDEX FOR (n:CAMProject) ON (n.cam_project_id)',
    'CREATE INDEX FOR (n:Part) ON (n.part_num)',
    'CREATE INDEX FOR (n:Customer) ON (n.customer_id)',
    'CREATE INDEX FOR (n:Shift) ON (n.shift_id)',
  ];

  for (const stmt of stmts) {
    try {
      await graphQuery(falkor, graphName, stmt);
    } catch (e) {
      // Index might already exist; ignore.
      logger.debug({ stmt, err: e?.message }, 'Index creation skipped');
    }
  }
}

async function clearGraph(falkor, graphName) {
  await graphQuery(falkor, graphName, 'MATCH (n) DETACH DELETE n');
}

async function upsertNodes(pool, falkor, graphName, spec) {
  const rows = await queryAll(pool, `SELECT * FROM ${spec.view}`);
  logger.info({ view: spec.view, count: rows.length }, 'Fetched node rows');

  for (const batch of chunkArray(rows, config.batchSize)) {
    // UNWIND [{...},{...}] AS row MERGE (n:Label {key: row.key}) SET n += row
    const listLiteral = cypherListOfMaps(batch);
    const cypher = `
      UNWIND ${listLiteral} AS row
      MERGE (n:${spec.label} {${spec.key}: row.${spec.key}})
      SET n += row
    `;
    await graphQuery(falkor, graphName, cypher);
  }
  logger.info({ label: spec.label }, 'Upserted nodes');
}

async function upsertEdges(pool, falkor, graphName, spec) {
  const rows = await queryAll(pool, `SELECT * FROM ${spec.view}`);
  logger.info({ view: spec.view, count: rows.length }, 'Fetched edge rows');

  for (const batch of chunkArray(rows, config.batchSize)) {
    const listLiteral = cypherListOfMaps(batch);

    const fromMatch = `(a:${spec.from.label} {${spec.from.key}: row.${spec.from.field}})`;
    const toMatch = `(b:${spec.to.label} {${spec.to.key}: row.${spec.to.field}})`;

    const relKeyProps = spec.relKeyProps || [];
    const relProps = spec.relProps || [];
    const relKeyMap = relKeyProps.length
      ? '{' + relKeyProps.map(p => `${p}: row.${p}`).join(', ') + '}'
      : '';

    const mergeRel = relKeyProps.length
      ? `MERGE (a)-[r:${spec.rel} ${relKeyMap}]->(b)`
      : `MERGE (a)-[r:${spec.rel}]->(b)`;

    const setProps = relProps.length
      ? `SET r += { ${relProps.map(p => `${p}: row.${p}`).join(', ')} }`
      : '';

    const cypher = `
      UNWIND ${listLiteral} AS row
      MATCH ${fromMatch}
      MATCH ${toMatch}
      ${mergeRel}
      ${setProps}
    `;
    await graphQuery(falkor, graphName, cypher);
  }
  logger.info({ rel: spec.rel }, 'Upserted edges');
}

export async function runFullRebuild(pool, falkor) {
  const graphName = config.graphName;

  logger.info({ graphName }, 'Starting full graph rebuild');
  await ensureIndexes(falkor, graphName);
  await clearGraph(falkor, graphName);

  // Nodes first
  for (const spec of NODE_SPECS) {
    await upsertNodes(pool, falkor, graphName, spec);
  }

  // Then edges
  for (const spec of EDGE_SPECS) {
    await upsertEdges(pool, falkor, graphName, spec);
  }

  logger.info({ graphName }, 'Graph rebuild complete');
}

export async function runIncremental(pool, falkor) {
  // Phase-2 placeholder:
  // Implement watermarking using meta.graph_sync_state + per-table updated_at or outbox.
  logger.warn('Incremental mode is not implemented yet. Falling back to full rebuild.');
  await runFullRebuild(pool, falkor);
}
