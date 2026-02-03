-- V5: Core views (snake_case) + stable keys

CREATE OR REPLACE VIEW core.jobs AS
SELECT
  "JobNum"        AS job_num,
  "SalesOrder"    AS sales_order,
  "CustomerID"    AS customer_id,
  "PartNum"       AS part_num,
  "Revision"      AS revision,
  "JobStatus"     AS job_status,
  "Priority"      AS priority,
  "QtyOrdered"    AS qty_ordered,
  "QtyCompleted"  AS qty_completed,
  "QtyScrapped"   AS qty_scrapped,
  "PlannedStart"  AS planned_start,
  "DueDate"       AS due_date,
  "CloseDate"     AS close_date,
  "Notes"         AS notes
FROM shop."jb_Jobs";

CREATE OR REPLACE VIEW core.job_operations AS
SELECT
  "JobNum" AS job_num,
  "OperSeq"::bigint AS oper_seq,
  ("JobNum" || ':' || "OperSeq"::text) AS operation_key,
  "WorkCenterID" AS work_center_id,
  "OperationDesc" AS operation_desc,
  "StdSetupHrs" AS std_setup_hrs,
  "StdRunHrsPerUnit" AS std_run_hrs_per_unit,
  "PlannedStart" AS planned_start,
  "PlannedEnd" AS planned_end,
  "ActualStart" AS actual_start,
  "ActualEnd" AS actual_end,
  "Machine" AS machine_code,
  "QtyComplete" AS qty_complete,
  "QtyScrap" AS qty_scrap,
  "SetupHrs" AS setup_hrs,
  "RunHrs" AS run_hrs,
  "MoveHrs" AS move_hrs,
  "QueueHrs" AS queue_hrs,
  "Status" AS status,
  "SMKO_ClusterID" AS smko_cluster_id
FROM shop."jb_JobOperations";

CREATE OR REPLACE VIEW core.parts AS
SELECT
  "PartNum" AS part_num,
  "Description" AS description,
  "UOM" AS uom,
  "Revision" AS revision,
  "StdMaterial" AS std_material,
  "StdCycleTimeSec" AS std_cycle_time_sec,
  "StdCost" AS std_cost,
  "SellPrice" AS sell_price
FROM shop."jb_Parts";

CREATE OR REPLACE VIEW core.customers AS
SELECT
  "CustomerID" AS customer_id,
  "CustomerName" AS customer_name,
  "Industry" AS industry,
  "City" AS city,
  "Country" AS country,
  "Terms" AS terms,
  "CreditLimit" AS credit_limit
FROM shop."jb_Customers";

CREATE OR REPLACE VIEW core.employees AS
SELECT
  "EmployeeID" AS employee_id,
  "EmployeeName" AS employee_name,
  "Role" AS role,
  "Shift" AS shift,
  "HourlyRate" AS hourly_rate
FROM shop."jb_Employees";

CREATE OR REPLACE VIEW core.work_centers AS
SELECT
  "WorkCenterID" AS work_center_id,
  "WorkCenterName" AS work_center_name,
  "Machine" AS machine_code,
  "Department" AS department,
  "MachineRatePerHour" AS machine_rate_per_hour
FROM shop."jb_WorkCenters";

-- Tooling
CREATE OR REPLACE VIEW core.tool_master AS
SELECT
  "ToolID"::bigint AS tool_id,
  "ToolCode" AS tool_code,
  "ToolType" AS tool_type,
  "ProcessType" AS process_type,
  "Diameter_mm" AS diameter_mm,
  "CornerRadius_mm" AS corner_radius_mm,
  "OverallLength_mm" AS overall_length_mm,
  "FluteCount" AS flute_count,
  "ToolMaterial" AS tool_material,
  "Coating" AS coating,
  "Manufacturer" AS manufacturer,
  "CatalogNo" AS catalog_no,
  "DefaultLife_min" AS default_life_min,
  "Regrindable" AS regrindable,
  "Notes" AS notes
FROM shop."kg_ToolMaster";

CREATE OR REPLACE VIEW core.holder_master AS
SELECT
  "HolderID"::bigint AS holder_id,
  "HolderCode" AS holder_code,
  "HolderType" AS holder_type,
  "Interface" AS interface,
  "GaugeLength_mm" AS gauge_length_mm,
  "CoolantThrough" AS coolant_through,
  "Notes" AS notes
FROM shop."kg_HolderMaster";

CREATE OR REPLACE VIEW core.tool_assembly AS
SELECT
  a."AssemblyID"::text AS assembly_id,
  a."AssemblyCode" AS assembly_code,
  a."ToolID"::bigint AS tool_id,
  a."HolderID"::bigint AS holder_id,
  a."ProcessType" AS process_type,
  a."GaugeLength_mm" AS gauge_length_mm,
  a."Stickout_mm" AS stickout_mm,
  a."BalanceRpmLimit" AS balance_rpm_limit,
  a."PresetRequired" AS preset_required,
  a."Status" AS status,
  lm."LifeBasis" AS life_basis,
  lm."Life_min" AS life_min,
  lm."SafetyFactor" AS safety_factor,
  lm."LastCalibratedAt" AS last_calibrated_at
FROM shop."kg_ToolAssembly" a
LEFT JOIN shop."kg_ToolLifeModel" lm ON lm."AssemblyID" = a."AssemblyID";

CREATE OR REPLACE VIEW core.tool_inventory_lots AS
SELECT
  "LotID"::text AS lot_id,
  "AssemblyID"::text AS assembly_id,
  "QtyAvailable" AS qty_available,
  "QtyReserved" AS qty_reserved,
  "LocationBin" AS location_bin,
  "Condition" AS condition,
  "LastCountDate" AS last_count_date
FROM shop."kg_ToolInventoryLots";

