import json
import os
import pandas as pd
from io import StringIO

DATA_DIR = "data/raw"
FILES = {
    "allocated_limit": "Allocated Limit",
    "total_expenditure": "Total Expenditure",
    "total_works_recommended": "Total Works Recommended",
    "total_works_completed": "Total Works Completed"
}

def analyze_file(name, key):
    filepath = os.path.join(DATA_DIR, f"{name}.json")
    print(f"## Analysis of {name}")
    
    try:
        with open(filepath, 'r') as f:
            data = json.load(f)
        
        # Parse inner JSON string
        inner_data_str = data.get(key)
        if not inner_data_str:
            print("Error: Key not found or empty.")
            return

        inner_data = json.loads(inner_data_str)
        df = pd.DataFrame(inner_data)
        
        print(f"* **Total Records:** {len(df)}")
        print(f"* **Columns:** {', '.join(df.columns)}")
        
        print("\n### Column Details:")
        for col in df.columns:
            unique_count = df[col].nunique()
            null_count = df[col].isnull().sum()
            sample_val = df[col].iloc[0] if len(df) > 0 else "N/A"
            print(f"* **{col}**: Unique={unique_count}, Nulls={null_count}, Sample='{sample_val}'")

        if 'MP_NAME' in df.columns:
            print(f"\n* **Top 5 MPs by frequency:**\n{df['MP_NAME'].value_counts().head(5).to_markdown()}")
            
        print("\n" + "-"*40 + "\n")
        
    except Exception as e:
        print(f"Error analyzing {name}: {e}")

def main():
    print("# Data Analysis Report\n")
    for name, key in FILES.items():
        analyze_file(name, key)

if __name__ == "__main__":
    main()
