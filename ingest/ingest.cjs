const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse");
const { FalkorDB } = require("falkordb");
require("dotenv").config();

// Default to ../data/erp since that's where the CSVs are in this repo
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "../data/erp");
const GRAPH_NAME = process.env.GRAPH_NAME || "shop";
const FALKORDB_URL = process.env.FALKORDB_URL || "falkor://localhost:6379";

const BATCH = 500;

const trim = (v) => (v == null ? "" : String(v).trim());
const toInt = (v) => {
    const n = parseInt(trim(v), 10);
    return Number.isFinite(n) ? n : 0;
};
const toFloat = (v) => {
    const n = parseFloat(trim(v));
    return Number.isFinite(n) ? n : 0;
};
const toTs = (v) => {
    const s = trim(v);
    if (!s) return null;
    const t = new Date(s).getTime();
    return Number.isFinite(t) ? t : null;
};

// Helper to join non-empty strings for search_text
const buildSearchText = (parts) => parts.map(trim).filter(p => p.length > 0).join(" ");

async function readCsvRows(fileName) {
    const filePath = path.join(DATA_DIR, fileName);
    if (!fs.existsSync(filePath)) {
        console.warn(`Warning: File not found: ${filePath}`);
        return [];
    }

    const rows = [];
    const parser = fs.createReadStream(filePath).pipe(
        parse({ columns: true, trim: true, bom: true })
    );

    for await (const r of parser) rows.push(r);
    return rows;
}

async function runBatches(graph, rows, cypher, mapRow) {
    if (!rows || rows.length === 0) return;
    console.log(`  > Ingesting ${rows.length} rows...`);
    for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH).map(mapRow);
        await graph.query(cypher, { params: { rows: batch } });
        process.stdout.write(".");
    }
    console.log(""); // newline
}

