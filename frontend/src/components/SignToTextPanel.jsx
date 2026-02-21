/**
 * Sign-to-Text Panel Component
 * 
 * Captures webcam feed, extracts landmarks, and displays predictions.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Camera as LucideCamera, CameraOff, Volume2, VolumeX, Loader2, AlertCircle, Copy, Check } from 'lucide-react'
import { Holistic } from '@mediapipe/holistic'
import { Camera } from '@mediapipe/camera_utils'
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils'
import {
    POSE_CONNECTIONS,
    FACEMESH_TESSELATION,
    HAND_CONNECTIONS
} from '@mediapipe/holistic'
import useWebSocket from '../hooks/useWebSocket'
import './SignToTextPanel.css'

function SignToTextPanel({ onRecognition, isConnected, isActive }) {
    const videoRef = useRef(null)
    const canvasRef = useRef(null)
    const [isStreaming, setIsStreaming] = useState(false)
    const [isTTSEnabled, setIsTTSEnabled] = useState(true)
    const [currentPrediction, setCurrentPrediction] = useState(null)
    const [currentGloss, setCurrentGloss] = useState(null)
    const [glossBuffer, setGlossBuffer] = useState([])
    const [isTranslating, setIsTranslating] = useState(false)
    const [confidence, setConfidence] = useState(0)
    const [error, setError] = useState(null)
    const [copied, setCopied] = useState(false)

    // WebSocket connection (Disabled while using POST for prediction)
    // const { isOpen, send, lastMessage } = useWebSocket(
    //     isConnected ? 'ws://localhost:8000/ws/sign-to-text' : null
    // )
    // const isOpen = true; // Mock true for UI purposes

    const holisticRef = useRef(null)
    const cameraRef = useRef(null)
    const framesBufferRef = useRef([]) // 30-frame sliding window
    const lastPredictionTimeRef = useRef(0) // Throttle API calls
    const lastGlossTimeRef = useRef(Date.now()) // Track pauses for the buffer

    // Handle incoming predictions (now via POST, not WebSocket)
    // useEffect(() => {
    //     if (lastMessage && lastMessage.type === 'prediction') {
    //         setCurrentPrediction(lastMessage.text)
    //         setConfidence(lastMessage.confidence)

    //         // Notify parent
    //         onRecognition?.(lastMessage.text)

    //         // Text-to-Speech
    //         if (isTTSEnabled && lastMessage.text) {
    //             speak(lastMessage.text)
    //         }
    //     }
    // }, [lastMessage, isTTSEnabled, onRecognition])

    const handlePredictionResult = useCallback((text, gloss, conf) => {
        if (!gloss || gloss === "" || gloss === "ERROR" || gloss === "IDLE") return;

        // Only accept if confidence is reasonable
        if (conf < 0.6) return;

        setCurrentGloss(gloss)
        setConfidence(conf)

        // Add to buffer if it's different from the last sign
        setGlossBuffer(prev => {
            const lastSign = prev.length > 0 ? prev[prev.length - 1] : null
            if (lastSign !== gloss) {
                lastGlossTimeRef.current = Date.now()
                return [...prev, gloss]
            }
            // Even if it's the same sign, we keep detecting it so it's not a pause yet 
            lastGlossTimeRef.current = Date.now()
            return prev
        })

    }, [])

    // Buffer processing timer
    useEffect(() => {
        const checkBuffer = async () => {
            if (glossBuffer.length > 0 && !isTranslating) {
                const now = Date.now()
                // If 5 seconds have passed since the last unique sign was detected
                if (now - lastGlossTimeRef.current > 5000) {
                    setIsTranslating(true)
                    const bufferToSend = [...glossBuffer]
                    setGlossBuffer([]) // Clear buffer immediately

                    try {
                        const response = await fetch('http://localhost:8000/translate-to-english', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ glosses: bufferToSend })
                        })

                        if (response.ok) {
                            const data = await response.json()
                            if (data.text) {
                                setCurrentPrediction(data.text)
                                onRecognition?.(data.text)

                                // Text-to-Speech
                                if (isTTSEnabled) {
                                    speak(data.text)
                                }
                            }
                        }
                    } catch (err) {
                        console.error("Reverse translation error:", err)
                    } finally {
                        setIsTranslating(false)
                    }
                }
            }
        }

        const interval = setInterval(checkBuffer, 1000)
        return () => clearInterval(interval)
    }, [glossBuffer, isTranslating, isTTSEnabled, onRecognition])

    // Start webcam
    const startCamera = async () => {
        try {
            setError(null)

            if (!holisticRef.current) {
                const holistic = new Holistic({
                    locateFile: (file) => {
                        return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`
                    }
                })

                holistic.setOptions({
                    modelComplexity: 1,
                    smoothLandmarks: true,
                    minDetectionConfidence: 0.5,
                    minTrackingConfidence: 0.5
                })

                holistic.onResults(onResults)
                holisticRef.current = holistic
            }

            if (videoRef.current && !cameraRef.current) {
                const camera = new Camera(videoRef.current, {
                    onFrame: async () => {
                        await holisticRef.current.send({ image: videoRef.current })
                    },
                    width: 640,
                    height: 480
                })
                camera.start()
                cameraRef.current = camera
                setIsStreaming(true)
            }
        } catch (err) {
            console.error('Camera error:', err)
            setError('Unable to access camera. Please grant permission.')
        }
    }

    // Stop webcam
    const stopCamera = () => {
        if (cameraRef.current) {
            cameraRef.current.stop()
            cameraRef.current = null
        }
        if (videoRef.current?.srcObject) {
            const tracks = videoRef.current.srcObject.getTracks()
            tracks.forEach(track => track.stop())
            videoRef.current.srcObject = null
        }
        setIsStreaming(false)
        setCurrentPrediction(null)
        setCurrentGloss(null)
        setGlossBuffer([])
    }

    // MediaPipe Results Handler
    const onResults = useCallback((results) => {
        if (!canvasRef.current) return

        // THROTTLE: Only process landmarks if this panel is currently active
        // This saves massive amounts of CPU/GPU when user is speaking to the avatar
        if (!isActive) return;

        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')

        // Draw the landmarks on the canvas
        ctx.save()
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        // Only draw segmentations/landmarks, not the video frame itself 
        // as the video is rendered in a separate <video> element

        // Pose
        drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS,
            { color: '#00FF00', lineWidth: 4 })
        drawLandmarks(ctx, results.poseLandmarks,
            { color: '#FF0000', lineWidth: 2 })

        // Face
        drawConnectors(ctx, results.faceLandmarks, FACEMESH_TESSELATION,
            { color: '#C0C0C070', lineWidth: 1 })

        // Left Hand
        drawConnectors(ctx, results.leftHandLandmarks, HAND_CONNECTIONS,
            { color: '#CC0000', lineWidth: 5 })
        drawLandmarks(ctx, results.leftHandLandmarks,
            { color: '#00FF00', lineWidth: 2 })

        // Right Hand
        drawConnectors(ctx, results.rightHandLandmarks, HAND_CONNECTIONS,
            { color: '#00CC00', lineWidth: 5 })
        drawLandmarks(ctx, results.rightHandLandmarks,
            { color: '#FF0000', lineWidth: 2 })

        ctx.restore()

        ctx.restore()

        // Extract and flatten landmarks
        // Backend expects 225 features: (33 pose + 21 left + 21 right) * 3 (x,y,z) = 225 features per frame
        // Note: Face is excluded from the 225 feature count to match the Python extraction logic

        let flattenedFrame = []

        // Pose (33 points * 3 = 99 features)
        if (results.poseLandmarks) {
            results.poseLandmarks.forEach(lm => {
                flattenedFrame.push(lm.x, lm.y, lm.z)
            })
        } else {
            flattenedFrame.push(...new Array(33 * 3).fill(0))
        }

        // Left Hand (21 points * 3 = 63 features)
        if (results.leftHandLandmarks) {
            results.leftHandLandmarks.forEach(lm => {
                flattenedFrame.push(lm.x, lm.y, lm.z)
            })
        } else {
            flattenedFrame.push(...new Array(21 * 3).fill(0))
        }

        // Right Hand (21 points * 3 = 63 features)
        if (results.rightHandLandmarks) {
            results.rightHandLandmarks.forEach(lm => {
                flattenedFrame.push(lm.x, lm.y, lm.z)
            })
        } else {
            flattenedFrame.push(...new Array(21 * 3).fill(0))
        }

        // Total flattenedFrame length should be 99 + 63 + 63 = 225

        // Add to buffer
        framesBufferRef.current.push(flattenedFrame)

        // Keep exactly 30 frames
        if (framesBufferRef.current.length > 30) {
            framesBufferRef.current = framesBufferRef.current.slice(framesBufferRef.current.length - 30)
        }

        // Check if we should send for prediction
        const now = Date.now()
        // Only predict if we have 30 frames, haven't predicted recently, AND the panel is active
        if (framesBufferRef.current.length === 30 && (now - lastPredictionTimeRef.current) > 1000 && isActive) {

            // Check if hands are present in the final frame before predicting
            if (results.leftHandLandmarks || results.rightHandLandmarks) {
                lastPredictionTimeRef.current = now
                sendPredictionRequest(framesBufferRef.current)
            }
        }

    }, [onRecognition, isTTSEnabled])

    // Send sequence to backend API
    const sendPredictionRequest = async (sequence) => {
        try {
            const response = await fetch('http://localhost:8000/predict', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ frames: sequence })
            })

            if (response.ok) {
                const data = await response.json()
                if (data.gloss) {
                    handlePredictionResult(data.text || data.gloss, data.gloss, data.confidence || 0.8)
                }
            }
        } catch (error) {
            console.error("Prediction API Error:", error)
        }
    }

    // Text-to-Speech
    const speak = (text) => {
        if ('speechSynthesis' in window && isActive) {
            const utterance = new SpeechSynthesisUtterance(text)
            utterance.rate = 0.9
            utterance.pitch = 1
            window.speechSynthesis.speak(utterance)
        }
    }

    const handleCopy = () => {
        if (currentPrediction) {
            navigator.clipboard.writeText(currentPrediction)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    // Capture frame disabled. Video feed processed directly by MediaPipe camera hook
    const captureFrame = useCallback(() => { }, [])

    return (
        <div className="sign-to-text-panel">
            {/* Header */}
            <div className="panel-header">
                <div className="panel-title">
                    <span className="panel-icon">👋</span>
                    <h3>Sign → Text</h3>
                </div>
                <div className="panel-controls">
                    <button
                        className={`control-btn ${isTTSEnabled ? 'active' : ''}`}
                        onClick={() => setIsTTSEnabled(!isTTSEnabled)}
                        title={isTTSEnabled ? 'Disable TTS' : 'Enable TTS'}
                    >
                        {isTTSEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                    </button>
                </div>
            </div>

            {/* Video Area */}
            <div className="video-container">
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={isStreaming ? 'active' : ''}
                />
                <canvas
                    ref={canvasRef}
                    width={640}
                    height={480}
                    className={`landmark-canvas ${isStreaming ? 'active' : ''}`}
                />

                {!isStreaming && (
                    <div className="video-placeholder">
                        <LucideCamera size={48} className="placeholder-icon" />
                        <p>Click Start to enable camera</p>
                    </div>
                )}

                {error && (
                    <div className="video-error">
                        <AlertCircle size={24} />
                        <p>{error}</p>
                    </div>
                )}

                {/* Landmark overlay would go here */}
                {isStreaming && (
                    <div className="landmark-overlay">
                        <div className="landmark-status">
                            <span className="status-dot online"></span>
                            <span>Detecting...</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Prediction Display */}
            <div className="prediction-area">
                <div className="prediction-box text-box">
                    <div className="box-header">
                        <span className="box-label">TRANSCRIPTION</span>
                        {currentPrediction && (
                            <button className="copy-btn" onClick={handleCopy} title="Copy to clipboard">
                                {copied ? <Check size={16} className="text-secondary" /> : <Copy size={16} />}
                            </button>
                        )}
                    </div>
                    {currentPrediction ? (
                        <span className="prediction-text">{currentPrediction}</span>
                    ) : (
                        <span className="prediction-placeholder">
                            {isStreaming ? 'Waiting for sign...' : 'Start camera to begin'}
                        </span>
                    )}
                </div>

                <div className="prediction-box gloss-box">
                    <span className="box-label">SIGN GLOSS BUFFER</span>
                    {glossBuffer.length > 0 || currentGloss ? (
                        <>
                            <div className="gloss-sequence">
                                {glossBuffer.map((g, i) => (
                                    <span key={i} className="gloss-tag">{g}</span>
                                ))}
                                {currentGloss && !glossBuffer.includes(currentGloss) && (
                                    <span className="gloss-tag active">{currentGloss}</span>
                                )}
                            </div>
                            <div className="confidence-bar">
                                <div
                                    className="confidence-fill"
                                    style={{ width: `${confidence * 100}%` }}
                                />
                            </div>
                            <span className="confidence-text">{(confidence * 100).toFixed(0)}% confidence</span>
                        </>
                    ) : (
                        <span className="prediction-placeholder">
                            {isTranslating ? <div className="translating"><Loader2 size={16} className="spin" /> Translating...</div> : 'Gloss will appear here...'}
                        </span>
                    )}
                </div>
            </div>

            {/* Controls */}
            <div className="panel-footer">
                <button
                    className={`btn ${isStreaming ? 'btn-danger' : 'btn-primary'}`}
                    onClick={isStreaming ? stopCamera : startCamera}
                >
                    {isStreaming ? (
                        <>
                            <CameraOff size={18} />
                            Stop Camera
                        </>
                    ) : (
                        <>
                            <LucideCamera size={18} />
                            Start Camera
                        </>
                    )}
                </button>
            </div>
        </div>
    )
}

export default SignToTextPanel
