const TARGET_SR = 16000;
const TARGET_SAMPLES = 128000;
const N_FFT = 254;
const HOP_LENGTH = 500;
const FRAME_COUNT = 256;

function readString(buffer, offset, length) {
  return buffer.subarray(offset, offset + length).toString('ascii');
}

function decodeWav(buffer) {
  if (readString(buffer, 0, 4) !== 'RIFF' || readString(buffer, 8, 4) !== 'WAVE') {
    throw new Error('Spectrogram generation requires WAV audio.');
  }

  let offset = 12;
  let fmt = null;
  let data = null;

  while (offset + 8 <= buffer.length) {
    const id = readString(buffer, offset, 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;

    if (id === 'fmt ') {
      fmt = {
        audioFormat: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        bitsPerSample: buffer.readUInt16LE(start + 14),
      };
    } else if (id === 'data') {
      data = buffer.subarray(start, end);
    }

    offset = end + (size % 2);
  }

  if (!fmt || !data) throw new Error('WAV file is missing fmt or data chunks.');
  if (fmt.audioFormat !== 1) throw new Error('Only PCM WAV audio is supported for spectrogram generation.');
  if (![16, 24, 32].includes(fmt.bitsPerSample)) {
    throw new Error(`Unsupported WAV bit depth for spectrogram generation: ${fmt.bitsPerSample}.`);
  }

  const bytesPerSample = fmt.bitsPerSample / 8;
  const frameCount = Math.floor(data.length / (bytesPerSample * fmt.channels));
  const samples = new Float32Array(frameCount);

  for (let frame = 0; frame < frameCount; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < fmt.channels; channel += 1) {
      const sampleOffset = (frame * fmt.channels + channel) * bytesPerSample;
      if (fmt.bitsPerSample === 16) sum += data.readInt16LE(sampleOffset) / 32768;
      else if (fmt.bitsPerSample === 24) sum += data.readIntLE(sampleOffset, 3) / 8388608;
      else sum += data.readInt32LE(sampleOffset) / 2147483648;
    }
    samples[frame] = sum / fmt.channels;
  }

  return { samples, sampleRate: fmt.sampleRate };
}

function resampleLinear(samples, sourceRate, targetRate) {
  if (sourceRate === targetRate) return samples;
  const targetLength = Math.max(1, Math.round(samples.length * targetRate / sourceRate));
  const resampled = new Float32Array(targetLength);
  const ratio = sourceRate / targetRate;

  for (let index = 0; index < targetLength; index += 1) {
    const sourceIndex = index * ratio;
    const left = Math.floor(sourceIndex);
    const right = Math.min(left + 1, samples.length - 1);
    const fraction = sourceIndex - left;
    resampled[index] = samples[left] * (1 - fraction) + samples[right] * fraction;
  }

  return resampled;
}

function centerCropOrPad(samples) {
  if (samples.length === TARGET_SAMPLES) return samples;
  const output = new Float32Array(TARGET_SAMPLES);
  if (samples.length < TARGET_SAMPLES) {
    output.set(samples, 0);
    return output;
  }

  const start = Math.floor((samples.length - TARGET_SAMPLES) / 2);
  return samples.slice(start, start + TARGET_SAMPLES);
}

function hannWindow(size) {
  return Array.from({ length: size }, (_, index) => (
    0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (size - 1))
  ));
}

function powerAtBin(frame, bin, window) {
  let real = 0;
  let imaginary = 0;
  for (let index = 0; index < N_FFT; index += 1) {
    const angle = (-2 * Math.PI * bin * index) / N_FFT;
    const value = frame[index] * window[index];
    real += value * Math.cos(angle);
    imaginary += value * Math.sin(angle);
  }
  return real * real + imaginary * imaginary;
}

function buildPowerSpectrogram(samples) {
  const centered = new Float32Array(samples.length + N_FFT);
  centered.set(samples, Math.floor(N_FFT / 2));
  const window = hannWindow(N_FFT);
  const bins = (N_FFT / 2) + 1;
  const matrix = Array.from({ length: bins }, () => new Array(FRAME_COUNT).fill(0));

  for (let frameIndex = 0; frameIndex < FRAME_COUNT; frameIndex += 1) {
    const start = frameIndex * HOP_LENGTH;
    const frame = centered.subarray(start, start + N_FFT);
    for (let bin = 0; bin < bins; bin += 1) {
      matrix[bins - 1 - bin][frameIndex] = 10 * Math.log10(Math.max(powerAtBin(frame, bin, window), 1e-10));
    }
  }

  return matrix;
}

function colorFor(value, min, max) {
  const normalized = Math.max(0, Math.min(1, (value - min) / Math.max(max - min, 1e-9)));
  const quantized = Math.round(normalized * 63) / 63;
  const hue = 250 - quantized * 250;
  const lightness = 16 + quantized * 50;
  return `hsl(${hue.toFixed(0)} 90% ${lightness.toFixed(0)}%)`;
}

function renderSpectrogramSvg(matrix, title = 'Spectrogram') {
  const rows = matrix.length;
  const columns = matrix[0]?.length || 0;
  const values = matrix.flat();
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pathsByColor = new Map();

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const color = colorFor(matrix[row][column], min, max);
      const path = pathsByColor.get(color) || [];
      path.push(`M${column} ${row}h1v1h-1z`);
      pathsByColor.set(color, path);
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${columns} ${rows}" role="img" aria-label="${title}" shape-rendering="crispEdges">`,
    '<rect width="100%" height="100%" fill="#09090b"/>',
    ...Array.from(pathsByColor, ([color, paths]) => `<path fill="${color}" d="${paths.join('')}"/>`),
    '</svg>',
  ].join('');
}

function buildSpectrogramFromWav(buffer, { fileName = 'spectrogram.svg', title = 'Spectrogram' } = {}) {
  const decoded = decodeWav(buffer);
  const resampled = resampleLinear(decoded.samples, decoded.sampleRate, TARGET_SR);
  const segment = centerCropOrPad(resampled);
  const matrix = buildPowerSpectrogram(segment);
  const svg = renderSpectrogramSvg(matrix, title);

  return {
    fileName,
    mimeType: 'image/svg+xml',
    encoding: 'utf8',
    data: svg,
    generatedAt: new Date(),
    parameters: {
      targetSampleRate: TARGET_SR,
      targetSamples: TARGET_SAMPLES,
      nFft: N_FFT,
      hopLength: HOP_LENGTH,
      power: 2,
      scale: 'dB',
      frames: FRAME_COUNT,
      bins: N_FFT / 2 + 1,
      sourceSampleRate: decoded.sampleRate,
    },
  };
}

module.exports = {
  buildSpectrogramFromWav,
};
