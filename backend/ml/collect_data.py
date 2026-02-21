import cv2
import numpy as np
import os
import sys
import time

# Add backend directory to path so we can import app modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app.services.landmark_extractor import get_extractor

# Configuration
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'dataset')
FRAMES_PER_SEQUENCE = 30
FEATURES_PER_FRAME = 225

def flatten_landmarks(landmarks_dict):
    """
    Flatten Pose, Left Hand, Right Hand into a 225-feature array
    Matches the frontend SignToTextPanel.jsx logic exactly.
    """
    flattened = []
    
    # Pose: 33 points * 3 = 99 features
    pose = landmarks_dict.get('pose', [])
    if pose:
        for lm in pose:
            flattened.extend([lm.x, lm.y, lm.z])
    else:
        flattened.extend([0] * 99)
        
    # Left Hand: 21 points * 3 = 63 features
    left_hand = landmarks_dict.get('left_hand', [])
    if left_hand:
        for lm in left_hand:
            flattened.extend([lm.x, lm.y, lm.z])
    else:
        flattened.extend([0] * 63)
        
    # Right Hand: 21 points * 3 = 63 features
    right_hand = landmarks_dict.get('right_hand', [])
    if right_hand:
        for lm in right_hand:
            flattened.extend([lm.x, lm.y, lm.z])
    else:
        flattened.extend([0] * 63)
        
    assert len(flattened) == FEATURES_PER_FRAME, f"Features mismatch: {len(flattened)} != {FEATURES_PER_FRAME}"
    return flattened

def main():
    print("====================================")
    print(" Sign Language Dataset Collector")
    print("====================================")
    
    # Ask user for the sign they want to collect
    sign_name = input("\nEnter the gloss name of the sign you are recording (e.g., HELLO): ").strip().upper()
    if not sign_name:
        print("Invalid sign name. Exiting.")
        return
        
    sign_dir = os.path.join(DATA_DIR, sign_name)
    os.makedirs(sign_dir, exist_ok=True)
    
    # Determine the next sequence number to avoid overwriting
    existing_files = [f for f in os.listdir(sign_dir) if f.startswith("sequence_") and f.endswith(".npy")]
    next_seq_num = len(existing_files)
    
    num_sequences = int(input("How many sequences do you want to record? (e.g., 10): ").strip())
    
    extractor = get_extractor()
    cap = cv2.VideoCapture(0)
    
    print("\nStarting camera...")
    
    for sequence in range(next_seq_num, next_seq_num + num_sequences):
        frames_data = []
        
        # Idle Phase & Countdown
        for i in range(3, 0, -1):
            ret, frame = cap.read()
            if not ret: break
            
            frame = cv2.flip(frame, 1) # Mirror
            cv2.putText(frame, f"Recording '{sign_name}' sequence {sequence}/{next_seq_num + num_sequences - 1}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 0, 0), 2, cv2.LINE_AA)
            cv2.putText(frame, f"Starting in {i}...", (150, 250), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 0, 255), 3, cv2.LINE_AA)
            
            cv2.imshow('Sign Collector', frame)
            cv2.waitKey(1000) # Wait 1 second
            
        # Recording Phase
        print(f"Recording sequence {sequence}...")
        for frame_num in range(FRAMES_PER_SEQUENCE):
            ret, frame = cap.read()
            if not ret: break
            
            frame = cv2.flip(frame, 1)
            
            # Extract landmarks
            landmarks, metadata = extractor.extract(frame)
            
            # Draw landmarks for visual feedback
            if landmarks:
                extractor.draw_landmarks(frame, landmarks)
                
            # Flatten exactly like the frontend
            features = flatten_landmarks(landmarks)
            frames_data.append(features)
            
            # Display recording UI
            cv2.putText(frame, f"RECORDING '{sign_name}' (Frame {frame_num+1}/{FRAMES_PER_SEQUENCE})", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2, cv2.LINE_AA)
            cv2.imshow('Sign Collector', frame)
            
            # Force 30 fps capture rate roughly (~33ms)
            if cv2.waitKey(33) & 0xFF == ord('q'):
                print("\nEarly exit requested. Quitting.")
                cap.release()
                cv2.destroyAllWindows()
                return
                
        # Save sequence
        if len(frames_data) == FRAMES_PER_SEQUENCE:
            sequence_array = np.array(frames_data)
            save_path = os.path.join(sign_dir, f"sequence_{sequence}.npy")
            np.save(save_path, sequence_array)
            print(f"Saved {save_path} (Shape: {sequence_array.shape})")
        else:
            print(f"Error: Sequence length was {len(frames_data)} instead of {FRAMES_PER_SEQUENCE}. Skipping.")
            
        # Short pause between datasets
        time.sleep(1)

    print("\nCollection complete!")
    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
