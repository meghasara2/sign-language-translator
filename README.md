# DeepBridge 🌉

**Bidirectional Sign Language Translation System**

A real-time AI-powered system that bridges communication between sign language users and spoken language users.

![Status](https://img.shields.io/badge/Status-In%20Development-yellow)
![Python](https://img.shields.io/badge/Python-3.9+-blue)
![React](https://img.shields.io/badge/React-18+-61dafb)

## 🎯 Overview

DeepBridge provides two-way translation:

| Pipeline | Direction | Technology Stack |
|----------|-----------|------------------|
| **Sign-to-Text** | 👋 → 📝 | MediaPipe → LSTM → Text → TTS |
| **Speech-to-Sign** | 🎤 → 🧑‍🤝‍🧑 | Whisper → Glosser → 3D Avatar |

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         DeepBridge UI                           │
│  ┌─────────────────────────┐   ┌─────────────────────────────┐  │
│  │    Sign-to-Text Panel   │   │   Speech-to-Sign Panel      │  │
│  │    ┌─────────────┐      │   │      ┌─────────────┐        │  │
│  │    │   Webcam    │      │   │      │  3D Avatar  │        │  │
│  │    │   Feed      │      │   │      │  (Three.js) │        │  │
│  │    └──────┬──────┘      │   │      └──────▲──────┘        │  │
│  │           │             │   │             │               │  │
│  │    [Recognized Text]    │   │    [Microphone Input]       │  │
│  │    [TTS Playback]       │   │    [Transcription]          │  │
│  └───────────┼─────────────┘   └─────────────┼───────────────┘  │
└──────────────┼───────────────────────────────┼──────────────────┘
               │                               │
               ▼                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    FastAPI Backend (WebSocket)                   │
│  ┌────────────────────────┐    ┌───────────────────────────┐    │
│  │   MediaPipe Holistic   │    │    OpenAI Whisper (STT)   │    │
│  │   Landmark Extractor   │    │    Glosser (NLP)          │    │
│  │   LSTM Classifier      │    │    Animation Controller   │    │
│  └────────────────────────┘    └───────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
DeepBridge/
├── backend/                    # Python FastAPI Backend
│   ├── app/
│   │   ├── main.py            # FastAPI + WebSocket server
│   │   ├── routers/           # API route handlers
│   │   └── services/          # Core ML services
│   └── ml/                    # Training scripts & models
│
├── frontend/                   # React + Three.js Frontend
│   ├── src/
│   │   ├── components/        # UI components
│   │   └── hooks/             # Custom React hooks
│   └── public/models/         # 3D avatar files
│
└── data/                      # Datasets & vocabularies
```

## 🚀 Quick Start

### Backend Setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

## 🎯 Target Vocabulary

Focused on **30-50 high-frequency ASL signs**:
- Greetings: Hello, Goodbye, Thank you, Please
- Questions: What, Where, When, How, Why, Who
- Common phrases: Yes, No, Help, Sorry, Name, You, Me
- Emergency: Help, Emergency, Doctor

## 📅 Development Roadmap

| Week | Milestone |
|------|-----------|
| 1-2 | Project setup, MediaPipe integration |
| 3-4 | LSTM training, real-time inference |
| 5-6 | Whisper STT, Glosser, 3D Avatar |
| 7-8 | Integration, optimization, demo |

## 📚 References

- [SignAvatars Dataset](https://github.com/ZhengdiYu/SignAvatars) - 3D Sign Language Motion Dataset
- [MediaPipe](https://mediapipe.dev/) - Real-time pose/hand tracking
- [OpenAI Whisper](https://github.com/openai/whisper) - Speech recognition
- [Ready Player Me](https://readyplayer.me/) - 3D Avatar generation

## 📄 License

MIT License - See [LICENSE](LICENSE) for details.
