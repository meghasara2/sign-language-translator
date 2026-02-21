/**
 * DeepBridge - Main Application
 * 
 * Bidirectional Sign Language Translation Dashboard
 */

import { useState, useEffect } from 'react'
import SignToTextPanel from './components/SignToTextPanel'
import SpeechToSignPanel from './components/SpeechToSignPanel'
import SettingsModal from './components/SettingsModal'
import { Hand, Mic, Settings, Info, Loader2 } from 'lucide-react'
import './App.css'

function App() {
    const [activeMode, setActiveMode] = useState('both') // 'sign-to-text', 'speech-to-sign', 'both'
    const [backendStatus, setBackendStatus] = useState('connecting')
    const [geminiStatus, setGeminiStatus] = useState('checking')
    const [cameraStatus, setCameraStatus] = useState('standby')
    const [transcript, setTranscript] = useState([])
    const [avatarUrl, setAvatarUrl] = useState('/avatar.glb')
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)
    const [resetKey, setResetKey] = useState(0) // Global toggle to force child re-renders/resets

    // Check backend connection
    useEffect(() => {
        const checkBackend = async () => {
            try {
                const response = await fetch('http://localhost:8000/')
                if (response.ok) {
                    const data = await response.json()
                    setBackendStatus('online')
                    setGeminiStatus(data.gemini_api || 'offline')
                } else {
                    setBackendStatus('offline')
                    setGeminiStatus('offline')
                }
            } catch (error) {
                setBackendStatus('offline')
                setGeminiStatus('offline')
            }
        }

        // Check camera permission state without prompting if possible
        if (navigator.permissions && navigator.permissions.query) {
            navigator.permissions.query({ name: 'camera' }).then(res => {
                if (res.state === 'granted') setCameraStatus('online')
                else if (res.state === 'denied') setCameraStatus('offline')

                res.onchange = () => {
                    if (res.state === 'granted') setCameraStatus('online')
                    else if (res.state === 'denied') setCameraStatus('offline')
                }
            }).catch(() => { /* Ignore on browsers that don't support camera in permission query */ })
        }

        checkBackend()
        const interval = setInterval(checkBackend, 5000)
        return () => clearInterval(interval)
    }, [])

    // Add to transcript
    const addTranscript = (entry) => {
        setTranscript(prev => [...prev, {
            ...entry,
            timestamp: new Date().toLocaleTimeString()
        }])
    }

    return (
        <div className="app">
            {/* Header */}
            <header className="header glass">
                <div className="header-left">
                    <div className="logo">
                        <span className="logo-icon">🌉</span>
                        <h1>DeepBridge</h1>
                    </div>
                    <span className="tagline">Bidirectional Sign Language Translation</span>
                </div>

                <div className="header-right">
                    <div className="system-check-dashboard glass">
                        <div className={`status-item ${backendStatus}`}>
                            <span className={`status-dot ${backendStatus}`}></span> Backend
                        </div>
                        <div className={`status-item ${cameraStatus}`}>
                            <span className={`status-dot ${cameraStatus}`}></span> Camera
                        </div>
                        <div className={`status-item ${geminiStatus}`}>
                            <span className={`status-dot ${geminiStatus}`}></span> Gemini API
                        </div>
                    </div>

                    <button
                        className="btn btn-secondary icon-btn"
                        title="Settings"
                        onClick={() => setIsSettingsOpen(true)}
                    >
                        <Settings size={20} />
                    </button>
                    <button className="btn btn-secondary icon-btn" title="Info">
                        <Info size={20} />
                    </button>
                </div>
            </header>

            {/* Mode Selector */}
            <nav className="mode-selector">
                <button
                    className={`mode-btn ${activeMode === 'sign-to-text' || activeMode === 'both' ? 'active' : ''}`}
                    onClick={() => {
                        setActiveMode(activeMode === 'both' ? 'sign-to-text' : 'both')
                        setResetKey(prev => prev + 1)
                    }}
                >
                    <Hand size={20} />
                    <span>Sign → Text</span>
                </button>
                <button
                    className={`mode-btn ${activeMode === 'speech-to-sign' || activeMode === 'both' ? 'active' : ''}`}
                    onClick={() => {
                        setActiveMode(activeMode === 'both' ? 'speech-to-sign' : 'both')
                        setResetKey(prev => prev + 1)
                    }}
                >
                    <Mic size={20} />
                    <span>Speech → Sign</span>
                </button>
            </nav>

            {/* Main Content */}
            <main className="main-content">
                <div className={`panels-container ${activeMode}`}>
                    {/* Left Panel: Sign to Text */}
                    {(activeMode === 'sign-to-text' || activeMode === 'both') && (
                        <div className="panel panel-left animate-slideIn">
                            <SignToTextPanel
                                key={`sign-${resetKey}`}
                                onRecognition={(text) => addTranscript({ type: 'sign', text })}
                                isConnected={backendStatus === 'online'}
                                isActive={activeMode === 'sign-to-text' || activeMode === 'both'}
                            />
                        </div>
                    )}

                    {/* Right Panel: Speech to Sign */}
                    {(activeMode === 'speech-to-sign' || activeMode === 'both') && (
                        <div className="panel panel-right animate-slideIn" style={{ animationDelay: '0.1s' }}>
                            <SpeechToSignPanel
                                key={`speech-${resetKey}`}
                                onGloss={(gloss) => addTranscript({ type: 'speech', text: gloss.join(' ') })}
                                isConnected={backendStatus === 'online'}
                                avatarUrl={avatarUrl}
                                isActive={activeMode === 'speech-to-sign' || activeMode === 'both'}
                            />
                        </div>
                    )}
                </div>

                {/* Transcript */}
                <div className="transcript-bar glass">
                    <div className="transcript-header">
                        <h4>Live Transcript</h4>
                        {transcript.length > 0 && (
                            <button
                                className="clear-btn"
                                onClick={() => setTranscript([])}
                            >
                                Clear
                            </button>
                        )}
                    </div>
                    <div className="transcript-content">
                        {transcript.length === 0 ? (
                            <p className="transcript-empty">Translations will appear here...</p>
                        ) : (
                            transcript.slice(-5).map((entry, index) => (
                                <div key={index} className={`transcript-entry ${entry.type}`}>
                                    <span className="transcript-icon">
                                        {entry.type === 'sign' ? '👋' : '🗣️'}
                                    </span>
                                    <span className="transcript-text">{entry.text}</span>
                                    <span className="transcript-time">{entry.timestamp}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </main>

            {/* Settings Modal */}
            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                avatarUrl={avatarUrl}
                onAvatarChange={setAvatarUrl}
            />

            {/* Footer */}
            <footer className="footer">
                <p>DeepBridge v0.1.0 • Built with ❤️ for accessibility</p>
            </footer>
        </div>
    )
}

export default App
