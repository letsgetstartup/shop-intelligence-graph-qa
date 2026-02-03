#!/usr/bin/env python3
"""Load the Excel workbook (jb_* + kg_* sheets) into Postgres tables under schema `shop`.

This is a starter loader. In production you will likely:
- pull data from real systems (SolidCAM, tool crib, NC parser, machine snapshots)
- write into the same Postgres contract tables
- run the Graph Builder

Usage:
  python load_excel_to_postgres.py --excel ../solidcam_graph_simulated_production.xlsx --pg postgresql://user:pass@host:5432/db

Notes:
- The script TRUNCATEs destination tables (CASCADE) and reloads all rows.
- Column names must match the DB schema (this package's migrations do).
"""

import argparse
import io
import re
from pathlib import Path

import pandas as pd
import psycopg

SHEET_RE = re.compile(r'^(jb_|kg_)')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--excel', required=True, help='Path to the Excel workbook')
    ap.add_argument('--pg', required=True, help='Postgres connection string')
    args = ap.parse_args()

    excel_path = Path(args.excel)
    if not excel_path.exists():
        raise SystemExit(f'Excel not found: {excel_path}')

    xls = pd.ExcelFile(excel_path)
    sheets = [s for s in xls.sheet_names if SHEET_RE.match(s)]

    print(f'Found {len(sheets)} sheets: {sheets}')

    with psycopg.connect(args.pg) as conn:
        conn.execute('SET statement_timeout = 0;')
        conn.execute('SET lock_timeout = 0;')

        for sheet in sheets:
            df = pd.read_excel(excel_path, sheet_name=sheet)
            # Normalize NaN -> None
            df = df.where(pd.notnull(df), None)

            table = sheet.replace('"', '""')
            print(f'Loading {sheet} -> shop."{table}" ({len(df)} rows)')

            with conn.cursor() as cur:
                cur.execute(f'TRUNCATE TABLE shop."{table}" CASCADE;')

                if len(df) == 0:
                    continue

                buf = io.StringIO()
                df.to_csv(buf, index=False)
                buf.seek(0)

                cols = ', '.join([f'"{c.replace("\"","\"\"")}"' for c in df.columns])
                copy_sql = f'COPY shop."{table}" ({cols}) FROM STDIN WITH CSV HEADER'
                with cur.copy(copy_sql) as copy:
                    copy.write(buf.getvalue())

        conn.commit()

    print('Done.')

if __name__ == '__main__':
    main()
