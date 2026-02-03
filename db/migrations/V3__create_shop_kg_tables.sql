-- V3: Create kg_* tables (exact columns from Excel)
CREATE TABLE IF NOT EXISTS shop."kg_README_DataModel" (
  "Field" text NOT NULL,
  "Description" text,
  PRIMARY KEY ("Field")
);

CREATE TABLE IF NOT EXISTS shop."kg_MachineProcessMap" (
  "Machine" text NOT NULL,
  "ProcessType" text,
  PRIMARY KEY ("Machine")
);

CREATE TABLE IF NOT EXISTS shop."kg_ToolMaster" (
  "ToolID" bigint NOT NULL,
  "ToolCode" text,
  "ToolType" text,
  "ProcessType" text,
  "Diameter_mm" numeric(18,6),
  "CornerRadius_mm" numeric(18,6),
  "OverallLength_mm" bigint,
  "FluteCount" bigint,
  "ToolMaterial" text,
  "Coating" text,
  "Manufacturer" text,
  "CatalogNo" text,
  "DefaultLife_min" bigint,
  "Regrindable" boolean,
  "Notes" text,
  PRIMARY KEY ("ToolID")
);

CREATE TABLE IF NOT EXISTS shop."kg_HolderMaster" (
  "HolderID" bigint NOT NULL,
  "HolderCode" text,
  "HolderType" text,
  "Interface" text,
  "GaugeLength_mm" bigint,
  "CoolantThrough" boolean,
  "Notes" text,
  PRIMARY KEY ("HolderID")
);

CREATE TABLE IF NOT EXISTS shop."kg_ToolAssembly" (
  "AssemblyID" text NOT NULL,
  "AssemblyCode" text,
  "ToolID" bigint,
  "HolderID" bigint,
  "ProcessType" text,
  "GaugeLength_mm" bigint,
  "Stickout_mm" bigint,
  "BalanceRpmLimit" bigint,
  "PresetRequired" boolean,
  "Status" text,
  PRIMARY KEY ("AssemblyID")
);

CREATE TABLE IF NOT EXISTS shop."kg_ToolLifeModel" (
  "AssemblyID" text NOT NULL,
  "LifeBasis" text,
  "Life_min" bigint,
  "SafetyFactor" numeric(18,6),
  "LastCalibratedAt" timestamptz,
  PRIMARY KEY ("AssemblyID")
);

CREATE TABLE IF NOT EXISTS shop."kg_ToolInventoryLots" (
  "LotID" text NOT NULL,
  "AssemblyID" text,
  "QtyAvailable" bigint,
  "QtyReserved" bigint,
  "LocationBin" text,
  "Condition" text,
  "LastCountDate" date,
  PRIMARY KEY ("LotID")
);

CREATE TABLE IF NOT EXISTS shop."kg_MachineMagazine" (
  "Machine" text NOT NULL,
  "PocketNo" bigint NOT NULL,
  "AssemblyID" text,
  "Status" text,
  "LoadedAt" timestamptz,
  "EstimatedLifeRemaining_min" bigint,
  PRIMARY KEY ("Machine", "PocketNo")
);

CREATE TABLE IF NOT EXISTS shop."kg_SolidCAM_Projects" (
  "CamProjectID" text NOT NULL,
  "PartNum" text,
  "Revision" text,
  "ToolLibrary" text,
  "PostProcessor" text,
  "LastUpdatedAt" timestamptz,
  PRIMARY KEY ("CamProjectID")
);

CREATE TABLE IF NOT EXISTS shop."kg_SolidCAM_OperationTools" (
  "CamProjectID" text NOT NULL,
  "JobNum" text,
  "OperSeq" bigint,
  "SetupID" text,
  "CamOperationID" text NOT NULL,
  "OperationType" text,
  "MaterialGroup" text,
  "AssemblyID" text,
  "EstimatedCut_min" numeric(18,6),
  "Feeds_mm_min" bigint,
  "SpindleRPM" bigint,
  "LastGeneratedAt" timestamptz,
  PRIMARY KEY ("CamProjectID", "CamOperationID")
);

CREATE TABLE IF NOT EXISTS shop."kg_NC_Programs" (
  "ProgramID" text NOT NULL,
  "JobNum" text,
  "OperSeq" bigint,
  "Machine" text,
  "ProgramName" text,
  "PostProcessor" text,
  "LastPostedAt" timestamptz,
  PRIMARY KEY ("ProgramID")
);

CREATE TABLE IF NOT EXISTS shop."kg_NC_ProgramTools" (
  "ProgramID" text NOT NULL,
  "ToolCall" text,
  "TNumber" bigint NOT NULL,
  "AssemblyID" text,
  "Comment" text,
  "LastSeenAt" timestamptz,
  PRIMARY KEY ("ProgramID", "TNumber")
);

CREATE TABLE IF NOT EXISTS shop."kg_JobOpRequiredTools" (
  "JobNum" text NOT NULL,
  "OperSeq" bigint NOT NULL,
  "Machine" text,
  "AssemblyID" text NOT NULL,
  "QtyNeeded" boolean,
  "Criticality" text,
  "Source" text,
  "RequiredFrom" timestamptz,
  "RequiredTo" timestamptz,
  "EstimatedCut_min" numeric(18,6),
  "PredictedConsumptionQty" numeric(18,6),
  PRIMARY KEY ("JobNum", "OperSeq", "AssemblyID")
);

CREATE TABLE IF NOT EXISTS shop."kg_DimShifts" (
  "ShiftID" bigint NOT NULL,
  "ShiftName" text,
  "StartHourUTC" bigint,
  "EndHourUTC" bigint,
  PRIMARY KEY ("ShiftID")
);

CREATE TABLE IF NOT EXISTS shop."kg_ShiftPlan" (
  "ShiftDate" date NOT NULL,
  "ShiftID" bigint NOT NULL,
  "Machine" text NOT NULL,
  "JobNum" text NOT NULL,
  "OperSeq" bigint NOT NULL,
  "PlannedStart" timestamptz,
  "PlannedEnd" timestamptz,
  PRIMARY KEY ("ShiftDate", "ShiftID", "Machine", "JobNum", "OperSeq")
);

CREATE TABLE IF NOT EXISTS shop."kg_ToolConsumption" (
  "EventID" text NOT NULL,
  "Timestamp" timestamptz,
  "Machine" text,
  "AssemblyID" text,
  "EventType" text,
  "Qty" bigint,
  "EstimatedCut_min" numeric(18,6),
  "JobNum" text,
  "OperSeq" bigint,
  "OperatorID" text,
  "Notes" text,
  PRIMARY KEY ("EventID")
);

CREATE TABLE IF NOT EXISTS shop."kg_ExampleQueries" (
  "Topic" text NOT NULL,
  "Query" text,
  PRIMARY KEY ("Topic")
);

