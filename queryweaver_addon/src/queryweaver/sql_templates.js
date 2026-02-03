export const SQL_TEMPLATES = {
  missing_tools_next_shift: `
    WITH ops AS (
      SELECT sp.shift_name, sp.machine_code, sp.operation_key, sp.job_num, sp.oper_seq
      FROM core.shift_plan sp
      WHERE ($1::text IS NULL OR sp.shift_name = $1::text)
    ),
    req AS (
      SELECT o.shift_name, o.machine_code, o.operation_key, o.job_num, o.oper_seq,
             r.assembly_id, r.qty_needed, r.criticality, r.source
      FROM ops o
      JOIN core.required_tools r ON r.operation_key = o.operation_key
    ),
    mag AS (
      SELECT machine_code, assembly_id
      FROM core.machine_magazine
      WHERE assembly_id IS NOT NULL
      GROUP BY 1,2
    ),
    inv AS (
      SELECT assembly_id,
             SUM(qty_available) AS qty_available,
             SUM(qty_reserved)  AS qty_reserved,
             SUM(qty_available - qty_reserved) AS qty_free
      FROM core.tool_inventory
      GROUP BY 1
    )
    SELECT
      req.shift_name, req.machine_code, req.operation_key, req.job_num, req.oper_seq,
      req.assembly_id, req.qty_needed, req.criticality, req.source,
      COALESCE(inv.qty_free, 0) AS qty_free_in_crib,
      CASE WHEN mag.assembly_id IS NULL THEN true ELSE false END AS missing_in_magazine
    FROM req
    LEFT JOIN mag ON mag.machine_code = req.machine_code AND mag.assembly_id = req.assembly_id
    LEFT JOIN inv ON inv.assembly_id = req.assembly_id
    WHERE mag.assembly_id IS NULL
    ORDER BY req.shift_name, req.machine_code, req.operation_key, req.criticality, req.assembly_id
  `,

  blocked_operations_missing_tools: `
    WITH req_missing AS (
      WITH req AS (
        SELECT r.operation_key, r.machine_code, r.assembly_id, r.qty_needed, r.criticality
        FROM core.required_tools r
      ),
      mag AS (
        SELECT machine_code, assembly_id
        FROM core.machine_magazine
        WHERE assembly_id IS NOT NULL
        GROUP BY 1,2
      ),
      inv AS (
        SELECT assembly_id, SUM(qty_available - qty_reserved) AS qty_free
        FROM core.tool_inventory
        GROUP BY 1
      )
      SELECT req.operation_key, req.machine_code, req.assembly_id, req.qty_needed, req.criticality,
             COALESCE(inv.qty_free,0) AS qty_free_in_crib
      FROM req
      LEFT JOIN mag ON mag.machine_code=req.machine_code AND mag.assembly_id=req.assembly_id
      LEFT JOIN inv ON inv.assembly_id=req.assembly_id
      WHERE mag.assembly_id IS NULL
    )
    SELECT
      o.operation_key, o.job_num, o.oper_seq, o.machine_code, o.planned_start, o.planned_end,
      COUNT(*) FILTER (WHERE req_missing.qty_free_in_crib < req_missing.qty_needed) AS missing_without_stock_count,
      COUNT(*) AS missing_total_count
    FROM core.operations o
    JOIN req_missing ON req_missing.operation_key = o.operation_key
    GROUP BY 1,2,3,4,5,6
    HAVING COUNT(*) FILTER (WHERE req_missing.qty_free_in_crib < req_missing.qty_needed) > 0
    ORDER BY o.planned_start NULLS LAST, o.operation_key
  `,

  tool_usage_for_job: `
    SELECT
      o.job_num, o.oper_seq, o.operation_key, o.machine_code,
      r.assembly_id, r.qty_needed, r.criticality, r.source
    FROM core.operations o
    JOIN core.required_tools r ON r.operation_key = o.operation_key
    WHERE o.job_num = $1::text
    ORDER BY o.oper_seq, r.criticality, r.assembly_id
  `,

  machines_loaded_magazine: `
    SELECT machine_code, pocket_no, assembly_id, status, loaded_at, estimated_life_remaining_min
    FROM core.machine_magazine
    ORDER BY machine_code, pocket_no
  `,

  compare_nc_vs_required: `
    WITH req AS (
      SELECT DISTINCT operation_key, assembly_id
      FROM core.required_tools
    ),
    nc AS (
      SELECT DISTINCT assembly_id
      FROM core.nc_program_tools
      WHERE assembly_id IS NOT NULL
    )
    SELECT
      req.operation_key,
      req.assembly_id,
      CASE WHEN nc.assembly_id IS NULL THEN 'REQUIRED_ONLY' ELSE 'REQUIRED_AND_NC' END AS status
    FROM req
    LEFT JOIN nc ON nc.assembly_id = req.assembly_id
    ORDER BY req.operation_key, req.assembly_id
  `
};
