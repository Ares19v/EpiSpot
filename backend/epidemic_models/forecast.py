import numpy as np
from .seir import seir_model
from scipy.integrate import odeint

def run_epidemic_forecast(disease):
    dis_lower = (disease or '').lower()
    
    # 1. Disease-specific scientific SEIR constants
    if "covid" in dis_lower:
        # High infectivity, moderate incubation/recovery
        beta, sigma, gamma = 0.58, 0.25, 0.14
    elif "dengue" in dis_lower:
        # Vector-borne cycles, moderate incubation, longer illness duration
        beta, sigma, gamma = 0.36, 0.15, 0.10
    elif "malaria" in dis_lower:
        # Slow mosquito transmission, long incubation, long latency
        beta, sigma, gamma = 0.28, 0.08, 0.07
    elif "h1n1" in dis_lower or "influenza" in dis_lower or "flu" in dis_lower:
        # Fast aerosol transmission, extremely rapid incubation and recovery
        beta, sigma, gamma = 0.52, 0.50, 0.25
    else:
        # Default placeholder parameters
        beta, sigma, gamma = 0.40, 0.20, 0.10

    S, E, I, R = 0.99, 0.005, 0.005, 0.0
    t = np.linspace(0, 180, 180)

    sol = odeint(seir_model, (S, E, I, R), t, args=(beta, sigma, gamma))
    return {
        "projection_days": 180,
        "infected_curve": sol[:,2].tolist()
    }
