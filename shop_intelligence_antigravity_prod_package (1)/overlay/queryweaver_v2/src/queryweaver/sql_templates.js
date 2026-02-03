export const SQL_TEMPLATES = {
  // Missing tool assemblies for the next shift per machine.
  // Params:
  //   $1 shift_key (optional)  e.g. "2026-02-03:1"
  // Behavior:
  //   If shift_key is null -> choose the next shift automatically (min shift_date >= current_date, then min shift_id).
  missing_tools_next_shift: `
    WITH chosen_shift AS (
      SELECT shift_key
      FROM qw.shift_plan
      WHERE ($1::text IS NULL OR shift_key = $1::text)
        AND ($1::text IS NOT NULL OR shift_date >= CURRENT_DATE)
      ORDER BY shift_date ASC, shift_id ASC
      LIMIT 1
    ),
    ops AS (
      SELECT sp.shift_key, sp.machine_code, sp.operation_key, sp.job_num, sp.oper_seq
      FROM qw.shift_plan sp
      JOIN chosen_shift cs ON cs.shift_key = sp.shift_key
    ),
    req AS (
      SELECT o.shift_key, o.machine_code, o.operation_key, o.job_num, o.oper_seq,
             r.assembly_id, r.qty_needed, r.criticality, r.source
      FROM ops o
      JOIN qw.required_tools r ON r.operation_key = o.operation_key
    ),
    mag AS (
      SELECT machine_code, assembly_id
      FROM qw.machine_magazine
      WHERE assembly_id IS NOT NULL
      GROUP BY 1,2
    ),
    inv AS (
      SELECT assembly_id,
             SUM(qty_available) AS qty_available,
             SUM(qty_reserved)  AS qty_reserved,
             SUM(qty_available - qty_reserved) AS qty_free
      FROM qw.tool_inventory
      GROUP BY 1
    )
    SELECT
      req.shift_key, req.machine_code, req.operation_key, req.job_num, req.oper_seq,
      req.assembly_id, req.qty_needed, req.criticality, req.source,
      COALESCE(inv.qty_free, 0) AS qty_free_in_crib,
      CASE WHEN mag.assembly_id IS NULL THEN true ELSE false END AS missing_in_magazine
    FROM req
    LEFT JOIN mag ON mag.machine_code = req.machine_code AND mag.assembly_id = req.assembly_id
    LEFT JOIN inv ON inv.assembly_id = req.assembly_id
    WHERE mag.assembly_id IS NULL
    ORDER BY req.machine_code, req.operation_key, req.criticality, req.assembly_id
  `,

  // Operations that are blocked because required tools are not loaded AND not available in crib.
  blocked_operations_missing_tools: `
    WITH req AS (
      SELECT r.operation_key, r.machine_code, r.assembly_id, r.qty_needed, r.criticality
      FROM qw.required_tools r
    ),
    mag AS (
      SELECT machine_code, assembly_id
      FROM qw.machine_magazine
      WHERE assembly_id IS NOT NULL
      GROUP BY 1,2
    ),
    inv AS (
      SELECT assembly_id, SUM(qty_available - qty_reserved) AS qty_free
      FROM qw.tool_inventory
      GROUP BY 1
    ),
    missing AS (
      SELECT
        req.operation_key,
        req.machine_code,
        req.assembly_id,
        req.qty_needed,
        req.criticality,
        COALESCE(inv.qty_free, 0) AS qty_free_in_crib,
        CASE WHEN mag.assembly_id IS NULL THEN true ELSE false END AS missing_in_magazine
      FROM req
      LEFT JOIN mag ON mag.machine_code = req.machine_code AND mag.assembly_id = req.assembly_id
      LEFT JOIN inv ON inv.assembly_id = req.assembly_id
      WHERE mag.assembly_id IS NULL
        AND COALESCE(inv.qty_free, 0) <= 0
    )
    SELECT
      m.operation_key,
      o.job_num,
      o.oper_seq,
      m.machine_code,
      m.assembly_id,
      m.qty_needed,
      m.criticality
    FROM missing m
    LEFT JOIN qw.operations o ON o.operation_key = m.operation_key
    ORDER BY m.criticality, m.machine_code, m.operation_key, m.assembly_id
  `,

  // Tool usage overview for a job (required tools and magazine status)
  // Params:
  //   $1 job_num (required)
  tool_usage_for_job: `
    WITH ops AS (
      SELECT operation_key, job_num, oper_seq, machine_code
      FROM qw.operations
      WHERE job_num = $1::text
    ),
    req AS (
      SELECT r.operation_key, r.assembly_id, r.qty_needed, r.criticality, r.source
      FROM qw.required_tools r
      JOIN ops o ON o.operation_key = r.operation_key
    ),
    mag AS (
      SELECT machine_code, assembly_id
      FROM qw.machine_magazine
      WHERE assembly_id IS NOT NULL
      GROUP BY 1,2
    )
    SELECT
      ops.job_num,
      ops.oper_seq,
      ops.machine_code,
      req.assembly_id,
      req.qty_needed,
      req.criticality,
      req.source,
      CASE WHEN mag.assembly_id IS NULL THEN false ELSE true END AS loaded_in_magazine
    FROM ops
    JOIN req ON req.operation_key = ops.operation_key
    LEFT JOIN mag ON mag.machine_code = ops.machine_code AND mag.assembly_id = req.assembly_id
    ORDER BY ops.oper_seq, req.criticality, req.assembly_id
  `,

  // Machines and their loaded tool assemblies (magazine snapshot)
  machines_loaded_magazine: `
    SELECT
      machine_code,
      pocket_no,
      assembly_id,
      status,
      loaded_at,
      estimated_life_remaining_min
    FROM qw.machine_magazine
    ORDER BY machine_code, pocket_no
  `,

  // NC-called tools vs required tools for an operation (quick gap check)
  // Params:
  //   $1 operation_key (required) e.g. "JOB123:10"
  compare_nc_vs_required_for_operation: `
    WITH req AS (
      SELECT DISTINCT assembly_id
      FROM qw.required_tools
      WHERE operation_key = $1::text
    ),
    nc AS (
      SELECT DISTINCT assembly_id
      FROM qw.nc_program_tools
      WHERE assembly_id IS NOT NULL
    )
    SELECT
      $1::text AS operation_key,
      (SELECT count(*) FROM req) AS required_cnt,
      (SELECT count(*) FROM nc) AS nc_cnt,
      (SELECT count(*) FROM req r LEFT JOIN nc n ON n.assembly_id = r.assembly_id WHERE n.assembly_id IS NULL) AS required_missing_in_nc,
      (SELECT count(*) FROM nc n LEFT JOIN req r ON r.assembly_id = n.assembly_id WHERE r.assembly_id IS NULL) AS nc_extra_not_required
  `
};