CREATE OR REPLACE VIEW core.machine_magazine AS
SELECT
  "Machine" AS machine_code,
  "PocketNo"::bigint AS pocket_no,
  "AssemblyID"::text AS assembly_id,
  "Status" AS status,
  "LoadedAt" AS loaded_at,
  "EstimatedLifeRemaining_min" AS estimated_life_remaining_min
FROM shop."kg_MachineMagazine";

CREATE OR REPLACE VIEW core.required_tools AS
SELECT
  "JobNum" AS job_num,
  "OperSeq"::bigint AS oper_seq,
  ("JobNum" || ':' || "OperSeq"::text) AS operation_key,
  "Machine" AS machine_code,
  "AssemblyID"::text AS assembly_id,
  "QtyNeeded" AS qty_needed,
  "Criticality" AS criticality,
  "Source" AS source,
  "RequiredFrom" AS required_from,
  "RequiredTo" AS required_to,
  "EstimatedCut_min" AS estimated_cut_min,
  "PredictedConsumptionQty" AS predicted_consumption_qty
FROM shop."kg_JobOpRequiredTools";

CREATE OR REPLACE VIEW core.nc_programs AS
SELECT
  "ProgramID" AS program_id,
  "JobNum" AS job_num,
  "OperSeq"::bigint AS oper_seq,
  ("JobNum" || ':' || "OperSeq"::text) AS operation_key,
  "Machine" AS machine_code,
  "ProgramName" AS program_name,
  "PostProcessor" AS post_processor,
  "LastPostedAt" AS last_posted_at
FROM shop."kg_NC_Programs";

CREATE OR REPLACE VIEW core.nc_program_tools AS
SELECT
  "ProgramID" AS program_id,
  "ToolCall" AS tool_call,
  "TNumber" AS t_number,
  "AssemblyID"::text AS assembly_id,
  "Comment" AS comment,
  "LastSeenAt" AS last_seen_at
FROM shop."kg_NC_ProgramTools";

CREATE OR REPLACE VIEW core.solidcam_projects AS
SELECT
  "CamProjectID" AS cam_project_id,
  "PartNum" AS part_num,
  "Revision" AS revision,
  "ToolLibrary" AS tool_library,
  "PostProcessor" AS post_processor,
  "LastUpdatedAt" AS last_updated_at
FROM shop."kg_SolidCAM_Projects";

CREATE OR REPLACE VIEW core.solidcam_operation_tools AS
SELECT
  "CamProjectID" AS cam_project_id,
  "JobNum" AS job_num,
  "OperSeq"::bigint AS oper_seq,
  ("JobNum" || ':' || "OperSeq"::text) AS operation_key,
  "SetupID" AS setup_id,
  "CamOperationID" AS cam_operation_id,
  "OperationType" AS operation_type,
  "MaterialGroup" AS material_group,
  "AssemblyID"::text AS assembly_id,
  "EstimatedCut_min" AS estimated_cut_min,
  "Feeds_mm_min" AS feeds_mm_min,
  "SpindleRPM" AS spindle_rpm,
  "LastGeneratedAt" AS last_generated_at
FROM shop."kg_SolidCAM_OperationTools";

CREATE OR REPLACE VIEW core.dim_shifts AS
SELECT
  "ShiftID" AS shift_id,
  "ShiftName" AS shift_name,
  "StartHourUTC" AS start_hour_utc,
  "EndHourUTC" AS end_hour_utc
FROM shop."kg_DimShifts";

CREATE OR REPLACE VIEW core.shift_plan AS
SELECT
  "ShiftDate" AS shift_date,
  "ShiftID" AS shift_id,
  "Machine" AS machine_code,
  "JobNum" AS job_num,
  "OperSeq"::bigint AS oper_seq,
  ("JobNum" || ':' || "OperSeq"::text) AS operation_key,
  "PlannedStart" AS planned_start,
  "PlannedEnd" AS planned_end
FROM shop."kg_ShiftPlan";

CREATE OR REPLACE VIEW core.tool_consumption AS
SELECT
  "EventID" AS event_id,
  "Timestamp" AS event_ts,
  "Machine" AS machine_code,
  "AssemblyID"::text AS assembly_id,
  "EventType" AS event_type,
  "Qty" AS qty,
  "EstimatedCut_min" AS estimated_cut_min,
  "JobNum" AS job_num,
  "OperSeq"::bigint AS oper_seq,
  ("JobNum" || ':' || "OperSeq"::text) AS operation_key,
  "OperatorID" AS operator_id,
  "Notes" AS notes
FROM shop."kg_ToolConsumption";

-- Machines dimension (derived): collects all known machines + optional process type mapping
CREATE OR REPLACE VIEW core.machines AS
WITH m AS (
  SELECT DISTINCT machine_code FROM (
    SELECT "Machine" AS machine_code FROM shop."jb_JobOperations"
    UNION ALL SELECT "Machine" AS machine_code FROM shop."jb_WorkCenters"
    UNION ALL SELECT "Machine" AS machine_code FROM shop."jb_LaborDetails"
    UNION ALL SELECT "Machine" AS machine_code FROM shop."jb_SMKO_ClusterBridge"
    UNION ALL SELECT "Machine" AS machine_code FROM shop."kg_MachineMagazine"
    UNION ALL SELECT "Machine" AS machine_code FROM shop."kg_ShiftPlan"
    UNION ALL SELECT "Machine" AS machine_code FROM shop."kg_NC_Programs"
  ) x WHERE machine_code IS NOT NULL AND machine_code <> ''
)
SELECT
  m.machine_code,
  COALESCE(mp."ProcessType", NULL) AS process_type
FROM m
LEFT JOIN shop."kg_MachineProcessMap" mp ON mp."Machine" = m.machine_code;
