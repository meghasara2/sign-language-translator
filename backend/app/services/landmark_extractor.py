"""
MediaPipe Landmark Extractor Service
=====================================
Extracts hand, pose, and face landmarks for sign language recognition.
"""

import cv2
import numpy as np
import mediapipe as mp
from typing import Optional, Tuple, Dict
from loguru import logger


class LandmarkExtractor:
    """
    Extracts and processes landmarks using MediaPipe Holistic.
    
    Returns flattened arrays suitable for LSTM input.
    """
    
    # Landmark counts
    POSE_LANDMARKS = 33
    HAND_LANDMARKS = 21
    FACE_LANDMARKS = 468
    
    def __init__(self, 
                 min_detection_confidence: float = 0.5,
                 min_tracking_confidence: float = 0.5,
                 use_face: bool = False):
        """
        Initialize MediaPipe Holistic model.
        
        Args:
            min_detection_confidence: Detection threshold
            min_tracking_confidence: Tracking threshold  
            use_face: Whether to include face landmarks (increases feature size)
        """
        self.mp_holistic = mp.solutions.holistic
        self.mp_drawing = mp.solutions.drawing_utils
        self.use_face = use_face
        
        self.holistic = self.mp_holistic.Holistic(
            static_image_mode=False,
            model_complexity=1,
            smooth_landmarks=True,
            enable_segmentation=False,
            smooth_segmentation=True,
            refine_face_landmarks=False,
            min_detection_confidence=min_detection_confidence,
            min_tracking_confidence=min_tracking_confidence
        )
        
        # Calculate feature dimensions
        # Each landmark has (x, y, z) = 3 values
        self.pose_features = self.POSE_LANDMARKS * 3
        self.hand_features = self.HAND_LANDMARKS * 3
        
        # Total features: pose + left_hand + right_hand
        self.total_features = self.pose_features + (self.hand_features * 2)
        
        if self.use_face:
            self.face_features = self.FACE_LANDMARKS * 3
            self.total_features += self.face_features
        
        logger.info(f"LandmarkExtractor initialized. Feature size: {self.total_features}")
    
    def extract(self, frame: np.ndarray) -> Tuple[Optional[np.ndarray], Dict]:
        """
        Extract landmarks from a single frame.
        
        Args:
            frame: BGR image from OpenCV (H, W, 3)
        
        Returns:
            landmarks: Flattened numpy array of shape (total_features,) or None
            metadata: Dictionary with detection status for each component
        """
        # Convert BGR to RGB
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        rgb_frame.flags.writeable = False
        
        # Process frame
        results = self.holistic.process(rgb_frame)
        
        metadata = {
            "pose_detected": results.pose_landmarks is not None,
            "left_hand_detected": results.left_hand_landmarks is not None,
            "right_hand_detected": results.right_hand_landmarks is not None,
            "face_detected": results.face_landmarks is not None if self.use_face else None
        }
        
        # Extract pose landmarks
        if results.pose_landmarks:
            pose = self._landmarks_to_array(results.pose_landmarks.landmark)
        else:
            pose = np.zeros(self.pose_features)
        
        # Extract hand landmarks
        if results.left_hand_landmarks:
            left_hand = self._landmarks_to_array(results.left_hand_landmarks.landmark)
        else:
            left_hand = np.zeros(self.hand_features)
        
        if results.right_hand_landmarks:
            right_hand = self._landmarks_to_array(results.right_hand_landmarks.landmark)
        else:
            right_hand = np.zeros(self.hand_features)
        
        # Concatenate features
        landmarks = np.concatenate([pose, left_hand, right_hand])
        
        # Optionally add face landmarks
        if self.use_face:
            if results.face_landmarks:
                face = self._landmarks_to_array(results.face_landmarks.landmark)
            else:
                face = np.zeros(self.face_features)
            landmarks = np.concatenate([landmarks, face])
        
        return landmarks, metadata
    
    def _landmarks_to_array(self, landmarks) -> np.ndarray:
        """Convert MediaPipe landmarks to flattened numpy array."""
        return np.array([[lm.x, lm.y, lm.z] for lm in landmarks]).flatten()
    
    def draw_landmarks(self, frame: np.ndarray, results) -> np.ndarray:
        """Draw landmarks on frame for visualization."""
        annotated = frame.copy()
        
        if results.pose_landmarks:
            self.mp_drawing.draw_landmarks(
                annotated,
                results.pose_landmarks,
                self.mp_holistic.POSE_CONNECTIONS
            )
        
        if results.left_hand_landmarks:
            self.mp_drawing.draw_landmarks(
                annotated,
                results.left_hand_landmarks,
                self.mp_holistic.HAND_CONNECTIONS
            )
        
        if results.right_hand_landmarks:
            self.mp_drawing.draw_landmarks(
                annotated,
                results.right_hand_landmarks,
                self.mp_holistic.HAND_CONNECTIONS
            )
        
        return annotated
    
    def close(self):
        """Release MediaPipe resources."""
        self.holistic.close()


class FrameBuffer:
    """
    Buffers frames for sequence-based prediction.
    
    Maintains a sliding window of the last N frames.
    """
    
    def __init__(self, sequence_length: int = 30, feature_size: int = 225):
        """
        Initialize frame buffer.
        
        Args:
            sequence_length: Number of frames to buffer (default 30 = ~1 second at 30fps)
            feature_size: Size of landmark feature vector
        """
        self.sequence_length = sequence_length
        self.feature_size = feature_size
        self.buffer = np.zeros((sequence_length, feature_size))
        self.frame_count = 0
    
    def add(self, landmarks: np.ndarray) -> bool:
        """
        Add landmarks to buffer.
        
        Args:
            landmarks: Flattened landmark array
        
        Returns:
            True if buffer is full (ready for prediction)
        """
        # Shift buffer left (drop oldest frame)
        self.buffer = np.roll(self.buffer, -1, axis=0)
        
        # Add new frame at the end
        self.buffer[-1] = landmarks
        self.frame_count += 1
        
        return self.is_ready()
    
    def is_ready(self) -> bool:
        """Check if buffer has enough frames for prediction."""
        return self.frame_count >= self.sequence_length
    
    def get_sequence(self) -> np.ndarray:
        """Get the current sequence for prediction."""
        return self.buffer.copy()
    
    def reset(self):
        """Clear the buffer."""
        self.buffer = np.zeros((self.sequence_length, self.feature_size))
        self.frame_count = 0


# Singleton instance for global access
_extractor_instance = None

def get_extractor() -> LandmarkExtractor:
    """Get or create the landmark extractor singleton."""
    global _extractor_instance
    if _extractor_instance is None:
        _extractor_instance = LandmarkExtractor()
    return _extractor_instance
