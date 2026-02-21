"""
Sign Language Classifier Service
=================================
LSTM-based sequence classifier for sign language recognition.
"""

import torch
import torch.nn as nn
import numpy as np
from pathlib import Path
import json
import os
from typing import Tuple, List, Optional
from loguru import logger

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'data')
MODEL_PATH = os.path.join(DATA_DIR, 'models', 'sign_classifier.pth')
VOCAB_PATH = os.path.join(DATA_DIR, 'vocabulary.json')


class SignLSTM(nn.Module):
    """
    LSTM-based sequence classifier for sign language.
    
    Architecture:
        Input (seq_len, features) → LSTM → FC → Softmax → Class
    """
    
    def __init__(self, 
                 input_size: int = 225,
                 hidden_size: int = 128,
                 num_layers: int = 2,
                 num_classes: int = 30,
                 dropout: float = 0.3):
        """
        Initialize LSTM classifier.
        
        Args:
            input_size: Number of input features per frame
            hidden_size: LSTM hidden state dimension
            num_layers: Number of stacked LSTM layers
            num_classes: Number of sign classes
            dropout: Dropout probability
        """
        super(SignLSTM, self).__init__()
        
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        
        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0,
            bidirectional=True
        )
        
        # Bidirectional doubles the hidden size
        self.fc1 = nn.Linear(hidden_size * 2, hidden_size)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(dropout)
        self.fc2 = nn.Linear(hidden_size, num_classes)
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass.
        
        Args:
            x: Input tensor of shape (batch, seq_len, input_size)
        
        Returns:
            Output tensor of shape (batch, num_classes)
        """
        # LSTM forward
        lstm_out, (h_n, c_n) = self.lstm(x)
        
        # Take the last timestep output
        last_output = lstm_out[:, -1, :]
        
        # Fully connected layers
        out = self.fc1(last_output)
        out = self.relu(out)
        out = self.dropout(out)
        out = self.fc2(out)
        
        return out


class SignClassifier:
    """
    Wrapper class for sign language classification inference.
    """
    
    def __init__(self, 
                 model_path: Optional[str] = None,
                 vocabulary: Optional[List[str]] = None,
                 device: str = "auto"):
        """
        Initialize classifier.
        
        Args:
            model_path: Path to trained model weights (.pth)
            vocabulary: List of sign class names
            device: "cuda", "cpu", or "auto"
        """
        # Set device
        if device == "auto":
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        else:
            self.device = torch.device(device)
        
        logger.info(f"SignClassifier using device: {self.device}")
        
        # Default vocabulary (placeholder)
        self.vocabulary = ["HELLO", "THANK_YOU", "YES", "NO", "PLEASE"]
        
        # Load vocabulary from JSON if available
        if os.path.exists(VOCAB_PATH):
            try:
                with open(VOCAB_PATH, 'r') as f:
                    self.vocabulary = json.load(f)
                logger.info(f"Loaded {len(self.vocabulary)} classes from {VOCAB_PATH}")
            except Exception as e:
                logger.error(f"Failed to load vocabulary: {e}")
        else:
            logger.warning(f"Vocabulary not found at {VOCAB_PATH}. Using default.")
        
        # Initialize model
        self.model = SignLSTM(
            input_size=225,  # 33*3 + 21*3 + 21*3 = 225
            hidden_size=64,  # Match train_model.py
            num_layers=2,
            num_classes=len(self.vocabulary),
            dropout=0.3
        ).to(self.device)
        
        # Load weights if trained model exists
        actual_model_path = model_path if model_path else MODEL_PATH
        if Path(actual_model_path).exists():
            try:
                self.model.load_state_dict(torch.load(actual_model_path, map_location=self.device))
                logger.info(f"Loaded trained model from {actual_model_path}")
            except Exception as e:
                logger.error(f"Failed to load weights: {e}")
        else:
            logger.warning(f"No trained model found at {actual_model_path}. Model will output random predictions! Run collect_data.py and train_model.py first.")
        
        self.model.eval()
    
    def predict(self, sequence: np.ndarray) -> Tuple[str, float]:
        """
        Predict sign from landmark sequence.
        
        Args:
            sequence: Numpy array of shape (seq_len, features) (e.g. 30x225)
        
        Returns:
            (predicted_sign, confidence)
        """
        # If the model is completely untrained (random weights), return a dummy answer to prevent crashes,
        # unless you purposefully want it to guess. Let's let it guess, but the warning above informs the user.
        
        # Validate Shape
        if len(sequence) != 30 or len(sequence[0]) != 225:
             logger.error(f"Invalid sequence shape: expected (30, 225), got ({len(sequence)}, {len(sequence[0]) if len(sequence) > 0 else 0})")
             return "ERROR", 0.0

        with torch.no_grad():
            # Prepare input
            x = torch.FloatTensor(sequence).unsqueeze(0).to(self.device)
            
            # Forward pass
            outputs = self.model(x)
            probabilities = torch.softmax(outputs, dim=1)
            
            # Get prediction
            confidence, predicted_idx = torch.max(probabilities, 1)
            
            idx = predicted_idx.item()
            if idx < len(self.vocabulary):
                predicted_sign = self.vocabulary[idx]
                return predicted_sign, confidence.item()
            else:
                return "UNKNOWN", 0.0
    
    def predict_topk(self, sequence: np.ndarray, k: int = 3) -> List[Tuple[str, float]]:
        """
        Get top-k predictions.
        
        Args:
            sequence: Numpy array of shape (seq_len, features)
            k: Number of top predictions to return
        
        Returns:
            List of (sign, confidence) tuples
        """
        with torch.no_grad():
            x = torch.FloatTensor(sequence).unsqueeze(0).to(self.device)
            outputs = self.model(x)
            probabilities = torch.softmax(outputs, dim=1)
            
            topk_probs, topk_indices = torch.topk(probabilities, k)
            
            results = []
            for prob, idx in zip(topk_probs[0], topk_indices[0]):
                results.append((self.vocabulary[idx.item()], prob.item()))
            
            return results
    
    def load_model(self, path: str):
        """Load model weights from file."""
        checkpoint = torch.load(path, map_location=self.device)
        self.model.load_state_dict(checkpoint['model_state_dict'])
        
        if 'vocabulary' in checkpoint:
            self.vocabulary = checkpoint['vocabulary']
    
    def save_model(self, path: str):
        """Save model weights to file."""
        torch.save({
            'model_state_dict': self.model.state_dict(),
            'vocabulary': self.vocabulary
        }, path)


# Singleton instance
_classifier_instance = None

def get_classifier() -> SignClassifier:
    """Get or create the classifier singleton."""
    global _classifier_instance
    if _classifier_instance is None:
        _classifier_instance = SignClassifier()
    return _classifier_instance
