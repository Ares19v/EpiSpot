import pandas as pd

def load_state_disease_data(disease):
    path = f"data/{disease}_india.csv"
    df = pd.read_csv(path)

    result = {}
    for _, row in df.iterrows():
        result[row["state_code"]] = {
            "name": row["state"],
            "active": int(row["active"]),
            "delta": int(row["delta"]),
            "risk": row["risk"]
        }

    return result
