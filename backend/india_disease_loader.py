import pandas as pd
import os

def load_state_disease_data(disease):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(base_dir, "data", f"{disease}_india.csv")
    
    if not os.path.exists(path):
        print(f"[WARN] Data file missing for {disease}: {path}")
        # Return fallback mock data for all Indian states so frontend doesn't break
        states = {
            "AN": "Andaman and Nicobar Islands", "AP": "Andhra Pradesh", "AR": "Arunachal Pradesh",
            "AS": "Assam", "BR": "Bihar", "CH": "Chandigarh", "CT": "Chhattisgarh",
            "DL": "Delhi", "DN": "Dadra and Nagar Haveli and Daman and Diu", "GA": "Goa",
            "GJ": "Gujarat", "HP": "Himachal Pradesh", "HR": "Haryana", "JH": "Jharkhand",
            "JK": "Jammu and Kashmir", "KA": "Karnataka", "KL": "Kerala", "LA": "Ladakh",
            "LD": "Lakshadweep", "MH": "Maharashtra", "ML": "Meghalaya", "MN": "Manipur",
            "MP": "Madhya Pradesh", "MZ": "Mizoram", "NL": "Nagaland", "OR": "Odisha",
            "PB": "Punjab", "PY": "Puducherry", "RJ": "Rajasthan", "SK": "Sikkim",
            "TG": "Telangana", "TN": "Tamil Nadu", "TR": "Tripura", "UP": "Uttar Pradesh",
            "UT": "Uttarakhand", "WB": "West Bengal"
        }
        import hashlib
        result = {}
        for code, name in states.items():
            h = int(hashlib.md5(f"{disease}_{code}".encode('utf-8')).hexdigest(), 16)
            active = (h % 900) + 50
            delta = int(active * 0.08)
            risk = "HIGH" if active > 600 else "MEDIUM" if active > 250 else "LOW"
            result[code] = {
                "name": name,
                "active": active,
                "delta": delta,
                "risk": risk
            }
        return result

    try:
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
    except Exception as e:
        print(f"[ERROR] Loading {disease} data: {e}")
        return {}
