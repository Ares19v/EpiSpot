import numpy as np
from scipy.integrate import odeint

def seir_model(y, t, beta, sigma, gamma):
    S, E, I, R = y
    dS = -beta * S * I
    dE = beta * S * I - sigma * E
    dI = sigma * E - gamma * I
    dR = gamma * I
    return dS, dE, dI, dR

