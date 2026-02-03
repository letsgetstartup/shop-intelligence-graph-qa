-- V7: Indexes for common joins and graph export scans
CREATE INDEX IF NOT EXISTS idx_jb_jobops_job_oper ON shop."jb_JobOperations" ("JobNum", "OperSeq");
CREATE INDEX IF NOT EXISTS idx_jb_jobs_part ON shop."jb_Jobs" ("PartNum");
CREATE INDEX IF NOT EXISTS idx_jb_jobs_customer ON shop."jb_Jobs" ("CustomerID");
CREATE INDEX IF NOT EXISTS idx_kg_required_jobop ON shop."kg_JobOpRequiredTools" ("JobNum", "OperSeq");
CREATE INDEX IF NOT EXISTS idx_kg_required_assembly ON shop."kg_JobOpRequiredTools" ("AssemblyID");
CREATE INDEX IF NOT EXISTS idx_kg_mag_machine ON shop."kg_MachineMagazine" ("Machine");
CREATE INDEX IF NOT EXISTS idx_kg_mag_assembly ON shop."kg_MachineMagazine" ("AssemblyID");
CREATE INDEX IF NOT EXISTS idx_kg_lots_assembly ON shop."kg_ToolInventoryLots" ("AssemblyID");
CREATE INDEX IF NOT EXISTS idx_kg_camop_jobop ON shop."kg_SolidCAM_OperationTools" ("JobNum", "OperSeq");
CREATE INDEX IF NOT EXISTS idx_kg_camop_assembly ON shop."kg_SolidCAM_OperationTools" ("AssemblyID");
CREATE INDEX IF NOT EXISTS idx_kg_ncprog_jobop ON shop."kg_NC_Programs" ("JobNum", "OperSeq");
CREATE INDEX IF NOT EXISTS idx_kg_nctools_program ON shop."kg_NC_ProgramTools" ("ProgramID");
CREATE INDEX IF NOT EXISTS idx_kg_nctools_assembly ON shop."kg_NC_ProgramTools" ("AssemblyID");
CREATE INDEX IF NOT EXISTS idx_kg_shiftplan_machine ON shop."kg_ShiftPlan" ("Machine");
