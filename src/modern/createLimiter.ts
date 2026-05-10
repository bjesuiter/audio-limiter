import { LimiterAudioWorkletNode } from "./LimiterAudioWorkletNode";
import { limiterParameterDescriptors } from "./parameters";
import { limiterWorkletCode } from "./workletCode";
import type {
  CreateLimiterNodeOptions,
  CreateLimiterOptions,
  LimiterParameterName,
  LoadLimiterWorkletOptions,
} from "./types";

const processorName = "limiter-processor";
const workletLoadPromises = new WeakMap<BaseAudioContext, Promise<void>>();

export async function createLimiter(
  context: BaseAudioContext,
  options: CreateLimiterOptions = {},
): Promise<LimiterAudioWorkletNode> {
  validateOptions(options);
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
  const explicitUrl =
    options.workletUrl === undefined ? undefined : normalizeWorkletUrl(options.workletUrl);

  const existingLoad = workletLoadPromises.get(context);
  if (existingLoad) return existingLoad;

  const load = (
    explicitUrl === undefined
      ? loadEmbeddedWorklet(context)
      : context.audioWorklet.addModule(explicitUrl)
  ).catch((error: unknown) => {
    workletLoadPromises.delete(context);
    throw error;
  });
  workletLoadPromises.set(context, load);
  return load;
}

export function createLimiterNode(
  context: BaseAudioContext,
  options: CreateLimiterNodeOptions = {},
): LimiterAudioWorkletNode {
  validateOptions(options);

  const lookahead = options.lookahead ?? 0.005;
  const audioWorkletOptions = createAudioWorkletOptions(options);
  const channelCount = audioWorkletOptions.channelCount ?? 2;

  return new LimiterAudioWorkletNode(context, processorName, {
    ...audioWorkletOptions,
    channelCount,
    channelCountMode: audioWorkletOptions.channelCountMode ?? "explicit",
    numberOfInputs: audioWorkletOptions.numberOfInputs ?? 1,
    numberOfOutputs: audioWorkletOptions.numberOfOutputs ?? 1,
    outputChannelCount: audioWorkletOptions.outputChannelCount ?? [channelCount],
    parameterData: createParameterData(options),
    processorOptions: { lookahead },
  });
}

function normalizeWorkletUrl(workletUrl: string | URL): string {
  if (typeof workletUrl !== "string" && !(workletUrl instanceof URL)) {
    throw new Error("Limiter workletUrl must be a string or URL.");
  }

  const url = workletUrl.toString();
  if (url.trim() === "") {
    throw new Error("Limiter workletUrl must not be empty.");
  }
  return url;
}

async function loadEmbeddedWorklet(context: BaseAudioContext): Promise<void> {
  const blob = new Blob([limiterWorkletCode], {
    type: "application/javascript; charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  try {
    await context.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function createAudioWorkletOptions(
  options: CreateLimiterOptions,
): Omit<AudioWorkletNodeOptions, "parameterData" | "processorOptions"> {
  const audioWorkletOptions: CreateLimiterOptions = { ...options };
  delete audioWorkletOptions.attack;
  delete audioWorkletOptions.bypass;
  delete audioWorkletOptions.lookahead;
  delete audioWorkletOptions.postGain;
  delete audioWorkletOptions.preGain;
  delete audioWorkletOptions.release;
  delete audioWorkletOptions.threshold;
  delete audioWorkletOptions.workletUrl;
  return audioWorkletOptions;
}

function createParameterData(
  options: Pick<
    CreateLimiterNodeOptions,
    "attack" | "bypass" | "postGain" | "preGain" | "release" | "threshold"
  >,
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
  validateFiniteRange("lookahead", options.lookahead ?? 0.005, 0, 10);
  validateBypass(options.bypass);
  validateInitialParameterValues(options);

  if (
    options.channelCount !== undefined &&
    (!Number.isInteger(options.channelCount) || options.channelCount < 1)
  ) {
    throw new Error("Limiter channelCount must be a positive integer.");
  }

  if (options.outputChannelCount !== undefined && options.outputChannelCount.length !== 1) {
    throw new Error("Limiter outputChannelCount must describe exactly one output.");
  }

  if (
    options.outputChannelCount?.some(
      (channelCount) => !Number.isInteger(channelCount) || channelCount < 1,
    )
  ) {
    throw new Error("Limiter outputChannelCount values must be positive integers.");
  }

  if (options.outputChannelCount?.length) {
    const [firstOutputChannelCount] = options.outputChannelCount;
    const effectiveChannelCount = options.channelCount ?? 2;
    if (firstOutputChannelCount !== effectiveChannelCount) {
      throw new Error("Limiter channelCount must match outputChannelCount[0].");
    }
  }

  if (options.channelCountMode !== undefined && options.channelCountMode !== "explicit") {
    throw new Error('Limiter requires channelCountMode "explicit".');
  }

  if (options.numberOfInputs !== undefined && !Number.isInteger(options.numberOfInputs)) {
    throw new Error("Limiter numberOfInputs must be an integer.");
  }

  if (options.numberOfInputs !== undefined && options.numberOfInputs !== 1) {
    throw new Error("Limiter requires exactly one input.");
  }

  if (options.numberOfOutputs !== undefined && !Number.isInteger(options.numberOfOutputs)) {
    throw new Error("Limiter numberOfOutputs must be an integer.");
  }

  if (options.numberOfOutputs !== undefined && options.numberOfOutputs !== 1) {
    throw new Error("Limiter requires exactly one output.");
  }
}

function validateBypass(value: boolean | undefined): void {
  if (value !== undefined && typeof value !== "boolean") {
    throw new Error("Limiter bypass must be a boolean.");
  }
}

function validateInitialParameterValues(options: CreateLimiterNodeOptions): void {
  for (const descriptor of limiterParameterDescriptors) {
    if (descriptor.name === "bypass") continue;

    const value = options[descriptor.name];
    if (value !== undefined) {
      validateFiniteRange(descriptor.name, value, descriptor.minValue, descriptor.maxValue);
    }
  }
}

function validateFiniteRange(name: string, value: number, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Limiter ${name} must be a finite number between ${min} and ${max}.`);
  }
}
