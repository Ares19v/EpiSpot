import os
import json
from pathlib import Path
from typing import List, Tuple, Dict

import pandas as pd
import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader
from transformers import (
    BertTokenizerFast,
    BertForSequenceClassification,
    AdamW,
    get_linear_schedule_with_warmup,
)
from sklearn.model_selection import train_test_split
from tqdm.auto import tqdm

# -----------------------------
# CONFIG
# -----------------------------
BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / ".." / "data" / "Final_Augmented_dataset_Diseases_and_Symptoms.csv"

MODEL_OUTPUT_PATH = BASE_DIR / "model.bin"
LABEL_MAP_PATH = BASE_DIR / "label_mapping.json"

PRETRAINED_MODEL_NAME = "bert-base-uncased"

MAX_LEN = 128
BATCH_SIZE = 8          # you can increase if GPU / RAM allows
EPOCHS = 3              # start small, increase later if training is stable
LEARNING_RATE = 2e-5
WARMUP_RATIO = 0.1

# IMPORTANT: Minimum samples per disease so stratified split works
MIN_SAMPLES_PER_CLASS = 3

# Optional cap on rows for quick tests; set to None to use all
MAX_ROWS = None  # e.g. 20000 for faster experiments


# -----------------------------
# DATA LOADING & PREP
# -----------------------------
def load_kaggle_dataset(csv_path: Path) -> Tuple[List[str], List[str], Dict[str, int], Dict[int, str]]:
    print(f"[train_kaggle] Loading CSV from: {csv_path}")
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV file not found at: {csv_path}")

    df = pd.read_csv(csv_path)

    if MAX_ROWS is not None and len(df) > MAX_ROWS:
        df = df.head(MAX_ROWS)
        print(f"[train_kaggle] Truncating to first {MAX_ROWS} rows for faster training")

    # The dataset you gave has a label column called 'diseases'
    if "diseases" not in df.columns:
        raise ValueError("Expected a 'diseases' column in the CSV, but it was not found.")

    label_col = "diseases"
    symptom_cols = [c for c in df.columns if c != label_col]

    print(f"[train_kaggle] Label column: {label_col}")
    print(f"[train_kaggle] # Symptom columns: {len(symptom_cols)}")

    # Drop rows where disease is missing or NaN
    df = df.dropna(subset=[label_col])

    # Build a "symptom sentence" for each row from one-hot columns
    texts: List[str] = []
    labels: List[str] = []

    for _, row in df.iterrows():
        disease = str(row[label_col]).strip()
        # treat non-zero as "symptom present"
        present_symptoms = [sym for sym in symptom_cols if row[sym] == 1]

        # If no symptom is marked, skip this row
        if not present_symptoms:
            continue

        symptom_text = "; ".join(present_symptoms)
        text = f"symptoms: {symptom_text}"

        texts.append(text)
        labels.append(disease)

    print(f"[train_kaggle] After building texts, #samples: {len(texts)}")

    # -------------------------
    # Filter out ultra-rare diseases
    # -------------------------
    label_counts = pd.Series(labels).value_counts()
    print(f"[train_kaggle] # Unique diseases before filtering: {label_counts.shape[0]}")

    allowed_labels = label_counts[label_counts >= MIN_SAMPLES_PER_CLASS].index.tolist()
    print(
        f"[train_kaggle] Keeping diseases with >= {MIN_SAMPLES_PER_CLASS} samples: "
        f"{len(allowed_labels)} classes"
    )

    filtered_texts = []
    filtered_labels = []
    for t, y in zip(texts, labels):
        if y in allowed_labels:
            filtered_texts.append(t)
            filtered_labels.append(y)

    texts = filtered_texts
    labels = filtered_labels

    print(f"[train_kaggle] After filtering rare classes, #samples: {len(texts)}")

    # -------------------------
    # Build label mappings
    # -------------------------
    unique_labels = sorted(list(set(labels)))
    label2id = {label: idx for idx, label in enumerate(unique_labels)}
    id2label = {idx: label for label, idx in label2id.items()}

    print(f"[train_kaggle] # Final unique diseases (classes): {len(unique_labels)}")

    return texts, labels, label2id, id2label


