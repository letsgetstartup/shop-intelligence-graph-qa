-- QueryWeaver semantic views (schema: qw)
-- Purpose: stable, query-friendly contract for SQL templates without modifying core.* or graph_export.*
-- Safe to apply alongside the existing shop/core/graph_export schemas.
--
-- Expected upstream tables:
--   shop."jb_JobOperations"
--   shop."kg_JobOpRequiredTools"
--   shop."kg_ToolAssembly"
--   shop."kg_ToolInventoryLots"
--   shop."kg_MachineMagazine"
--   shop."kg_ShiftPlan"
--   shop."kg_NC_ProgramTools"
--
-- Note: kg_ShiftPlan has (ShiftDate, ShiftID, Machine, JobNum, OperSeq, PlannedStart, PlannedEnd).
-- We expose a derived "shift_key" to enable human-friendly filtering.

CREATE SCHEMA IF NOT EXISTS qw;

-- Operations (from ERP/MES)
CREATE OR REPLACE VIEW qw.operations AS
SELECT
  jo."JobNum"::text                         AS job_num,
  jo."OperSeq"::bigint                      AS oper_seq,
  (jo."JobNum"::text || ':' || jo."OperSeq"::text) AS operation_key,
  NULLIF(jo."Machine"::text, '')            AS machine_code,
  NULLIF(jo."Status"::text, '')             AS status,
  jo."PlannedStart"::timestamptz            AS planned_start,
  jo."PlannedEnd"::timestamptz              AS planned_end,
  jo."RunHrs"::numeric                      AS run_hours
FROM shop."jb_JobOperations" jo;

-- Required tool assemblies per operation
CREATE OR REPLACE VIEW qw.required_tools AS
SELECT
  rt."JobNum"::text                          AS job_num,
  rt."OperSeq"::bigint                       AS oper_seq,
  (rt."JobNum"::text || ':' || rt."OperSeq"::text) AS operation_key,
  NULLIF(rt."Machine"::text, '')             AS machine_code,
  rt."AssemblyID"::bigint                    AS assembly_id,
  COALESCE(rt."QtyNeeded"::int, 1)           AS qty_needed,
  COALESCE(NULLIF(rt."Criticality"::text,''),'A') AS criticality,
  COALESCE(NULLIF(rt."Source"::text,''),'UNKNOWN') AS source
FROM shop."kg_JobOpRequiredTools" rt;

-- Tool assemblies (planning key)
CREATE OR REPLACE VIEW qw.tool_assemblies AS
SELECT
  a."AssemblyID"::bigint        AS assembly_id,
  a."AssemblyCode"::text        AS assembly_code,
  a."ToolID"::bigint            AS tool_id,
  a."HolderID"::bigint          AS holder_id,
  a."GaugeLengthMm"::numeric    AS gauge_length_mm,
  a."StickoutMm"::numeric       AS stickout_mm,
  a."LifeMinutes"::numeric      AS life_minutes
FROM shop."kg_ToolAssembly" a;

-- Inventory (crib)
CREATE OR REPLACE VIEW qw.tool_inventory AS
SELECT
  l."LotID"::bigint             AS lot_id,
  l."AssemblyID"::bigint        AS assembly_id,
  l."LocationBin"::text         AS location_bin,
  COALESCE(l."QtyAvailable"::int, 0) AS qty_available,
  COALESCE(l."QtyReserved"::int, 0)  AS qty_reserved,
  COALESCE(l."Condition"::text, 'NEW') AS condition
FROM shop."kg_ToolInventoryLots" l;

-- Current magazine snapshot
CREATE OR REPLACE VIEW qw.machine_magazine AS
SELECT
  m."Machine"::text                 AS machine_code,
  m."PocketNo"::int                 AS pocket_no,
  m."AssemblyID"::bigint            AS assembly_id,
  COALESCE(m."Status"::text,'LOADED') AS status,
  m."LoadedAt"::timestamptz         AS loaded_at,
  m."EstimatedLifeRemainingMin"::numeric AS estimated_life_remaining_min
FROM shop."kg_MachineMagazine" m;

-- Shift plan
-- shift_key example: 2026-02-03:1  (ShiftDate:ShiftID)
CREATE OR REPLACE VIEW qw.shift_plan AS
SELECT
  sp."ShiftDate"::date                        AS shift_date,
  sp."ShiftID"::bigint                        AS shift_id,
  (sp."ShiftDate"::text || ':' || sp."ShiftID"::text) AS shift_key,
  sp."Machine"::text                          AS machine_code,
  sp."JobNum"::text                           AS job_num,
  sp."OperSeq"::bigint                        AS oper_seq,
  (sp."JobNum"::text || ':' || sp."OperSeq"::text) AS operation_key,
  sp."PlannedStart"::timestamptz              AS planned_start,
  sp."PlannedEnd"::timestamptz                AS planned_end
FROM shop."kg_ShiftPlan" sp;

-- NC tools (per program)
CREATE OR REPLACE VIEW qw.nc_program_tools AS
SELECT
  t."ProgramID"::bigint          AS program_id,
  t."ProgramName"::text          AS program_name,
  t."ToolCall"::text             AS tool_call,
  t."TNumber"::text              AS t_number,
  t."AssemblyID"::bigint         AS assembly_id,
  t."Comment"::text              AS comment,
  t."LastSeenAt"::timestamptz    AS last_seen_at
FROM shop."kg_NC_ProgramTools" t;
