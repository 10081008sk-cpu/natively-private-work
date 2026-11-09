#!/usr/bin/env python3
"""Real-time audio capture from system default or specified input device.

Outputs raw 16-bit signed-integer PCM at 16 kHz mono to stdout.
All diagnostic messages go to stderr so the pipe stays clean.

Environment variables:
  SAMPLE_RATE  — target sample rate in Hz (default: 16000)
  INPUT_DEVICE — device ID (integer) or name substring; empty = system default
  CHANNELS     — number of channels (default: 1, mono)

Required packages: numpy, sounddevice
  pip install numpy sounddevice
"""

import sys
import os

SAMPLE_RATE = int(os.environ.get("SAMPLE_RATE", "16000"))
INPUT_DEVICE = os.environ.get("INPUT_DEVICE", "").strip()
CHANNELS = int(os.environ.get("CHANNELS", "1"))

BLOCKSIZE = int(SAMPLE_RATE * 0.03)  # 30 ms frames


def _e(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def main() -> None:
    # --- late imports so missing deps give a clear error on stderr ---
    try:
        import numpy as np
    except ImportError:
        _e("ERROR:numpy not installed. Run: pip install numpy")
        sys.exit(1)

    try:
        import sounddevice as sd
    except ImportError:
        _e("ERROR:sounddevice not installed. Run: pip install sounddevice")
        sys.exit(1)

    # ---- resolve device -------------------------------------------------
    device_id = None  # type: int | None
    if INPUT_DEVICE and INPUT_DEVICE != "default":
        # try integer id first
        try:
            device_id = int(INPUT_DEVICE)
        except ValueError:
            # name substring search
            devices = sd.query_devices()
            matches = [i for i, d in enumerate(devices) if INPUT_DEVICE.lower() in d["name"].lower()]
            if matches:
                device_id = matches[0]
            else:
                names = [f'  {i}: {d["name"]}' for i, d in enumerate(devices)]
                _e(f"ERROR:Device '{INPUT_DEVICE}' not found. Available devices:\n" + "\n".join(names))
                sys.exit(1)

    try:
        info = sd.query_device(device_id) if device_id is not None else sd.query_device(sd.default.device[0])
    except Exception as exc:
        _e(f"ERROR:Failed to query audio device: {exc}")
        sys.exit(1)

    _e(f"DEVICE:{info['name']}")
    _e(f"RATE:{int(info['default_samplerate'])}")

    # ---- audio callback -------------------------------------------------
    def callback(indata: np.ndarray, frames: int, time_info, status) -> None:
        if status:
            _e(f"STATUS:{status}")
        # indata is float32 in [-1, 1]; convert to int16 raw PCM
        raw = (indata * 32767).astype(np.int16).tobytes()
        sys.stdout.buffer.write(raw)
        sys.stdout.buffer.flush()

    # ---- start stream ---------------------------------------------------
    try:
        with sd.InputStream(
            device=device_id,
            channels=CHANNELS,
            samplerate=SAMPLE_RATE,
            dtype="float32",
            callback=callback,
            blocksize=BLOCKSIZE,
        ):
            _e("CAPTURE:STARTED")
            while True:
                sd.sleep(1_000_000)  # large sleep; interrupts on Ctrl+C
    except KeyboardInterrupt:
        _e("CAPTURE:STOPPED")
    except Exception as exc:
        _e(f"ERROR:{exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
