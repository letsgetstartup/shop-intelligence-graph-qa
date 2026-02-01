// Semantic Fixup Script
// Run this if you imported data without the updated ingest.js, or to normalize older data.

// 1. Ensure entity_type is set (fallback to Label)
MATCH (n) WHERE n.entity_type IS NULL OR n.entity_type = ''
SET n.entity_type = labels(n)[0];

// 2. Ensure display_name exists (Fallback to keys)
MATCH (c:Customer) WHERE c.display_name IS NULL SET c.display_name = c.CustomerName;
MATCH (j:Job) WHERE j.display_name IS NULL SET j.display_name = 'Job ' + j.JobNum;
MATCH (p:Part) WHERE p.display_name IS NULL SET p.display_name = p.PartNum;
MATCH (m:Machine) WHERE m.display_name IS NULL SET m.display_name = coalesce(m.MachineAlias, m.WorkCenterName, m.WorkCenterID);
MATCH (o:Operation) WHERE o.display_name IS NULL SET o.display_name = 'Op ' + toString(o.OperSeq) + ' (Job ' + o.JobNum + ')';
MATCH (e:Employee) WHERE e.display_name IS NULL SET e.display_name = coalesce(e.EmployeeName, e.EmployeeID);

// 3. Ensure search_text exists (Fallback to display_name)
MATCH (n) WHERE n.search_text IS NULL OR n.search_text = ''
SET n.search_text = n.display_name;

// 4. Trim properties (basic normalization example)
MATCH (n) 
WHERE n.display_name STARTS WITH ' ' OR n.display_name ENDS WITH ' '
SET n.display_name = trim(n.display_name);
