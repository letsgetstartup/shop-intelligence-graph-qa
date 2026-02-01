# Useful Graph Queries

These queries help you explore, debug, and visualize the Shop Intelligence semantic graph.

## Visualization & Connectivity

**1. Full Trace: Customer to Machine**
This query retrieves a complete manufacturing chain, showing the `display_name` which is optimized for visualization.
```cypher
MATCH p=(c:Customer)-[:PLACED]->(j:Job)-[:HAS_OPERATION]->(o:Operation)-[:USES_MACHINE]->(m:Machine)
OPTIONAL MATCH (j)-[:PRODUCES]->(p:Part)
OPTIONAL MATCH (m)-[:HAS_CLUSTER]->(cl:Cluster)
OPTIONAL MATCH (e:Employee)-[:WORKED_ON]->(o)
RETURN 
  c.display_name, 
  j.display_name, 
  o.display_name, 
  m.display_name, 
  p.display_name, 
  e.display_name
LIMIT 50
```

**2. Inspect Semantic Properties**
Check that nodes have the required `display_name` and `entity_type`.
```cypher
MATCH (n) 
RETURN labels(n) as Label, n.entity_type, n.display_name, n.search_text 
LIMIT 20
```

## Debugging / Data Integrity

**3. Find Disconnected Nodes by Label**
Nodes that aren't connected to anything (potential data orphans).
```cypher
MATCH (n)
WHERE NOT (n)--() 
RETURN labels(n), count(n)
```

**4. Find Operations without Machines**
Operations should always be connected to a computer/machine.
```cypher
MATCH (o:Operation)
WHERE NOT (o)-[:USES_MACHINE]->()
RETURN o.JobOperKey, o.display_name
```

**5. Find Jobs without Customers**
```cypher
MATCH (j:Job)
WHERE NOT (j)<-[:PLACED]-(:Customer)
RETURN j.JobNum, j.display_name
```
