export type LimiterParameterName =
  | "attack"
  | "release"
  | "threshold"
  | "preGain"
  | "postGain"
  | "bypass";

export interface LoadLimiterWorkletOptions {
  /** Optional caller-managed worklet URL. When omitted, an embedded Blob worklet is used. */
  workletUrl?: string | URL;
}

export interface CreateLimiterNodeOptions extends Omit<
  AudioWorkletNodeOptions,
  "processorOptions" | "parameterData"
> {
  /** Lookahead delay in seconds. Used to delay audio so gain reduction can react to the detected envelope. */
  lookahead?: number;
  /** Initial threshold in dB. */
  threshold?: number;
  /** Initial attack time in seconds. */
  attack?: number;
  /** Initial release time in seconds. */
  release?: number;
  /** Initial input gain in dB. */
  preGain?: number;
  /** Initial output gain in dB. */
  postGain?: number;
  /** Initial bypass state. */
  bypass?: boolean;
}

export type CreateLimiterOptions = CreateLimiterNodeOptions & LoadLimiterWorkletOptions;
