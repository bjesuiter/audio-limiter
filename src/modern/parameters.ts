import type { LimiterParameterName } from './types';

type LimiterAudioParamDescriptor = {
  name: LimiterParameterName;
  minValue: number;
  maxValue: number;
  defaultValue: number;
};

export const limiterParameterDescriptors = [
  { name: 'attack', minValue: 0, maxValue: 2, defaultValue: 0 },
  { name: 'release', minValue: 0, maxValue: 2, defaultValue: 0.1 },
  { name: 'threshold', minValue: -100, maxValue: 0, defaultValue: -2 },
  { name: 'preGain', minValue: -100, maxValue: 100, defaultValue: 0 },
  { name: 'postGain', minValue: -100, maxValue: 100, defaultValue: 0 },
  { name: 'bypass', minValue: 0, maxValue: 1, defaultValue: 0 },
] as const satisfies readonly LimiterAudioParamDescriptor[];

export const limiterParameterNames = limiterParameterDescriptors.map(
  (descriptor) => descriptor.name,
) as LimiterParameterName[];
