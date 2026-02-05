export const SQL_TEMPLATES = {
  missing_tools_next_shift: `
    WITH ops AS (
      SELECT ds."ShiftName" as shift_name, sp."Machine" as machine_code, sp."JobNum" as job_num, sp."OperSeq" as oper_seq
      FROM shop."kg_ShiftPlan" sp
      JOIN shop."kg_DimShifts" ds ON ds."ShiftID" = sp."ShiftID"
      WHERE ($1::text IS NULL OR ds."ShiftName" = $1::text)
    ),
    req AS (
      SELECT o.shift_name, o.machine_code, o.job_num, o.oper_seq,
             r."AssemblyID" as assembly_id, 
             CASE WHEN r."QtyNeeded" THEN 1 ELSE 0 END as qty_needed, 
             r."Criticality" as criticality, r."Source" as source
      FROM ops o
      JOIN shop."kg_JobOpRequiredTools" r ON r."JobNum" = o.job_num AND r."OperSeq" = o.oper_seq
    ),
    mag AS (
      SELECT "Machine" as machine_code, "AssemblyID" as assembly_id
      FROM shop."kg_MachineMagazine"
      WHERE "AssemblyID" IS NOT NULL
      GROUP BY 1,2
    ),
    inv AS (
      SELECT "AssemblyID" as assembly_id,
             SUM("QtyAvailable") AS qty_available,
             SUM("QtyReserved")  AS qty_reserved,
             SUM("QtyAvailable" - "QtyReserved") AS qty_free
      FROM shop."kg_ToolInventoryLots"
      GROUP BY 1
    )
    SELECT
      req.shift_name, req.machine_code, req.job_num, req.oper_seq,
      req.assembly_id, req.qty_needed, req.criticality, req.source,
      COALESCE(inv.qty_free, 0) AS qty_free_in_crib,
      CASE WHEN mag.assembly_id IS NULL THEN true ELSE false END AS missing_in_magazine
    FROM req
    LEFT JOIN mag ON mag.machine_code = req.machine_code AND mag.assembly_id = req.assembly_id
    LEFT JOIN inv ON inv.assembly_id = req.assembly_id
    WHERE mag.assembly_id IS NULL
    ORDER BY req.shift_name, req.machine_code, req.criticality, req.assembly_id
  `,

  blocked_operations_missing_tools: `
    WITH req_missing AS (
      WITH req AS (
        SELECT "JobNum" as job_num, "OperSeq" as oper_seq, "AssemblyID" as assembly_id, 
               CASE WHEN "QtyNeeded" THEN 1 ELSE 0 END as qty_needed
        FROM shop."kg_JobOpRequiredTools"
      ),
      mag AS (
        SELECT "Machine" as machine_code, "AssemblyID" as assembly_id
        FROM shop."kg_MachineMagazine"
        WHERE "AssemblyID" IS NOT NULL
        GROUP BY 1,2
      ),
      inv AS (
        SELECT "AssemblyID" as assembly_id, SUM("QtyAvailable" - "QtyReserved") AS qty_free
        FROM shop."kg_ToolInventoryLots"
        GROUP BY 1
      )
      SELECT req.job_num, req.oper_seq, req.assembly_id, req.qty_needed,
             COALESCE(inv.qty_free,0) AS qty_free_in_crib
      FROM req
      LEFT JOIN shop."jb_JobOperations" jo ON jo."JobNum" = req.job_num AND jo."OperSeq" = req.oper_seq
      LEFT JOIN mag ON mag.machine_code = jo."Machine" AND mag.assembly_id = req.assembly_id
      LEFT JOIN inv ON inv.assembly_id = req.assembly_id
      WHERE mag.assembly_id IS NULL
    )
    SELECT
      o."JobNum" as job_num, o."OperSeq" as oper_seq, o."Machine" as machine_code, o."PlannedStart" as planned_start, o."PlannedEnd" as planned_end,
      COUNT(*) FILTER (WHERE req_missing.qty_free_in_crib < req_missing.qty_needed) AS missing_without_stock_count,
      COUNT(*) AS missing_total_count
    FROM shop."jb_JobOperations" o
    JOIN req_missing ON req_missing.job_num = o."JobNum" AND req_missing.oper_seq = o."OperSeq"
    GROUP BY 1,2,3,4,5
    HAVING COUNT(*) FILTER (WHERE req_missing.qty_free_in_crib < req_missing.qty_needed) > 0
    ORDER BY o."PlannedStart" NULLS LAST, o."JobNum"
  `,

  tool_usage_for_job: `
    SELECT
      o."JobNum" as job_num, o."OperSeq" as oper_seq, o."Machine" as machine_code,
      r."AssemblyID" as assembly_id, 
      CASE WHEN r."QtyNeeded" THEN 1 ELSE 0 END as qty_needed, 
      r."Criticality" as criticality, r."Source" as source
    FROM shop."jb_JobOperations" o
    JOIN shop."kg_JobOpRequiredTools" r ON r."JobNum" = o."JobNum" AND r."OperSeq" = o."OperSeq"
    WHERE o."JobNum" = $1::text
    ORDER BY o."OperSeq", r."Criticality", r."AssemblyID"
  `,

  machines_loaded_magazine: `
    SELECT "Machine" as machine_code, "PocketNo" as pocket_no, "AssemblyID" as assembly_id, "Status" as status, "LoadedAt" as loaded_at, "EstimatedLifeRemaining_min" as estimated_life_remaining_min
    FROM shop."kg_MachineMagazine"
    ORDER BY "Machine", "PocketNo"
  `,

  compare_nc_vs_required: `
    WITH req AS (
      SELECT DISTINCT "JobNum", "OperSeq", "AssemblyID" as assembly_id
      FROM shop."kg_JobOpRequiredTools"
    ),
    nc AS (
      SELECT DISTINCT "AssemblyID" as assembly_id
      FROM shop."kg_NC_ProgramTools"
      WHERE "AssemblyID" IS NOT NULL
    )
    SELECT
      req."JobNum" as job_num,
      req."OperSeq" as oper_seq,
      req.assembly_id,
      CASE WHEN nc.assembly_id IS NULL THEN 'REQUIRED_ONLY' ELSE 'REQUIRED_AND_NC' END AS status
    FROM req
    LEFT JOIN nc ON nc.assembly_id = req.assembly_id
    ORDER BY req."JobNum", req."OperSeq", req.assembly_id
  `,

  general_operations_summary: `
    SELECT
      'general' as query_type,
      COUNT(*) as total_operations,
      'Query executed successfully. For detailed insights, please specify a job number or ask a more specific question.' as message
    FROM shop."jb_JobOperations"
    LIMIT 1
  `
};
