/* ---- Main Dashboard Logic ---- */

let chartInstances = {};
const ChartConfig = {
    darkGray: '#475569',
    lightText: '#FFFFFF',
    cyan: 'var(--color-secondary)',
    red: 'var(--color-danger)',
    yellow: 'var(--color-warning)',
    whiteBlue: '#c8deff',
    whiteBlueBackground: 'rgba(200,220,255,0.05)'
};

const chartOptions = (title) => ({
    responsive: true, maintainAspectRatio: false,
    plugins: {
        legend: { display: true, labels: { color: ChartConfig.lightText } },
        title: { display: true, text: title, color: ChartConfig.lightText, font: { size: 16 } }
    },
    scales: {
        x: { ticks: { color: ChartConfig.lightText }, grid: { color: ChartConfig.darkGray } },
        y: { ticks: { color: ChartConfig.lightText }, grid: { color: ChartConfig.darkGray }, beginAtZero: true }
    }
});

const ILLNESSES = [
    "Influenza (Seasonal Flu)", "Dengue Fever", "COVID-like Respiratory Infection",
    "Gastroenteritis (Stomach Infection)", "Migraine Episode", "Pneumonia"
];

const TRAINING_SEED = {
    "Influenza (Seasonal Flu)": ["I have fever, body pain and chills", "I feel fatigued and sore throat and fever", "High fever and headache with muscle aches"],
    "Dengue Fever": ["Severe headache behind the eyes and joint pain", "High fever with rash and muscle pain", "Sudden high fever and severe joint pains"],
    "COVID-like Respiratory Infection": ["Persistent cough and difficulty breathing and fever", "Loss of smell and taste with cough and fatigue", "Shortness of breath with fever and sore throat"],
    "Gastroenteritis (Stomach Infection)": ["Vomiting and diarrhea and abdominal pain", "Stomach cramps with nausea and watery stools", "Frequent vomiting and dehydration"],
    "Migraine Episode": ["Severe one-sided headache with light sensitivity", "Throbbing headache with nausea and visual aura", "Headache, sensitivity to light and sound"],
    "Pneumonia": ["High fever with chest pain and shallow breathing", "Productive cough, chest pain and difficulty breathing", "Rapid breathing, chest tightness and fever"]
};

const RED_FLAG_PATTERNS = [
    /shortness of breath|difficulty breathing|cant breathe|can't breathe|breathless/i,
    /chest pain|severe chest pain|pressure in chest/i,
    /blue lips|cyanosis|loss of consciousness|unconscious|fainting/i,
    /severe bleeding|vomiting blood|passing blood/i
];

const TREATMENT_RECOMMENDATIONS = {
    "Influenza (Seasonal Flu)": ["Rest and stay hydrated.", "Use antipyretics like paracetamol for fever.", "Seek medical care if symptoms worsen."],
    "Dengue Fever": ["Avoid NSAIDs (e.g., ibuprofen) due to bleeding risk.", "Maintain fluid intake (ORS).", "Seek medical attention for severe abdominal pain."],
    "COVID-like Respiratory Infection": ["Isolate, monitor oxygen saturation.", "Seek testing and medical advice for breathing difficulty.", "Rest and hydration."],
    "Gastroenteritis (Stomach Infection)": ["Oral rehydration (ORS).", "Small frequent meals.", "Seek care if severe dehydration occurs."],
    "Migraine Episode": ["Rest in a dark, quiet room.", "Identify triggers and stay hydrated.", "Seek medical help if headaches are sudden and severe."],
    "Pneumonia": ["Seek urgent medical evaluation; may require antibiotics.", "Monitor breathing and oxygen levels."]
};

