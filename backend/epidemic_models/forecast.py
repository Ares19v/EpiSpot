import numpy as np
from .seir import seir_model
from scipy.integrate import odeint

def run_epidemic_forecast(disease):
    S, E, I, R = 0.99, 0.005, 0.005, 0.0
    beta, sigma, gamma = 0.4, 0.2, 0.1
    t = np.linspace(0, 180, 180)

    sol = odeint(seir_model, (S, E, I, R), t, args=(beta, sigma, gamma))
    return {
        "projection_days": 180,
        "infected_curve": sol[:,2].tolist()
    }
