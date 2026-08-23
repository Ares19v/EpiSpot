# 🛡️ EpiSpot Study Guide (From-Scratch)

Welcome to the beginner's learning guide for **EpiSpot**, an epidemiological surveillance dashboard and predictive forecasting suite. This guide will help you understand how mathematical modeling, data visualization, and AI work together in a public health dashboard.

---

## 🗺️ Architectural Map

EpiSpot consists of two main parts:
1. **Frontend (Dashboard UI)**: A modern, single-page application built using vanilla HTML5, CSS3, and JavaScript. It uses:
   - **Leaflet.js** to display an interactive vector choropleth map of India.
   - **Chart.js** to render high-contrast, glowing disease surge timelines.
2. **Backend (FastAPI Engine)**: A Python FastAPI application that provides:
   - **`/ai-diagnosis`**: BERT-based clinical symptom classification (with a smart fallback heuristic).
   - **`/india-hotspots`**: Local disease statistics loader.
   - **`/global-trends`**: Gaussian surge wave simulations.
   - **`/global-forecast`**: Numerical SEIR ODE epidemic projections.

---

## 📐 The Math: Numerical SEIR Compartmental Model

Epidemiologists divide a population into "compartments" to track how a disease spreads. In a classic **SEIR** model, we have:
*   **S (Susceptible)**: People who can catch the disease.
*   **E (Exposed)**: People who have caught the disease but are not yet infectious.
*   **I (Infectious)**: People who are actively spreading the disease.
*   **R (Recovered / Removed)**: People who recovered or passed away, and are no longer spreading it.

### Ordinary Differential Equations (ODEs)
The movement of the population between compartments is modeled using the following system:

$$\frac{dS}{dt} = -\frac{\beta \cdot S \cdot I}{N}$$

$$\frac{dE}{dt} = \frac{\beta \cdot S \cdot I}{N} - \sigma \cdot E$$

$$\frac{dI}{dt} = \sigma \cdot E - \gamma \cdot I$$

$$\frac{dR}{dt} = \gamma \cdot I$$

Where:
*   $\beta$ = Transmission rate
*   $\sigma$ = Incubation rate ($1 / \text{incubation period}$)
*   $\gamma$ = Recovery rate ($1 / \text{infectious duration}$)
*   $N$ = Total population ($S + E + I + R$)

### Solved in Python (Backend)
Using numerical integration methods (like Euler's method or Runge-Kutta), the backend computes the dynamic sizes of these compartments step-by-step over a projection timeline.

---

## 🧠 AI Symptom Diagnosis & Smart Fallbacks

The `/ai-diagnosis` endpoint uses a custom-trained **BERT** (`BertForSequenceClassification`) model to predict diseases from symptom descriptions. 

### Why is there a Heuristic Fallback?
Large model weight files (e.g., `model.bin` which is 439MB) are too heavy for GitHub's 100MB file limits and can make CI/CD pipelines slow.
*   **The Heuristic Fallback**: A rule-based text keyword matcher.
*   **How it works**: It parses the text for specific symptom keywords, calculates probability scores using an exponential probability scale (like a softmax function), and returns the results.
*   **Why it's smart**: The API response format is *identical* to BERT's output. If the actual BERT model isn't downloaded, the app still works 100% fine without throwing errors!

---

## 📈 CSV Data Analyzer

You can drag-and-drop a CSV file containing active/recovered/death data. The frontend processes it instantly on the client side using JavaScript (meaning it does not send the data to a server):
*   **Case Fatality Ratio (CFR)**: $\text{CFR} = \frac{\text{Deaths}}{\text{Confirmed Cases}} \times 100$
*   **Recovery Rate**: $\text{Recovery Rate} = \frac{\text{Recovered}}{\text{Confirmed Cases}} \times 100$
*   **Peak Surge**: Scans all rows to find the date with the highest single-day case spike.

---

## 🛠️ Step-by-Step Local Deployment

### 1. One-Click Script Setup
If you are on Windows:
*   Run `INSTALL.bat` to create a virtual environment (`.venv`) and install dependencies.
*   Run `Run_Project.bat` to spin up the backend and automatically load `http://localhost:8080/index.html` in your browser.
*   Run `UNINSTALL.bat` to clean up environment folders and logs when done.

### 2. Manual Commands
If you want to run it via commands:
```bash
# Navigate to the backend directory
cd backend

# Install dependencies
pip install -r ../requirements.txt

# Launch FastAPI using Uvicorn
uvicorn main:app --host 0.0.0.0 --port 8080
```
Then open your browser and navigate to `http://localhost:8080/index.html` to access the dashboard!
