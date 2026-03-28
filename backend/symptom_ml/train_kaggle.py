# backend/symptom_ml/train_kaggle.py

import json
from pathlib import Path
from typing import List, Tuple

import numpy as np
import pandas as pd
import torch
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from sklearn.model_selection import train_test_split
from transformers import (
    BertTokenizer,
    BertForSequenceClassification,
    get_linear_schedule_with_warmup,
)
from tqdm import tqdm

# -------------------------------------------------------------------
# CONFIG
# -------------------------------------------------------------------

BASE_MODEL_NAME = "bert-base-uncased"

# IMPORTANT: this is the file you want to train on.
# Put this CSV in backend/data/
CSV_FILENAME = "Diseases_Symptoms.csv"

# Limit rows for quicker training (set to None to use all rows)
MAX_ROWS = 5000  # later you can set to None for full training

TEST_SIZE = 0.15
RANDOM_STATE = 42
EPOCHS = 3
BATCH_SIZE = 16
LEARNING_RATE = 2e-5
MAX_LEN = 128


# -------------------------------------------------------------------
# DATASET
# -------------------------------------------------------------------

class SymptomTextDataset(Dataset):
    def __init__(self, texts: List[str], labels: List[int], tokenizer: BertTokenizer, max_len: int):
        self.texts = texts
        self.labels = labels
        self.tokenizer = tokenizer
        self.max_len = max_len

    def __len__(self):
        return len(self.texts)

    def __getitem__(self, idx):
        text = str(self.texts[idx])
        label = int(self.labels[idx])

        enc = self.tokenizer(
            text,
            add_special_tokens=True,
            truncation=True,
            max_length=self.max_len,
            padding="max_length",
            return_attention_mask=True,
            return_tensors="pt",
        )

        return {
            "input_ids": enc["input_ids"].squeeze(0),
            "attention_mask": enc["attention_mask"].squeeze(0),
            "labels": torch.tensor(label, dtype=torch.long),
        }


# -------------------------------------------------------------------
# AUTO-DETECT FORMAT
# -------------------------------------------------------------------

def _lower_dict(cols):
    """Map lowercase column name -> original name."""
    return {c.lower(): c for c in cols}


def build_texts_from_wide(df: pd.DataFrame, label_col: str) -> List[str]:
    """
    For wide one-hot style datasets:
    - label column e.g. 'diseases'
    - many symptom columns with 0/1 / True/False
    We convert each row into: "symptom1; symptom2; symptom3..."
    """
    symptom_cols = [c for c in df.columns if c != label_col]
    texts = []
    for _, row in df.iterrows():
        active = []
        for col in symptom_cols:
            val = row[col]
            if isinstance(val, (int, float, bool, np.bool_)):
                if val:
                    active.append(col)
            else:
                sval = str(val).strip().lower()
                if sval in {"1", "true", "yes", "y"}:
                    active.append(col)
        if not active:
            active = ["no_symptom"]
        texts.append("; ".join(active))
    return texts


def detect_and_prepare(df: pd.DataFrame) -> Tuple[List[str], List[str]]:
    """
    Returns (texts, labels) for ANY of:
    1) Your dataset:
       - text column: 'Symptoms'
       - label column: 'Name'
    2) Wide dataset:
       - label: 'diseases'
       - 100s of symptom columns with 0/1
    """
    cols_map = _lower_dict(df.columns)

    # ---- Case 1: Your simple dataset (Name + Symptoms + other stuff) ----
    if "symptoms" in cols_map and any(k in cols_map for k in ["name", "disease", "disease_name"]):
        text_col = cols_map["symptoms"]
        if "name" in cols_map:
            label_col = cols_map["name"]
        elif "disease" in cols_map:
            label_col = cols_map["disease"]
        else:
            label_col = cols_map["disease_name"]

        print(f"[train_kaggle] Detected text-label CSV: text='{text_col}', label='{label_col}'")
        texts = df[text_col].astype(str).tolist()
        labels = df[label_col].astype(str).tolist()
        return texts, labels

    # ---- Case 2: Wide one-hot dataset (diseases + many symptom columns) ----
    if "diseases" in cols_map:
        label_col = cols_map["diseases"]
        print(f"[train_kaggle] Detected wide symptom CSV with label column '{label_col}'")
        texts = build_texts_from_wide(df, label_col)
        labels = df[label_col].astype(str).tolist()
        return texts, labels

    # If we reach here, we don't know how to interpret this file
    raise ValueError(
        "Could not detect suitable text/label columns.\n"
        "For auto-detection, expected something like:\n"
        "- a 'Symptoms' column + a 'Name'/'Disease' column, OR\n"
        "- a 'diseases' column + many binary symptom columns."
    )


