import { describe, expect, it } from 'vitest';
import { createLimiter, type CreateLimiterOptions } from '../../src/index';

const sampleRate = 44_100;

function supportsOfflineAudioWorklet(): boolean {
  return typeof OfflineAudioContext !== 'undefined'
    && 'audioWorklet' in OfflineAudioContext.prototype;
}

function createOfflineContext(length = Math.floor(sampleRate * 0.5), numberOfChannels = 2): OfflineAudioContext {
  return new OfflineAudioContext({ length, numberOfChannels, sampleRate });
}

function peak(buffer: AudioBuffer, channel = 0): number {
  return buffer.getChannelData(channel).reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);
}

function expectBounded(buffer: AudioBuffer, bound = 1): void {
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    expect(data.every((sample) => sample >= -bound && sample <= bound)).toBe(true);
  }
}

async function renderSine(gainValue: number, limiterOptions?: CreateLimiterOptions): Promise<AudioBuffer> {
  const context = createOfflineContext();
  const oscillator = new OscillatorNode(context, { type: 'sine', frequency: 440 });
  const gain = new GainNode(context, { gain: gainValue });
  const limiter = await createLimiter(context, { lookahead: 0, ...limiterOptions });

  oscillator.connect(gain).connect(limiter).connect(context.destination);
  oscillator.start(0);

  return context.startRendering();
}

async function renderBufferSource(
  sourceData: Float32Array,
  limiterOptions?: CreateLimiterOptions,
  configure?: (limiter: AudioWorkletNode, context: OfflineAudioContext) => void,
): Promise<AudioBuffer> {
  const context = createOfflineContext(sourceData.length, 2);
  const buffer = context.createBuffer(2, sourceData.length, sampleRate);
  const copiedSourceData = new Float32Array(sourceData);
  buffer.copyToChannel(copiedSourceData, 0);
  buffer.copyToChannel(copiedSourceData, 1);

  const source = new AudioBufferSourceNode(context, { buffer });
  const limiter = await createLimiter(context, { lookahead: 0, ...limiterOptions });
  configure?.(limiter, context);

  source.connect(limiter).connect(context.destination);
  source.start(0);

  return context.startRendering();
}

