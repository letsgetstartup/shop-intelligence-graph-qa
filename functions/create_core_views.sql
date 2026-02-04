-- QueryWeaver Schema Alignment Script
-- Creates core.* views aliasing qw.* views
-- Run this in production Postgres if core.* views don't exist

CREATE SCHEMA IF NOT EXISTS core;

-- Operations view (jobs, operations, machines)
CREATE OR REPLACE VIEW core.operations AS 
SELECT * FROM qw.operations;

-- Required tools per operation
CREATE OR REPLACE VIEW core.required_tools AS 
SELECT * FROM qw.required_tools;

-- Machine magazine status (loaded tools)
CREATE OR REPLACE VIEW core.machine_magazine AS 
SELECT * FROM qw.machine_magazine;

-- Tool inventory (available tools in crib)
CREATE OR REPLACE VIEW core.tool_inventory AS 
SELECT * FROM qw.tool_inventory;

-- Shift planning
CREATE OR REPLACE VIEW core.shift_plan AS 
SELECT * FROM qw.shift_plan;

-- NC program tools
CREATE OR REPLACE VIEW core.nc_program_tools AS 
SELECT * FROM qw.nc_program_tools;

-- Verification query
SELECT schemaname, viewname
FROM pg_views
WHERE schemaname = 'core'
ORDER BY viewname;
