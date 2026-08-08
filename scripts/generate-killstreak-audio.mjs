import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const DURATIONS = [0.44, 0.58, 0.72, 0.88, 1.16];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIRECTORY = path.join(ROOT, "public", "assets", "v3", "audio", "killstreak");

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function equalPowerPan(pan) {
  const angle = (Math.max(-1, Math.min(1, pan)) + 1) * Math.PI / 4;
  return [Math.cos(angle), Math.sin(angle)];
}

function addSample(channels, index, value, pan = 0) {
  if (index < 0 || index >= channels[0].length) return;
  const [left, right] = equalPowerPan(pan);
  channels[0][index] += value * left;
  channels[1][index] += value * right;
}

function addResonance(channels, options) {
  const {
    frequency,
    start = 0,
    duration,
    gain,
    decay = 5,
    pan = 0,
    attack = 0.003,
    detune = 0,
  } = options;
  const first = Math.floor(start * SAMPLE_RATE);
  const count = Math.min(channels[0].length - first, Math.floor(duration * SAMPLE_RATE));
  let phase = 0;
  for (let offset = 0; offset < count; offset += 1) {
    const time = offset / SAMPLE_RATE;
    const envelope = Math.min(1, time / attack) * Math.exp(-decay * time);
    const glide = frequency * (1 + detune * Math.exp(-10 * time));
    phase += 2 * Math.PI * glide / SAMPLE_RATE;
    addSample(channels, first + offset, Math.sin(phase) * envelope * gain, pan);
  }
}

function addWoodStrike(channels, start, strength, pan, random) {
  const modes = [176, 286, 419, 642];
  const gains = [0.72, 0.42, 0.23, 0.1];
  for (let mode = 0; mode < modes.length; mode += 1) {
    addResonance(channels, {
      frequency: modes[mode] * (0.98 + random() * 0.04),
      start,
      duration: 0.2,
      gain: strength * gains[mode],
      decay: 17 + mode * 8,
      attack: 0.0015,
      detune: 0.035,
      pan: pan + (random() - 0.5) * 0.14,
    });
  }

  const first = Math.floor(start * SAMPLE_RATE);
  const count = Math.floor(0.012 * SAMPLE_RATE);
  let lowPass = 0;
  for (let offset = 0; offset < count; offset += 1) {
    const time = offset / SAMPLE_RATE;
    lowPass += ((random() * 2 - 1) - lowPass) * 0.18;
    const envelope = Math.exp(-260 * time);
    addSample(channels, first + offset, lowPass * envelope * strength * 0.55, pan);
  }
}

function addCrystal(channels, start, frequency, strength, pan, duration = 0.42) {
  const partials = [1, 2.006, 2.998, 4.074, 5.43];
  const gains = [0.52, 0.23, 0.14, 0.08, 0.035];
  for (let partial = 0; partial < partials.length; partial += 1) {
    addResonance(channels, {
      frequency: frequency * partials[partial],
      start,
      duration,
      gain: strength * gains[partial],
      decay: 5.2 + partial * 2.4,
      attack: 0.002 + partial * 0.001,
      pan: pan + (partial % 2 === 0 ? -0.12 : 0.12),
      detune: 0.006,
    });
  }
}

function addBassBloom(channels, start, strength, startFrequency, endFrequency, duration) {
  const first = Math.floor(start * SAMPLE_RATE);
  const count = Math.min(channels[0].length - first, Math.floor(duration * SAMPLE_RATE));
  let phase = 0;
  for (let offset = 0; offset < count; offset += 1) {
    const time = offset / SAMPLE_RATE;
    const progress = time / duration;
    const attack = Math.min(1, time / 0.035);
    const envelope = attack * Math.pow(1 - progress, 1.7);
    const frequency = startFrequency * Math.pow(endFrequency / startFrequency, progress);
    phase += 2 * Math.PI * frequency / SAMPLE_RATE;
    const body = Math.sin(phase) + Math.sin(phase * 2) * 0.18;
    addSample(channels, first + offset, body * envelope * strength, 0);
  }
}

function addAirRise(channels, start, duration, strength, random) {
  const first = Math.floor(start * SAMPLE_RATE);
  const count = Math.min(channels[0].length - first, Math.floor(duration * SAMPLE_RATE));
  let leftFilter = 0;
  let rightFilter = 0;
  for (let offset = 0; offset < count; offset += 1) {
    const progress = offset / Math.max(1, count - 1);
    const envelope = Math.sin(Math.PI * progress) * progress;
    leftFilter += ((random() * 2 - 1) - leftFilter) * (0.03 + progress * 0.13);
    rightFilter += ((random() * 2 - 1) - rightFilter) * (0.03 + progress * 0.13);
    channels[0][first + offset] += leftFilter * envelope * strength;
    channels[1][first + offset] += rightFilter * envelope * strength;
  }
}

