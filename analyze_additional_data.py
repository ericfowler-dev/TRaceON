import pandas as pd
import sys

# Force UTF-8 output
sys.stdout.reconfigure(encoding='utf-8')

# Read the Excel file
file_path = r"c:\Users\efowler\Projects\bms-analyzer\BMS Log File Example.xlsx"

print("=" * 80)
print("ADDITIONAL DATA ANALYSIS")
print("=" * 80)

# Check balancing state
print("\n" + "=" * 80)
print("BALANCING STATE DETAILED ANALYSIS:")
print("=" * 80)
df_bal = pd.read_excel(file_path, sheet_name='Balancing state 0x86')

print(f"Total rows: {len(df_bal)}")
print(f"\nFirst 5 rows:")
print(df_bal.head().to_string())

# Check unique values in balancing state columns
print("\nUnique values in balancing state columns:")
bal_cols = [col for col in df_bal.columns if 'Balancing state' in col]
for col in bal_cols[:5]:  # Check first 5
    unique_vals = df_bal[col].unique()
    print(f"{col}: {unique_vals}")

# Check if any balancing is active
print("\nChecking for active balancing (non-zero/non-'No Balance' values):")
for col in bal_cols:
    active_count = len(df_bal[df_bal[col] != 'No Balance'])
    if active_count > 0:
        print(f"{col}: {active_count} rows with active balancing")
        print(f"  Values: {df_bal[df_bal[col] != 'No Balance'][col].unique()}")

# Check temperatures
print("\n" + "=" * 80)
print("TEMPERATURE DATA ANALYSIS:")
print("=" * 80)
df_temp = pd.read_excel(file_path, sheet_name='Temperatures 0x09')

print(f"Total rows: {len(df_temp)}")
print(f"Total columns: {len(df_temp.columns)}")

print("\nAll temperature columns:")
for i, col in enumerate(df_temp.columns, 1):
    col_safe = col.encode('ascii', 'replace').decode('ascii')
    print(f"{i}. {col_safe}")

print("\nFirst 3 rows of temperature data:")
print(df_temp.head(3).to_string())

# Check Enable/Disable data
print("\n" + "=" * 80)
print("ENABLE & DISABLE DATA ANALYSIS:")
print("=" * 80)
df_enable = pd.read_excel(file_path, sheet_name='Enable&disable data 0x97')

print(f"Total rows: {len(df_enable)}")
print(f"Total columns: {len(df_enable.columns)}")

print("\nColumns:")
for i, col in enumerate(df_enable.columns, 1):
    col_safe = col.encode('ascii', 'replace').decode('ascii')
    print(f"{i}. {col_safe}")

if len(df_enable) > 0:
    print("\nFirst row:")
    print(df_enable.iloc[0].to_string())

# Check (Dis)charged energy
print("\n" + "=" * 80)
print("(DIS)CHARGED ENERGY ANALYSIS:")
print("=" * 80)
df_energy = pd.read_excel(file_path, sheet_name='(Dis)charged energy 0x89')

print(f"Total rows: {len(df_energy)}")
print(f"Total columns: {len(df_energy.columns)}")

print("\nColumns:")
for i, col in enumerate(df_energy.columns, 1):
    col_safe = col.encode('ascii', 'replace').decode('ascii')
    print(f"{i}. {col_safe}")

if len(df_energy) > 0:
    print("\nFirst few rows:")
    print(df_energy.head(3).to_string())

# Check Device info
print("\n" + "=" * 80)
print("DEVICE INFO ANALYSIS:")
print("=" * 80)
df_device = pd.read_excel(file_path, sheet_name='Device info. 0x92')

print(f"Total rows: {len(df_device)}")
print(f"Total columns: {len(df_device.columns)}")

print("\nColumns:")
for i, col in enumerate(df_device.columns, 1):
    col_safe = col.encode('ascii', 'replace').decode('ascii')
    print(f"{i}. {col_safe}")

if len(df_device) > 0:
    print("\nFirst row:")
    first_row = df_device.iloc[0]
    for col in df_device.columns:
        col_safe = col.encode('ascii', 'replace').decode('ascii')
        print(f"{col_safe}: {first_row[col]}")
