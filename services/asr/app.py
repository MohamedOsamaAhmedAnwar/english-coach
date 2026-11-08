import os
import tempfile
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

MODEL_SIZE = os.getenv("WHISPER_MODEL", "small.en")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
COMPUTE = os.getenv("WHISPER_COMPUTE", "int8")

model = None
load_error = None
ready = threading.Event()


def load_model():
    global model, load_error
    try:
        from faster_whisper import WhisperModel

        model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE)
    except Exception as exc:  # noqa: BLE001
        load_error = f"{type(exc).__name__}: {exc}"
    finally:
        ready.set()


@asynccontextmanager
async def lifespan(app: FastAPI):
    threading.Thread(target=load_model, daemon=True).start()
    yield


app = FastAPI(title="English Coach ASR", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {
        "ready": model is not None,
        "loading": not ready.is_set(),
        "model": MODEL_SIZE,
        "device": DEVICE,
        "compute": COMPUTE,
        "error": load_error,
    }


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), language: str = Form("en")):
    if not ready.wait(timeout=180):
        raise HTTPException(503, "Model still loading")
    if model is None:
        raise HTTPException(503, f"Model failed to load: {load_error}")

    suffix = os.path.splitext(file.filename or "answer.webm")[1] or ".webm"
    path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(await file.read())
            path = tmp.name

        segments, info = model.transcribe(
            path,
            language=None if language == "auto" else language,
            word_timestamps=True,
            vad_filter=True,
            beam_size=5,
            condition_on_previous_text=False,
        )

        words = []
        segs = []
        for seg in segments:
            segs.append({"start": seg.start, "end": seg.end, "text": seg.text})
            for word in seg.words or []:
                words.append(
                    {
                        "word": word.word,
                        "start": word.start,
                        "end": word.end,
                        "probability": word.probability,
                    }
                )

        text = " ".join(s["text"].strip() for s in segs).strip()
        return {
            "text": text,
            "language": info.language,
            "language_probability": info.language_probability,
            "duration": info.duration,
            "words": words,
            "segments": segs,
            "model": MODEL_SIZE,
        }
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"Transcription error: {type(exc).__name__}: {exc}") from exc
    finally:
        if path and os.path.exists(path):
            os.unlink(path)