function addMysticSpace(channels, duration, amount) {
  const dryLeft = Float64Array.from(channels[0]);
  const dryRight = Float64Array.from(channels[1]);
  const taps = [
    [0.041, 0.28],
    [0.073, 0.2],
    [0.113, 0.13],
    [0.167, 0.08],
  ];
  for (const [delay, gain] of taps) {
    const delaySamples = Math.floor(delay * SAMPLE_RATE);
    const damping = gain * amount;
    for (let index = delaySamples; index < Math.floor(duration * SAMPLE_RATE); index += 1) {
      channels[0][index] += dryRight[index - delaySamples] * damping;
      channels[1][index] += dryLeft[index - delaySamples] * damping;
    }
  }
}

function finishMix(channels) {
  let peak = 0;
  for (const channel of channels) {
    for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
  }
  const normalization = peak > 0 ? 0.89 / peak : 1;
  for (const channel of channels) {
    for (let index = 0; index < channel.length; index += 1) {
      const faded = index > channel.length - SAMPLE_RATE * 0.03
        ? (channel.length - index) / (SAMPLE_RATE * 0.03)
        : 1;
      channel[index] = Math.tanh(channel[index] * normalization * 1.25) / Math.tanh(1.25) * faded;
    }
  }
}

function synthesizeTier(tier, duration) {
  const channels = [
    new Float64Array(Math.floor(duration * SAMPLE_RATE)),
    new Float64Array(Math.floor(duration * SAMPLE_RATE)),
  ];
  const random = seededRandom(0x6a41_0000 + tier * 7919);

  if (tier === 1) {
    addWoodStrike(channels, 0.012, 0.72, -0.08, random);
    addCrystal(channels, 0.018, 659.25, 0.68, 0.08, 0.38);
  } else if (tier === 2) {
    addWoodStrike(channels, 0.01, 0.64, -0.24, random);
    addCrystal(channels, 0.016, 523.25, 0.52, -0.15, 0.38);
    addWoodStrike(channels, 0.14, 0.7, 0.2, random);
    addCrystal(channels, 0.146, 783.99, 0.64, 0.18, 0.4);
  } else if (tier === 3) {
    addBassBloom(channels, 0, 0.46, 94, 56, 0.55);
    addWoodStrike(channels, 0.022, 0.72, -0.16, random);
    addCrystal(channels, 0.034, 392, 0.52, -0.12, 0.47);
    addCrystal(channels, 0.19, 587.33, 0.64, 0.15, 0.44);
  } else if (tier === 4) {
    addBassBloom(channels, 0, 0.54, 82, 43, 0.72);
    addAirRise(channels, 0.02, 0.28, 0.16, random);
    addWoodStrike(channels, 0.025, 0.78, -0.1, random);
    addCrystal(channels, 0.05, 349.23, 0.48, -0.14, 0.56);
    addCrystal(channels, 0.22, 698.46, 0.72, 0.16, 0.5);
  } else {
    addBassBloom(channels, 0, 0.62, 68, 38, 0.98);
    addAirRise(channels, 0.015, 0.5, 0.2, random);
    addWoodStrike(channels, 0.02, 0.78, -0.16, random);
    addCrystal(channels, 0.04, 293.66, 0.43, -0.22, 0.72);
    addCrystal(channels, 0.19, 440, 0.48, -0.1, 0.68);
    addCrystal(channels, 0.35, 659.25, 0.58, 0.1, 0.62);
    addWoodStrike(channels, 0.51, 0.74, 0.14, random);
    addCrystal(channels, 0.52, 987.77, 0.74, 0.22, 0.58);
  }

  addMysticSpace(channels, duration, tier === 5 ? 1 : 0.78);
  finishMix(channels);
  return channels;
}

function encodeWave(channels) {
  const frameCount = channels[0].length;
  const dataSize = frameCount * CHANNELS * 2;
  const output = Buffer.alloc(44 + dataSize);
  output.write("RIFF", 0, "ascii");
  output.writeUInt32LE(36 + dataSize, 4);
  output.write("WAVE", 8, "ascii");
  output.write("fmt ", 12, "ascii");
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(CHANNELS, 22);
  output.writeUInt32LE(SAMPLE_RATE, 24);
  output.writeUInt32LE(SAMPLE_RATE * CHANNELS * 2, 28);
  output.writeUInt16LE(CHANNELS * 2, 32);
  output.writeUInt16LE(16, 34);
  output.write("data", 36, "ascii");
  output.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < CHANNELS; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channel][frame]));
      output.writeInt16LE(Math.round(sample * 32_767), offset);
      offset += 2;
    }
  }
  return output;
}

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
for (let index = 0; index < DURATIONS.length; index += 1) {
  const tier = index + 1;
  const outputPath = path.join(OUTPUT_DIRECTORY, `kill-${tier}.wav`);
  const wave = encodeWave(synthesizeTier(tier, DURATIONS[index]));
  await writeFile(outputPath, wave);
  console.log(`generated ${path.relative(ROOT, outputPath)} (${wave.length} bytes)`);
}