async function main() {
    console.log(`Connecting: ${FALKORDB_URL}  Graph: ${GRAPH_NAME}`);
    console.log(`Data Dir: ${DATA_DIR}`);

    const db = await FalkorDB.connect({ url: FALKORDB_URL });
    const graph = db.selectGraph(GRAPH_NAME);

    console.log("Creating Indexes...");
    try {
        await graph.query("CREATE INDEX FOR (c:Customer) ON (c.CustomerID)");
        await graph.query("CREATE INDEX FOR (j:Job) ON (j.JobNum)");
        await graph.query("CREATE INDEX FOR (p:Part) ON (p.PartNum)");
        await graph.query("CREATE INDEX FOR (o:Operation) ON (o.JobOperKey)");
        await graph.query("CREATE INDEX FOR (m:Machine) ON (m.WorkCenterID)");
        await graph.query("CREATE INDEX FOR (m:Machine) ON (m.MachineAlias)");
        await graph.query("CREATE INDEX FOR (e:Employee) ON (e.EmployeeID)");
        await graph.query("CREATE INDEX FOR (cl:Cluster) ON (cl.ClusterID)");
        // New indexes for semantics might be useful, e.g. on entity_type if we query by it often, 
        // but label scans are usually fast enough.
    } catch (err) {
        // Indexes might already exist, ignore errors
    }

    // ---- 0) Load WorkCenters first to build a MachineAlias -> WorkCenterID map
    console.log("Loading WorkCenters...");
    const workCenters = await readCsvRows("jb_WorkCenters.csv");
    const aliasToWC = new Map();
    for (const r of workCenters) {
        const wcId = trim(r.WorkCenterID);
        const alias = trim(r.Machine);
        if (wcId && alias) aliasToWC.set(alias, wcId);
    }

    // ---- 1) Machines
    console.log("Ingesting Machines...");
    await runBatches(
        graph,
        workCenters,
        `
    UNWIND $rows AS row
    MERGE (m:Machine {WorkCenterID: row.WorkCenterID})
    SET
      m.entity_type    = 'Machine',
      m.display_name   = row.display_name,
      m.search_text    = row.search_text,
      m.source         = 'jb_WorkCenters.csv',
      m.WorkCenterName = row.WorkCenterName,
      m.MachineAlias   = row.MachineAlias,
      m.Department     = row.Department,
      m.RatePerHour    = row.RatePerHour
    `,
        (r) => {
            const wcId = trim(r.WorkCenterID);
            const wcName = trim(r.WorkCenterName);
            const alias = trim(r.Machine);
            const dept = trim(r.Department);

            // logic: "{MachineAlias}" else "{WorkCenterName}" else "WorkCenter {WorkCenterID}"
            let displayName = alias;
            if (!displayName) displayName = wcName;
            if (!displayName) displayName = `WorkCenter ${wcId}`;

            return {
                WorkCenterID: wcId,
                WorkCenterName: wcName,
                MachineAlias: alias,
                Department: dept,
                RatePerHour: toFloat(r.MachineRatePerHour),
                display_name: displayName,
                search_text: buildSearchText([wcId, wcName, alias, dept])
            };
        }
    );

    // ---- 2) Customers
    console.log("Ingesting Customers...");
    const customers = await readCsvRows("jb_Customers.csv");
    await runBatches(
        graph,
        customers,
        `
    UNWIND $rows AS row
    MERGE (c:Customer {CustomerID: row.CustomerID})
    SET
      c.entity_type    = 'Customer',
      c.display_name   = row.display_name,
      c.description    = row.description,
      c.search_text    = row.search_text,
      c.source         = 'jb_Customers.csv',
      c.CustomerName   = row.CustomerName,
      c.Industry       = row.Industry,
      c.City           = row.City,
      c.Country        = row.Country,
      c.Terms          = row.Terms,
      c.CreditLimit    = row.CreditLimit
    `,
        (r) => {
            const cid = trim(r.CustomerID);
            const name = trim(r.CustomerName);
            const city = trim(r.City);
            const country = trim(r.Country);
            const terms = trim(r.Terms);
            const industry = trim(r.Industry);

            return {
                CustomerID: cid,
                CustomerName: name,
                Industry: industry,
                City: city,
                Country: country,
                Terms: terms,
                CreditLimit: toFloat(r.CreditLimit),
                display_name: name || cid,
                description: `Customer in ${country}/${city}, Terms: ${terms}, Industry: ${industry}`,
                search_text: buildSearchText([cid, name, industry, city, country])
            };
        }
    );

    // ---- 3) Parts
    console.log("Ingesting Parts...");
    const parts = await readCsvRows("jb_Parts.csv");
    await runBatches(
        graph,
        parts,
        `
    UNWIND $rows AS row
    MERGE (p:Part {PartNum: row.PartNum})
    SET
      p.entity_type    = 'Part',
      p.display_name   = row.display_name,
      p.search_text    = row.search_text,
      p.source         = 'jb_Parts.csv',
      p.Description      = row.Description,
      p.UOM              = row.UOM,
      p.Revision         = row.Revision,
      p.StdMaterial      = row.StdMaterial,
      p.StdCycleTimeSec  = row.StdCycleTimeSec,
      p.StdCost          = row.StdCost,
      p.SellPrice        = row.SellPrice
    `,
        (r) => {
            const pnum = trim(r.PartNum);
            const desc = trim(r.Description);

            return {
                PartNum: pnum,
                Description: desc,
                UOM: trim(r.UOM),
                Revision: trim(r.Revision),
                StdMaterial: trim(r.StdMaterial),
                StdCycleTimeSec: toFloat(r.StdCycleTimeSec),
                StdCost: toFloat(r.StdCost),
                SellPrice: toFloat(r.SellPrice),
                display_name: desc ? `${pnum} - ${desc}` : pnum,
                search_text: buildSearchText([pnum, desc, trim(r.StdMaterial)])
            };
        }
    );

    // ---- 4) Jobs
    console.log("Ingesting Jobs...");
    const jobs = await readCsvRows("jb_Jobs.csv");
    await runBatches(
        graph,
        jobs,
        `
    UNWIND $rows AS row
    MERGE (j:Job {JobNum: row.JobNum})
    SET
      j.entity_type    = 'Job',
      j.display_name   = row.display_name,
      j.search_text    = row.search_text,
      j.source         = 'jb_Jobs.csv',
      j.SalesOrder    = row.SalesOrder,
      j.Revision      = row.Revision,
      j.JobStatus     = row.JobStatus,
      j.Priority      = row.Priority,
      j.QtyOrdered    = row.QtyOrdered,
      j.QtyCompleted  = row.QtyCompleted,
      j.QtyScrapped   = row.QtyScrapped,
      j.PlannedStart  = row.PlannedStart,
      j.DueDate       = row.DueDate,
      j.due_ts        = row.due_ts,
      j.CloseDate     = row.CloseDate,
      j.close_ts      = row.close_ts,
      j.Notes         = row.Notes
    MERGE (c:Customer {CustomerID: row.CustomerID})
    MERGE (p:Part {PartNum: row.PartNum})
    MERGE (c)-[:PLACED {source: 'jb_Jobs.csv'}]->(j)
    MERGE (j)-[:PRODUCES {qty_ordered: row.QtyOrdered, qty_completed: row.QtyCompleted}]->(p)
    `,
        (r) => {
            const jnum = trim(r.JobNum);
            const so = trim(r.SalesOrder);

            return {
                JobNum: jnum,
                SalesOrder: so,
                CustomerID: trim(r.CustomerID),
                PartNum: trim(r.PartNum),
                Revision: trim(r.Revision),
                JobStatus: trim(r.JobStatus),
                Priority: trim(r.Priority),
                QtyOrdered: toInt(r.QtyOrdered),
                QtyCompleted: toInt(r.QtyCompleted),
                QtyScrapped: toInt(r.QtyScrapped),
                PlannedStart: trim(r.PlannedStart),
                DueDate: trim(r.DueDate),
                due_ts: toTs(r.DueDate),
                CloseDate: trim(r.CloseDate),
                close_ts: toTs(r.CloseDate),
                Notes: trim(r.Notes),
                display_name: `Job ${jnum}` + (so ? ` (SO ${so})` : ""),
                search_text: buildSearchText([jnum, so, trim(r.JobStatus), trim(r.Priority), trim(r.Notes)])
            };
        }
    );

    // ---- 5) Clusters
    console.log("Ingesting Clusters...");
    const clusters = await readCsvRows("jb_SMKO_ClusterBridge.csv");
    await runBatches(
        graph,
        clusters,
        `
    UNWIND $rows AS row
    MERGE (cl:Cluster {ClusterID: row.ClusterID})
    SET
      cl.entity_type    = 'Cluster',
      cl.display_name   = row.display_name,
      cl.search_text    = row.search_text,
      cl.source         = 'jb_SMKO_ClusterBridge.csv',
      cl.ClusterStart = row.ClusterStart,
      cl.start_ts     = row.start_ts,
      cl.ClusterEnd   = row.ClusterEnd,
      cl.end_ts       = row.end_ts,
      cl.RunSec       = row.RunSec,
      cl.CycleCount   = row.CycleCount,
      cl.DurationSec  = row.DurationSec
    MERGE (m:Machine {WorkCenterID: row.WorkCenterID})
    SET m.MachineAlias = CASE WHEN m.MachineAlias IS NULL OR m.MachineAlias = '' THEN row.MachineAlias ELSE m.MachineAlias END
    MERGE (m)-[:HAS_CLUSTER {cluster_start: row.ClusterStart, cluster_end: row.ClusterEnd, duration_sec: row.DurationSec}]->(cl)
    `,
        (r) => {
            const alias = trim(r.Machine);
            const wcId = aliasToWC.get(alias) || alias;
            const startTs = toTs(r.ClusterStart);
            const endTs = toTs(r.ClusterEnd);
            const cid = trim(r.ClusterID);
            const start = trim(r.ClusterStart);
            const end = trim(r.ClusterEnd);

            return {
                ClusterID: cid,
                MachineAlias: alias,
                WorkCenterID: wcId,
                ClusterStart: start,
                start_ts: startTs,
                ClusterEnd: end,
                end_ts: endTs,
                RunSec: toInt(r.RunSec),
                CycleCount: toInt(r.CycleCount),
                DurationSec: startTs && endTs ? (endTs - startTs) / 1000 : null,
                display_name: `Cluster ${cid} (${start} -> ${end})`,
                search_text: buildSearchText([cid])
            };
        }
    );

    // ---- 6) Operations
    console.log("Ingesting Operations...");
    const ops = await readCsvRows("jb_JobOperations.csv");
    await runBatches(
        graph,
        ops,
        `
    UNWIND $rows AS row
    WITH row, (row.JobNum + '::' + toString(row.OperSeq)) AS opKey
    MERGE (o:Operation {JobOperKey: opKey})
    SET
      o.entity_type      = 'Operation',
      o.display_name     = row.display_name,
      o.search_text      = row.search_text,
      o.source           = 'jb_JobOperations.csv',
      o.JobNum           = row.JobNum,
      o.OperSeq          = row.OperSeq,
      o.WorkCenterID     = row.WorkCenterID,
      o.OperationDesc    = row.OperationDesc,
      o.StdSetupHrs      = row.StdSetupHrs,
      o.StdRunHrsPerUnit = row.StdRunHrsPerUnit,
      o.PlannedStart     = row.PlannedStart,
      o.PlannedEnd       = row.PlannedEnd,
      o.ActualStart      = row.ActualStart,
      o.ActualEnd        = row.ActualEnd,
      o.MachineAlias     = row.MachineAlias,
      o.QtyComplete      = row.QtyComplete,
      o.QtyScrap         = row.QtyScrap,
      o.SetupHrs         = row.SetupHrs,
      o.RunHrs           = row.RunHrs,
      o.MoveHrs          = row.MoveHrs,
      o.QueueHrs         = row.QueueHrs,
      o.Status           = row.Status
    MERGE (j:Job {JobNum: row.JobNum})
    MERGE (j)-[:HAS_OPERATION {oper_seq: row.OperSeq}]->(o)
    MERGE (m:Machine {WorkCenterID: row.WorkCenterID})
    SET m.MachineAlias = CASE WHEN m.MachineAlias IS NULL OR m.MachineAlias = '' THEN row.MachineAlias ELSE m.MachineAlias END
    MERGE (o)-[:USES_MACHINE {workcenter_id: row.WorkCenterID, machine_alias: row.MachineAlias}]->(m)
    FOREACH (_ IN CASE WHEN row.ClusterID IS NULL OR row.ClusterID = '' THEN [] ELSE [1] END |
      MERGE (cl:Cluster {ClusterID: row.ClusterID})
      MERGE (o)-[:IN_CLUSTER {cluster_id: row.ClusterID}]->(cl)
    )
    `,
        (r) => {
            const jnum = trim(r.JobNum);
            const opdesc = trim(r.OperationDesc);
            const opseq = toInt(r.OperSeq);
            const alias = trim(r.Machine);

            return {
                JobNum: jnum,
                OperSeq: opseq,
                WorkCenterID: trim(r.WorkCenterID),
                OperationDesc: opdesc,
                StdSetupHrs: toFloat(r.StdSetupHrs),
                StdRunHrsPerUnit: toFloat(r.StdRunHrsPerUnit),
                PlannedStart: trim(r.PlannedStart),
                PlannedEnd: trim(r.PlannedEnd),
                ActualStart: trim(r.ActualStart),
                ActualEnd: trim(r.ActualEnd),
                MachineAlias: alias,
                QtyComplete: toInt(r.QtyComplete),
                QtyScrap: toInt(r.QtyScrap),
                SetupHrs: toFloat(r.SetupHrs),
                RunHrs: toFloat(r.RunHrs),
                MoveHrs: toFloat(r.MoveHrs),
                QueueHrs: toFloat(r.QueueHrs),
                Status: trim(r.Status),
                ClusterID: trim(r.SMKO_ClusterID),
                display_name: `Op ${opseq}: ${opdesc} (Job ${jnum})`,
                search_text: buildSearchText([jnum, opseq.toString(), opdesc, alias, trim(r.Status)])
            };
        }
    );

    // ---- 7) Employees
    console.log("Ingesting Employees...");
    const employees = await readCsvRows("jb_Employees.csv");
    await runBatches(
        graph,
        employees,
        `
    UNWIND $rows AS row
    MERGE (e:Employee {EmployeeID: row.EmployeeID})
    SET
      e.entity_type    = 'Employee',
      e.display_name   = row.display_name,
      e.search_text    = row.search_text,
      e.source         = 'jb_Employees.csv',
      e.EmployeeName = row.EmployeeName,
      e.Role         = row.Role,
      e.Shift        = row.Shift,
      e.HourlyRate   = row.HourlyRate
    `,
        (r) => {
            const eid = trim(r.EmployeeID);
            const name = trim(r.EmployeeName);

            return {
                EmployeeID: eid,
                EmployeeName: name,
                Role: trim(r.Role),
                Shift: trim(r.Shift),
                HourlyRate: toFloat(r.HourlyRate),
                display_name: name || eid,
                search_text: buildSearchText([eid, name, trim(r.Role), trim(r.Shift)])
            };
        }
    );

    // ---- 8) LaborDetails
    console.log("Ingesting LaborDetails...");
    const labor = await readCsvRows("jb_LaborDetails.csv");
    await runBatches(
        graph,
        labor,
        `
    UNWIND $rows AS row
    WITH row, (row.JobNum + '::' + toString(row.OperSeq)) AS opKey
    MERGE (e:Employee {EmployeeID: row.EmployeeID})
    MERGE (o:Operation {JobOperKey: opKey})
    MERGE (e)-[r:WORKED_ON]->(o)
    SET
      r.source   = 'jb_LaborDetails.csv',
      r.LaborID  = row.LaborID,
      r.LaborHrs = row.LaborHrs,
      r.SetupHrs = row.SetupHrs,
      r.RunHrs   = row.RunHrs,
      r.ClockIn  = row.ClockIn,
      r.ClockOut = row.ClockOut,
      r.Comment  = row.Comment
    `,
        (r) => ({
            LaborID: trim(r.LaborID),
            EmployeeID: trim(r.EmployeeID),
            JobNum: trim(r.JobNum),
            OperSeq: toInt(r.OperSeq),
            LaborHrs: toFloat(r.LaborHrs),
            SetupHrs: toFloat(r.SetupHrs),
            RunHrs: toFloat(r.RunHrs),
            ClockIn: trim(r.ClockIn),
            ClockOut: trim(r.ClockOut),
            Comment: trim(r.Comment),
        })
    );

    console.log("✅ Ingestion complete.");
    db.close();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
