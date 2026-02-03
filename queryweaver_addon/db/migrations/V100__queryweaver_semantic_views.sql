create schema if not exists core;

create or replace view core.operations as
select
  jo."JobNum"::text as job_num,
  jo."OperSeq"::int as oper_seq,
  (jo."JobNum"::text || ':' || jo."OperSeq"::text) as operation_key,
  nullif(jo."Machine"::text, '') as machine_code,
  nullif(jo."Status"::text, '') as status,
  jo."PlannedStart"::timestamptz as planned_start,
  jo."PlannedEnd"::timestamptz as planned_end,
  jo."RunHrs"::numeric as run_hours
from shop."jb_JobOperations" jo;

create or replace view core.required_tools as
select
  rt."JobNum"::text as job_num,
  rt."OperSeq"::int as oper_seq,
  (rt."JobNum"::text || ':' || rt."OperSeq"::text) as operation_key,
  rt."Machine"::text as machine_code,
  rt."AssemblyID"::int as assembly_id,
  rt."QtyNeeded"::int as qty_needed,
  rt."Criticality"::text as criticality,
  rt."Source"::text as source
from shop."kg_JobOpRequiredTools" rt;

create or replace view core.tool_assemblies as
select
  a."AssemblyID"::int as assembly_id,
  a."AssemblyCode"::text as assembly_code,
  a."ToolID"::int as tool_id,
  a."HolderID"::int as holder_id,
  a."GaugeLengthMm"::numeric as gauge_length_mm,
  a."StickoutMm"::numeric as stickout_mm
from shop."kg_ToolAssembly" a;

create or replace view core.tool_inventory as
select
  l."LotID"::int as lot_id,
  l."AssemblyID"::int as assembly_id,
  l."LocationBin"::text as location_bin,
  l."QtyAvailable"::int as qty_available,
  l."QtyReserved"::int as qty_reserved,
  l."Condition"::text as condition
from shop."kg_ToolInventoryLots" l;

create or replace view core.machine_magazine as
select
  m."Machine"::text as machine_code,
  m."PocketNo"::int as pocket_no,
  m."AssemblyID"::int as assembly_id,
  m."Status"::text as status,
  m."LoadedAt"::timestamptz as loaded_at,
  m."EstimatedLifeRemainingMin"::numeric as estimated_life_remaining_min
from shop."kg_MachineMagazine" m;

create or replace view core.shift_plan as
select
  sp."ShiftName"::text as shift_name,
  sp."Machine"::text as machine_code,
  sp."JobNum"::text as job_num,
  sp."OperSeq"::int as oper_seq,
  (sp."JobNum"::text || ':' || sp."OperSeq"::text) as operation_key,
  sp."PlannedStart"::timestamptz as planned_start,
  sp."PlannedEnd"::timestamptz as planned_end
from shop."kg_ShiftPlan" sp;

create or replace view core.nc_program_tools as
select
  t."ProgramID"::int as program_id,
  t."ProgramName"::text as program_name,
  t."ToolCall"::text as tool_call,
  t."AssemblyID"::int as assembly_id,
  t."Comment"::text as comment
from shop."kg_NC_ProgramTools" t;
