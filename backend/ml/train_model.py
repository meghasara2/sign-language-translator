import os
import sys
import json
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader
from sklearn.model_selection import train_test_split

# Add backend directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app.services.sign_classifier import SignLSTM

# Configuration
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'dataset')
MODEL_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'models')
VOCAB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'vocabulary.json')

FRAMES_PER_SEQUENCE = 30
FEATURES_PER_FRAME = 225
EPOCHS = 100
BATCH_SIZE = 16
LEARNING_RATE = 0.001

def load_data():
    """
    Parses the dataset directory mapping folder names to numerical classes.
    Returns: sequences, labels, vocabulary (string list)
    """
    if not os.path.exists(DATA_DIR):
        print(f"Dataset directory {DATA_DIR} not found.")
        return None, None, None

    vocabulary = sorted([d for d in os.listdir(DATA_DIR) if os.path.isdir(os.path.join(DATA_DIR, d))])
    label_map = {label: i for i, label in enumerate(vocabulary)}

    X = []
    y = []

    for label in vocabulary:
        label_dir = os.path.join(DATA_DIR, label)
        for seq_file in os.listdir(label_dir):
            if seq_file.endswith(".npy"):
                file_path = os.path.join(label_dir, seq_file)
                sequence = np.load(file_path)
                
                # Validation check
                if sequence.shape == (FRAMES_PER_SEQUENCE, FEATURES_PER_FRAME):
                    X.append(sequence)
                    y.append(label_map[label])
                else:
                    print(f"Skipping {file_path}: Invalid shape {sequence.shape}")

    if not X:
        print("No valid sequences found in dataset.")
        return None, None, None

    return np.array(X), np.array(y), vocabulary


def train():
    print("====================================")
    print(" PyTorch Model Training Pipeline")
    print("====================================")

    # 1. Load Data
    X, y, vocabulary = load_data()
    if X is None: return

    print(f"Loaded {len(X)} sequences across {len(vocabulary)} classes.")
    print(f"Classes: {vocabulary}")

    # Save to vocabulary.json
    os.makedirs(os.path.dirname(VOCAB_PATH), exist_ok=True)
    with open(VOCAB_PATH, 'w') as f:
        json.dump(vocabulary, f, indent=4)
    print(f"Updated vocabulary mapped to {VOCAB_PATH}")

    # 2. Split and Tensorize
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    X_train_t = torch.tensor(X_train, dtype=torch.float32)
    y_train_t = torch.tensor(y_train, dtype=torch.long)
    X_test_t = torch.tensor(X_test, dtype=torch.float32)
    y_test_t = torch.tensor(y_test, dtype=torch.long)

    train_data = TensorDataset(X_train_t, y_train_t)
    test_data = TensorDataset(X_test_t, y_test_t)

    train_loader = DataLoader(train_data, batch_size=BATCH_SIZE, shuffle=True)
    test_loader = DataLoader(test_data, batch_size=BATCH_SIZE, shuffle=False)

    # 3. Model Setup
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Training on device: {device}")

    num_classes = len(vocabulary)
    model = SignLSTM(input_size=FEATURES_PER_FRAME, hidden_size=64, num_layers=2, num_classes=num_classes).to(device)

    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE)

    # 4. Training Loop
    print("\nStarting Training...")
    for epoch in range(EPOCHS):
        model.train()
        total_loss = 0
        correct = 0

        for batch_X, batch_y in train_loader:
            batch_X, batch_y = batch_X.to(device), batch_y.to(device)

            optimizer.zero_grad()
            outputs = model(batch_X)
            
            loss = criterion(outputs, batch_y)
            loss.backward()
            optimizer.step()

            total_loss += loss.item()
            _, predicted = torch.max(outputs.data, 1)
            correct += (predicted == batch_y).sum().item()

        train_acc = 100 * correct / len(train_data)

        # Validation
        model.eval()
        val_loss = 0
        val_correct = 0
        with torch.no_grad():
            for batch_X, batch_y in test_loader:
                batch_X, batch_y = batch_X.to(device), batch_y.to(device)
                outputs = model(batch_X)
                loss = criterion(outputs, batch_y)
                val_loss += loss.item()
                _, predicted = torch.max(outputs.data, 1)
                val_correct += (predicted == batch_y).sum().item()

        val_acc = 100 * val_correct / len(test_data)

        if (epoch + 1) % 10 == 0:
            print(f"Epoch [{epoch+1}/{EPOCHS}] | "
                  f"Train Loss: {total_loss/len(train_loader):.4f} | Train Acc: {train_acc:.2f}% | "
                  f"Val Loss: {val_loss/len(test_loader):.4f} | Val Acc: {val_acc:.2f}%")

    # 5. Export Weights
    os.makedirs(MODEL_DIR, exist_ok=True)
    model_path = os.path.join(MODEL_DIR, 'sign_classifier.pth')
    
    # Save the state dict
    torch.save(model.state_dict(), model_path)
    print(f"\nTraining Complete. Hand-tracking weights saved successfully to:")
    print(f"-> {model_path}")

if __name__ == "__main__":
    train()
