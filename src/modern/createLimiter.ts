import { LimiterAudioWorkletNode } from './LimiterAudioWorkletNode';
import { limiterWorkletCode } from './workletCode';
import type {
  CreateLimiterNodeOptions,
  CreateLimiterOptions,
  LimiterParameterName,
  LoadLimiterWorkletOptions,
} from './types';

const processorName = 'limiter-processor';
const loadedEmbeddedWorkletContexts = new WeakSet<BaseAudioContext>();

export async function createLimiter(
  context: BaseAudioContext,
  options: CreateLimiterOptions = {},
): Promise<LimiterAudioWorkletNode> {
  await loadLimiterWorklet(
    context,
    options.workletUrl === undefined ? {} : { workletUrl: options.workletUrl },
  );
  return createLimiterNode(context, options);
}

export async function loadLimiterWorklet(
  context: BaseAudioContext,
  options: LoadLimiterWorkletOptions = {},
): Promise<void> {
  if (options.workletUrl) {
    await context.audioWorklet.addModule(options.workletUrl.toString());
    return;
  }

  if (loadedEmbeddedWorkletContexts.has(context)) return;

  const blob = new Blob([limiterWorkletCode], {
    type: 'application/javascript; charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  try {
    await context.audioWorklet.addModule(url);
    loadedEmbeddedWorkletContexts.add(context);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function createLimiterNode(
  context: BaseAudioContext,
  options: CreateLimiterNodeOptions = {},
): LimiterAudioWorkletNode {
  validateOptions(options);

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

function createParameterData(
  options: CreateLimiterNodeOptions,
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

function validateOptions(options: CreateLimiterNodeOptions): void {
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
