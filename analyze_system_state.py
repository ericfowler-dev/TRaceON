import pandas as pd
import sys
import json

# Force UTF-8 output
sys.stdout.reconfigure(encoding='utf-8')

# Read the Excel file
file_path = r"c:\Users\efowler\Projects\bms-analyzer\BMS Log File Example.xlsx"

print("=" * 80)
print("SYSTEM STATE SHEET ANALYSIS")
print("=" * 80)

# Read System state sheet
df = pd.read_excel(file_path, sheet_name='System state 0x93')

print(f"\nTotal rows: {df.shape[0]}")
print(f"Total columns: {df.shape[1]}")

print("\n" + "=" * 80)
print("ALL COLUMN NAMES:")
print("=" * 80)
for i, col in enumerate(df.columns, 1):
    # Encode to ASCII to avoid Unicode issues
    col_safe = col.encode('ascii', 'replace').decode('ascii')
    print(f"{i}. {col_safe}")

print("\n" + "=" * 80)
print("RELAY COLUMNS:")
print("=" * 80)
relay_cols = [col for col in df.columns if 'Relay' in col]
for col in relay_cols:
    print(f"\nColumn: {col}")
    unique_values = df[col].unique()
    print(f"Unique values: {unique_values}")
    print(f"Value counts:")
    print(df[col].value_counts())

print("\n" + "=" * 80)
print("LOOKING FOR Relay3 = 'CLOSED' ROWS:")
print("=" * 80)
if 'Relay3' in df.columns:
    relay3_closed = df[df['Relay3'] == 'CLOSED']
    print(f"Found {len(relay3_closed)} rows where Relay3 = 'CLOSED'")

    if len(relay3_closed) > 0:
        print("\nFirst row where Relay3 is CLOSED:")
        print(relay3_closed.iloc[0].to_string())

        print("\n" + "-" * 80)
        print("Checking all relay values in this row:")
        for col in relay_cols:
            print(f"{col}: {relay3_closed.iloc[0][col]}")
else:
    print("Relay3 column not found!")

print("\n" + "=" * 80)
print("OTHER IMPORTANT COLUMNS (Cell Balancing, Heating, Cooling, Errors):")
print("=" * 80)
important_keywords = ['balanc', 'heat', 'cool', 'error', 'fault', 'alarm', 'status', 'charge', 'discharge']

for keyword in important_keywords:
    matching_cols = [col for col in df.columns if keyword.lower() in col.lower()]
    if matching_cols:
        print(f"\nColumns containing '{keyword}':")
        for col in matching_cols:
            col_safe = col.encode('ascii', 'replace').decode('ascii')
            print(f"  - {col_safe}")
            unique_vals = df[col].unique()
            if len(unique_vals) <= 20:
                print(f"    Unique values: {unique_vals}")
            else:
                print(f"    Has {len(unique_vals)} unique values")

print("\n" + "=" * 80)
print("SAMPLE DATA (First 3 rows):")
print("=" * 80)
print(df.head(3).to_string())

print("\n" + "=" * 80)
print("CHECKING BALANCING STATE SHEET:")
print("=" * 80)
df_bal = pd.read_excel(file_path, sheet_name='Balancing state 0x86')
print(f"\nBalancing state sheet - Rows: {df_bal.shape[0]}, Columns: {df_bal.shape[1]}")
print("\nColumns:")
for i, col in enumerate(df_bal.columns, 1):
    col_safe = col.encode('ascii', 'replace').decode('ascii')
    print(f"{i}. {col_safe}")

print("\n" + "=" * 80)
print("CHECKING ALARM STATE SHEET:")
print("=" * 80)
df_alarm = pd.read_excel(file_path, sheet_name='Alarm state 0x87')
print(f"\nAlarm state sheet - Rows: {df_alarm.shape[0]}, Columns: {df_alarm.shape[1]}")
print("\nColumns:")
for i, col in enumerate(df_alarm.columns, 1):
    col_safe = col.encode('ascii', 'replace').decode('ascii')
    print(f"{i}. {col_safe}")

# Show sample alarm data
print("\nFirst row of alarm data:")
if len(df_alarm) > 0:
    print(df_alarm.iloc[0].to_string())
