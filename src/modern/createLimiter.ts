import { LimiterAudioWorkletNode } from './LimiterAudioWorkletNode';
import { limiterWorkletCode } from './workletCode';
import type { CreateLimiterOptions, LimiterParameterName } from './types';

const processorName = 'limiter-processor';
const loadedContexts = new WeakSet<BaseAudioContext>();

export async function createLimiter(
  context: BaseAudioContext,
  options: CreateLimiterOptions = {},
): Promise<LimiterAudioWorkletNode> {
  validateOptions(options);
  await loadLimiterWorklet(context, options.workletUrl);

  const channelCount = options.channelCount ?? 2;
  const parameterData = createParameterData(options);

  return new LimiterAudioWorkletNode(context, processorName, {
    ...options,
    channelCount,
    channelCountMode: options.channelCountMode ?? 'explicit',
    numberOfInputs: options.numberOfInputs ?? 1,
    numberOfOutputs: options.numberOfOutputs ?? 1,
    outputChannelCount: options.outputChannelCount ?? [channelCount],
    parameterData,
    processorOptions: {
      lookahead: options.lookahead ?? 0.005,
    },
  });
}

async function loadLimiterWorklet(
  context: BaseAudioContext,
  workletUrl?: string | URL,
): Promise<void> {
  if (loadedContexts.has(context) && !workletUrl) return;

  if (workletUrl) {
    await context.audioWorklet.addModule(workletUrl.toString());
    return;
  }

  const blob = new Blob([limiterWorkletCode], {
    type: 'application/javascript; charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  try {
    await context.audioWorklet.addModule(url);
    loadedContexts.add(context);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function createParameterData(
  options: CreateLimiterOptions,
): Partial<Record<LimiterParameterName, number>> {
  return {
    ...(options.attack === undefined ? {} : { attack: options.attack }),
    ...(options.release === undefined ? {} : { release: options.release }),
    ...(options.threshold === undefined ? {} : { threshold: options.threshold }),
    ...(options.preGain === undefined ? {} : { preGain: options.preGain }),
    ...(options.postGain === undefined ? {} : { postGain: options.postGain }),
    ...(options.bypass === undefined ? {} : { bypass: options.bypass ? 1 : 0 }),
  };
}

function validateOptions(options: CreateLimiterOptions): void {
  const lookahead = options.lookahead ?? 0.005;
  if (lookahead < 0 || lookahead > 10) {
    throw new Error('Limiter lookahead must be between 0 and 10 seconds.');
  }

  if (options.channelCount && options.outputChannelCount?.length) {
    const [firstOutputChannelCount] = options.outputChannelCount;
    if (firstOutputChannelCount !== options.channelCount) {
      throw new Error('Limiter channelCount must match outputChannelCount[0].');
    }
  }

  if (options.channelCountMode && options.channelCountMode !== 'explicit') {
    throw new Error('Limiter requires channelCountMode "explicit".');
  }

  if (options.numberOfInputs && options.numberOfInputs !== 1) {
    throw new Error('Limiter requires exactly one input.');
  }

  if (options.numberOfOutputs && options.numberOfOutputs !== 1) {
    throw new Error('Limiter requires exactly one output.');
  }
}
