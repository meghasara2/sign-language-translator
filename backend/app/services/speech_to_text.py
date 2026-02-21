"""
Speech-to-Text Service
======================
OpenAI Whisper integration for transcribing spoken language.
"""

import numpy as np
from typing import Optional, Dict
from pathlib import Path
from loguru import logger

# Whisper import with fallback
try:
    import whisper
    WHISPER_AVAILABLE = True
except ImportError:
    WHISPER_AVAILABLE = False
    logger.warning("Whisper not installed. Speech-to-text disabled.")


class SpeechToText:
    """
    Whisper-based speech recognition service.
    
    Uses OpenAI Whisper 'base' model for good accuracy/speed balance.
    """
    
    def __init__(self, model_size: str = "base", device: str = "auto"):
        """
        Initialize Whisper model.
        
        Args:
            model_size: Whisper model size ("tiny", "base", "small", "medium", "large")
            device: Device to use ("cuda", "cpu", or "auto")
        """
        self.model_size = model_size
        self.model = None
        
        if not WHISPER_AVAILABLE:
            logger.error("Whisper is not available. Install with: pip install openai-whisper")
            return
        
        # Load model
        logger.info(f"Loading Whisper '{model_size}' model...")
        
        if device == "auto":
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
        
        self.model = whisper.load_model(model_size, device=device)
        logger.info(f"Whisper model loaded on {device}")
    
    def transcribe(self, audio_path: str, language: str = "en") -> Dict:
        """
        Transcribe audio file to text.
        
        Args:
            audio_path: Path to audio file
            language: Language code (default: English)
        
        Returns:
            Dictionary with transcription results
        """
        if not self.model:
            return {"error": "Whisper model not loaded", "text": ""}
        
        try:
            result = self.model.transcribe(
                audio_path,
                language=language,
                fp16=False  # Use FP32 for CPU compatibility
            )
            
            return {
                "text": result["text"].strip(),
                "language": result.get("language", language),
                "segments": result.get("segments", [])
            }
        
        except Exception as e:
            logger.error(f"Transcription error: {e}")
            return {"error": str(e), "text": ""}
    
    def transcribe_audio_array(self, audio: np.ndarray, sample_rate: int = 16000) -> Dict:
        """
        Transcribe audio from numpy array.
        
        Args:
            audio: Audio samples as numpy array (mono, float32)
            sample_rate: Audio sample rate (Whisper expects 16kHz)
        
        Returns:
            Dictionary with transcription results
        """
        if not self.model:
            return {"error": "Whisper model not loaded", "text": ""}
        
        # Resample if necessary (Whisper expects 16kHz)
        if sample_rate != 16000:
            # Simple resampling using linear interpolation
            duration = len(audio) / sample_rate
            new_length = int(duration * 16000)
            indices = np.linspace(0, len(audio) - 1, new_length)
            audio = np.interp(indices, np.arange(len(audio)), audio)
        
        # Ensure correct dtype
        audio = audio.astype(np.float32)
        
        try:
            result = self.model.transcribe(
                audio,
                language="en",
                fp16=False
            )
            
            return {
                "text": result["text"].strip(),
                "language": result.get("language", "en"),
                "segments": result.get("segments", [])
            }
        
        except Exception as e:
            logger.error(f"Transcription error: {e}")
            return {"error": str(e), "text": ""}


class AudioBuffer:
    """
    Buffer for collecting audio chunks before transcription.
    """
    
    def __init__(self, sample_rate: int = 16000, chunk_seconds: float = 3.0):
        """
        Initialize audio buffer.
        
        Args:
            sample_rate: Audio sample rate
            chunk_seconds: Duration to buffer before transcription
        """
        self.sample_rate = sample_rate
        self.chunk_samples = int(sample_rate * chunk_seconds)
        self.buffer = np.array([], dtype=np.float32)
    
    def add(self, audio_chunk: np.ndarray) -> bool:
        """
        Add audio chunk to buffer.
        
        Returns:
            True if buffer is full
        """
        self.buffer = np.concatenate([self.buffer, audio_chunk])
        return len(self.buffer) >= self.chunk_samples
    
    def get(self) -> np.ndarray:
        """Get buffered audio."""
        return self.buffer.copy()
    
    def reset(self):
        """Clear buffer."""
        self.buffer = np.array([], dtype=np.float32)


# Singleton instance
_stt_instance = None

def get_stt() -> SpeechToText:
    """Get or create the STT singleton."""
    global _stt_instance
    if _stt_instance is None:
        _stt_instance = SpeechToText()
    return _stt_instance
