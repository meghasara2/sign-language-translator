import whisper
import os

def test_whisper():
    print("Testing Whisper...")
    try:
        # Check ffmpeg
        import shutil
        if not shutil.which("ffmpeg"):
            print("ERROR: FFmpeg not found!")
            return

        print("Loading model 'tiny.en'...")
        model = whisper.load_model("tiny.en")
        print("Model loaded successfully.")
        
        # Test transcription (optional, needs file)
        # We just want to check if load works
        print("Model object:", type(model))

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_whisper()