# -----------------------------
# DATASET CLASS
# -----------------------------
class SymptomDataset(Dataset):
    def __init__(
        self,
        texts: List[str],
        labels: List[int],
        tokenizer: BertTokenizerFast,
        max_len: int,
    ):
        self.texts = texts
        self.labels = labels
        self.tokenizer = tokenizer
        self.max_len = max_len

    def __len__(self) -> int:
        return len(self.texts)

    def __getitem__(self, idx: int):
        text = self.texts[idx]
        label = self.labels[idx]

        encoded = self.tokenizer(
            text,
            truncation=True,
            padding="max_length",
            max_length=self.max_len,
            return_tensors="pt",
        )

        item = {
            "input_ids": encoded["input_ids"].squeeze(0),
            "attention_mask": encoded["attention_mask"].squeeze(0),
            "labels": torch.tensor(label, dtype=torch.long),
        }
        return item


# -----------------------------
# TRAINING LOOP
# -----------------------------
def train():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[train_kaggle] Using device: {device}")

    texts, label_names, label2id, id2label = load_kaggle_dataset(DATA_PATH)

    # Convert label names -> label IDs
    label_ids = [label2id[y] for y in label_names]

    # Train/val split with stratification on label IDs
    train_texts, val_texts, train_labels, val_labels = train_test_split(
        texts,
        label_ids,
        test_size=0.1,
        random_state=42,
        stratify=label_ids,
    )

    print(f"[train_kaggle] Train samples: {len(train_texts)}")
    print(f"[train_kaggle] Val samples:   {len(val_texts)}")

    # Save label mapping for inference
    with open(LABEL_MAP_PATH, "w") as f:
        json.dump(
            {
                "label2id": label2id,
                "id2label": {str(k): v for k, v in id2label.items()},
            },
            f,
            indent=2,
        )
    print(f"[train_kaggle] Saved label mapping to {LABEL_MAP_PATH}")

    tokenizer = BertTokenizerFast.from_pretrained(PRETRAINED_MODEL_NAME, revision="main")  # nosec B615

    num_labels = len(label2id)
    model = BertForSequenceClassification.from_pretrained(
        PRETRAINED_MODEL_NAME,
        num_labels=num_labels,
        revision="main"  # nosec B615
    )
    model.to(device)

    train_dataset = SymptomDataset(train_texts, train_labels, tokenizer, MAX_LEN)
    val_dataset = SymptomDataset(val_texts, val_labels, tokenizer, MAX_LEN)

    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=BATCH_SIZE, shuffle=False)

    optimizer = AdamW(model.parameters(), lr=LEARNING_RATE)
    total_steps = len(train_loader) * EPOCHS

    scheduler = get_linear_schedule_with_warmup(
        optimizer,
        num_warmup_steps=int(total_steps * WARMUP_RATIO),
        num_training_steps=total_steps,
    )

    # -------------------------
    # Actual training
    # -------------------------
    for epoch in range(1, EPOCHS + 1):
        print(f"\n[train_kaggle] Epoch {epoch}/{EPOCHS}")
        model.train()
        total_train_loss = 0.0

        for batch in tqdm(train_loader, desc="Training", leave=False):
            optimizer.zero_grad()

            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            labels = batch["labels"].to(device)

            outputs = model(
                input_ids=input_ids,
                attention_mask=attention_mask,
                labels=labels,
            )
            loss = outputs.loss
            total_train_loss += loss.item()

            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            scheduler.step()

        avg_train_loss = total_train_loss / max(1, len(train_loader))
        print(f"[train_kaggle] Train loss: {avg_train_loss:.4f}")

        # ---------------------
        # Validation
        # ---------------------
        model.eval()
        total_val_loss = 0.0
        correct = 0
        total = 0

        with torch.no_grad():
            for batch in tqdm(val_loader, desc="Validation", leave=False):
                input_ids = batch["input_ids"].to(device)
                attention_mask = batch["attention_mask"].to(device)
                labels = batch["labels"].to(device)

                outputs = model(
                    input_ids=input_ids,
                    attention_mask=attention_mask,
                    labels=labels,
                )

                loss = outputs.loss
                logits = outputs.logits

                total_val_loss += loss.item()

                preds = torch.argmax(logits, dim=-1)
                correct += (preds == labels).sum().item()
                total += labels.size(0)

        avg_val_loss = total_val_loss / max(1, len(val_loader))
        val_accuracy = correct / max(1, total)
        print(f"[train_kaggle] Val loss: {avg_val_loss:.4f} | Val acc: {val_accuracy:.4f}")

    # -------------------------
    # Save final model
    # -------------------------
    torch.save(model.state_dict(), MODEL_OUTPUT_PATH)
    print(f"\n✅ Training complete. Saved model to: {MODEL_OUTPUT_PATH}")
    print(f"✅ Label mapping saved to: {LABEL_MAP_PATH}")


if __name__ == "__main__":
    train()