describe('Limiter audio processing', () => {
  it.runIf(supportsOfflineAudioWorklet())('leaves below-threshold audio untouched when lookahead is disabled', async () => {
    const referenceContext = createOfflineContext();
    const referenceOscillator = new OscillatorNode(referenceContext, { type: 'sine', frequency: 440 });
    const referenceGain = new GainNode(referenceContext, { gain: 0.5 });
    referenceOscillator.connect(referenceGain).connect(referenceContext.destination);
    referenceOscillator.start(0);
    const reference = await referenceContext.startRendering();

    const limited = await renderSine(0.5, { lookahead: 0 });

    const referenceData = reference.getChannelData(0);
    const limitedData = limited.getChannelData(0);
    for (let i = 0; i < referenceData.length; i += 1) {
      expect(limitedData[i]!).toBeCloseTo(referenceData[i]!, 5);
    }
  });

  it.runIf(supportsOfflineAudioWorklet())('limits a strongly gained sine wave', async () => {
    const context = createOfflineContext();
    const oscillator = new OscillatorNode(context, { type: 'sine', frequency: 440 });
    const gain = new GainNode(context, { gain: 5 });
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(0);
    const unclipped = await context.startRendering();
    expect(peak(unclipped)).toBeGreaterThan(1);

    const limited = await renderSine(5, { threshold: -2, attack: 0, release: 0 });
    expectBounded(limited);
  });

  it.runIf(supportsOfflineAudioWorklet())('limits constant-power audio buffers', async () => {
    const rendered = await renderBufferSource(new Float32Array(sampleRate).fill(2), {
      threshold: -2,
      attack: 0,
      release: 0,
    });

    expectBounded(rendered);
  });

  it.runIf(supportsOfflineAudioWorklet())('limits random wide-gain noise', async () => {
    const noise = Float32Array.from({ length: sampleRate }, (_, index) => {
      const x = Math.sin(index * 12.9898) * 43758.5453;
      return (x - Math.floor(x)) * 6 - 3;
    });

    const rendered = await renderBufferSource(noise, { threshold: -1, attack: 0, release: 0 });
    expectBounded(rendered);
  });

  it.runIf(supportsOfflineAudioWorklet())('responds to preGain and postGain parameters', async () => {
    const stepped = new Float32Array(Array.from({ length: sampleRate }, (_, index) => {
      const values = [-0.25, 0.25, -0.5, 0.5];
      return values[index % values.length]!;
    }));

    const rendered = await renderBufferSource(stepped, {
      threshold: -2,
      preGain: 8,
      postGain: 1.5,
      attack: 0,
      release: 0,
    });

    expectBounded(rendered);
  });

  it.runIf(supportsOfflineAudioWorklet())('supports scheduled AudioParam changes while rendering', async () => {
    const length = sampleRate * 5;
    const input = Float32Array.from({ length }, (_, index) => Math.sin(index * 0.1));

    const rendered = await renderBufferSource(
      input,
      { threshold: -2, preGain: 8, postGain: 1.5, attack: 0, release: 0 },
      (limiter) => {
        limiter.parameters.get('attack')?.setValueAtTime(0, 0);
        limiter.parameters.get('attack')?.linearRampToValueAtTime(0.1, 2);
        limiter.parameters.get('release')?.setValueAtTime(0, 0);
        limiter.parameters.get('release')?.linearRampToValueAtTime(0.1, 2);
        limiter.parameters.get('preGain')?.setValueAtTime(0, 0);
        limiter.parameters.get('preGain')?.linearRampToValueAtTime(10, 2);
        limiter.parameters.get('postGain')?.setValueAtTime(0, 0);
        limiter.parameters.get('postGain')?.linearRampToValueAtTime(-10, 2);
        limiter.parameters.get('threshold')?.setValueAtTime(0, 0);
        limiter.parameters.get('threshold')?.linearRampToValueAtTime(-10, 2);
      },
    );

    expectBounded(rendered);
  });

  it.runIf(supportsOfflineAudioWorklet())('delays audio by the configured lookahead', async () => {
    const lookaheadSamples = 128;
    const length = 512;
    const input = new Float32Array(length);
    input[0] = 0.25;

    const rendered = await renderBufferSource(input, {
      lookahead: lookaheadSamples / sampleRate,
      threshold: 0,
      attack: 0,
      release: 0,
    });

    const data = rendered.getChannelData(0);
    let peakIndex = 0;
    let peakValue = 0;
    for (let i = 0; i < data.length; i += 1) {
      const absolute = Math.abs(data[i]!);
      if (absolute > peakValue) {
        peakValue = absolute;
        peakIndex = i;
      }
    }

    expect(peakIndex).toBe(lookaheadSamples);
    expect(peakValue).toBeCloseTo(0.25, 5);
    expect(data.slice(0, lookaheadSamples).every((sample) => sample === 0)).toBe(true);
  });

  it.runIf(supportsOfflineAudioWorklet())('switches to bypass mode', async () => {
    const length = Math.floor(sampleRate * 0.5);
    const rendered = await renderBufferSource(
      new Float32Array(length).fill(5),
      { threshold: -2, attack: 0, release: 0 },
      (limiter) => {
        limiter.parameters.get('bypass')?.setValueAtTime(1, 0.25);
      },
    );

    const data = rendered.getChannelData(0);
    const quantum = 128;
    const bypassIndex = Math.floor(0.25 * sampleRate);
    const limited = data.slice(0, bypassIndex - quantum);
    const bypassed = data.slice(bypassIndex + quantum);

    expect(limited.every((sample) => sample > -1 && sample <= 1)).toBe(true);
    expect(bypassed.every((sample) => sample === 5)).toBe(true);
  });
});
