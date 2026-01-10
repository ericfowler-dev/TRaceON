import pandas as pd
import sys

# Force UTF-8 output
sys.stdout.reconfigure(encoding='utf-8')

# Read the Excel file
file_path = r"c:\Users\efowler\Projects\bms-analyzer\BMS Log File Example.xlsx"

print("=" * 80)
print("ANALYZING BMS LOG FILE")
print("=" * 80)

# Get all sheet names
xl_file = pd.ExcelFile(file_path)
print("\n1. SHEETS PRESENT:")
print("-" * 80)
for i, sheet in enumerate(xl_file.sheet_names, 1):
    print(f"{i}. {sheet}")

# Read each sheet to understand structure
for sheet_name in xl_file.sheet_names:
    print(f"\n{'=' * 80}")
    print(f"SHEET: {sheet_name}")
    print("=" * 80)

    df = pd.read_excel(file_path, sheet_name=sheet_name)

    print(f"\nShape: {df.shape[0]} rows x {df.shape[1]} columns")

    print("\n2. ALL COLUMN NAMES:")
    print("-" * 80)
    for i, col in enumerate(df.columns, 1):
        print(f"{i}. {col}")

    # Look for relay columns
    relay_cols = [col for col in df.columns if 'relay' in col.lower() or 'Relay' in col]
    if relay_cols:
        print(f"\n3. RELAY COLUMNS FOUND:")
        print("-" * 80)
        for col in relay_cols:
            print(f"- {col}")
            unique_values = df[col].unique()
            print(f"  Unique values: {unique_values}")
            print(f"  Value counts:")
            print(df[col].value_counts().to_string())

    # If Relay3 exists, show rows where it's CLOSED
    if 'Relay3' in df.columns:
        print(f"\n4. ROWS WHERE Relay3 = 'CLOSED':")
        print("-" * 80)
        relay3_closed = df[df['Relay3'] == 'CLOSED']
        if len(relay3_closed) > 0:
            print(f"Found {len(relay3_closed)} rows where Relay3 is CLOSED")
            print("\nFirst 5 rows (all columns):")
            pd.set_option('display.max_columns', None)
            pd.set_option('display.width', None)
            print(relay3_closed.head().to_string())
        else:
            # Try other possible values
            print("No rows with 'CLOSED', checking other values...")
            print(f"Relay3 unique values: {df['Relay3'].unique()}")

    # Look for cell balancing, heating, cooling, error columns
    print(f"\n5. OTHER IMPORTANT COLUMNS:")
    print("-" * 80)
    important_keywords = ['balanc', 'heat', 'cool', 'error', 'fault', 'alarm',
                          'temp', 'voltage', 'current', 'soc', 'soh', 'status',
                          'charge', 'discharge', 'cell']

    for keyword in important_keywords:
        matching_cols = [col for col in df.columns if keyword.lower() in col.lower()]
        if matching_cols:
            print(f"\nColumns containing '{keyword}':")
            for col in matching_cols:
                print(f"  - {col}")
                # Show sample values
                non_null_values = df[col].dropna().unique()[:10]
                if len(non_null_values) > 0:
                    print(f"    Sample values: {non_null_values}")

    print(f"\n6. FIRST FEW ROWS OF DATA:")
    print("-" * 80)
    pd.set_option('display.max_columns', None)
    print(df.head(3).to_string())

    print(f"\n7. DATA TYPES:")
    print("-" * 80)
    print(df.dtypes.to_string())
