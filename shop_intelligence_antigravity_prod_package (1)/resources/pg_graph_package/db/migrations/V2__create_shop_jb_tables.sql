-- V2: Create jb_* tables (exact columns from Excel)
CREATE TABLE IF NOT EXISTS shop."jb_Customers" (
  "CustomerID" text NOT NULL,
  "CustomerName" text,
  "Industry" text,
  "City" text,
  "Country" text,
  "Terms" text,
  "CreditLimit" bigint,
  PRIMARY KEY ("CustomerID")
);

CREATE TABLE IF NOT EXISTS shop."jb_Employees" (
  "EmployeeID" text NOT NULL,
  "EmployeeName" text,
  "Role" text,
  "Shift" text,
  "HourlyRate" bigint,
  PRIMARY KEY ("EmployeeID")
);

CREATE TABLE IF NOT EXISTS shop."jb_JobOperations" (
  "JobNum" text NOT NULL,
  "OperSeq" bigint NOT NULL,
  "WorkCenterID" text,
  "OperationDesc" text,
  "StdSetupHrs" numeric(18,6),
  "StdRunHrsPerUnit" numeric(18,6),
  "PlannedStart" timestamptz,
  "PlannedEnd" timestamptz,
  "ActualStart" timestamptz,
  "ActualEnd" timestamptz,
  "Machine" text,
  "QtyComplete" bigint,
  "QtyScrap" bigint,
  "SetupHrs" numeric(18,6),
  "RunHrs" numeric(18,6),
  "MoveHrs" numeric(18,6),
  "QueueHrs" numeric(18,6),
  "Status" text,
  "SMKO_ClusterID" bigint,
  PRIMARY KEY ("JobNum", "OperSeq")
);

CREATE TABLE IF NOT EXISTS shop."jb_Jobs" (
  "JobNum" text NOT NULL,
  "SalesOrder" text,
  "CustomerID" text,
  "PartNum" text,
  "Revision" text,
  "JobStatus" text,
  "Priority" text,
  "QtyOrdered" bigint,
  "QtyCompleted" bigint,
  "QtyScrapped" bigint,
  "PlannedStart" timestamptz,
  "DueDate" timestamptz,
  "CloseDate" timestamptz,
  "Notes" text,
  PRIMARY KEY ("JobNum")
);

CREATE TABLE IF NOT EXISTS shop."jb_LaborDetails" (
  "LaborID" text NOT NULL,
  "EmployeeID" text,
  "JobNum" text,
  "OperSeq" bigint,
  "WorkCenterID" text,
  "Machine" text,
  "ClockIn" timestamptz,
  "ClockOut" timestamptz,
  "LaborHrs" numeric(18,6),
  "SetupHrs" numeric(18,6),
  "RunHrs" numeric(18,6),
  "IndirectCode" text,
  "Shift" text,
  "Comment" text,
  PRIMARY KEY ("LaborID")
);

CREATE TABLE IF NOT EXISTS shop."jb_Parts" (
  "PartNum" text NOT NULL,
  "Description" text,
  "UOM" text,
  "Revision" text,
  "StdMaterial" text,
  "StdCycleTimeSec" bigint,
  "StdCost" numeric(18,6),
  "SellPrice" numeric(18,6),
  PRIMARY KEY ("PartNum")
);

CREATE TABLE IF NOT EXISTS shop."jb_SMKO_ClusterBridge" (
  "ClusterID" bigint NOT NULL,
  "Machine" text,
  "ClusterStart" timestamptz,
  "ClusterEnd" timestamptz,
  "RunSec" bigint,
  "CycleCount" bigint,
  PRIMARY KEY ("ClusterID")
);

CREATE TABLE IF NOT EXISTS shop."jb_WorkCenters" (
  "WorkCenterID" text NOT NULL,
  "WorkCenterName" text,
  "Machine" text,
  "Department" text,
  "MachineRatePerHour" bigint,
  PRIMARY KEY ("WorkCenterID")
);

