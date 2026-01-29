
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const { FalkorDB } = require('falkordb');
require('dotenv').config();

const DATA_DIR = path.join(__dirname, '../data/erp');
const FALKORDB_URL = process.env.FALKORDB_URL || 'falkor://localhost:6379';
const GRAPH_NAME = process.env.GRAPH_NAME || 'shop';

async function main() {
    console.log(`Connecting to FalkorDB at ${FALKORDB_URL}, Graph: ${GRAPH_NAME}`);
    const db = await FalkorDB.connect({ url: FALKORDB_URL });
    const graph = db.selectGraph(GRAPH_NAME);

    // Create Indexes
    console.log("Creating indexes...");
    try {
        await graph.query("CREATE INDEX FOR (c:Customer) ON (c.CustomerID)");
        await graph.query("CREATE INDEX FOR (p:Part) ON (p.PartNum)");
        await graph.query("CREATE INDEX FOR (j:Job) ON (j.JobNum)");
        await graph.query("CREATE INDEX FOR (o:Operation) ON (o.JobOperKey)");
        await graph.query("CREATE INDEX FOR (m:Machine) ON (m.MachineName)"); // Using MachineName from WorkCenters/Clusters
        await graph.query("CREATE INDEX FOR (e:Employee) ON (e.EmployeeID)");
        await graph.query("CREATE INDEX FOR (cl:Cluster) ON (cl.ClusterID)");
    } catch (err) {
        console.log("Index creation note (may already exist):", err.message);
    }

    // --- Helpers ---
    const processFile = async (filename, rowHandler) => {
        const filePath = path.join(DATA_DIR, filename);
        if (!fs.existsSync(filePath)) {
            console.warn(`File not found: ${filePath}, skipping.`);
            return;
        }
        console.log(`Processing ${filename}...`);
        const parser = fs.createReadStream(filePath).pipe(parse({ columns: true, trim: true, bom: true }));
        let count = 0;
        for await (const row of parser) {
            await rowHandler(row, count);
            count++;
            if (count % 1000 === 0) process.stdout.write(`.`);
        }
        console.log(`\nImported ${count} rows from ${filename}`);
    };

    // 1. Customers
    await processFile('jb_Customers.csv', async (row, count) => {
        const params = {
            id: row.CustomerID,
            props: {
                CustomerID: row.CustomerID,
                Name: row.CustomerName,
                // Address: row.Address, // Missing in CSV
                City: row.City,
                // State: row.State, // Missing
                // Zip: row.Zip, // Missing
                Country: row.Country,
                Industry: row.Industry,
                Terms: row.Terms,
                // ContactPerson: row.ContactPerson, // Missing
                CreditLimit: parseFloat(row.CreditLimit || 0)
            }
        };
        if (count === 0) console.log("Debug Customer Row:", JSON.stringify(row), "Params:", JSON.stringify(params));
        await graph.query(`MERGE (c:Customer {CustomerID: $id}) SET c += $props`, { params });
    });

    // 2. Parts
    await processFile('jb_Parts.csv', async (row) => {
        const params = {
            id: row.PartNum,
            props: {
                PartNum: row.PartNum,
                Description: row.Description,
                UOM: row.UOM,
                Revision: row.Revision,
                StdMaterial: row.StdMaterial,
                StdCycleTimeSec: parseFloat(row.StdCycleTimeSec || 0),
                StdCost: parseFloat(row.StdCost || 0),
                SellPrice: parseFloat(row.SellPrice || 0)
            }
        };
        await graph.query(`MERGE (p:Part {PartNum: $id}) SET p += $props`, { params });
    });

    // 3. Machines (from WorkCenters)
    // We assume WorkCenter -> Machine. 
    await processFile('jb_WorkCenters.csv', async (row) => {
        // We will treat 'Machine' column as the unique identifier for the machine node if present, 
        // OR use WorkCenterID as the Machine identifier if Machine column is empty/same.
        // Based on headers: WorkCenterID,WorkCenterName,Machine,Department,MachineRatePerHour
        const machineId = row.Machine || row.WorkCenterID;
        const params = {
            id: machineId,
            props: {
                MachineName: machineId,
                WorkCenterID: row.WorkCenterID,
                WorkCenterName: row.WorkCenterName,
                Department: row.Department,
                RatePerHour: parseFloat(row.MachineRatePerHour || 0)
            }
        };
        await graph.query(`MERGE (m:Machine {MachineName: $id}) SET m += $props`, { params });
    });

    // 4. Employees
    await processFile('jb_Employees.csv', async (row) => {
        const params = {
            id: row.EmployeeID,
            props: {
                EmployeeID: row.EmployeeID,
                Name: row.EmployeeName,
                Role: row.Role,
                Shift: row.Shift,
                HourlyRate: parseFloat(row.HourlyRate || 0)
            }
        };
        await graph.query(`MERGE (e:Employee {EmployeeID: $id}) SET e += $props`, { params });
    });

    // 5. Jobs (Nodes + Relationships to Customer & Part)
    await processFile('jb_Jobs.csv', async (row) => {
        const dueTs = row.DueDate ? new Date(row.DueDate).getTime() : null;
        const closeTs = row.CloseDate ? new Date(row.CloseDate).getTime() : null;

        const params = {
            jobNum: row.JobNum,
            props: {
                JobNum: row.JobNum,
                SalesOrder: row.SalesOrder,
                Revision: row.Revision,
                JobStatus: row.JobStatus,
                Priority: row.Priority,
                QtyOrdered: parseInt(row.QtyOrdered || 0),
                QtyCompleted: parseInt(row.QtyCompleted || 0),
                QtyScrapped: parseInt(row.QtyScrapped || 0),
                PlannedStart: row.PlannedStart,
                DueDate: row.DueDate,
                due_ts: dueTs,
                CloseDate: row.CloseDate,
                close_ts: closeTs,
                Notes: row.Notes
            },
            custId: row.CustomerID,
            partNum: row.PartNum
        };

        const query = `
            MERGE (j:Job {JobNum: $jobNum}) SET j += $props
            WITH j
            MATCH (c:Customer {CustomerID: $custId})
            MERGE (c)-[:PLACED]->(j)
            WITH j
            MATCH (p:Part {PartNum: $partNum})
            MERGE (j)-[:PRODUCES]->(p)
        `;
        // Note: If Customer or Part doesn't exist, the rel creation might fail or do nothing.
        // Ideally we ensure they exist. The MERGE on Customer/Part above handles existence.
        // However, if the CSV has broken foreign keys, the MATCH will return nothing and relationships won't be created.
        await graph.query(query, { params });
    });

    // 6. Cluster Events (Nodes + Rel to Machine)
    await processFile('jb_SMKO_ClusterBridge.csv', async (row) => {
        const startTs = new Date(row.ClusterStart).getTime();
        const endTs = new Date(row.ClusterEnd).getTime();

        const params = {
            clusterId: row.ClusterID,
            machineName: row.Machine,
            props: {
                ClusterID: row.ClusterID,
                ClusterStart: row.ClusterStart,
                start_ts: startTs,
                ClusterEnd: row.ClusterEnd,
                end_ts: endTs,
                RunSec: parseInt(row.RunSec || 0),
                CycleCount: parseInt(row.CycleCount || 0),
                DurationSec: (endTs - startTs) / 1000
            }
        };

        const query = `
            MERGE (cl:Cluster {ClusterID: $clusterId}) SET cl += $props
            WITH cl
            MATCH (m:Machine {MachineName: $machineName})
            MERGE (m)-[:HAS_CLUSTER]->(cl)
        `;
        await graph.query(query, { params });
    });

    // 7. Operations (Nodes + Rel to Job, Machine, Cluster)
    await processFile('jb_JobOperations.csv', async (row) => {
        const jobOperKey = `${row.JobNum}::${row.OperSeq}`;
        const params = {
            opKey: jobOperKey,
            jobNum: row.JobNum,
            machineName: row.Machine, // or match via WorkCenterID if Machine is empty, but let's try Machine field first
            wcId: row.WorkCenterID,
            clusterId: row.SMKO_ClusterID,
            props: {
                JobOperKey: jobOperKey,
                JobNum: row.JobNum,
                OperSeq: parseInt(row.OperSeq),
                OperationDesc: row.OperationDesc,
                StdSetupHrs: parseFloat(row.StdSetupHrs || 0),
                StdRunHrsPerUnit: parseFloat(row.StdRunHrsPerUnit || 0),
                QtyComplete: parseInt(row.QtyComplete || 0),
                QtyScrap: parseInt(row.QtyScrap || 0),
                SetupHrs: parseFloat(row.SetupHrs || 0),
                RunHrs: parseFloat(row.RunHrs || 0),
                Status: row.Status
            }
        };

        let query = `
            MERGE (o:Operation {JobOperKey: $opKey}) SET o += $props
            WITH o
            MATCH (j:Job {JobNum: $jobNum})
            MERGE (j)-[:HAS_OPERATION]->(o)
        `;

        // Match machine by name if possible, else maybe by WC? 
        // In jb_JobOperations.csv we have 'Machine' and 'WorkCenterID'.
        // In jb_WorkCenters.csv we stored MachineName = Machine || WorkCenterID.
        // So we should try to match on that.
        // We'll trust 'Machine' column first if populated.

        if (row.Machine) {
            query += `
                WITH o
                MATCH (m:Machine {MachineName: $machineName})
                MERGE (o)-[:USES_MACHINE]->(m)
             `;
        } else if (row.WorkCenterID) {
            query += `
                WITH o
                MATCH (m:Machine {WorkCenterID: $wcId})
                MERGE (o)-[:USES_MACHINE]->(m)
             `;
        }

        if (row.SMKO_ClusterID && row.SMKO_ClusterID !== '') {
            query += `
                WITH o
                MATCH (cl:Cluster {ClusterID: $clusterId})
                MERGE (o)-[:IN_CLUSTER]->(cl)
            `;
        }

        await graph.query(query, { params });
    });

    // 8. Labor Details (Employee -> Operation)
    await processFile('jb_LaborDetails.csv', async (row) => {
        const jobOperKey = `${row.JobNum}::${row.OperSeq}`;
        const params = {
            empId: row.EmployeeID,
            opKey: jobOperKey,
            laborHrs: parseFloat(row.LaborHrs || 0),
            setupHrs: parseFloat(row.SetupHrs || 0),
            runHrs: parseFloat(row.RunHrs || 0),
        };

        // We can add properties to the relationship
        const query = `
            MATCH (e:Employee {EmployeeID: $empId})
            MATCH (o:Operation {JobOperKey: $opKey})
            MERGE (e)-[r:PERFORMED_BY]->(o)
            SET r.LaborHrs = $laborHrs, r.SetupHrs = $setupHrs, r.RunHrs = $runHrs
        `
        await graph.query(query, { params });
    });

    console.log("Ingestion complete.");
    db.close();
}

main().catch(console.error);
