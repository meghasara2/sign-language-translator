"""
Sign Language Classifier Service
=================================
LSTM-based sequence classifier for sign language recognition.
"""

import torch
import torch.nn as nn
import numpy as np
from pathlib import Path
from typing import Tuple, List, Optional
from loguru import logger


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
        
        # Default vocabulary (placeholder - will be loaded from file)
        self.vocabulary = vocabulary or [
            "HELLO", "GOODBYE", "THANK_YOU", "PLEASE", "SORRY",
            "YES", "NO", "HELP", "NAME", "YOU", "ME", "WHAT",
            "WHERE", "WHEN", "HOW", "WHY", "WHO", "LOVE", "FRIEND",
            "FAMILY", "EAT", "DRINK", "SLEEP", "WORK", "SCHOOL",
            "HOME", "HAPPY", "SAD", "GOOD", "BAD"
        ]
        
        # Initialize model
        self.model = SignLSTM(
            input_size=225,  # 33*3 + 21*3 + 21*3 = 225
            hidden_size=128,
            num_layers=2,
            num_classes=len(self.vocabulary),
            dropout=0.3
        ).to(self.device)
        
        # Load weights if provided
        if model_path and Path(model_path).exists():
            self.load_model(model_path)
            logger.info(f"Loaded model from {model_path}")
        else:
            logger.warning("No model weights loaded. Using random initialization.")
        
        self.model.eval()
    
    def predict(self, sequence: np.ndarray) -> Tuple[str, float]:
        """
        Predict sign from landmark sequence.
        
        Args:
            sequence: Numpy array of shape (seq_len, features)
        
        Returns:
            (predicted_sign, confidence)
        """
        with torch.no_grad():
            # Prepare input
            x = torch.FloatTensor(sequence).unsqueeze(0).to(self.device)
            
            # Forward pass
            outputs = self.model(x)
            probabilities = torch.softmax(outputs, dim=1)
            
            # Get prediction
            confidence, predicted_idx = torch.max(probabilities, 1)
            predicted_sign = self.vocabulary[predicted_idx.item()]
            
            return predicted_sign, confidence.item()
    
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
