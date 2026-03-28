from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from india_disease_loader import load_state_disease_data
from symptom_ml.infer import predict_symptoms
from epidemic_models.forecast import run_epidemic_forecast
from data_sources import fetch_global_disease_trends

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ INDIA HOTSPOTS (ANY DISEASE)
@app.get("/india-hotspots")
def india_hotspots(disease: str):
    return load_state_disease_data(disease)

# ✅ AI SYMPTOM ML
@app.post("/ai-diagnosis")
def ai_diagnosis(payload: dict):
    return predict_symptoms(payload["text"])

# ✅ GLOBAL TRENDS BY DISEASE
@app.get("/global-trends")
def global_trends(disease: str):
    return fetch_global_disease_trends(disease)

# ✅ PANDEMIC FORECAST ENGINE
@app.get("/global-forecast")
def global_forecast(disease: str):
    return run_epidemic_forecast(disease)
