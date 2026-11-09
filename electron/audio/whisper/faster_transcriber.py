from hallucination_filter import is_hallucination
from confidence_filter import is_confident
from language_filter import validate_language

from sentence_corrector import correct_text

from transcript_stabilizer import TranscriptStabilizer

import sys
import json
import warnings
import os
import traceback

try:
    print(
        json.dumps({
            "startup": "python_started"
        }),
        flush=True
    )
except Exception:
    pass

# Suppress loud compiler warnings to protect the Node standard I/O stream
warnings.filterwarnings("ignore")
os.environ["CT2_VERBOSE"] = "0"

try:
    from faster_whisper import WhisperModel
except ImportError:
    print(
        json.dumps(
            {"error": "Missing faster-model. Run: pip install faster-whisper"}
        ),
        flush=True,
    )
    sys.exit(1)

# Initialize the model on CPU with INT8 quantization
print(json.dumps({"status":"ready"}), flush=True)
model = WhisperModel("base", device="cpu", compute_type="int8")
stabilizer = TranscriptStabilizer()

# Let Electron know the background sidecar engine is active and ready
print("[LocalWhisperSTT] Starting sidecar", flush=True)


print(json.dumps({"status": "ready"}), flush=True)





for line in sys.stdin:
    try:
        request = json.loads(line.strip())
        audio_path = request.get("path")

        print(json.dumps({"debug": f"received {audio_path}"}), flush=True)

        lang_hint = request.get("language")
        mode = request.get("mode", "normal")

        if not audio_path or not os.path.exists(audio_path):
            continue

        # Debug file size
        file_size = os.path.getsize(audio_path)
        print(
            json.dumps({"file": audio_path, "size_bytes": file_size}),
            flush=True
        )

        # Transcribe
        print(
            json.dumps({"DEBUG": "starting_transcribe"}),
            flush=True
        )
        
        segments, info = model.transcribe(
            audio_path,
            word_timestamps=True,
            beam_size=2,
            best_of=2,
            patience=1,
            task="transcribe",
            language=lang_hint if lang_hint else None,
            vad_filter=False,
            vad_parameters=dict(min_speech_duration_ms=200,min_silence_duration_ms=300,),
            condition_on_previous_text=True,
            temperature=0.0,
        )
        print(
            json.dumps({"DEBUG": "finished_transcribe"}),
            flush=True
        )

        print(json.dumps({"DEBUG": "starting_transcribe before segments = list(segments) ..."}), flush=True)
        
        # Convert generator to list
        segments = list(segments)
        print(
            json.dumps({
                "segments_count": len(segments)
            }),
            flush=True
        )
        
        print(json.dumps({"DEBUG": "finished_transcribe after segments = list(segments)"}), flush=True)
        print(json.dumps({"DEBUG_REACHED": "after_segments"}), flush=True)
        print(json.dumps({"segments_count": len(segments)}), flush=True)

        # Debug each segment
        for idx, seg in enumerate(segments):
            print(json.dumps({"DEBUG_SEGMENT_LOOP": idx}), flush=True)
            print(
                json.dumps({
                    "segment": idx,
                    "start": seg.start,
                    "end": seg.end,
                    "text": seg.text
                }),
                flush=True
            )

        # Reject extremely short speech chunks
        speech_duration = sum(seg.end - seg.start for seg in segments)
        print(json.dumps({"speech_duration_seconds": speech_duration}), flush=True)
        print(json.dumps({"debug_duration": speech_duration}), flush=True)

        text_output = "".join(segment.text for segment in segments).strip()
        if mode == "short":
            allowed_short_words = {
                "yes", "yeah", "yep",
                "no", "nope",
                "ok", "okay",
                "hi", "hello", "hey",
                "thanks", "thank you",
                "correct", "right"
            }
            normalized = text_output.lower().strip().replace(".", "").replace(",", "")

            if normalized not in allowed_short_words:
                print(
                    json.dumps({
                        "warning": "short_mode_rejected",
                        "raw_text": text_output
                    }),
                    flush=True
                )
                continue
            
        if not text_output:
            continue

        if is_hallucination(text_output):
            print(json.dumps({
                "warning": "hallucination_detected_blocked",
                "text": text_output}),
                flush=True
            )
            continue

        if not is_confident(
            info.language_probability,
            speech_duration
        ):
            print(
                json.dumps({
                    "warning": "low_confidence",
                    "text": text_output
                }),
                flush=True
            )
            continue

        if not validate_language(
            text_output,
            info.language
        ):
            print(
                json.dumps({
                    "warning": "language_validation_failed",
                    "text": text_output
                }),
                flush=True
            )
            continue

        text_output = correct_text(
            text_output
        )

        text_output = stabilizer.process(
            text_output
        )

        print(
            json.dumps({
                "detected_language": info.language,
                "language_probability": info.language_probability,
                "raw_text": text_output
            }),
            flush=True
        )

        if not text_output:
            print(
                json.dumps({
                    "warning": "empty_text",
                    "language": info.language,
                    "probability": info.language_probability
                }),
                flush=True
            )
            continue

        

        print(
            json.dumps({
                "debug": True,
                "debug_raw_text": text_output,
                "text": text_output,
                "language": info.language,
                "probability": info.language_probability,
                "duration": speech_duration,
            }),
            flush=True,
        )
    except Exception as e:
        print(
            json.dumps({
                "error": str(e),
                "traceback": traceback.format_exc()
            }),
            flush=True
        )