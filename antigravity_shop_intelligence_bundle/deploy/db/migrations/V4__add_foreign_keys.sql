-- V4: Add foreign keys between jb_* and kg_* tables
DO $$ BEGIN
  -- jb relationships
  BEGIN
    ALTER TABLE shop."jb_Jobs" ADD CONSTRAINT fk_jb_jobs_customer FOREIGN KEY ("CustomerID") REFERENCES shop."jb_Customers" ("CustomerID") ON UPDATE CASCADE ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE shop."jb_Jobs" ADD CONSTRAINT fk_jb_jobs_part FOREIGN KEY ("PartNum") REFERENCES shop."jb_Parts" ("PartNum") ON UPDATE CASCADE ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE shop."jb_JobOperations" ADD CONSTRAINT fk_jb_jobops_job FOREIGN KEY ("JobNum") REFERENCES shop."jb_Jobs" ("JobNum") ON UPDATE CASCADE ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE shop."jb_JobOperations" ADD CONSTRAINT fk_jb_jobops_wc FOREIGN KEY ("WorkCenterID") REFERENCES shop."jb_WorkCenters" ("WorkCenterID") ON UPDATE CASCADE ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE shop."jb_LaborDetails" ADD CONSTRAINT fk_jb_labor_employee FOREIGN KEY ("EmployeeID") REFERENCES shop."jb_Employees" ("EmployeeID") ON UPDATE CASCADE ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE shop."jb_LaborDetails" ADD CONSTRAINT fk_jb_labor_jobop FOREIGN KEY ("JobNum", "OperSeq") REFERENCES shop."jb_JobOperations" ("JobNum", "OperSeq") ON UPDATE CASCADE ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE shop."jb_LaborDetails" ADD CONSTRAINT fk_jb_labor_wc FOREIGN KEY ("WorkCenterID") REFERENCES shop."jb_WorkCenters" ("WorkCenterID") ON UPDATE CASCADE ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  -- kg relationships
  BEGIN
    ALTER TABLE shop."kg_ToolAssembly" ADD CONSTRAINT fk_kg_assembly_tool FOREIGN KEY ("ToolID") REFERENCES shop."kg_ToolMaster" ("ToolID") ON UPDATE CASCADE ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE shop."kg_ToolAssembly" ADD CONSTRAINT fk_kg_assembly_holder FOREIGN KEY ("HolderID") REFERENCES shop."kg_HolderMaster" ("HolderID") ON UPDATE CASCADE ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE shop."kg_ToolLifeModel" ADD CONSTRAINT fk_kg_life_assembly FOREIGN KEY ("AssemblyID") REFERENCES shop."kg_ToolAssembly" ("AssemblyID") ON UPDATE CASCADE ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE shop."kg_ToolInventoryLots" ADD CONSTRAINT fk_kg_lots_assembly FOREIGN KEY ("AssemblyID") REFERENCES shop."kg_ToolAssembly" ("AssemblyID") ON UPDATE CASCADE ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE shop."kg_MachineMagazine" ADD CONSTRAINT fk_kg_mag_assembly FOREIGN KEY ("AssemblyID") REFERENCES shop."kg_ToolAssembly" ("AssemblyID") ON UPDATE CASCADE ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE shop."kg_SolidCAM_Projects" ADD CONSTRAINT fk_kg_cam_part FOREIGN KEY ("PartNum") REFERENCES shop."jb_Parts" ("PartNum") ON UPDATE CASCADE ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE shop."kg_SolidCAM_OperationTools" ADD CONSTRAINT fk_kg_camop_project FOREIGN KEY ("CamProjectID") REFERENCES shop."kg_SolidCAM_Projects" ("CamProjectID") ON UPDATE CASCADE ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE shop."kg_SolidCAM_OperationTools" ADD CONSTRAINT fk_kg_camop_jobop FOREIGN KEY ("JobNum", "OperSeq") REFERENCES shop."jb_JobOperations" ("JobNum", "OperSeq") ON UPDATE CASCADE ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE shop."kg_SolidCAM_OperationTools" ADD CONSTRAINT fk_kg_camop_assembly FOREIGN KEY ("AssemblyID") REFERENCES shop."kg_ToolAssembly" ("AssemblyID") ON UPDATE CASCADE ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE shop."kg_NC_Programs" ADD CONSTRAINT fk_kg_ncprog_jobop FOREIGN KEY ("JobNum", "OperSeq") REFERENCES shop."jb_JobOperations" ("JobNum", "OperSeq") ON UPDATE CASCADE ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE shop."kg_NC_ProgramTools" ADD CONSTRAINT fk_kg_nctools_program FOREIGN KEY ("ProgramID") REFERENCES shop."kg_NC_Programs" ("ProgramID") ON UPDATE CASCADE ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE shop."kg_NC_ProgramTools" ADD CONSTRAINT fk_kg_nctools_assembly FOREIGN KEY ("AssemblyID") REFERENCES shop."kg_ToolAssembly" ("AssemblyID") ON UPDATE CASCADE ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE shop."kg_JobOpRequiredTools" ADD CONSTRAINT fk_kg_required_jobop FOREIGN KEY ("JobNum", "OperSeq") REFERENCES shop."jb_JobOperations" ("JobNum", "OperSeq") ON UPDATE CASCADE ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE shop."kg_JobOpRequiredTools" ADD CONSTRAINT fk_kg_required_assembly FOREIGN KEY ("AssemblyID") REFERENCES shop."kg_ToolAssembly" ("AssemblyID") ON UPDATE CASCADE ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE shop."kg_ShiftPlan" ADD CONSTRAINT fk_kg_shiftplan_shift FOREIGN KEY ("ShiftID") REFERENCES shop."kg_DimShifts" ("ShiftID") ON UPDATE CASCADE ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE shop."kg_ShiftPlan" ADD CONSTRAINT fk_kg_shiftplan_jobop FOREIGN KEY ("JobNum", "OperSeq") REFERENCES shop."jb_JobOperations" ("JobNum", "OperSeq") ON UPDATE CASCADE ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE shop."kg_ToolConsumption" ADD CONSTRAINT fk_kg_consumption_assembly FOREIGN KEY ("AssemblyID") REFERENCES shop."kg_ToolAssembly" ("AssemblyID") ON UPDATE CASCADE ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE shop."kg_ToolConsumption" ADD CONSTRAINT fk_kg_consumption_jobop FOREIGN KEY ("JobNum", "OperSeq") REFERENCES shop."jb_JobOperations" ("JobNum", "OperSeq") ON UPDATE CASCADE ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE shop."kg_ToolConsumption" ADD CONSTRAINT fk_kg_consumption_operator FOREIGN KEY ("OperatorID") REFERENCES shop."jb_Employees" ("EmployeeID") ON UPDATE CASCADE ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
