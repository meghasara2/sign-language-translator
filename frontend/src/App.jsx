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
    const [transcript, setTranscript] = useState([])
    const [avatarUrl, setAvatarUrl] = useState('/avatar.glb')
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)

    // Check backend connection
    useEffect(() => {
        const checkBackend = async () => {
            try {
                const response = await fetch('/api/vocabulary')
                if (response.ok) {
                    setBackendStatus('online')
                } else {
                    setBackendStatus('offline')
                }
            } catch (error) {
                // Try direct connection
                try {
                    const directResponse = await fetch('http://localhost:8000/')
                    if (directResponse.ok) {
                        setBackendStatus('online')
                    } else {
                        setBackendStatus('offline')
                    }
                } catch {
                    setBackendStatus('offline')
                }
            }
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
                    <div className={`status-indicator ${backendStatus}`}>
                        <div className={`status-dot ${backendStatus}`}></div>
                        <span>
                            {backendStatus === 'online' ? 'Connected' :
                                backendStatus === 'connecting' ? 'Connecting...' : 'Offline'}
                        </span>
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
                    onClick={() => setActiveMode(activeMode === 'both' ? 'sign-to-text' : 'both')}
                >
                    <Hand size={20} />
                    <span>Sign → Text</span>
                </button>
                <button
                    className={`mode-btn ${activeMode === 'speech-to-sign' || activeMode === 'both' ? 'active' : ''}`}
                    onClick={() => setActiveMode(activeMode === 'both' ? 'speech-to-sign' : 'both')}
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
                                onRecognition={(text) => addTranscript({ type: 'sign', text })}
                                isConnected={backendStatus === 'online'}
                            />
                        </div>
                    )}

                    {/* Right Panel: Speech to Sign */}
                    {(activeMode === 'speech-to-sign' || activeMode === 'both') && (
                        <div className="panel panel-right animate-slideIn" style={{ animationDelay: '0.1s' }}>
                            <SpeechToSignPanel
                                onGloss={(gloss) => addTranscript({ type: 'speech', text: gloss.join(' ') })}
                                isConnected={backendStatus === 'online'}
                                avatarUrl={avatarUrl}
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