/* ---- Frontend ML (USE + small classifier) ---- */
const illnessClassifier = {
    useModel: null,
    classifier: null,
    labelIndex: ILLNESSES.slice(),
    isReady: false,
    async load() {
        if (this.useModel) return;
        document.getElementById('ml-status-text').innerText = 'Loading Universal Sentence Encoder...';
        this.useModel = await use.load();
        document.getElementById('ml-status-text').innerText = 'USE loaded. Classifier not trained.';
    },
    async train(seed = TRAINING_SEED, epochs = 25) {
        if (!this.useModel) throw new Error('USE not loaded');
        const sentences = [];
        const labels = [];
        for (const [label, arr] of Object.entries(seed)) {
            for (const s of arr) {
                sentences.push(s);
                labels.push(this.labelIndex.indexOf(label));
            }
        }
        document.getElementById('ml-status-text').innerText = 'Embedding seed sentences...';
        const embeddings = await this.useModel.embed(sentences);
        const xs = embeddings;
        const ys = tf.tidy(() => tf.oneHot(tf.tensor1d(labels, 'int32'), this.labelIndex.length));

        const inputDim = xs.shape[1];
        const model = tf.sequential();
        model.add(tf.layers.dense({ inputShape: [inputDim], units: 256, activation: 'relu' }));
        model.add(tf.layers.dropout({ rate: 0.25 }));
        model.add(tf.layers.dense({ units: 64, activation: 'relu' }));
        model.add(tf.layers.dense({ units: this.labelIndex.length, activation: 'softmax' }));
        model.compile({ optimizer: tf.train.adam(0.001), loss: 'categoricalCrossentropy', metrics: ['accuracy'] });

        document.getElementById('ml-status-text').innerText = 'Training classifier (demo)...';
        await model.fit(xs, ys, {
            epochs,
            shuffle: true,
            callbacks: {
                onEpochEnd: (epoch, logs) => {
                    try {
                        const acc = logs.acc || logs.accuracy;
                        document.getElementById('ml-status-text').innerText =
                            `Training: epoch ${epoch+1}/${epochs} - loss ${logs.loss.toFixed(3)} acc ${acc ? (acc.toFixed(2)) : 'n/a'}`;
                    } catch(e){}
                }
            }
        });
        ys.dispose();
        this.classifier = model;
        this.isReady = true;
        document.getElementById('ml-status-text').innerText = 'ML classifier ready (in-browser fallback).';
    },
    async predict(text) {
        if (!this.isReady || !this.useModel) throw new Error('Classifier not ready');
        const emb = await this.useModel.embed([text]);
        const pred = tf.tidy(() => {
            const logits = this.classifier.predict(emb);
            return logits.arraySync()[0];
        });
        emb.dispose();
        return pred;
    }
};

async function startTraining(){
    try {
        document.getElementById('train-ml-btn').disabled = true;
        await illnessClassifier.load();
        await illnessClassifier.train(TRAINING_SEED, 25);
    } catch (err) {
        console.error('Training error', err);
        alert('ML training failed: ' + (err.message || err));
    } finally {
        document.getElementById('train-ml-btn').disabled = false;
    }
}

function heuristicDiagnose(text) {
    const lower = text.toLowerCase();
    const results = ILLNESSES.map(name => ({ name, prob: 0 }));
    const keywordMap = {
        "Influenza (Seasonal Flu)": ["fever","body pain","chills","headache","fatigue","sore throat"],
        "Dengue Fever": ["fever","joint pain","rash","eye pain","severe headache","platelet"],
        "COVID-like Respiratory Infection": ["cough","breathing","shortness of breath","fatigue","fever","loss of smell","loss of taste"],
        "Gastroenteritis (Stomach Infection)": ["vomiting","diarrhea","stomach pain","nausea"],
        "Migraine Episode": ["headache","light sensitivity","sound sensitivity","nausea"],
        "Pneumonia": ["cough","breathing","chest pain","fever","cold sweats","productive cough"]
    };
    ILLNESSES.forEach((ill, idx) => {
        const keys = keywordMap[ill] || [];
        let score = 0;
        keys.forEach(k => { if (lower.includes(k)) score += 1; });
        const prob = Math.min(1, score / Math.max(1, keys.length));
        results[idx].prob = prob + 0.01;
    });
    const sum = results.reduce((a,b)=>a + b.prob,0) || 1;
    return results.map(r => ({ name:r.name, prob: r.prob / sum }));
}

function detectRedFlags(text) {
    const matches = [];
    for (const r of RED_FLAG_PATTERNS) {
        if (r.test(text)) matches.push(r.source || r.toString());
    }
    return matches;
}

function computeSeverityScore(predictions, redFlags) {
    const top = predictions.slice().sort((a,b)=>b.prob-a.prob)[0] || { prob:0 };
    let score = Math.round(top.prob * 80);
    const criticalLabels = ["Pneumonia","Dengue Fever"];
    predictions.forEach(p => {
        for (const c of criticalLabels) {
            if (p.name.includes(c) && p.prob > 0.25) score += 10;
        }
    });
    score += Math.min(20, redFlags.length * 10);
    score = Math.min(100, Math.max(0, score));
    return score;
}

function estimateTimeline(score) {
    if (score >= 75) return { onset: 'Immediate (0-2 days)', peak: 'Early (3-7 days)', recovery: '7-30+ days' };
    else if (score >= 45) return { onset: 'Soon (1-4 days)', peak: 'Within 1 week', recovery: '2-4 weeks' };
    else return { onset: 'Gradual (2-7 days)', peak: '2-3 weeks', recovery: 'Within 2 weeks' };
}

function renderProbabilityChart(predictions) {
    const ctx = document.getElementById('probChart').getContext('2d');
    if (chartInstances['probChart']) chartInstances['probChart'].destroy();
    chartInstances['probChart'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: predictions.map(p => p.name),
            datasets: [{
                label:'Probability (%)',
                data: predictions.map(p => +(p.prob*100).toFixed(1)),
                backgroundColor: predictions.map(() => ChartConfig.cyan)
            }]
        },
        options: {
            indexAxis: 'y', responsive:true, maintainAspectRatio:false,
            plugins: { legend: { display:false }, title: { display:true, text:'Diagnosis Probabilities' } },
            scales: { x: { beginAtZero:true, max:100 }, y: { ticks: { color: ChartConfig.lightText } } }
        }
    });
}

