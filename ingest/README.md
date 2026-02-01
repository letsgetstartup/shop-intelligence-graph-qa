# Shop Intelligence Graph Ingestion

This folder contains the scripts to ingest the Shop Intelligence "Semantic Graph" into FalkorDB.

## Semantic Graph Model

We enforce a strict schema where nodes have both canonical keys (for joining) and semantic properties (for humans and agents).

### Universal Semantic Properties
Every node (`Customer`, `Job`, `Machine`, etc.) now includes:
*   `display_name`: Human-readable label (e.g., "Job 2042 (SO 123)"). **Use this for UI captions.**
*   `entity_type`: The node type string (e.g., "Job").
*   `search_text`: Concatenated keywords for vector search or simple text retrieval.
*   `source`: Origin CSV file.

See [docs/graph_schema.md](../docs/graph_schema.md) for the full schema definition.

## Ingestion Script

The `ingest.js` script reads CSV files from `../data/erp` and populates the graph with these semantic fields automatically.

### Running Ingestion

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

## Visualization "How-To"

When using the FalkorDB Browser or other visualization tools:
*   **Node Captions**: Configure the tool to use `display_name` as the caption. This replaces obscure IDs like `105` with "Job 50021".
*   **Inspection**: Click any node to see `search_text` and `entity_type` along with its raw data.

### Sanity Check Query for Semantics
Run this to see the rich, connected graph with human-readable names:
```cypher
MATCH p=(c:Customer)-[:PLACED]->(j:Job)-[:HAS_OPERATION]->(o:Operation)-[:USES_MACHINE]->(m:Machine)
RETURN 
  c.display_name as Customer, 
  j.display_name as Job, 
  o.display_name as Op, 
  m.display_name as Machine
LIMIT 50
```
