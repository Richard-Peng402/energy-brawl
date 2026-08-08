from __future__ import annotations

import sys
import wave

import numpy as np


def active_regions(levels: np.ndarray, threshold: float) -> list[list[float]]:
    active = levels > threshold
    regions: list[list[float]] = []
    start: int | None = None
    for index, is_active in enumerate(active):
        if is_active and start is None:
            start = index
        if start is not None and (not is_active or index == len(active) - 1):
            end = index if not is_active else index + 1
            if (end - start) * 0.02 >= 0.04:
                regions.append([start * 0.02, end * 0.02])
            start = None

    merged: list[list[float]] = []
    for start_time, end_time in regions:
        if merged and start_time - merged[-1][1] < 0.18:
            merged[-1][1] = end_time
        else:
            merged.append([start_time, end_time])
    return merged


source = sys.argv[1]
with wave.open(source, "rb") as recording:
    frame_count = recording.getnframes()
    sample_rate = recording.getframerate()
    channel_count = recording.getnchannels()
    sample_width = recording.getsampwidth()
    raw = recording.readframes(frame_count)

print(
    f"channels={channel_count} sample_rate={sample_rate} sample_width={sample_width} "
    f"frames={frame_count} duration={frame_count / sample_rate:.3f}"
)

if sample_width == 3:
    bytes_24 = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
    samples = bytes_24[:, 0] | (bytes_24[:, 1] << 8) | (bytes_24[:, 2] << 16)
    samples = (samples ^ 0x800000) - 0x800000
else:
    dtype = {1: np.uint8, 2: np.int16, 4: np.int32}[sample_width]
    samples = np.frombuffer(raw, dtype=dtype)
if sample_width == 1:
    samples = samples.astype(np.float64) - 128
else:
    samples = samples.astype(np.float64)
mono = samples.reshape(-1, channel_count).mean(axis=1)
window_size = max(1, int(sample_rate * 0.02))
window_count = len(mono) // window_size
windows = mono[: window_count * window_size].reshape(window_count, window_size)
rms = np.sqrt(np.mean(windows**2, axis=1) + 1e-12)
full_scale = 2 ** (sample_width * 8 - 1)
levels = 20 * np.log10(rms / full_scale)

for cutoff in (-45, -40, -36, -32, -28):
    regions = active_regions(levels, cutoff)
    formatted = " ".join(f"{start:.2f}-{end:.2f}" for start, end in regions)
    print(f"threshold={cutoff} regions={len(regions)} {formatted}")

peak_dbfs = 20 * np.log10(np.max(np.abs(mono)) / full_scale)
rms_dbfs = 20 * np.log10(np.sqrt(np.mean(mono**2)) / full_scale)
print(f"peak_dbfs={peak_dbfs:.2f} rms_dbfs={rms_dbfs:.2f}")

if len(sys.argv) > 2:
    from PIL import Image, ImageDraw

    output = sys.argv[2]
    width, height = 1920, 540
    margin_x, margin_y = 60, 36
    image = Image.new("RGB", (width, height), "#0d131a")
    draw = ImageDraw.Draw(image)
    plot_width = width - margin_x * 2
    plot_height = height - margin_y * 2
    for db in range(-80, 1, 10):
        y = margin_y + int((-db / 80) * plot_height)
        draw.line((margin_x, y, width - margin_x, y), fill="#26313b", width=1)
        draw.text((8, y - 7), f"{db} dB", fill="#8d9aa6")
    points: list[tuple[int, int]] = []
    for index, level in enumerate(levels):
        x = margin_x + int(index / max(1, len(levels) - 1) * plot_width)
        y = margin_y + int(np.clip(-level / 80, 0, 1) * plot_height)
        points.append((x, y))
    draw.line(points, fill="#31d5b4", width=2)
    image.save(output)
    print(f"waveform={output}")