function renderSeverityGauge(score) {
    const ctx = document.getElementById('severity-gauge').getContext('2d');
    if (chartInstances['severity-gauge']) chartInstances['severity-gauge'].destroy();
    chartInstances['severity-gauge'] = new Chart(ctx, {
        type:'doughnut',
        data: {
            labels:['Severity','Remaining'],
            datasets:[{
                data:[score,100-score],
                backgroundColor: [score >= 70 ? ChartConfig.red : score >= 40 ? ChartConfig.yellow : ChartConfig.cyan, 'rgba(255,255,255,0.06)'],
                borderWidth:0
            }]
        },
        options: { responsive:true, maintainAspectRatio:false, cutout:'70%', plugins:{ legend:{ display:false } } }
    });
    document.getElementById('severity-text').innerText = `Score: ${score}/100`;
}

function renderRecommendations(primary) {
    const container = document.getElementById('recommendations-list');
    container.innerHTML = '';
    const recs = TREATMENT_RECOMMENDATIONS[primary] || ["General care: rest, fluids, and seek medical advice."];
    recs.forEach(r => {
        const div = document.createElement('div');
        div.className = 'recommendation';
        div.innerHTML = `<div style="font-weight:600; margin-bottom:.25rem;">${primary}</div><div style="font-size:.95rem;">${r}</div>`;
        container.appendChild(div);
    });
}

