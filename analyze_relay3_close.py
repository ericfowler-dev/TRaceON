import pandas as pd
import sys

# Force UTF-8 output
sys.stdout.reconfigure(encoding='utf-8')

# Read the Excel file
file_path = r"c:\Users\efowler\Projects\bms-analyzer\BMS Log File Example.xlsx"

print("=" * 80)
print("RELAY 3 'Close' ANALYSIS")
print("=" * 80)

# Read System state sheet
df = pd.read_excel(file_path, sheet_name='System state 0x93')

print("\nSearching for rows where 'Relay 3' = 'Close'...")
relay3_close = df[df['Relay 3'] == 'Close']

print(f"\nFound {len(relay3_close)} rows where Relay 3 = 'Close'")

if len(relay3_close) > 0:
    print("\n" + "=" * 80)
    print("FIRST ROW WHERE RELAY 3 IS CLOSE:")
    print("=" * 80)

    # Show all columns for first matching row
    first_row = relay3_close.iloc[0]

    # Show relay states
    print("\nRELAY STATES:")
    print("-" * 80)
    relay_cols = [col for col in df.columns if col.startswith('Relay ') and not 'times' in col.lower() and not 'voltage' in col.lower()]
    for col in relay_cols:
        print(f"{col}: {first_row[col]}")

    # Show important system data
    print("\n" + "=" * 80)
    print("IMPORTANT SYSTEM DATA IN THIS ROW:")
    print("=" * 80)
    important_cols = ['Time', 'System state', 'Current(A)', 'Shown SOC（%）', 'Real SOC（%）',
                      'SOH（%）', 'Power volt', 'Acc. voltage(V)', 'HVBPOS(V)']

    for col in important_cols:
        if col in df.columns:
            print(f"{col}: {first_row[col]}")

    # Show fault states
    print("\n" + "=" * 80)
    print("FAULT/ERROR STATES:")
    print("=" * 80)
    fault_cols = [col for col in df.columns if 'fault' in col.lower() or 'error' in col.lower()]
    for col in fault_cols:
        print(f"{col}: {first_row[col]}")

    # Show all Relay 3 = Close rows summary
    print("\n" + "=" * 80)
    print("SUMMARY OF ALL RELAY 3 'Close' ROWS:")
    print("=" * 80)
    print(f"Time range: {relay3_close['Time'].min()} to {relay3_close['Time'].max()}")
    print(f"\nSystem states when Relay 3 is Close:")
    print(relay3_close['System state'].value_counts())

    print(f"\nCurrent(A) stats when Relay 3 is Close:")
    print(f"  Min: {relay3_close['Current(A)'].min()}")
    print(f"  Max: {relay3_close['Current(A)'].max()}")
    print(f"  Mean: {relay3_close['Current(A)'].mean():.2f}")

    # Show state of other relays when Relay 3 is Close
    print("\n" + "=" * 80)
    print("OTHER RELAY STATES WHEN RELAY 3 IS CLOSE:")
    print("=" * 80)
    for col in relay_cols:
        if col != 'Relay 3':
            print(f"\n{col}:")
            print(relay3_close[col].value_counts())

print("\n" + "=" * 80)
print("CHECKING PEAK DATA SHEET:")
print("=" * 80)
df_peak = pd.read_excel(file_path, sheet_name='Peak data 0x9B')
print(f"\nPeak data sheet - Rows: {df_peak.shape[0]}, Columns: {df_peak.shape[1]}")
print("\nColumns:")
for i, col in enumerate(df_peak.columns, 1):
    col_safe = col.encode('ascii', 'replace').decode('ascii')
    print(f"{i}. {col_safe}")

if len(df_peak) > 0:
    print("\nFirst row sample:")
    print(df_peak.iloc[0].to_string())

print("\n" + "=" * 80)
print("CHECKING CHARGING SHEET:")
print("=" * 80)
df_charging = pd.read_excel(file_path, sheet_name='Charging 0x99')
print(f"\nCharging sheet - Rows: {df_charging.shape[0]}, Columns: {df_charging.shape[1]}")
print("\nColumns:")
for i, col in enumerate(df_charging.columns, 1):
    col_safe = col.encode('ascii', 'replace').decode('ascii')
    print(f"{i}. {col_safe}")
