/**
 * Speech-to-Sign Panel Component
 * 
 * Captures audio, transcribes with Whisper, and displays 3D avatar animations.
 */

import { useState, useRef, useEffect, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei'
import { Mic, MicOff, Play, Pause, Loader2 } from 'lucide-react'
import AvatarScene from './AvatarScene'
import useWebSocket from '../hooks/useWebSocket'
import './SpeechToSignPanel.css'

function SpeechToSignPanel({ onGloss, isConnected }) {
    const [isListening, setIsListening] = useState(false)
    const [transcription, setTranscription] = useState('')
    const [glossSequence, setGlossSequence] = useState([])
    const [currentAnimationIndex, setCurrentAnimationIndex] = useState(0)
    const [isPlaying, setIsPlaying] = useState(false)
    const mediaRecorderRef = useRef(null)
    const audioChunksRef = useRef([])
    const mimeTypeRef = useRef('audio/webm')

    const processedMessageRef = useRef(null)

    // WebSocket connection
    const { isOpen, send, lastMessage } = useWebSocket(
        isConnected ? 'ws://localhost:8000/ws/speech-to-sign' : null
    )

    // Handle incoming gloss sequences
    useEffect(() => {
        if (lastMessage && lastMessage !== processedMessageRef.current && lastMessage.type === 'gloss') {
            processedMessageRef.current = lastMessage

            setTranscription(lastMessage.text)
            setGlossSequence(lastMessage.gloss)
            setCurrentAnimationIndex(0)
            setIsPlaying(true)

            // Notify parent
            onGloss?.(lastMessage.gloss)
        }
    }, [lastMessage, onGloss])

    // Play through animation sequence
    // Play through animation sequence
    useEffect(() => {
        if (!isPlaying || glossSequence.length === 0) return

        if (currentAnimationIndex < glossSequence.length) {
            const timer = setTimeout(() => {
                setCurrentAnimationIndex(prev => prev + 1)
            }, 1200) // 1.2 seconds per sign

            return () => clearTimeout(timer)
        } else {
            setIsPlaying(false)
        }
    }, [isPlaying, currentAnimationIndex, glossSequence])

    // Start listening
    const startListening = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            console.log('[Frontend] Microphone access granted')

            // Dynamically select MIME type
            let mimeType = 'audio/webm'
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                mimeType = 'audio/webm;codecs=opus'
            } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                mimeType = 'audio/mp4' // Safari support
            } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
                mimeType = 'audio/ogg' // Firefox fallback
            }
            console.log('[Frontend] Using MIME type:', mimeType)
            mimeTypeRef.current = mimeType

            mediaRecorderRef.current = new MediaRecorder(stream, { mimeType })

            mediaRecorderRef.current.onstart = () => {
                console.log('[Frontend] MediaRecorder started')
                audioChunksRef.current = []
            }

            mediaRecorderRef.current.onerror = (event) => {
                console.error('[Frontend] MediaRecorder error:', event.error)
            }

            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data)
                }
            }

            mediaRecorderRef.current.onstop = async () => {
                const mimeType = mimeTypeRef.current
                const audioBlob = new Blob(audioChunksRef.current, { type: mimeType.split(';')[0] }) // Use the determined mimeType for the blob
                console.log('[Frontend] Audio recording stopped. Blob size:', audioBlob.size)

                // Convert blob to base64
                const reader = new FileReader()
                reader.readAsDataURL(audioBlob)
                reader.onloadend = () => {
                    const base64Audio = reader.result
                    console.log('[Frontend] Audio converted to base64. Length:', base64Audio.length)

                    if (isOpen) {
                        console.log('[Frontend] Sending audio to backend via WebSocket...')
                        send({
                            type: 'audio',
                            audio: base64Audio,
                            timestamp: Date.now()
                        })
                    } else {
                        console.warn('[Frontend] WebSocket is closed, cannot send audio.')
                    }
                }
            }

            mediaRecorderRef.current.start()
            setIsListening(true)
        } catch (error) {
            console.error('Microphone error:', error)
        }
    }

    // Stop listening
    const stopListening = () => {
        if (mediaRecorderRef.current && isListening) {
            mediaRecorderRef.current.stop()
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
            setIsListening(false)
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

    const currentGloss = glossSequence[currentAnimationIndex] || null

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
                            currentSign={currentGloss}
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
                    {currentGloss && (
                        <div className="current-sign">
                            <span className="sign-label">Signing:</span>
                            <span className="sign-text">{currentGloss}</span>
                        </div>
                    )}
                </div>

                {/* Loading Indicator */}
                {!isConnected && (
                    <div className="avatar-loading">
                        <Loader2 size={32} className="spin" />
                        <span>Connecting...</span>
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
                                    className={`gloss-item ${index === currentAnimationIndex && isPlaying ? 'active' : ''} ${index < currentAnimationIndex ? 'done' : ''}`}
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
