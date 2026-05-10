export const limiterWorkletCode = String.raw`
const parameterDescriptors = [
  { name: 'attack', minValue: 0, maxValue: 2, defaultValue: 0 },
  { name: 'release', minValue: 0, maxValue: 2, defaultValue: 0.1 },
  { name: 'threshold', minValue: -100, maxValue: 0, defaultValue: -2 },
  { name: 'preGain', minValue: -100, maxValue: 100, defaultValue: 0 },
  { name: 'postGain', minValue: -100, maxValue: 100, defaultValue: 0 },
  { name: 'bypass', minValue: 0, maxValue: 1, defaultValue: 0 },
];

const dBToAmp = (db) => Math.pow(10, db / 20);
const ampToDB = (value) => value <= 0 ? -Infinity : 20 * Math.log10(value);
const readParam = (param, index) => param.length === 1 ? param[0] : param[index];

class DelayBuffer {
  constructor(length) {
    this.length = Math.max(0, Math.floor(length));
    this.array = new Float32Array(Math.max(1, this.length * 2));
    this.readPointer = 0;
    this.writePointer = this.length;
  }

  read() {
    const value = this.array[this.readPointer % this.array.length];
    this.readPointer += 1;
    return value;
  }

  write(value) {
    this.array[this.writePointer % this.array.length] = value;
    this.writePointer += 1;
  }
}

class LimiterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return parameterDescriptors;
  }

  constructor(options) {
    super();
    const channelCount = options.outputChannelCount?.[0] ?? options.channelCount ?? 2;
    const lookahead = options.processorOptions?.lookahead ?? 0.005;

    if (lookahead < 0 || lookahead > 10) {
      throw new Error('Limiter lookahead must be between 0 and 10 seconds.');
    }

    this.lookahead = lookahead;
    this.buffers = Array.from(
      { length: channelCount },
      () => new DelayBuffer(sampleRate * this.lookahead),
    );
    this.sampleEnvelope = new Float32Array(channelCount);
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !output) return true;

    for (let channel = 0; channel < output.length; channel += 1) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];
      if (!outputChannel) continue;

      if (!inputChannel) {
        outputChannel.fill(0);
        continue;
      }

      let envelope = this.sampleEnvelope[channel] ?? 0;
      const delay = this.buffers[channel];

      for (let i = 0; i < outputChannel.length; i += 1) {
        const preGain = dBToAmp(readParam(parameters.preGain, i));
        const postGain = dBToAmp(readParam(parameters.postGain, i));
        const threshold = readParam(parameters.threshold, i);
        const attack = readParam(parameters.attack, i);
        const release = readParam(parameters.release, i);
        const bypass = readParam(parameters.bypass, i) >= 0.5;

        const gainedInput = inputChannel[i] * preGain;
        const absoluteInput = Math.abs(gainedInput);

        if (attack <= 0 && envelope < absoluteInput) {
          envelope = absoluteInput;
        } else if (release <= 0 && envelope >= absoluteInput) {
          envelope = absoluteInput;
        } else {
          const time = envelope < absoluteInput ? attack : release;
          const coefficient = Math.exp(-1 / (sampleRate * Math.max(time, 1 / sampleRate)));
          envelope = absoluteInput + coefficient * (envelope - absoluteInput);
        }

        let delayed = gainedInput;
        if (this.lookahead > 0 && delay) {
          delay.write(gainedInput);
          delayed = delay.read();
        }

        if (bypass) {
          outputChannel[i] = inputChannel[i];
        } else {
          const gainDb = Math.min(threshold - ampToDB(envelope), 0);
          outputChannel[i] = delayed * dBToAmp(gainDb) * postGain;
        }
      }

      this.sampleEnvelope[channel] = envelope;
    }

    return true;
  }
}

registerProcessor('limiter-processor', LimiterProcessor);
`;
