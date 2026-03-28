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
LABEL_MAP_PATH = BASE_DIR / "label_map.json"

_device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

_tokenizer = None
_model = None
_id2label = None


def _lazy_load():
    """
    Lazily load tokenizer, model, and label map
    the first time we call predict_symptoms.
    """
    global _tokenizer, _model, _id2label

    if _tokenizer is not None and _model is not None and _id2label is not None:
        return

    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"model.bin not found at {MODEL_PATH}. "
            f"Train it first with symptom_ml/train_kaggle.py."
        )

    if not LABEL_MAP_PATH.exists():
        raise FileNotFoundError(
            f"label_map.json not found at {LABEL_MAP_PATH}. "
            f"Train it first with symptom_ml/train_kaggle.py."
        )

    print("[infer] Loading tokenizer and model weights...")
    _tokenizer = BertTokenizerFast.from_pretrained(MODEL_NAME)

    with open(LABEL_MAP_PATH, "r") as f:
        m = json.load(f)
    label2id = m["label2id"]
    id2label = {int(k): v for k, v in m["id2label"].items()}
    _id2label = id2label

    num_labels = len(label2id)
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

    print("[infer] Model + label map loaded. Ready for inference.")


def predict_symptoms(text: str, top_k: int = 5) -> List[Tuple[str, float]]:
    """
    Given a symptom description string, returns
    a list of (disease_name, probability) sorted desc.
    """
    _lazy_load()

    if not text or not text.strip():
        return []

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

    # Sort probs
    indices = probs.argsort()[::-1]
    results = []
    for idx in indices[:top_k]:
        label = _id2label.get(int(idx), f"label_{idx}")
        prob = float(probs[idx])
        results.append((label, prob))

    return results
