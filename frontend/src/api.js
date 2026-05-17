/* ---- API Configuration & Helpers ---- */

const BACKEND_BASE_URL = window.BACKEND_URL || window.location.origin;

const API_CONFIG = {
    DISEASE_SH_GLOBAL_ALL: 'https://disease.sh/v3/covid-19/all',
    DISEASE_SH_COUNTRY: (country) =>
        `https://disease.sh/v3/covid-19/countries/${encodeURIComponent(country)}?strict=true`,
    DISEASE_SH_GLOBAL_HISTORICAL: (days) =>
        `https://disease.sh/v3/covid-19/historical/all?lastdays=${days}`,
    DISEASE_SH_COUNTRY_HISTORICAL: (country, days) =>
        `https://disease.sh/v3/covid-19/historical/${encodeURIComponent(country)}?lastdays=${days}`,
    INDIA_COVID_DATA: 'https://data.incovid19.org/v4/min/data.min.json',
    INDIA_STATES_GEOJSON: 'https://raw.githubusercontent.com/nswamy14/geoJson/master/india.states.geo.json'
};

const INDIA_STATE_CODE_TO_NAME = {
    "AN": "Andaman and Nicobar Islands",
    "AP": "Andhra Pradesh",
    "AR": "Arunachal Pradesh",
    "AS": "Assam",
    "BR": "Bihar",
    "CH": "Chandigarh",
    "CT": "Chhattisgarh",
    "DL": "Delhi",
    "DN": "Dadra and Nagar Haveli and Daman and Diu",
    "GA": "Goa",
    "GJ": "Gujarat",
    "HP": "Himachal Pradesh",
    "HR": "Haryana",
    "JH": "Jharkhand",
    "JK": "Jammu and Kashmir",
    "KA": "Karnataka",
    "KL": "Kerala",
    "LA": "Ladakh",
    "LD": "Lakshadweep",
    "MH": "Maharashtra",
    "ML": "Meghalaya",
    "MN": "Manipur",
    "MP": "Madhya Pradesh",
    "MZ": "Mizoram",
    "NL": "Nagaland",
    "OR": "Odisha",
    "PB": "Punjab",
    "PY": "Puducherry",
    "RJ": "Rajasthan",
    "SK": "Sikkim",
    "TG": "Telangana",
    "TN": "Tamil Nadu",
    "TR": "Tripura",
    "UP": "Uttar Pradesh",
    "UT": "Uttarakhand",
    "WB": "West Bengal"
};

const INDIA_STATE_NAME_TO_CODE = {};
Object.entries(INDIA_STATE_CODE_TO_NAME).forEach(([code, name]) => {
    INDIA_STATE_NAME_TO_CODE[name.toUpperCase()] = code;
});

async function fetchRegionSnapshot(locationStr) {
    const locClean = (locationStr || '').trim();
    if (!locClean || locClean.toLowerCase() === 'global') {
        return fetchGlobalSnapshot();
    }

    // 1. Try treating the input as a direct country name first
    try {
        const currentUrl = API_CONFIG.DISEASE_SH_COUNTRY(locClean);
        const currentResp = await fetch(currentUrl);
        if (currentResp.ok) {
            const current = await currentResp.json();
            // Fetch historical
            const histUrl = API_CONFIG.DISEASE_SH_COUNTRY_HISTORICAL(current.country || locClean, 90);
            const histResp = await fetch(histUrl);
            const hist = histResp.ok ? await histResp.json() : {};
            return { scope: 'country', label: current.country || locClean, current, hist };
        }
    } catch (e) {
        console.warn("Direct country fetch failed, attempting heuristic fallback...", e);
    }

    // 2. Try mapping via local dictionary (e.g. mapping "Pune" or "Maharashtra" to "India")
    const locLower = locClean.toLowerCase();
    const guessedCountry = guessCountryFromLocation(locLower);
    if (guessedCountry) {
        try {
            const [current, hist] = await Promise.all([
                fetch(API_CONFIG.DISEASE_SH_COUNTRY(guessedCountry)).then(r => r.json()),
                fetch(API_CONFIG.DISEASE_SH_COUNTRY_HISTORICAL(guessedCountry, 90)).then(r => r.json())
            ]);
            return { scope: 'country', label: guessedCountry, current, hist };
        } catch (e) {
            console.warn("Guessed country fetch failed", e);
        }
    }

    // 3. Fall back to global overview
    return fetchGlobalSnapshot();
}

