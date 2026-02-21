import React, { useState } from 'react'
import { X, Save, RefreshCw } from 'lucide-react'
import './SettingsModal.css'

function SettingsModal({ isOpen, onClose, avatarUrl, onAvatarChange }) {
    const [tempUrl, setTempUrl] = useState(avatarUrl)

    if (!isOpen) return null

    const handleSave = () => {
        onAvatarChange(tempUrl)
        onClose()
    }

    const resetToDefault = () => {
        setTempUrl('/avatar.glb')
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content glass" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Settings</h3>
                    <button className="close-btn" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className="modal-body">
                    <div className="settings-section">
                        <label>Ready Player Me Avatar URL (.glb)</label>
                        <div className="input-group">
                            <input
                                type="text"
                                value={tempUrl}
                                onChange={(e) => setTempUrl(e.target.value)}
                                placeholder="https://models.readyplayer.me/your-avatar.glb"
                            />
                            <button
                                className="icon-btn"
                                onClick={resetToDefault}
                                title="Reset to Default"
                            >
                                <RefreshCw size={16} />
                            </button>
                        </div>
                        <p className="help-text">
                            Paste your GLB URL from Ready Player Me to use your personalized avatar.
                        </p>
                    </div>

                    <div className="settings-section">
                        <label>Translation Mode</label>
                        <select defaultValue="asl">
                            <option value="asl">American Sign Language (ASL)</option>
                            <option value="isl">Indian Sign Language (ISL)</option>
                        </select>
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary btn-with-icon" onClick={handleSave}>
                        <Save size={18} />
                        Save Settings
                    </button>
                </div>
            </div>
        </div>
    )
}

export default SettingsModal
