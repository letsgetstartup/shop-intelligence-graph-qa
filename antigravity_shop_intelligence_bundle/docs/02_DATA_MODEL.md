# Data Model (What is stored where)

## Canonical contract in Postgres
Schema: `shop`

### ERP/MES exports (as-is)
- `shop."jb_Jobs"`
- `shop."jb_JobOperations"`
- `shop."jb_Parts"`
- `shop."jb_Customers"`
- `shop."jb_WorkCenters"`
- `shop."jb_Employees"`
- `shop."jb_LaborDetails"`
- `shop."jb_SMKO_ClusterBridge"`

### Tooling / CAM / NC / Planning (simulated-to-production path)
- `shop."kg_ToolMaster"`
- `shop."kg_HolderMaster"`
- `shop."kg_ToolAssembly"`
- `shop."kg_ToolLifeModel"`
- `shop."kg_ToolInventoryLots"`
- `shop."kg_MachineMagazine"`
- `shop."kg_SolidCAM_Projects"`
- `shop."kg_SolidCAM_OperationTools"`
- `shop."kg_NC_Programs"`
- `shop."kg_NC_ProgramTools"`
- `shop."kg_JobOpRequiredTools"`
- `shop."kg_DimShifts"`
- `shop."kg_ShiftPlan"`
- `shop."kg_ToolConsumption"`

## Views
- `core.*`: canonical naming / convenience joins
- `graph_export.*`: stable node + edge feeds used by Graph Builder