async function runDiagnosis() {
    const text = (document.getElementById('symptom-input').value || '').trim();
    const summaryDiv = document.getElementById('diag-top-result');
    const timelineDiv = document.getElementById('diag-timeline');
    const redBanner = document.getElementById('red-flag-banner');

    if (!text) {
        summaryDiv.innerHTML = '<span style="color:var(--color-warning);">Please enter symptoms.</span>';
        return;
    }

    const redFlags = detectRedFlags(text);
    redBanner.style.display = redFlags.length > 0 ? 'block' : 'none';
    if (redFlags.length > 0) redBanner.innerHTML = `<i class="fas fa-exclamation-triangle"></i> URGENT: ${redFlags.length} red flag(s). Seek care.`;

    summaryDiv.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Analyzing...`;
    let predictions = null;

    try {
        const data = await fetchAiDiagnosis(text);
        predictions = data.all.map(([name, prob]) => ({ name, prob }));
    } catch (err) {
        console.warn("Backend AI failed, using fallback", err);
        if (illnessClassifier.isReady) {
            const probs = await illnessClassifier.predict(text);
            predictions = ILLNESSES.map((n,i) => ({ name: n, prob: +probs[i] }));
        } else {
            predictions = heuristicDiagnose(text);
        }
    }

    const sum = predictions.reduce((a,b) => a + b.prob, 0) || 1;
    predictions = predictions.map(p => ({ name: p.name, prob: p.prob / sum })).sort((a,b)=>b.prob-a.prob);
    const top = predictions[0];

    summaryDiv.innerHTML = `<strong>${top.name}</strong> — ${(top.prob*100).toFixed(1)}% (AI Risk Estimate)`;
    const severityScore = computeSeverityScore(predictions, redFlags);
    const timeline = estimateTimeline(severityScore);
    timelineDiv.innerHTML = `<strong>Onset:</strong> ${timeline.onset} • <strong>Peak:</strong> ${timeline.peak} • <strong>Recovery:</strong> ${timeline.recovery}`;

    renderProbabilityChart(predictions);
    renderSeverityGauge(severityScore);
    renderRecommendations(top.name);

    window.__lastDiagnosis = { inputText: text, predictions, severityScore, timeline, redFlags, primaryName: top.name, timestamp: new Date().toISOString() };
}

function downloadDiagnosisReport() {
    const data = window.__lastDiagnosis;
    if (!data) return alert('Run diagnosis first.');
    const report = document.createElement('div');
    report.style.padding = '20px'; report.style.color = '#0f172a'; report.style.background = '#fff';
    report.innerHTML = `<h2>EpiSpot Report</h2><p>Generated: ${new Date().toLocaleString()}</p>
        <p><strong>Symptoms:</strong><br/>${data.inputText}</p>
        <p><strong>Prediction:</strong> ${data.primaryName} (${(data.predictions[0].prob*100).toFixed(1)}%)</p>
        <p><strong>Severity:</strong> ${data.severityScore}/100</p>`;
    html2pdf().from(report).save(`EpiSpot_Report_${Date.now()}.pdf`);
}

/* ---- India hotspots: map + state data ---- */
let indiaMap = null;
let indiaGeoLayer = null;
let indiaStateData = null;

function stateNameToCodeGuess(name) {
    if (!name) return null;
    const upper = name.toUpperCase().trim();
    if (INDIA_STATE_NAME_TO_CODE[upper]) return INDIA_STATE_NAME_TO_CODE[upper];
    return null;
}

function styleForStateFeature(feature) {
    const name = feature.properties?.ST_NM || feature.properties?.st_nm || feature.properties?.state_name || feature.properties?.NAME_1 || '';
    const code = stateNameToCodeGuess(name);
    const risk = (indiaStateData && code && indiaStateData[code]) ? indiaStateData[code].risk : 'NONE';
    return {
        weight: 0.8, color: '#0f172a', fillOpacity: 0.95,
        fillColor: risk === 'HIGH' ? '#ef4444' : risk === 'MEDIUM' ? '#facc15' : risk === 'LOW' ? '#22c55e' : '#4b5563'
    };
}

async function initIndiaMap() {
    if (indiaMap) return;
    indiaMap = L.map('india-map', { zoomControl: true, attributionControl: false }).setView([22.5, 80], 4.5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(indiaMap);
    const resp = await fetch(API_CONFIG.INDIA_STATES_GEOJSON);
    const geo = await resp.json();
    indiaGeoLayer = L.geoJSON(geo, {
        style: styleForStateFeature,
        onEachFeature: (feature, layer) => {
            const name = feature.properties?.ST_NM || feature.properties?.st_nm || feature.properties?.state_name || feature.properties?.NAME_1 || 'State';
            const code = stateNameToCodeGuess(name);
            let content = `<strong>${name}</strong>`;
            if (code && indiaStateData && indiaStateData[code]) {
                const d = indiaStateData[code];
                content += `<br/>Active: ${d.active.toLocaleString()}<br/>Risk: ${d.risk}`;
            }
            layer.bindTooltip(content, { sticky:true });
        }
    }).addTo(indiaMap);
}

async function updateHotspotData(diseaseKey) {
    const tableBody = document.getElementById('hotspot-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';
    try {
        indiaStateData = (diseaseKey === 'covid') ? await fetchIndiaCovidStateData() : await fetchBackendDiseaseStateData(diseaseKey);
        tableBody.innerHTML = '';
        Object.values(indiaStateData).filter(s => s.code).sort((a,b)=>b.active - a.active).forEach(item => {
            const row = tableBody.insertRow();
            const color = item.risk === 'HIGH' ? '#ef4444' : item.risk === 'MEDIUM' ? '#facc15' : '#22c55e';
            row.innerHTML = `<td>${item.name}</td><td style="color:${color}; font-weight:600;">${item.risk}</td><td>${item.active.toLocaleString()}</td><td>${item.delta.toLocaleString()}</td>`;
        });
        if (indiaGeoLayer) {
            indiaGeoLayer.setStyle(styleForStateFeature);
            indiaGeoLayer.eachLayer(layer => {
                const feature = layer.feature;
                const name = feature.properties?.ST_NM || feature.properties?.st_nm || feature.properties?.state_name || feature.properties?.NAME_1 || 'State';
                const code = stateNameToCodeGuess(name);
                let content = `<strong>${name}</strong>`;
                if (code && indiaStateData && indiaStateData[code]) {
                    const d = indiaStateData[code];
                    content += `<br/>Active: ${d.active.toLocaleString()}<br/>Risk: ${d.risk}`;
                }
                layer.unbindTooltip();
                layer.bindTooltip(content, { sticky: true });
            });
        }
    } catch (err) {
        tableBody.innerHTML = '<tr><td colspan="4">Error loading data.</td></tr>';
    }
}

/* ---- Charts & Forecasts ---- */
async function renderGlobalTrendChart() {
    const canvas = document.getElementById('global-trend-chart');
    if (!canvas) return;
    const diseaseKey = document.getElementById('global-disease-select')?.value || 'covid';
    try {
        const data = await fetchGlobalTrends(diseaseKey);
        const cases = data.cases || {};
        const dates = Object.keys(cases).sort((a,b)=> new Date(a) - new Date(b));
        const daily = dates.map((d, i) => i === 0 ? 0 : Math.max(0, cases[d] - cases[dates[i-1]]));
        
        if (chartInstances['global-trend-chart']) chartInstances['global-trend-chart'].destroy();
        chartInstances['global-trend-chart'] = new Chart(canvas.getContext('2d'), {
            type:'line',
            data:{ labels: dates, datasets:[{ label:'New Cases', data: daily, borderColor: ChartConfig.lightText, backgroundColor: ChartConfig.whiteBlueBackground, fill:true }] },
            options: chartOptions(`Global ${diseaseKey.toUpperCase()} Trends`)
        });
    } catch (e) { console.error(e); }
}

async function runResourceForecast() {
    const outputDiv = document.getElementById("resource-forecast-output");
    if (!outputDiv) return;

    const beds = parseInt(document.getElementById("beds-available")?.value) || 0;
    const icu = parseInt(document.getElementById("icu-occupancy")?.value) || 0;
    const vents = parseInt(document.getElementById("vent-inventory")?.value) || 0;
    const duration = parseInt(document.getElementById("forecast-duration")?.value) || 90;
    const diseaseKey = document.getElementById('hotspot-disease-select')?.value || 'covid';

    outputDiv.innerHTML = `<p style="color:#94a3b8; text-align:center;">
        <i class="fas fa-spinner fa-spin"></i> Querying epidemic forecast backend for ${diseaseKey.toUpperCase()}...
    </p>`;

    try {
        const data = await fetchResourceForecast(diseaseKey);
        const curve = data.infected_curve || [];
        const horizon = Math.min(duration, curve.length);

        const POPULATION = 10000000;
        const projectedCases = Math.round(
            curve.slice(0, horizon).reduce((sum, p) => sum + p * POPULATION, 0)
        );

        const hosp = Math.round(projectedCases * 0.10);
        const icuNeed = Math.round(projectedCases * 0.03);
        const ventNeed = Math.round(projectedCases * 0.01);

        const bedDeficit = Math.max(0, hosp - beds);
        const ventDeficit = Math.max(0, ventNeed - vents);

        const currentlyUsedBeds = (beds * (icu / 100));
        const peakBedUse = Math.min(130, Math.round(((currentlyUsedBeds + hosp) / (beds || 1)) * 100));

        outputDiv.innerHTML = `
            <p style="font-weight:600;color:${ bedDeficit > 0 || ventDeficit > 0 ? "var(--color-danger)" : "var(--color-success)"}">
                Forecast Status (${duration} days, disease: ${diseaseKey.toUpperCase()}):
                ${ bedDeficit > 0 || ventDeficit > 0 ? "System likely overloaded" : "Capacity likely manageable" }
            </p>

            <div class="resource-metric" style="display:flex; justify-content:space-between; margin-bottom:.5rem; border-bottom:1px solid #334155; padding-bottom:.25rem;">
                <span class="metric-label">Projected infections (approx.)</span>
                <span class="metric-value" style="font-weight:600;">${projectedCases.toLocaleString()}</span>
            </div>
            <div class="resource-metric" style="display:flex; justify-content:space-between; margin-bottom:.5rem; border-bottom:1px solid #334155; padding-bottom:.25rem;">
                <span class="metric-label">Predicted Hospitalizations</span>
                <span class="metric-value" style="font-weight:600;">${hosp.toLocaleString()}</span>
            </div>
            <div class="resource-metric" style="display:flex; justify-content:space-between; margin-bottom:.5rem; border-bottom:1px solid #334155; padding-bottom:.25rem;">
                <span class="metric-label">ICU Beds Required</span>
                <span class="metric-value" style="font-weight:600;">${icuNeed.toLocaleString()}</span>
            </div>
            <div class="resource-metric" style="display:flex; justify-content:space-between; margin-bottom:.5rem; border-bottom:1px solid #334155; padding-bottom:.25rem;">
                <span class="metric-label">Ventilators Required</span>
                <span class="metric-value" style="font-weight:600;">${ventNeed.toLocaleString()}</span>
            </div>

            <h5 style="margin-top:1rem; border-bottom:1px solid #334155; padding-bottom:.25rem;">Capacity Gaps</h5>
            <div class="resource-metric" style="display:flex; justify-content:space-between; margin-bottom:.5rem; border-bottom:1px solid #334155; padding-bottom:.25rem;">
                <span class="metric-label">Bed Deficit</span>
                <span class="metric-value" style="color:${ bedDeficit > 0 ? "var(--color-danger)" : "var(--color-success)"}; font-weight:600;">
                    ${ bedDeficit > 0 ? "+"+bedDeficit.toLocaleString() : "Sufficient" }
                </span>
            </div>
            <div class="resource-metric" style="display:flex; justify-content:space-between; margin-bottom:.5rem; border-bottom:1px solid #334155; padding-bottom:.25rem;">
                <span class="metric-label">Ventilator Deficit</span>
                <span class="metric-value" style="color:${ ventDeficit > 0 ? "var(--color-danger)" : "var(--color-success)"}; font-weight:600;">
                    ${ ventDeficit > 0 ? "+"+ventDeficit.toLocaleString() : "Sufficient" }
                </span>
            </div>
            <div class="resource-metric" style="display:flex; justify-content:space-between; margin-bottom:.5rem;">
                <span class="metric-label">Peak Bed Utilization (approx.)</span>
                <span class="metric-value" style="font-weight:600;">${peakBedUse}%</span>
            </div>
        `;
    } catch (err) {
        console.error("resource forecast error", err);
        outputDiv.innerHTML = `<p style="color:var(--color-danger);">
            <i class="fas fa-times-circle"></i> Could not contact forecast backend.
        </p>`;
    }
}

let lastPredictionMetrics = null;

function computeRiskFromSnapshot(snapshot, yearsWindow) {
    const { current, hist, label, scope } = snapshot;
    const population = current.population || 0;
    const todayCases = current.todayCases || 0;
    const cases = current.cases || 0;
    const deaths = current.deaths || 0;
    const active = current.active || 0;

    const casesPerMillion = current.casesPerOneMillion || (population ? (cases / population) * 1e6 : 0);
    const deathsPerMillion = current.deathsPerOneMillion || (population ? (deaths / population) * 1e6 : 0);
    const dailyPerMillion = population ? (todayCases / population) * 1e6 : 0;

    let growthRate = 0;
    let rtApprox = 0;
    try {
    let histCases = {};
    if (Array.isArray(hist)) {
        hist.forEach(prov => {
            const casesObj = prov.cases || prov.timeline?.cases || {};
            for (const [date, val] of Object.entries(casesObj)) {
                histCases[date] = (histCases[date] || 0) + (val || 0);
            }
        });
    } else {
        histCases = hist.cases || hist.timeline?.cases || {};
    }
    const dates = Object.keys(histCases).sort((a,b)=> new Date(a) - new Date(b));
        const newSeries = [];
        for (let i=1;i<dates.length;i++) {
            newSeries.push(Math.max(0, (histCases[dates[i]]||0) - (histCases[dates[i-1]]||0)));
        }
        if (newSeries.length >= 28) {
            const last7 = newSeries.slice(-7);
            const prev7 = newSeries.slice(-14, -7);
            const meanLast7 = last7.reduce((a,b)=>a+b,0) / 7;
            const meanPrev7 = prev7.reduce((a,b)=>a+b,0) / 7 || 1;
            growthRate = ((meanLast7 - meanPrev7) / meanPrev7) * 100;
            rtApprox = meanPrev7 > 0 ? meanLast7 / meanPrev7 : 0;
        }
    } catch(e) {
        console.warn('growth/rt computation failed', e);
    }

    let score = 0;

    if (casesPerMillion > 150000) score += 25;
    else if (casesPerMillion > 80000) score += 18;
    else if (casesPerMillion > 30000) score += 10;
    else if (casesPerMillion > 10000) score += 5;

    if (dailyPerMillion > 20) score += 30;
    else if (dailyPerMillion > 10) score += 22;
    else if (dailyPerMillion > 5) score += 15;
    else if (dailyPerMillion > 1) score += 8;

    if (growthRate > 50) score += 20;
    else if (growthRate > 20) score += 14;
    else if (growthRate > 5) score += 8;
    else if (growthRate < -20) score -= 8;

    if (rtApprox > 1.3) score += 15;
    else if (rtApprox > 1.1) score += 10;
    else if (rtApprox > 1.0) score += 5;
    else if (rtApprox < 0.9) score -= 5;

    const crudeIFR = cases > 0 ? (deaths / cases) * 100 : 0;
    if (crudeIFR > 2) score += 10;
    else if (crudeIFR > 1) score += 5;

    const windowFactor = Math.min(1.5, Math.max(0.7, yearsWindow / 3));
    score = Math.round(Math.max(0, Math.min(100, score * windowFactor)));

    let riskLevel = 'LOW';
    if (score >= 70) riskLevel = 'HIGH';
    else if (score >= 40) riskLevel = 'MEDIUM';

    return {
        score,
        riskLevel,
        label,
        scope,
        metrics: {
            population, todayCases, cases, deaths, active,
            casesPerMillion, deathsPerMillion, dailyPerMillion,
            growthRate, rtApprox, crudeIFR
        }
    };
}

async function runPrediction() {
    const location = (document.getElementById('location-input')?.value || 'Global').trim();
    const diseaseType = document.getElementById('disease-type-input')?.value || 'covid-variants';
    const dataPeriodYears = parseInt(document.getElementById('data-period-input')?.value) || 3;

    const outputDiv = document.getElementById('prediction-output');
    const riskDisplay = document.getElementById('risk-display');
    const citationsDiv = document.getElementById('prediction-citations');

    if (!outputDiv) return;

    outputDiv.innerHTML = `<p style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Contacting live COVID-19 epidemic APIs...</p>`;
    if (riskDisplay) riskDisplay.style.display = 'none';
    if (citationsDiv) citationsDiv.innerHTML = '';

    try {
        const snapshot = await fetchRegionSnapshot(location);
        const risk = computeRiskFromSnapshot(snapshot, dataPeriodYears);
        lastPredictionMetrics = risk;

        const m = risk.metrics;
        const diseaseLabel = diseaseType === 'covid-variants'
            ? 'COVID-19 and major variants'
            : diseaseType === 'all'
                ? 'COVID-19 as a proxy for overall respiratory/infectious risk'
                : `${diseaseType} (approximated via COVID-19 trend; specific pathogen data not wired)`;

        const narrative = `
            <p><strong><i class="fas fa-globe"></i> Region:</strong> ${risk.label} (${snapshot.scope === 'global' ? 'Global overview' : 'Country-level snapshot'})</p>
            <p><strong><i class="fas fa-virus"></i> Disease focus:</strong> ${diseaseLabel}</p>
            <p><strong><i class="fas fa-users"></i> Population (est.):</strong> ${m.population ? m.population.toLocaleString() : 'N/A'}</p>
            <p><strong><i class="fas fa-disease"></i> Total cases:</strong> ${m.cases.toLocaleString()} (${m.casesPerMillion.toFixed(0)} per million)</p>
            <p><strong><i class="fas fa-burst"></i> New cases (last 24h):</strong> ${m.todayCases.toLocaleString()} (${m.dailyPerMillion.toFixed(1)} per million)</p>
            <p><strong><i class="fas fa-heartbeat"></i> Deaths:</strong> ${m.deaths.toLocaleString()} (${m.deathsPerMillion.toFixed(1)} per million), crude IFR ≈ ${m.crudeIFR.toFixed(2)}%</p>
            <p><strong><i class="fas fa-chart-line"></i> Recent trend (last ~2 weeks):</strong>
                growth ≈ ${m.growthRate.toFixed(1)}%,
                Rt-like signal ≈ ${m.rtApprox ? m.rtApprox.toFixed(2) : 'N/A'}
            </p>
            <p style="margin-top: 0.75rem; border-top:1px solid #334155; padding-top:0.75rem;">
                <strong>EpiSpot composite risk score:</strong> <span style="font-weight:800;">${risk.score}/100</span>
                — categorised as <strong>${risk.riskLevel}</strong> for the next 3–6 months, based <em>only</em> on live COVID-19 surveillance indicators.
            </p>
            <p style="margin-top:0.75rem;font-size:0.8rem;color:#94a3b8;">
                <i class="fas fa-triangle-exclamation"></i> This tool uses public APIs and heuristic rules — it cannot
                reliably “predict” pandemics or replace professional epidemiological modelling.
            </p>
        `;
        outputDiv.innerHTML = narrative;

        if (riskDisplay) {
            riskDisplay.className = `risk-level risk-${risk.riskLevel.toLowerCase()}`;
            riskDisplay.style.display = 'block';
            riskDisplay.textContent = `Overall Epidemic Risk (COVID-based): ${risk.riskLevel}`;
        }

        if (citationsDiv) {
            citationsDiv.innerHTML = `
                <p style="font-size:0.8rem;">
                    <strong>Live data sources:</strong>
                    disease.sh Open Disease API (global & country COVID-19 statistics) and incovid19.org (India state panel).
                </p>
            `;
        }
    } catch (err) {
        console.error('runPrediction error', err);
        outputDiv.innerHTML = `<p style="color:var(--color-danger);">
            <i class="fas fa-times-circle"></i> Failed to fetch live epidemic data.
            Check your internet connection or that disease.sh is reachable.
        </p>`;
    }
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        if (lines.length < 2) {
            alert("CSV is too short or empty.");
            return;
        }

        const headers = lines[0].split(',').map(h => h.replace(/^["']|["']$/g, '').trim().toLowerCase());
        const caseIdx = headers.findIndex(h => h.includes('case') || h.includes('active'));
        const deathIdx = headers.findIndex(h => h.includes('death'));
        const recIdx = headers.findIndex(h => h.includes('recover'));
        const dateIdx = headers.findIndex(h => h.includes('date'));
        const regIdx = headers.findIndex(h => h.includes('region') || h.includes('state'));

        let totalCases = 0;
        let totalDeaths = 0;
        let totalRecovered = 0;
        let peakSpike = 0;
        let peakDate = "N/A";

        const parsedRows = [];
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.replace(/^["']|["']$/g, '').trim());
            const cVal = caseIdx !== -1 ? (parseInt(cols[caseIdx]) || 0) : 0;
            const dVal = deathIdx !== -1 ? (parseInt(cols[deathIdx]) || 0) : 0;
            const rVal = recIdx !== -1 ? (parseInt(cols[recIdx]) || 0) : 0;
            const dateVal = dateIdx !== -1 ? (cols[dateIdx] || `Day ${i}`) : `Day ${i}`;
            const regVal = regIdx !== -1 ? (cols[regIdx] || 'General') : 'General';

            totalCases += cVal;
            totalDeaths += dVal;
            totalRecovered += rVal;

            if (cVal > peakSpike) {
                peakSpike = cVal;
                peakDate = dateVal;
            }

            parsedRows.push({ date: dateVal, region: regVal, cases: cVal, deaths: dVal, recovered: rVal });
        }

        const cfr = totalCases > 0 ? ((totalDeaths / totalCases) * 100).toFixed(2) : '0.00';
        const recRate = totalCases > 0 ? ((totalRecovered / totalCases) * 100).toFixed(2) : '0.00';

        const resultsDiv = document.getElementById("analysis-results");
        const contentDiv = document.getElementById("report-content");

        if (resultsDiv && contentDiv) {
            resultsDiv.style.display = "block";
            contentDiv.innerHTML = `
                <div class="card" style="margin-top:1.5rem; padding:1.5rem; background:#1e293b; border-left:5px solid var(--color-secondary); border-radius:8px;">
                    <h3 style="color:var(--color-secondary); margin-top:0; display:flex; align-items:center; gap:0.5rem;">
                        <i class="fas fa-file-invoice"></i> Epidemic Dataset Analysis Report
                    </h3>
                    <p style="color:#94a3b8; font-size:0.9rem;">Dataset successfully parsed. Calculated key metrics and trends below.</p>
                    
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:16px; margin-top:1.5rem; margin-bottom:1.5rem;">
                        <div style="background:#0f172a; padding:1rem; border-radius:6px; border:1px solid #334155;">
                            <div style="color:#94a3b8; font-size:0.8rem; text-transform:uppercase; font-weight:600;">Total Documented Cases</div>
                            <div style="font-size:1.6rem; font-weight:800; color:white; margin-top:0.25rem;">${totalCases.toLocaleString()}</div>
                        </div>
                        <div style="background:#0f172a; padding:1rem; border-radius:6px; border:1px solid #334155;">
                            <div style="color:#94a3b8; font-size:0.8rem; text-transform:uppercase; font-weight:600;">Total Fatalities (Deaths)</div>
                            <div style="font-size:1.6rem; font-weight:800; color:var(--color-danger); margin-top:0.25rem;">${totalDeaths.toLocaleString()}</div>
                        </div>
                        <div style="background:#0f172a; padding:1rem; border-radius:6px; border:1px solid #334155;">
                            <div style="color:#94a3b8; font-size:0.8rem; text-transform:uppercase; font-weight:600;">Case Fatality Ratio (CFR)</div>
                            <div style="font-size:1.6rem; font-weight:800; color:var(--color-warning); margin-top:0.25rem;">${cfr}%</div>
                        </div>
                        <div style="background:#0f172a; padding:1rem; border-radius:6px; border:1px solid #334155;">
                            <div style="color:#94a3b8; font-size:0.8rem; text-transform:uppercase; font-weight:600;">Recovery Rate</div>
                            <div style="font-size:1.6rem; font-weight:800; color:var(--color-success); margin-top:0.25rem;">${recRate}%</div>
                        </div>
                    </div>
                    
                    <div style="background:#0f172a; padding:1rem; border-radius:8px; margin-bottom:1.5rem; border:1px solid #334155; display:flex; align-items:center; gap:12px;">
                        <div style="background:rgba(234,179,8,0.1); color:var(--color-warning); width:45px; height:45px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.2rem;">
                            <i class="fas fa-chart-line"></i>
                        </div>
                        <div>
                            <div style="font-weight:600; color:white;">Peak Single-Day Case Spike</div>
                            <div style="font-size:0.9rem; color:#94a3b8;">Spike of <strong>${peakSpike.toLocaleString()}</strong> cases recorded on <strong>${peakDate}</strong>.</div>
                        </div>
                    </div>
                    
                    <h4 style="color:white; margin-bottom:0.75rem;"><i class="fas fa-table"></i> Parsed Data Preview</h4>
                    <div style="max-height:250px; overflow-y:auto; border-radius:6px; border:1px solid #334155;">
                        <table class="data-table" style="width:100%; border-collapse:collapse; text-align:left;">
                            <thead>
                                <tr style="background:#0f172a; position:sticky; top:0;">
                                    <th style="padding:0.6rem;">Date</th>
                                    <th style="padding:0.6rem;">Region</th>
                                    <th style="padding:0.6rem;">Cases</th>
                                    <th style="padding:0.6rem;">Deaths</th>
                                    <th style="padding:0.6rem;">Recovered</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${parsedRows.map(row => `
                                    <tr style="border-bottom:1px solid #1e293b;">
                                        <td style="padding:0.5rem; color:#cbd5e1;">${row.date}</td>
                                        <td style="padding:0.5rem; color:#cbd5e1;">${row.region}</td>
                                        <td style="padding:0.5rem; color:white; font-weight:600;">${row.cases.toLocaleString()}</td>
                                        <td style="padding:0.5rem; color:var(--color-danger);">${row.deaths.toLocaleString()}</td>
                                        <td style="padding:0.5rem; color:var(--color-success);">${row.recovered.toLocaleString()}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }
    };
    reader.readAsText(file);
}

// Expose functions globally
window.runPrediction = runPrediction;
window.computeRiskFromSnapshot = computeRiskFromSnapshot;
window.handleFileUpload = handleFileUpload;

/* ---- Utils & Tabs ---- */
function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    if (tabId === 'global-trends') renderGlobalTrendChart();
}

window.addEventListener('DOMContentLoaded', () => {
    initIndiaMap();
    updateHotspotData('covid');
    showTab('india-hotspots');
});
