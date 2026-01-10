import pandas as pd
import os
import sys

# Open output file with UTF-8 encoding
output_file = open(r"c:\Users\efowler\Projects\bms-analyzer\analysis_output.txt", "w", encoding="utf-8")

def output(text):
    output_file.write(text + "\n")
    output_file.flush()

files = [
    r"c:\Users\efowler\Projects\bms-analyzer\37504A4521063938040A16324E2B100F_20250114114310.xlsx",
    r"c:\Users\efowler\Projects\bms-analyzer\BMS Log File Example_2.xlsx",
    r"c:\Users\efowler\Projects\bms-analyzer\BMS Log File Example_01.xlsx",
    r"c:\Users\efowler\Projects\bms-analyzer\BMS Log File Example.xlsx",
    r"c:\Users\efowler\Projects\bms-analyzer\34504A45170A31381209163539031C17_20251223085259.xlsx",
    r"c:\Users\efowler\Projects\bms-analyzer\34504A45170A31381209163539031C17_20251217115303.xlsx"
]

output("=" * 100)
output("BMS FILE ANALYSIS")
output("=" * 100)

for idx, file_path in enumerate(files, 1):
    output(f"\n\n{'=' * 100}")
    output(f"FILE {idx}: {os.path.basename(file_path)}")
    output("=" * 100)

    try:
        # Get all sheet names
        xl_file = pd.ExcelFile(file_path)
        output(f"\n--- SHEET NAMES ---")
        for sheet_name in xl_file.sheet_names:
            output(f"  - {sheet_name}")

        # Analyze System state 0x93 sheet
        if "System state 0x93" in xl_file.sheet_names:
            output(f"\n--- SYSTEM STATE 0x93 SHEET ---")
            df = pd.read_excel(file_path, sheet_name="System state 0x93")
            output(f"Column names: {list(df.columns)}")
            output(f"Shape: {df.shape}")

            # Look for relay columns
            relay_cols = [col for col in df.columns if 'relay' in str(col).lower()]
            output(f"\nRelay columns found: {relay_cols}")

            if relay_cols:
                output(f"\nSample data from relay columns (first 10 rows):")
                output(df[relay_cols].head(10).to_string())
                output(f"\nUnique values in relay columns:")
                for col in relay_cols:
                    output(f"  {col}: {df[col].unique()[:20]}")  # First 20 unique values

        # Analyze Temperatures 0x09 sheet
        if "Temperatures 0x09" in xl_file.sheet_names:
            output(f"\n--- TEMPERATURES 0x09 SHEET ---")
            df = pd.read_excel(file_path, sheet_name="Temperatures 0x09")
            output(f"Column names: {list(df.columns)}")
            output(f"Shape: {df.shape}")

            # Get temperature columns (exclude timestamp/non-numeric)
            temp_cols = [col for col in df.columns if col not in ['timestamp', 'Timestamp']]
            output(f"\nTemperature columns: {temp_cols}")

            if temp_cols:
                output(f"\nSample temperature data (rows 0, 10, 20, 30, 40, 50, 60, 70, 80, 90):")
                sample_rows = [i for i in [0, 10, 20, 30, 40, 50, 60, 70, 80, 90] if i < len(df)]
                output(df.iloc[sample_rows][temp_cols[:10]].to_string())  # First 10 temp columns

                output(f"\nTemperature statistics for numeric columns:")
                numeric_temps = df[temp_cols].select_dtypes(include=['number'])
                if not numeric_temps.empty:
                    output(numeric_temps.describe().to_string())

        # Analyze Peak data 0x9B sheet
        if "Peak data 0x9B" in xl_file.sheet_names:
            output(f"\n--- PEAK DATA 0x9B SHEET ---")
            df = pd.read_excel(file_path, sheet_name="Peak data 0x9B")
            output(f"Column names: {list(df.columns)}")
            output(f"Shape: {df.shape}")

            # Look for temperature columns
            temp_cols = [col for col in df.columns if 'temp' in str(col).lower()]
            output(f"\nTemperature-related columns: {temp_cols}")

            if temp_cols:
                output(f"\nSample data (first 10 rows):")
                output(df[temp_cols].head(10).to_string())

        # Analyze Charging 0x99 sheet
        if "Charging 0x99" in xl_file.sheet_names:
            output(f"\n--- CHARGING 0x99 SHEET ---")
            df = pd.read_excel(file_path, sheet_name="Charging 0x99")
            output(f"Column names: {list(df.columns)}")
            output(f"Shape: {df.shape}")
            output(f"\nSample data (first 5 rows):")
            output(df.head(5).to_string())

        # Analyze (Dis)charged energy 0x89 sheet
        if "(Dis)charged energy 0x89" in xl_file.sheet_names:
            output(f"\n--- (DIS)CHARGED ENERGY 0x89 SHEET ---")
            df = pd.read_excel(file_path, sheet_name="(Dis)charged energy 0x89")
            output(f"Column names: {list(df.columns)}")
            output(f"Shape: {df.shape}")
            output(f"\nSample data (first 5 rows):")
            output(df.head(5).to_string())

        # Analyze Voltages 0x9A sheet
        if "Voltages 0x9A" in xl_file.sheet_names:
            output(f"\n--- VOLTAGES 0x9A SHEET ---")
            df = pd.read_excel(file_path, sheet_name="Voltages 0x9A")
            output(f"Column names: {list(df.columns)}")
            output(f"Shape: {df.shape}")

            # Get cell voltage columns
            cell_cols = [col for col in df.columns if col not in ['timestamp', 'Timestamp']]
            output(f"\nNumber of cell columns: {len(cell_cols)}")
            output(f"Cell columns: {cell_cols}")

            if cell_cols:
                numeric_cells = df[cell_cols].select_dtypes(include=['number'])
                if not numeric_cells.empty:
                    output(f"\nCell voltage statistics:")
                    output(numeric_cells.describe().to_string())
                    output(f"\nGlobal Min: {numeric_cells.min().min()}")
                    output(f"Global Max: {numeric_cells.max().max()}")

    except Exception as e:
        output(f"\nERROR analyzing file: {str(e)}")
        import traceback
        output(traceback.format_exc())

output(f"\n\n{'=' * 100}")
output("ANALYSIS COMPLETE")
output("=" * 100)

output_file.close()
print("Analysis complete! Output written to: c:\\Users\\efowler\\Projects\\bms-analyzer\\analysis_output.txt")
