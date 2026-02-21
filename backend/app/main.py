"""
DeepBridge FastAPI Backend
==========================
Real-time bidirectional sign language translation server.
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
import json
import asyncio
import base64
import random
import os
import tempfile
import whisper
from pydantic import BaseModel
from typing import List

# Define request body for prediction
class PredictionRequest(BaseModel):
    frames: List[List[float]]  # List of 30 frames, each with 225 features

# Define request body for translation
class TranslationRequest(BaseModel):
    text: str

# Global model variable
model = None

# Initialize FastAPI app
app = FastAPI(
    title="DeepBridge API",
    description="Bidirectional Sign Language Translation System",
    version="0.1.0"
)

# Startup event removed to prevent blocking/crashing if model load fails.
# Model is lazy-loaded in the endpoint.

# CORS configuration for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# WebSocket connection manager
class ConnectionManager:
    """Manages WebSocket connections for real-time communication."""
    
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"Client connected. Total connections: {len(self.active_connections)}")
    
    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        logger.info(f"Client disconnected. Total connections: {len(self.active_connections)}")
    
    async def send_json(self, websocket: WebSocket, data: dict):
        await websocket.send_json(data)
    
    async def broadcast(self, data: dict):
        for connection in self.active_connections:
            await connection.send_json(data)


manager = ConnectionManager()


from dotenv import load_dotenv
load_dotenv()

@app.get("/")
async def root():
    """Health check endpoint."""
    gemini_key = os.getenv("GEMINI_API_KEY")
    return {
        "status": "online",
        "service": "DeepBridge",
        "version": "0.1.0",
        "pipelines": {
            "sign_to_text": "ready",
            "speech_to_sign": "ready"
        },
        "gemini_api": "online" if gemini_key else "offline"
    }


@app.get("/api/vocabulary")
async def get_vocabulary():
    """Get the list of supported signs."""
    # TODO: Load from data/vocabulary.json
    vocabulary = [
        "HELLO", "GOODBYE", "THANK_YOU", "PLEASE", "SORRY",
        "YES", "NO", "HELP", "NAME", "YOU", "ME", "WHAT",
        "WHERE", "WHEN", "HOW", "WHY", "WHO"
    ]
    return {"vocabulary": vocabulary, "count": len(vocabulary)}


@app.post("/predict")
async def predict_sign(request: PredictionRequest):
    """
    Predict sign from a sequence of landmark frames.
    Accepts a 30-frame window of flattened 225-feature arrays.
    """
    try:
        frames = request.frames
        
        # Validate input shape
        if len(frames) == 0:
             return {"error": "Empty sequence provided"}
             
        # Extract the sequence and convert to numpy array
        import numpy as np
        sequence_array = np.array(frames)
        
        # If sequence is shorter than 30, pad it. If longer, truncate.
        SEQ_LEN = 30
        if sequence_array.shape[0] < SEQ_LEN:
             # Pad with zeros
             pad_width = ((0, SEQ_LEN - sequence_array.shape[0]), (0, 0))
             sequence_array = np.pad(sequence_array, pad_width, mode='constant')
        elif sequence_array.shape[0] > SEQ_LEN:
             sequence_array = sequence_array[-SEQ_LEN:]
             
        # Get classifier singleton
        from app.services.sign_classifier import get_classifier
        classifier = get_classifier()
        
        # Predict
        predicted_sign, confidence = classifier.predict(sequence_array)
        
        # For now, gloss and text are the same, but you can build a mapping later
        # e.g. "THANK_YOU" -> "Thank you."
        text = predicted_sign.replace("_", " ").title() + "."
        
        return {
            "gloss": predicted_sign,
            "text": text,
            "confidence": confidence
        }
        
    except Exception as e:
        logger.error(f"Prediction failed: {e}")
        return {"error": str(e), "gloss": "ERROR", "text": "Error processing sequence"}


from app.services.glosser import get_glosser

@app.post("/translate-to-gloss")
async def translate_to_gloss(request: TranslationRequest):
    """
    Translate English text into ASL Gloss sequence.
    """
    try:
        text = request.text
        if not text:
            return {"error": "Empty text provided", "gloss": []}
            
        glosser = get_glosser()
        gloss = await glosser.gloss(text)
        
        logger.info(f"Intelligent translation: '{text}' -> Gloss Sequence: {gloss}")
        
        return {
            "text": text,
            "gloss": gloss
        }
    except Exception as e:
        logger.error(f"Translation failed: {e}")
        return {"error": str(e), "gloss": []}


# ============================================
# Pipeline A: Sign-to-Text WebSocket
# ============================================
@app.websocket("/ws/sign-to-text")
async def sign_to_text_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for Sign-to-Text pipeline.
    
    Receives: Video frames (base64 encoded) from webcam
    Sends: Recognized text predictions
    """
    await manager.connect(websocket)
    
    # Import here to avoid circular dependencies
    try:
        from app.services.landmark_extractor import get_extractor
        extractor = get_extractor()
    except Exception as e:
        logger.error(f"Failed to initialize landmark extractor: {e}")
        await manager.send_json(websocket, {"type": "error", "message": "Sign detection unavailable (MediaPipe error)"})
        manager.disconnect(websocket)
        return
    
    import cv2
    import numpy as np
    import base64
    import random
    
    # Mock vocabulary for testing movement
    TEST_VOCAB = ["HELLO", "GOODBYE", "THANK_YOU", "YES", "NO", "PLEASE", "HELP"]
    
    try:
        while True:
            # Receive frame data from client
            data = await websocket.receive_json()
            
            if data.get("type") == "frame":
                image_data = data.get("image")
                
                if image_data:
                    # Decode base64 image
                    try:
                        # Remove header if present (data:image/jpeg;base64,...)
                        if "," in image_data:
                            image_data = image_data.split(",")[1]
                            
                        image_bytes = base64.b64decode(image_data)
                        nparr = np.frombuffer(image_bytes, np.uint8)
                        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                        
                        if frame is not None:
                            # Extract landmarks
                            landmarks, metadata = extractor.extract(frame)
                            
                            # Logic: If hands are detected, return a random sign (for now)
                            # In real model, we would add to buffer and predict
                            if metadata["left_hand_detected"] or metadata["right_hand_detected"]:
                                # Simulate prediction stability (don't change every frame)
                                if random.random() > 0.9:  # 10% chance to change sign
                                    prediction = random.choice(TEST_VOCAB)
                                    confidence = 0.8 + (random.random() * 0.15)
                                    
                                    response = {
                                        "type": "prediction",
                                        "text": prediction,
                                        "confidence": confidence,
                                        "timestamp": data.get("timestamp")
                                    }
                                    await manager.send_json(websocket, response)
                            else:
                                # Optional: Send "No Hands" status or just silence
                                pass
                                
                    except Exception as e:
                        logger.error(f"Image processing error: {e}")
            
            elif data.get("type") == "ping":
                await manager.send_json(websocket, {"type": "pong"})
    
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info("Sign-to-Text client disconnected")