async function fetchGlobalSnapshot() {
    const [current, hist] = await Promise.all([
        fetch(API_CONFIG.DISEASE_SH_GLOBAL_ALL).then(r => r.json()),
        fetch(API_CONFIG.DISEASE_SH_GLOBAL_HISTORICAL(90)).then(r => r.json())
    ]);
    return { scope: 'global', label: 'Global', current, hist };
}

function guessCountryFromLocation(locLower) {
    const mapping = {
        // India cities and states
        'india':'India',
        'bharat':'India',
        'pune':'India',
        'mumbai':'India',
        'delhi':'India',
        'bangalore':'India',
        'bengaluru':'India',
        'hyderabad':'India',
        'chennai':'India',
        'kolkata':'India',
        'maharashtra':'India',
        'karnataka':'India',
        'tamil nadu':'India',
        'uttar pradesh':'India',
        'gujarat':'India',
        'rajasthan':'India',
        'punjab':'India',
        'kerala':'India',
        'goa':'India',
        'haryana':'India',
        'bihar':'India',
        'west bengal':'India',
        
        // USA cities and states
        'united states':'USA',
        'usa':'USA',
        'us ':'USA',
        'america':'USA',
        'new york':'USA',
        'california':'USA',
        'texas':'USA',
        'florida':'USA',
        'los angeles':'USA',
        'chicago':'USA',
        'houston':'USA',
        'san francisco':'USA',
        'seattle':'USA',
        'boston':'USA',
        'washington':'USA',
        
        // UK cities and states
        'united kingdom':'UK',
        'uk':'UK',
        'england':'UK',
        'london':'UK',
        'manchester':'UK',
        'birmingham':'UK',
        'scotland':'UK',
        'wales':'UK',
        'ireland':'UK',
        
        // Other major countries
        'brazil':'Brazil',
        'canada':'Canada',
        'germany':'Germany',
        'france':'France',
        'italy':'Italy',
        'spain':'Spain',
        'china':'China',
        'japan':'Japan',
        'australia':'Australia',
        'russia':'Russia'
    };
    for (const [key, value] of Object.entries(mapping)) {
        if (locLower.includes(key)) return value;
    }
    return null;
}

async function fetchBackendDiseaseStateData(diseaseKey) {
    const resp = await fetch(
        `${BACKEND_BASE_URL}/india-hotspots?disease=${encodeURIComponent(diseaseKey)}`
    );
    if (!resp.ok) throw new Error(`Backend error: ${resp.status}`);
    const data = await resp.json();
    for (const [code, entry] of Object.entries(data)) {
        entry.code = code;
    }
    return data;
}

async function fetchIndiaCovidStateData() {
    const resp = await fetch(API_CONFIG.INDIA_COVID_DATA);
    const json = await resp.json();
    const result = {};
    for (const [code, entry] of Object.entries(json)) {
        if (code === 'TT') continue;
        const total = entry.total || {};
        const delta = entry.delta || entry.delta7 || {};
        const confirmed = total.confirmed || 0;
        const recovered = total.recovered || 0;
        const deceased = total.deceased || 0;
        const active = Math.max(0, confirmed - recovered - deceased);
        const newCases = delta.confirmed || 0;
        const name = INDIA_STATE_CODE_TO_NAME[code] || code;

        result[code] = {
            code, name, confirmed, recovered, deceased, active,
            delta: newCases,
            risk: 'LOW'
        };
    }
    // Calculate risk thresholds
    const activeValues = Object.values(result).map(s => s.active);
    if (activeValues.length > 0) {
        const maxActive = Math.max(...activeValues);
        const highThreshold = maxActive * 0.6;
        const medThreshold = maxActive * 0.3;
        Object.values(result).forEach(s => {
            if (s.active >= highThreshold) s.risk = 'HIGH';
            else if (s.active >= medThreshold) s.risk = 'MEDIUM';
            else s.risk = 'LOW';
        });
    }
    result.__source = 'covid-api';
    return result;
}

async function fetchGlobalTrends(diseaseKey) {
    const resp = await fetch(`${BACKEND_BASE_URL}/global-trends?disease=${encodeURIComponent(diseaseKey)}`);
    if (!resp.ok) throw new Error("Backend error " + resp.status);
    return await resp.json();
}

async function fetchResourceForecast(diseaseKey) {
    const resp = await fetch(`${BACKEND_BASE_URL}/global-forecast?disease=${encodeURIComponent(diseaseKey)}`);
    if (!resp.ok) throw new Error("Backend error " + resp.status);
    return await resp.json();
}

async function fetchAiDiagnosis(text) {
    const res = await fetch(`${BACKEND_BASE_URL}/ai-diagnosis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
    });
    if (!res.ok) throw new Error("Backend error " + res.status);
    return await res.json();
}
