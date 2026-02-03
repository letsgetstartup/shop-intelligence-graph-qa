export const CYPHER_TEMPLATES = {
  tool_alternatives_for_missing_assemblies: (assemblyIdsCsv, maxDepth=1) => `
    MATCH (a:ToolAssembly)
    WHERE a.assembly_id IN [${assemblyIdsCsv}]
    OPTIONAL MATCH (a)-[:ALTERNATE_OF*1..${maxDepth}]->(alt:ToolAssembly)
    RETURN a.assembly_id AS assembly_id, collect(DISTINCT alt.assembly_id) AS alternate_assembly_ids
  `,

  job_operation_machine_chain: (jobNumSafe) => `
    MATCH (j:Job {JobNum: "${jobNumSafe}"} )-[:HAS_OPERATION]->(o:Operation)-[:USES_MACHINE]->(m:Machine)
    RETURN j.JobNum AS job_num, o.JobOperKey AS operation_key, m.MachineAlias AS machine
    ORDER BY o.JobOperKey
  `
};