# ============================================
# Pipeline B: Speech-to-Sign WebSocket  
# ============================================
@app.websocket("/ws/speech-to-sign")
async def speech_to_sign_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for Speech-to-Sign pipeline.
    
    Receives: Audio chunks from microphone
    Sends: Gloss sequence for avatar animation
    """
    await manager.connect(websocket)
    
    try:
        while True:
            # Receive audio data from client
            data = await websocket.receive_json()
            
            if data.get("type") == "audio":
                audio_b64 = data.get("audio")
                if audio_b64:
                    try:
                        # Decode audio (just to verify validity)
                        if "," in audio_b64:
                            audio_b64 = audio_b64.split(",")[1]
                        audio_bytes = base64.b64decode(audio_b64)
                        logger.info(f"Received audio chunk: {len(audio_bytes)} bytes")
                        
                        # Ensure model is loaded (Lazy Load)
                        global model  # Required to modify the global variable
                        if model is None:
                            logger.info("Model not found in global scope. Loading 'tiny.en' in executor...")
                            try:
                                loop = asyncio.get_event_loop()
                                # Check ffmpeg
                                import shutil
                                if not shutil.which("ffmpeg"):
                                    logger.error("FFmpeg not found! Whisper requires FFmpeg.")
                                    text = "Error: FFmpeg missing"
                                    # Don't try to load model if ffmpeg is missing
                                else:
                                    model = await loop.run_in_executor(None, whisper.load_model, "tiny.en")
                                    logger.info(f"Model loaded successfully: {type(model)}")
                            except Exception as e:
                                logger.error(f"Failed to lazy-load model: {e}")
                                import traceback
                                logger.error(traceback.format_exc())
                                
                        # Transcribe with Whisper
                        text = "Error: Model failed to load"
                        gloss = []
                        
                        if model:
                            # Save to temp file
                            with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_audio:
                                temp_audio.write(audio_bytes)
                                temp_audio_path = temp_audio.name
                            
                            try:
                                logger.info(f"Transcribing audio from {temp_audio_path}...")
                                # Run transcription in executor
                                loop = asyncio.get_event_loop()
                                result = await loop.run_in_executor(None, model.transcribe, temp_audio_path)
                                text = result["text"].strip()
                                logger.info(f"Transcription Result: '{text}'")
                                
                                # Simple NLP
                                import re
                                clean_text = re.sub(r'[^\w\s]', '', text).upper()
                                gloss = clean_text.split()
                                logger.info(f"Generated Gloss: {gloss}")
                                
                            except Exception as e:
                                logger.error(f"Transcription failed: {e}")
                                import traceback
                                logger.error(traceback.format_exc())
                                text = f"Error: {str(e)}"
                            finally:
                                # Cleanup temp file
                                if os.path.exists(temp_audio_path):
                                    os.remove(temp_audio_path)
                        else:
                             logger.warning("Whisper model is still None after loading attempt.")
                        
                        response = {
                            "type": "gloss",
                            "text": text,
                            "gloss": gloss,
                            "timestamp": data.get("timestamp")
                        }
                        
                        logger.info(f"Sending response: {response}")
                        await manager.send_json(websocket, response)
                        
                    except Exception as e:
                        logger.error(f"Audio processing error: {e}")
            
            elif data.get("type") == "ping":
                await manager.send_json(websocket, {"type": "pong"})
    
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info("Speech-to-Sign client disconnected")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
