from __future__ import annotations

import argparse
from pathlib import Path
import wave

import numpy as np


def read_pcm(path: Path) -> tuple[np.ndarray, int, int]:
    with wave.open(str(path), "rb") as recording:
        channel_count = recording.getnchannels()
        sample_rate = recording.getframerate()
        sample_width = recording.getsampwidth()
        raw = recording.readframes(recording.getnframes())

    if sample_width == 3:
        packed = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
        integers = packed[:, 0] | (packed[:, 1] << 8) | (packed[:, 2] << 16)
        integers = (integers ^ 0x800000) - 0x800000
    else:
        dtype = {1: np.uint8, 2: np.int16, 4: np.int32}[sample_width]
        integers = np.frombuffer(raw, dtype=dtype)
        if sample_width == 1:
            integers = integers.astype(np.int16) - 128

    full_scale = float(2 ** (sample_width * 8 - 1))
    samples = integers.reshape(-1, channel_count).astype(np.float64) / full_scale
    return samples, sample_rate, channel_count


def find_onsets(samples: np.ndarray, sample_rate: int) -> list[float]:
    mono = samples.mean(axis=1)
    window_seconds = 0.02
    window_size = max(1, int(sample_rate * window_seconds))
    window_count = len(mono) // window_size
    windows = mono[: window_count * window_size].reshape(window_count, window_size)
    rms = np.sqrt(np.mean(windows**2, axis=1) + 1e-12)
    levels = 20 * np.log10(rms)

    candidates: list[float] = []
    for index in range(1, len(levels)):
        if levels[index] > -35 and levels[index - 1] < -38 and levels[index] - levels[index - 1] > 9:
            onset = index * window_seconds
            if not candidates or onset - candidates[-1] > 0.5:
                candidates.append(onset)
    return candidates


def fade(samples: np.ndarray, sample_rate: int) -> np.ndarray:
    result = samples.copy()
    fade_in_frames = min(len(result), int(sample_rate * 0.005))
    fade_out_frames = min(len(result), int(sample_rate * 0.04))
    result[:fade_in_frames] *= np.linspace(0, 1, fade_in_frames, endpoint=True)[:, None]
    result[-fade_out_frames:] *= np.linspace(1, 0, fade_out_frames, endpoint=True)[:, None]
    return result


def write_wave(path: Path, samples: np.ndarray, sample_rate: int, channel_count: int, seed: int) -> None:
    random = np.random.default_rng(seed)
    dither = (random.random(samples.shape) - random.random(samples.shape)) / 65_536
    pcm = np.round(np.clip(samples + dither, -1, 1) * 32_767).astype("<i2")
    with wave.open(str(path), "wb") as output:
        output.setnchannels(channel_count)
        output.setsampwidth(2)
        output.setframerate(sample_rate)
        output.writeframes(pcm.tobytes())


parser = argparse.ArgumentParser(description="Split a sequential five-tier killstreak recording into mobile WAV assets.")
parser.add_argument("source", type=Path)
parser.add_argument("output", type=Path)
arguments = parser.parse_args()

source_samples, source_rate, source_channels = read_pcm(arguments.source)
detected_onsets = find_onsets(source_samples, source_rate)
if len(detected_onsets) < 6:
    raise RuntimeError(f"Expected five cues followed by an end marker, detected {detected_onsets}")

cue_onsets = detected_onsets[:5]
end_marker = detected_onsets[5]
cut_points = [max(0, onset - 0.04) for onset in cue_onsets] + [end_marker - 0.04]
peak = max(np.max(np.abs(source_samples[int(start * source_rate) : int(end * source_rate)])) for start, end in zip(cut_points, cut_points[1:]))
gain = (10 ** (-1 / 20)) / peak

arguments.output.mkdir(parents=True, exist_ok=True)
for index, (start, end) in enumerate(zip(cut_points, cut_points[1:]), start=1):
    first_frame = int(round(start * source_rate))
    final_frame = int(round(end * source_rate))
    cue = fade(source_samples[first_frame:final_frame] * gain, source_rate)
    destination = arguments.output / f"kill-{index}.wav"
    write_wave(destination, cue, source_rate, source_channels, seed=0x6A410000 + index)
    print(f"kill-{index}: {start:.2f}-{end:.2f}s duration={end - start:.2f}s -> {destination}")
