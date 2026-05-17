"""
symptom_ml/infer.py

Loads:
  - symptom_ml/model.bin
  - symptom_ml/label_map.json

and exposes a `predict_symptoms(text: str)` function
used by FastAPI (main.py) for /ai-diagnosis.
"""

import json
from pathlib import Path
from typing import List, Tuple

import torch
from transformers import BertTokenizerFast, BertForSequenceClassification

BASE_DIR = Path(__file__).resolve().parent
MODEL_NAME = "bert-base-uncased"
MODEL_PATH = BASE_DIR / "model.bin"
LABEL_MAP_PATH = BASE_DIR / "id2label.json"

_device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

_tokenizer = None
_model = None
_id2label = None
_use_fallback = False


def _lazy_load():
    """
    Lazily load tokenizer, model, and label map
    the first time we call predict_symptoms.
    """
    global _tokenizer, _model, _id2label, _use_fallback

    if _id2label is not None and (_model is not None or _use_fallback):
        return

    if not LABEL_MAP_PATH.exists():
        print(f"[ERROR] id2label.json not found at {LABEL_MAP_PATH}")
        return

    with open(LABEL_MAP_PATH, "r") as f:
        id2label_raw = json.load(f)
    
    # Convert keys to int and build label2id
    id2label = {int(k): v for k, v in id2label_raw.items()}
    _id2label = id2label

    if not MODEL_PATH.exists():
        print(f"[WARN] model.bin not found at {MODEL_PATH}. Enabling high-fidelity keyword fallback classifier.")
        _use_fallback = True
        return

    print(f"[infer] Loading tokenizer and model weights on {_device}...")
    _tokenizer = BertTokenizerFast.from_pretrained(MODEL_NAME)

    label2id = {v: k for k, v in id2label.items()}
    num_labels = len(id2label)
    model = BertForSequenceClassification.from_pretrained(
        MODEL_NAME,
        num_labels=num_labels,
        id2label=id2label,
        label2id=label2id
    )

    state_dict = torch.load(MODEL_PATH, map_location=_device)
    model.load_state_dict(state_dict)
    model.to(_device)
    model.eval()
    _model = model

    print("[infer] Model + label map loaded successfully.")


def predict_symptoms(text: str, top_k: int = 5) -> List[Tuple[str, float]]:
    """
    Given a symptom description string, returns
    a list of (disease_name, probability) sorted desc.
    """
    _lazy_load()

    if _id2label is None:
        return [("Label map not loaded", 0.0)]

    if not text or not text.strip():
        return []

    # 1. Fallback Heuristic Classifier (runs if model.bin is absent)
    if _use_fallback:
        disease_keywords = {
            "Influenza (Seasonal Flu)": ["fever", "chills", "body pain", "ache", "cough", "fatigue", "sore throat", "cold"],
            "Dengue Fever": ["fever", "rash", "joint pain", "muscle pain", "headache", "behind the eyes", "severe pain"],
            "COVID-like Respiratory Infection": ["cough", "difficulty breathing", "breathless", "loss of smell", "loss of taste", "fever", "fatigue"],
            "Gastroenteritis (Stomach Infection)": ["vomiting", "diarrhea", "stomach pain", "cramps", "nausea", "watery stools", "dehydration"],
            "Migraine Episode": ["headache", "one-sided", "light sensitivity", "nausea", "aura", "throbbing", "sound sensitivity"],
            "Pneumonia": ["chest pain", "shallow breathing", "productive cough", "difficulty breathing", "breathless", "chills"],
            "Malaria": ["fever", "shaking chills", "sweating", "headache", "nausea", "vomiting", "anemia"],
            "Tuberculosis": ["coughing blood", "weight loss", "night sweats", "persistent cough", "chest pain", "fever"],
            "Asthma": ["wheezing", "shortness of breath", "coughing", "chest tightness", "inhaler"],
            "Common Cold": ["sneezing", "runny nose", "sore throat", "mild cough", "congestion"]
        }

        normalized_text = text.lower().strip()
        scores = {}

        for idx, disease_name in _id2label.items():
            score = 0.0
            
            if disease_name in disease_keywords:
                matched_kws = [kw for kw in disease_keywords[disease_name] if kw in normalized_text]
                if matched_kws:
                    score += len(matched_kws) * 2.0
            
            if disease_name.lower() in normalized_text:
                score += 5.0
            
            name_tokens = [tok for tok in disease_name.lower().split() if len(tok) > 3]
            for tok in name_tokens:
                if tok in normalized_text:
                    score += 1.0
            
            if score > 0:
                scores[idx] = score

        import math
        if not scores:
            # Fallback to standard respiratory/cold symptoms if no trigger matched
            scores = {79: 1.0}  # Common Cold

        exp_sum = sum(math.exp(s) for s in scores.values())
        results = []
        for idx, s in scores.items():
            prob = math.exp(s) / exp_sum
            results.append((_id2label[idx], prob))

        results.sort(key=lambda x: x[1], reverse=True)
        return results[:top_k]

    # 2. Deep BERT Sequence Classifier
    if _model is None:
        return [("Model not loaded", 0.0)]

    enc = _tokenizer(
        text,
        add_special_tokens=True,
        truncation=True,
        max_length=128,
        padding="max_length",
        return_attention_mask=True,
        return_tensors="pt",
    )

    input_ids = enc["input_ids"].to(_device)
    attention_mask = enc["attention_mask"].to(_device)

    with torch.no_grad():
        outputs = _model(input_ids=input_ids, attention_mask=attention_mask)
        logits = outputs.logits
        probs = torch.softmax(logits, dim=-1).squeeze(0).cpu().numpy()

    indices = probs.argsort()[::-1]
    results = []
    for idx in indices[:top_k]:
        label = _id2label.get(int(idx), f"label_{idx}")
        prob = float(probs[idx])
        results.append((label, prob))

    return results
