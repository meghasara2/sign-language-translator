/**
 * Speech-to-Sign Panel Component
 * 
 * Captures audio, transcribes with Whisper, and displays 3D avatar animations.
 */

import { useState, useRef, useEffect, Suspense, useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei'
import { Mic, MicOff, Play, Pause, Loader2 } from 'lucide-react'
import AvatarScene from './AvatarScene'
import './SpeechToSignPanel.css'

function SpeechToSignPanel({ onGloss, isConnected }) {
    const [isListening, setIsListening] = useState(false)
    const [transcription, setTranscription] = useState('')
    const [glossSequence, setGlossSequence] = useState([])
    const [currentAnimationIndex, setCurrentAnimationIndex] = useState(0)
    const [isPlaying, setIsPlaying] = useState(false)
    const recognitionRef = useRef(null)

    // Initialize Web Speech API
    useEffect(() => {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            console.error("Web Speech API is not supported in this browser.")
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();

        recognition.continuous = false; // Stop when the user stops talking
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            console.log("[SpeechRecognition] Listening...");
            setIsListening(true);
        };

        recognition.onresult = async (event) => {
            const current = event.resultIndex;
            const transcript = event.results[current][0].transcript;
            console.log("[SpeechRecognition] Recognized:", transcript);

            setTranscription(transcript);

            // Send to backend for translation
            translateToGloss(transcript);
        };

        recognition.onerror = (event) => {
            console.error("[SpeechRecognition] Error:", event.error);
            if (event.error !== 'no-speech') {
                setIsListening(false);
            }
        };

        recognition.onend = () => {
            console.log("[SpeechRecognition] Disconnected.");
            setIsListening(false);
        };

        recognitionRef.current = recognition;

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.abort();
            }
        }
    }, [])

    const translateToGloss = async (text) => {
        try {
            const response = await fetch('http://localhost:8000/translate-to-gloss', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text })
            });

            if (response.ok) {
                const data = await response.json();
                setGlossSequence(data.gloss);
                setCurrentAnimationIndex(0);
                setIsPlaying(true);

                onGloss?.(data.gloss);
            } else {
                console.error("Failed to translate:", await response.text());
            }
        } catch (err) {
            console.error("Translation API Error:", err);
        }
    }

    // Play through animation sequence with 'Rest/Idle' interpolation
    useEffect(() => {
        if (!isPlaying || glossSequence.length === 0) return

        if (currentAnimationIndex < glossSequence.length * 2) {

            // Even indexes are actual signs. Odd indexes are brief 'IDLE' rest poses.
            const isRestPose = currentAnimationIndex % 2 !== 0;
            const delay = isRestPose ? 300 : 1800; // 300ms rest, 1.8s sign play time

            const timer = setTimeout(() => {
                setCurrentAnimationIndex(prev => prev + 1)
            }, delay)

            return () => clearTimeout(timer)
        } else {
            setIsPlaying(false)
        }
    }, [isPlaying, currentAnimationIndex, glossSequence])

    // Derive the actual string to send to the avatar
    const getActiveSign = () => {
        if (!isPlaying || glossSequence.length === 0) return null;
        if (currentAnimationIndex >= glossSequence.length * 2) return null;

        // If it's an odd index, we want the avatar to interpolate back to IDLE
        if (currentAnimationIndex % 2 !== 0) return 'IDLE';

        // Otherwise, return the actual gloss word
        const actualIndex = Math.floor(currentAnimationIndex / 2);
        return glossSequence[actualIndex];
    }

    const currentGlossText = getActiveSign();
    // For UI Highlighting, we only care about the actual words
    const displayIndex = Math.floor(currentAnimationIndex / 2);

    // Start listening
    const startListening = () => {
        if (recognitionRef.current && !isListening) {
            try {
                recognitionRef.current.start();
                setTranscription(''); // clear previous
                setGlossSequence([]);
            } catch (err) {
                console.error("Couldn't start recognition:", err);
            }
        }
    }

    // Stop listening
    const stopListening = () => {
        if (recognitionRef.current && isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
        }
    }

    // Toggle play/pause
    const togglePlayback = () => {
        if (isPlaying) {
            setIsPlaying(false)
        } else if (glossSequence.length > 0) {
            setCurrentAnimationIndex(0)
            setIsPlaying(true)
        }
    }

    const currentGloss = getActiveSign()

    return (
        <div className="speech-to-sign-panel">
            {/* Header */}
            <div className="panel-header">
                <div className="panel-title">
                    <span className="panel-icon">🗣️</span>
                    <h3>Speech → Sign</h3>
                </div>
                <div className="panel-controls">
                    {glossSequence.length > 0 && (
                        <button
                            className={`control-btn ${isPlaying ? 'active' : ''}`}
                            onClick={togglePlayback}
                            title={isPlaying ? 'Pause' : 'Replay'}
                        >
                            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                        </button>
                    )}
                </div>
            </div>

            {/* 3D Avatar Canvas */}
            <div className="avatar-container">
                <Canvas
                    camera={{ position: [0, 1.5, 3], fov: 50 }}
                    shadows
                >
                    <Suspense fallback={null}>
                        {/* Lighting */}
                        <ambientLight intensity={0.5} />
                        <directionalLight
                            position={[5, 5, 5]}
                            intensity={1}
                            castShadow
                        />
                        <pointLight position={[-5, 5, -5]} intensity={0.5} color="#6366f1" />

                        {/* Avatar */}
                        <AvatarScene
                            currentSign={currentGlossText}
                            isPlaying={isPlaying}
                        />

                        {/* Environment */}
                        <Environment preset="city" />
                        <ContactShadows
                            position={[0, 0, 0]}
                            opacity={0.4}
                            scale={10}
                            blur={2.5}
                        />

                        {/* Controls */}
                        <OrbitControls
                            enablePan={false}
                            minDistance={2}
                            maxDistance={5}
                            target={[0, 1, 0]}
                        />
                    </Suspense>
                </Canvas>

                {/* Current Sign Display */}
                <div className="current-sign-overlay">
                    {currentGlossText && currentGlossText !== 'IDLE' && (
                        <div className="current-sign">
                            <span className="sign-label">Signing:</span>
                            <span className="sign-text">{currentGlossText}</span>
                        </div>
                    )}
                </div>

                {/* Loading Indicator */}
                {!isConnected && (
                    <div className="avatar-loading">
                        <Loader2 size={32} className="spin" />
                        <span>Not Connected to Backend</span>
                    </div>
                )}
            </div>

            {/* Transcription & Gloss Display */}
            <div className="gloss-area">
                <div className="transcription-box">
                    <span className="box-label">Transcription</span>
                    <p className="transcription-text">
                        {transcription || 'Speak to see transcription...'}
                    </p>
                </div>

                <div className="gloss-box">
                    <span className="box-label">Sign Gloss</span>
                    <div className="gloss-sequence">
                        {glossSequence.length > 0 ? (
                            glossSequence.map((gloss, index) => (
                                <span
                                    key={index}
                                    className={`gloss-item ${index === displayIndex && isPlaying ? 'active' : ''} ${index < displayIndex ? 'done' : ''}`}
                                >
                                    {gloss}
                                </span>
                            ))
                        ) : (
                            <span className="gloss-placeholder">Gloss will appear here...</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Microphone Controls */}
            <div className="panel-footer">
                <button
                    className={`btn mic-btn ${isListening ? 'btn-recording' : 'btn-primary'}`}
                    onClick={isListening ? stopListening : startListening}
                >
                    {isListening ? (
                        <>
                            <MicOff size={18} />
                            Stop Recording
                            <div className="recording-indicator"></div>
                        </>
                    ) : (
                        <>
                            <Mic size={18} />
                            Start Recording
                        </>
                    )}
                </button>
            </div>
        </div>
    )
}

export default SpeechToSignPanel
