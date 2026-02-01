# Shop Intelligence Graph Ingestion

This folder contains the scripts to ingest the Shop Intelligence "Canonical Graph" into FalkorDB.

## Canonical Graph Model

We enforce a strict schema where nodes are keyed by their primary identifiers from the ERP system.

### Node Labels & Keys

| Label       | Primary Key | Description |
|-------------|-------------|-------------|
| `:Customer` | `CustomerID` | Customers who place jobs |
| `:Job`      | `JobNum` | Manufacturing jobs |
| `:Part`     | `PartNum` | The item being produced |
| `:Operation`| `JobOperKey` | `JobNum::OperSeq` (Unique operation instance) |
| `:Machine`  | `WorkCenterID`| Keyed by WorkCenterID. Display name stored as `MachineAlias` |
| `:Employee` | `EmployeeID` | Staff performing work |
| `:Cluster`  | `ClusterID` | Machine monitoring cluster events |

### Relationships

* `(c:Customer)-[:PLACED]->(j:Job)`
* `(j:Job)-[:PRODUCES]->(p:Part)`
* `(j:Job)-[:HAS_OPERATION]->(o:Operation)`
* `(o:Operation)-[:USES_MACHINE]->(m:Machine)`
    * **Crucial**: Operations connect to Machines via `WorkCenterID`.
* `(m:Machine)-[:HAS_CLUSTER]->(cl:Cluster)`
* `(o:Operation)-[:IN_CLUSTER]->(cl:Cluster)` (when `SMKO_ClusterID` is present)
* `(e:Employee)-[:WORKED_ON {LaborHrs, ...}]->(o:Operation)`

## Ingestion Script

The `ingest.js` script reads CSV files from `../data/erp` (default) and populates the graph.

### Key Logic Changes
* **Machines**: We now strictly use `WorkCenterID` as the key for `:Machine` nodes.
    * The `jb_WorkCenters.csv` file provides the master list.
    * `jb_JobOperations.csv` connects via `WorkCenterID`.
    * `jb_SMKO_ClusterBridge.csv` (which often only has machine aliases) uses a lookup map to find the correct `WorkCenterID`.
* **Timestamps**: Dates are converted to epoch timestamps (`_ts` suffixes) for range queries.

## Running Ingestion

1. Ensure your FalkorDB instance is running:
   ```bash
   docker run -p 6379:6379 -it --rm falkordb/falkordb
   ```

2. Install dependencies:
   ```bash
   cd ingest
   npm install
   ```

3. Run the script:
   ```bash
   node ingest.js
   ```

## Sanity Check Queries

Run these in the FalkorDB Browser or via CLI to verify the graph is fully connected.

**1. Check Total Relationships**
```cypher
MATCH ()-[r]->() RETURN count(r)
```

**2. Verify Full Chain (Customer -> Job -> Op -> Machine)**
This query proves that all joins are working correcty.
```cypher
MATCH p=(c:Customer)-[:PLACED]->(j:Job)-[:HAS_OPERATION]->(o:Operation)-[:USES_MACHINE]->(m:Machine)
OPTIONAL MATCH (m)-[:HAS_CLUSTER]->(cl:Cluster)
OPTIONAL MATCH (e:Employee)-[:WORKED_ON]->(o)
RETURN c.CustomerName, j.JobNum, o.OperSeq, m.MachineAlias, cl.ClusterID, e.EmployeeName
LIMIT 50
```

**3. Check for Orphaned Operations (Should be 0)**
```cypher
MATCH (o:Operation)
WHERE NOT (o)-[:USES_MACHINE]->()
RETURN count(o) as OrphanedOps
```
