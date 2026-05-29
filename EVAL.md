# EVAL — EpiSpot

> **Evaluation Date:** 2026-05-29
> **Evaluator:** Automated Portfolio Review
> **Maturity Level:** MVP

---

## 1. Project Purpose & Problem Statement

EpiSpot is an epidemiological surveillance dashboard and predictive forecasting platform aimed at public health officials and researchers. It addresses the lack of accessible, open-source tools that combine real-time disease hotspot visualization, mathematical epidemic modeling, and ML-powered symptom diagnosis in a single interface. The platform targets the Indian public health context specifically, with a 28-state/UT vector map and locally relevant disease datasets (Dengue, Malaria, H1N1, Chikungunya, COVID-19).

The SEIR compartmental model integration makes this genuinely useful for scenario planning — health officials can adjust transmission rate (β), incubation rate (σ), and recovery rate (γ) parameters and immediately visualize ICU/ventilator saturation projections. This is a real epidemiological tool, not just a data visualization dashboard.

---

## 2. Technical Architecture

EpiSpot is a two-container system: an **Nginx Alpine** container serves a Vanilla HTML/CSS/JS SPA and reverse-proxies API endpoints to a **FastAPI** backend. This follows the same Nginx-FastAPI pattern as Agent Smith.

**Backend modules**:
- `symptom_ml/infer.py` — BERT `BertForSequenceClassification` trained on 390+ clinical conditions. The critical engineering decision: the 439MB `model.bin` is gitignored (exceeds GitHub's 100MB limit); instead a smart keyword-matching heuristic fallback activates automatically on fresh clones, returning structurally identical output.
- `india_disease_loader` — CSV-based state-level disease data with regional weighting for the India hotspot map.
- `data_sources/global_trends` — Gaussian wave simulators for monsoon-seasonal disease surge modeling.
- `epidemic_models/seir` — Numerical SEIR ODE integrator with capacity deficit alarm logic (ICU, ventilator, bed saturation thresholds).

**Frontend**: Vanilla JS using Leaflet.js for the India GeoJSON vector map, Chart.js for trend visualizations, and client-side CSV parsing for the data analyzer module. No build tool dependency.

The journey.md documents four engineering phases: frontend bug fixes (GeoJSON property key case mismatch), ML deployment constraint resolution (the `model.bin` fallback), Docker containerization, and a security hardening phase that patched 9 Bandit-identified vulnerabilities.

---

## 3. Model/Algorithm Details

**Primary ML Model**: `BertForSequenceClassification` fine-tuned on a clinical symptom classification dataset covering 390+ conditions. Architecture choice is appropriate — BERT's bidirectional attention handles the multi-symptom input well. The model is CPU-inferred (no GPU requirement mentioned), which implies inference latency may be significant for large inputs.

**Heuristic Fallback**: Keyword extraction with exponential probability scaling (softmax over matched terms). Returns `[(disease, probability), ...]` — structurally identical to BERT output, preserving API contract. This is excellent engineering: CI passes and the app is 100% functional without the model weights.

**SEIR Model**: Classic 4-compartment ODE system (S, E, I, R) solved numerically. Parameters (β, σ, γ, N) are user-configurable. The capacity alarm system adds practical clinical utility beyond academic epidemiology.

**Monsoon Trend Simulator**: Gaussian wave functions modeling seasonal vector-borne disease cycles. This is a simulation, not a data-driven forecast — but it is clearly presented as such.

---

## 4. Strengths

- **Heuristic fallback for ML model weights** — solving the GitHub 100MB limit while maintaining CI green is creative and practically important engineering.
- **SEIR ODE integrator** — genuine mathematical epidemiology, not just chart decoration. The ICU capacity deficit alarms add clinical decision support value.
- **India GeoJSON choropleth map** — interactive multi-disease visualization of all 28 states/UTs is well-executed.
- **CI/CD with Bandit security audit** — 9 security vulnerabilities identified and patched (timeout enforcement, secure PyTorch loads, MD5 intent declaration, supply chain pinning).
- **Containerized multi-service deployment** — proper Docker Compose with health checks.
- **Windows one-click automation** — `INSTALL.bat`, `Run_Project.bat`, `UNINSTALL.bat` stack.
- **Drag-and-drop CSV analyzer** — client-side with CFR, recovery rate, and peak surge computation requires no backend round-trip.

---

## 5. Limitations & Known Gaps

- **BERT model not distributable** — 439MB model.bin is gitignored. Users get the heuristic fallback by default; the full BERT experience requires a separate model download step that is not scripted.
- **Vanilla JS frontend** — no component framework, build system, or module bundler. Scaling the codebase will become difficult.
- **Disease data is synthetic/static** — the CSV datasets and Gaussian trend simulators are not connected to live epidemiological data feeds (WHO, ICMR, IDSP). This significantly limits real-world utility.
- **No authentication** — the dashboard has zero access control, which is problematic for health data contexts.
- **No data export** — SEIR forecast outputs and hotspot data cannot be exported for reports.
- **Monsoon wave model is a simulation** — it is not calibrated against historical data, limiting its predictive validity.

---

## 6. Code Quality Assessment

**Structure**: Clean FastAPI module separation (`symptom_ml/`, `epidemic_models/`, `data_sources/`). The heuristic fallback is well-engineered and maintains API contract.

**Documentation**: README is solid with SEIR mathematical notation (LaTeX), architecture diagram, and feature descriptions. journey.md provides excellent engineering narrative.

**Tests**: `test_all.bat` references `backend/deep_test.py` — existence confirmed, but test suite depth is not fully documented.

**Security**: Notably strong — 9 Bandit findings patched, including secure PyTorch deserialization and supply chain pinning. This level of security awareness is uncommon in portfolio projects.

**Docker**: Multi-container with health checks; proper Nginx reverse proxy.

---

## 7. Maturity Breakdown

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 7/10 | All modules work; disease data is synthetic |
| Code Quality | 7/10 | Clean backend; vanilla JS frontend limits extensibility |
| Documentation | 8/10 | SEIR math notation, journey.md, architecture diagram |
| Scalability | 5/10 | No auth, no live data, vanilla JS |
| Security | 8/10 | Bandit audit passed; 9 issues patched |
| **Overall** | **7/10** | Technically impressive; data authenticity is the main gap |

---

## 8. Suggested Next Steps

1. **Connect to live epidemiological data** — integrate IDSP (India's Integrated Disease Surveillance Programme) API or WHO Open Data endpoints for real disease burden data. This would transform EpiSpot from a demo into a genuinely useful tool.
2. **Script model weight download** — add a `download_model.py` script (or `wget`/`curl` command) in `INSTALL.bat` that pulls the BERT `model.bin` from a cloud storage bucket (Hugging Face Hub, Google Drive). This makes the full ML experience accessible without manual steps.
3. **Add data export** — allow SEIR forecast curves and hotspot tables to be downloaded as CSV/PDF. This is table-stakes for public health decision support tools.

---

## 9. Verdict

EpiSpot is technically sophisticated — the combination of BERT symptom classification, SEIR ODE epidemiological modeling, and India-specific GeoJSON choropleth visualization in a single platform is genuinely impressive for a solo project. The engineering decisions around the ML model weight constraint (heuristic fallback maintaining API contract) and the Bandit security hardening demonstrate real production thinking. The critical limitation is that all disease data is synthetic/simulated rather than connected to live surveillance feeds, which keeps it in demo territory rather than becoming a genuinely deployable public health tool.

---
<p align="center">Made by Devansh Tyagi @ 2026</p>