# -------------------------------------------------------------------
# MAIN TRAIN LOOP
# -------------------------------------------------------------------

def train():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[train_kaggle] Using device: {device}")

    here = Path(__file__).resolve().parent
    csv_path = (here.parent / "data" / CSV_FILENAME).resolve()
    print(f"[train_kaggle] Loading CSV from: {csv_path}")

    if not csv_path.exists():
        raise FileNotFoundError(f"CSV file not found at: {csv_path}")

    # Load CSV
    df = pd.read_csv(csv_path)

    if MAX_ROWS is not None and len(df) > MAX_ROWS:
        df = df.sample(n=MAX_ROWS, random_state=RANDOM_STATE).reset_index(drop=True)
        print(f"[train_kaggle] Using a subset of {len(df)} rows for faster training.")

    # Convert to (texts, labels) according to format
    texts, label_strings = detect_and_prepare(df)

    # Encode labels
    unique_labels = sorted(set(label_strings))
    label2id = {lab: i for i, lab in enumerate(unique_labels)}
    id2label = {i: lab for lab, i in label2id.items()}
    y = np.array([label2id[lab] for lab in label_strings], dtype=np.int64)

    print(f"[train_kaggle] # Unique classes (diseases): {len(unique_labels)}")

    # We DO NOT stratify (some classes might have only 1 sample)
    train_texts, val_texts, train_labels, val_labels = train_test_split(
        texts,
        y,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        shuffle=True,
    )

    # Tokenizer & datasets
    tokenizer = BertTokenizer.from_pretrained(BASE_MODEL_NAME)
    train_dataset = SymptomTextDataset(train_texts, train_labels, tokenizer, MAX_LEN)
    val_dataset = SymptomTextDataset(val_texts, val_labels, tokenizer, MAX_LEN)

    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=BATCH_SIZE, shuffle=False)

    # Model
    model = BertForSequenceClassification.from_pretrained(
        BASE_MODEL_NAME,
        num_labels=len(unique_labels),
        id2label=id2label,
        label2id=label2id,
    )
    model.to(device)

    # Optimizer + scheduler
    optimizer = optim.AdamW(model.parameters(), lr=LEARNING_RATE)
    total_steps = len(train_loader) * EPOCHS
    scheduler = get_linear_schedule_with_warmup(
        optimizer,
        num_warmup_steps=int(0.1 * total_steps),
        num_training_steps=total_steps,
    )
    loss_fn = torch.nn.CrossEntropyLoss()

    # Training loop
    for epoch in range(1, EPOCHS + 1):
        model.train()
        train_losses = []

        print(f"\n[train_kaggle] Epoch {epoch}/{EPOCHS}")
        for batch in tqdm(train_loader, desc="Training"):
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            labels = batch["labels"].to(device)

            optimizer.zero_grad()
            outputs = model(input_ids=input_ids, attention_mask=attention_mask)
            logits = outputs.logits
            loss = loss_fn(logits, labels)
            loss.backward()
            optimizer.step()
            scheduler.step()

            train_losses.append(loss.item())

        avg_train_loss = float(np.mean(train_losses)) if train_losses else 0.0

        # Validation
        model.eval()
        val_losses = []
        correct = 0
        total = 0
        with torch.no_grad():
            for batch in tqdm(val_loader, desc="Validation"):
                input_ids = batch["input_ids"].to(device)
                attention_mask = batch["attention_mask"].to(device)
                labels = batch["labels"].to(device)

                outputs = model(input_ids=input_ids, attention_mask=attention_mask)
                logits = outputs.logits
                loss = loss_fn(logits, labels)
                val_losses.append(loss.item())

                preds = torch.argmax(logits, dim=-1)
                correct += (preds == labels).sum().item()
                total += labels.size(0)

        avg_val_loss = float(np.mean(val_losses)) if val_losses else 0.0
        val_acc = correct / total if total > 0 else 0.0

        print(
            f"[train_kaggle] Epoch {epoch} | "
            f"Train loss: {avg_train_loss:.4f} | "
            f"Val loss: {avg_val_loss:.4f} | "
            f"Val acc: {val_acc:.4f}"
        )

    # Save model + label maps next to infer.py (symptom_ml folder)
    out_dir = here  # symptom_ml/
    model_path = out_dir / "model.bin"
    label_map_path = out_dir / "id2label.json"

    torch.save(model.state_dict(), model_path)
    with open(label_map_path, "w") as f:
        json.dump(id2label, f, indent=2)

    print(f"\n[train_kaggle] ✅ Training complete.")
    print(f"[train_kaggle] Saved model to: {model_path}")
    print(f"[train_kaggle] Saved label map to: {label_map_path}")


if __name__ == "__main__":
    train()
