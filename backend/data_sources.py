import requests

def fetch_global_disease_trends(disease):
    if disease.lower() == "covid":
        url = "https://disease.sh/v3/covid-19/historical/all?lastdays=365"
        data = requests.get(url).json()
        return data

    if disease.lower() == "dengue":
        url = "https://ghoapi.azureedge.net/api/DENGUECASES"
        return requests.get(url).json()

    return {"error": "No real-time API available for this disease"}
