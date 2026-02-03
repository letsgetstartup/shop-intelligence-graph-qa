# Sample Prompts for QueryWeaver

Send to `POST /queryweaver/query`

1) Missing tools next shift:
{"question":"What tools are missing for the next shift per machine?","params":{"shift_name":"NEXT"}}

2) Blocked operations:
{"question":"Which operations are blocked due to missing tool assemblies?"}

3) Tool usage by job:
{"question":"Show tool usage for a specific JobNum and its operations.","params":{"job_num":"J0001"}}

4) Magazine snapshot:
{"question":"Show machines and their loaded assemblies (magazine snapshot)."}

5) Compare NC vs required:
{"question":"Compare NC-called tools vs required tools for operations."}
