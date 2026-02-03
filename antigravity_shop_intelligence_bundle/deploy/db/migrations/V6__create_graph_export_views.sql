-- V6: Graph export projections (graph_export.*)
-- These views are the ONLY contract the Graph Builder reads from.

-- Nodes
CREATE OR REPLACE VIEW graph_export.node_machines AS
SELECT
  machine_code,
  COALESCE(process_type, 'UNKNOWN') AS process_type
FROM core.machines;

CREATE OR REPLACE VIEW graph_export.node_parts AS
SELECT * FROM core.parts;

CREATE OR REPLACE VIEW graph_export.node_customers AS
SELECT * FROM core.customers;

CREATE OR REPLACE VIEW graph_export.node_jobs AS
SELECT * FROM core.jobs;

CREATE OR REPLACE VIEW graph_export.node_operations AS
SELECT * FROM core.job_operations;

CREATE OR REPLACE VIEW graph_export.node_tools AS
SELECT * FROM core.tool_master;

CREATE OR REPLACE VIEW graph_export.node_holders AS
SELECT * FROM core.holder_master;

CREATE OR REPLACE VIEW graph_export.node_tool_assemblies AS
SELECT * FROM core.tool_assembly;

CREATE OR REPLACE VIEW graph_export.node_inventory_lots AS
SELECT * FROM core.tool_inventory_lots;

CREATE OR REPLACE VIEW graph_export.node_cam_projects AS
SELECT * FROM core.solidcam_projects;

CREATE OR REPLACE VIEW graph_export.node_nc_programs AS
SELECT * FROM core.nc_programs;

CREATE OR REPLACE VIEW graph_export.node_shifts AS
SELECT * FROM core.dim_shifts;

-- Edges
CREATE OR REPLACE VIEW graph_export.edge_job_for_part AS
SELECT job_num, part_num
FROM core.jobs
WHERE part_num IS NOT NULL;

CREATE OR REPLACE VIEW graph_export.edge_job_for_customer AS
SELECT job_num, customer_id
FROM core.jobs
WHERE customer_id IS NOT NULL;

CREATE OR REPLACE VIEW graph_export.edge_job_has_operation AS
SELECT DISTINCT
  o.job_num,
  o.operation_key
FROM core.job_operations o;

CREATE OR REPLACE VIEW graph_export.edge_operation_runs_on_machine AS
SELECT DISTINCT
  o.operation_key,
  o.machine_code
FROM core.job_operations o
WHERE o.machine_code IS NOT NULL AND o.machine_code <> '';

CREATE OR REPLACE VIEW graph_export.edge_operation_requires_assembly AS
SELECT
  r.operation_key,
  r.assembly_id,
  r.qty_needed,
  r.criticality,
  r.source,
  r.required_from,
  r.required_to,
  r.estimated_cut_min,
  r.predicted_consumption_qty
FROM core.required_tools r;

CREATE OR REPLACE VIEW graph_export.edge_assembly_uses_tool AS
SELECT assembly_id, tool_id
FROM core.tool_assembly
WHERE tool_id IS NOT NULL;

CREATE OR REPLACE VIEW graph_export.edge_assembly_uses_holder AS
SELECT assembly_id, holder_id
FROM core.tool_assembly
WHERE holder_id IS NOT NULL;

CREATE OR REPLACE VIEW graph_export.edge_machine_pocket_loaded AS
SELECT
  machine_code,
  pocket_no,
  assembly_id,
  status,
  loaded_at,
  estimated_life_remaining_min
FROM core.machine_magazine
WHERE assembly_id IS NOT NULL;

CREATE OR REPLACE VIEW graph_export.edge_lot_contains_assembly AS
SELECT
  lot_id,
  assembly_id,
  qty_available,
  qty_reserved,
  location_bin,
  condition
FROM core.tool_inventory_lots
WHERE assembly_id IS NOT NULL;

CREATE OR REPLACE VIEW graph_export.edge_cam_project_for_part AS
SELECT cam_project_id, part_num
FROM core.solidcam_projects
WHERE part_num IS NOT NULL;

CREATE OR REPLACE VIEW graph_export.edge_cam_operation_uses_assembly AS
SELECT
  cam_project_id,
  cam_operation_id,
  operation_key,
  assembly_id,
  operation_type,
  material_group,
  estimated_cut_min,
  feeds_mm_min,
  spindle_rpm,
  last_generated_at
FROM core.solidcam_operation_tools
WHERE assembly_id IS NOT NULL;

CREATE OR REPLACE VIEW graph_export.edge_nc_program_for_operation AS
SELECT
  program_id,
  operation_key,
  machine_code
FROM core.nc_programs;

CREATE OR REPLACE VIEW graph_export.edge_nc_program_calls_assembly AS
SELECT
  program_id,
  tool_call,
  t_number,
  assembly_id,
  comment,
  last_seen_at
FROM core.nc_program_tools
WHERE assembly_id IS NOT NULL;

CREATE OR REPLACE VIEW graph_export.edge_shiftplan_operation_in_shift AS
SELECT
  shift_date,
  shift_id,
  machine_code,
  operation_key,
  planned_start,
  planned_end
FROM core.shift_plan;

CREATE OR REPLACE VIEW graph_export.edge_operation_consumed_assembly AS
SELECT
  event_id,
  event_ts,
  machine_code,
  operation_key,
  assembly_id,
  event_type,
  qty,
  estimated_cut_min,
  operator_id,
  notes
FROM core.tool_consumption
WHERE assembly_id IS NOT NULL;
