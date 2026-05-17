from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import torch
from india_disease_loader import load_state_disease_data
from symptom_ml.infer import predict_symptoms
from epidemic_models.forecast import run_epidemic_forecast
from data_sources import fetch_global_disease_trends

from pydantic import BaseModel

class SymptomRequest(BaseModel):
    text: str

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request, call_next):
    print(f"[REQUEST] {request.method} {request.url.path}")
    response = await call_next(request)
    print(f"[RESPONSE] {response.status_code}")
    return response

# ✅ INDIA HOTSPOTS (ANY DISEASE)
@app.get("/india-hotspots")
def india_hotspots(disease: str):
    return load_state_disease_data(disease)

# ✅ SYMPTOM AI ENDPOINT
@app.post("/ai-diagnosis")
def ai_diagnosis(item: SymptomRequest):
    results = predict_symptoms(item.text)
    # Return structured format: { primary: [name, prob], all: [[name, prob], ...] }
    return {
        "primary": results[0] if results else ["Unknown", 0.0],
        "all": results
    }

# ✅ GLOBAL TRENDS BY DISEASE
@app.get("/global-trends")
def global_trends(disease: str):
    return fetch_global_disease_trends(disease)

# ✅ HEALTH CHECK
@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "backend": "FastAPI",
        "gpu_available": torch.cuda.is_available() if "torch" in globals() else False
    }

# ✅ PANDEMIC FORECAST ENGINE
@app.get("/global-forecast")
def global_forecast(disease: str):
    return run_epidemic_forecast(disease)

# ✅ SERVE FRONTEND STATIC FILES
from fastapi.staticfiles import StaticFiles
import os

frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))
app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
