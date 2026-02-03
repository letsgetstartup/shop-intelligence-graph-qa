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
        conn.execute("SET session_replication_role = 'replica';")

        # Phase 1: Truncate all tables first
        print('Phase 1: Truncating all tables...')
        with conn.cursor() as cur:
            for sheet in sheets:
                table = sheet.replace('"', '""')
                cur.execute(f'TRUNCATE TABLE shop."{table}" CASCADE;')
        
        # Phase 2: Load data
        print('Phase 2: Loading data...')
        for sheet in sheets:
            df = pd.read_excel(excel_path, sheet_name=sheet)
            df = df.where(pd.notnull(df), None)
            
            table = sheet.replace('"', '""')
            if len(df) == 0:
                print(f'Skipping empty sheet: {sheet}')
                continue
                
            print(f'Loading {sheet} -> shop."{table}" ({len(df)} rows)')
            
            # Numeric cleanup
            for col in df.columns:
                if pd.api.types.is_float_dtype(df[col]):
                    try:
                        non_null = df[col].dropna()
                        if not non_null.empty and (non_null % 1 == 0).all():
                            df[col] = df[col].astype('Int64')
                    except:
                        pass
            
            buf = io.StringIO()
            df.to_csv(buf, index=False)
            buf.seek(0)

            quote = '"'
            cols = ', '.join([f'{quote}{c.replace(quote, quote+quote)}{quote}' for c in df.columns])
            copy_sql = f'COPY shop."{table}" ({cols}) FROM STDIN WITH CSV HEADER'
            
            with conn.cursor() as cur:
                with cur.copy(copy_sql) as copy:
                    copy.write(buf.getvalue())

        conn.commit()
    print('Done.')

if __name__ == '__main__':
    main()
