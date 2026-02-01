# Shop Intelligence Graph Schema

This document describes the "Semantic Graph" model used in the Shop Intelligence application. The graph is designed to be both human-readable (for visualization) and agent-friendly (for LLM retrieval).

## Core Semantic Standard

Every node in the graph adheres to the following property standard to ensure consistent visualization and searchability:

| Property | Type | Description |
| :--- | :--- | :--- |
| `entity_type` | String | The human-readable type of the node (e.g., "Customer", "Job"). Matches the Label. |
| `display_name` | String | A short, human-friendly label for the node (e.g., "Job 10123 (SO 999)"). Used for UI captions. |
| `search_text` | String | A concatenated string of key fields used for semantic retrieval / embeddings. |
| `source` | String | The origin datasource (e.g., CSV filename). |
| `description` | String | (Optional) A natural language description of the entity. |

## Node Definitions

### :Customer
*   **Key**: `CustomerID`
*   **Semantic Fields**:
    *   `display_name`: `CustomerName` (or ID if name missing)
    *   `description`: "Customer in {City}/{Country}, Terms: {Terms}..."
    *   `search_text`: `CustomerID` + `CustomerName` + `Industry` + `City` + `Country`

### :Job
*   **Key**: `JobNum`
*   **Semantic Fields**:
    *   `display_name`: "Job {JobNum} (SO {SalesOrder})"
    *   `search_text`: `JobNum` + `SalesOrder` + `JobStatus` + `Priority` + `Notes`

### :Part
*   **Key**: `PartNum`
*   **Semantic Fields**:
    *   `display_name`: "{PartNum} - {Description}"
    *   `search_text`: `PartNum` + `Description` + `StdMaterial`

### :Operation
*   **Key**: `JobOperKey` (`JobNum`::`OperSeq`)
*   **Semantic Fields**:
    *   `display_name`: "Op {OperSeq}: {OperationDesc} (Job {JobNum})"
    *   `search_text`: `JobNum` + `OperSeq` + `OperationDesc` + `MachineAlias` + `Status`

### :Machine
*   **Key**: `WorkCenterID`
*   **Semantic Fields**:
    *   `display_name`: `MachineAlias` OR `WorkCenterName` OR "WorkCenter {WorkCenterID}"
    *   `search_text`: `WorkCenterID` + `WorkCenterName` + `MachineAlias` + `Department`

### :Cluster
*   **Key**: `ClusterID`
*   **Semantic Fields**:
    *   `display_name`: "Cluster {ClusterID} ({Start} -> {End})"
    *   `search_text`: `ClusterID`

### :Employee
*   **Key**: `EmployeeID`
*   **Semantic Fields**:
    *   `display_name`: `EmployeeName` (or ID)
    *   `search_text`: `EmployeeID` + `EmployeeName` + `Role` + `Shift`

## Relationships

Relationships retain their semantic types but are enriched with context properties.

*   `(c:Customer)-[:PLACED {source}]->(j:Job)`
*   `(j:Job)-[:PRODUCES {qty_ordered, qty_completed}]->(p:Part)`
*   `(j:Job)-[:HAS_OPERATION {oper_seq}]->(o:Operation)`
*   `(o:Operation)-[:USES_MACHINE {workcenter_id, machine_alias}]->(m:Machine)`
*   `(m:Machine)-[:HAS_CLUSTER {cluster_start, duration_sec}]->(cl:Cluster)`
*   `(o:Operation)-[:IN_CLUSTER {cluster_id}]->(cl:Cluster)`
*   `(e:Employee)-[:WORKED_ON {LaborHrs, SetupHrs, RunHrs, source}]->(o:Operation)`
