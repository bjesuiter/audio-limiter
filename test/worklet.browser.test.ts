import { describe, expect, it } from "vitest";
import { createLimiter, limiterParameterDescriptors } from "../src/index";

function supportsOfflineAudioWorklet(): boolean {
  return (
    typeof OfflineAudioContext !== "undefined" && "audioWorklet" in OfflineAudioContext.prototype
  );
}

describe("LimiterAudioWorkletNode browser configuration", () => {
  it.runIf(supportsOfflineAudioWorklet())(
    "implements the expected AudioWorkletNode shape",
    async () => {
      const context = new OfflineAudioContext({
        length: 128,
        numberOfChannels: 2,
        sampleRate: 48_000,
      });
      const limiter = await createLimiter(context);

      expect(limiter).toBeInstanceOf(AudioWorkletNode);
      expect(limiter.channelCount).toBe(2);
      expect(limiter.channelCountMode).toBe("explicit");
      expect(typeof limiter.connect).toBe("function");
      expect(typeof limiter.disconnect).toBe("function");
      expect(limiter.context).toBe(context);
      expect(limiter.numberOfInputs).toBe(1);
      expect(limiter.numberOfOutputs).toBe(1);
      expect(limiter.parameters).toBeDefined();
      expect(limiter.onprocessorerror).toBeNull();
      expect(typeof limiter.addEventListener).toBe("function");
      expect(typeof limiter.removeEventListener).toBe("function");
      expect(typeof limiter.dispatchEvent).toBe("function");
    },
  );

  it.runIf(supportsOfflineAudioWorklet())("rejects incompatible node options", async () => {
    const context = new OfflineAudioContext({
      length: 128,
      numberOfChannels: 2,
      sampleRate: 48_000,
    });

    await expect(createLimiter(context, { numberOfInputs: 0 })).rejects.toThrow(/one input/);
    await expect(createLimiter(context, { numberOfInputs: 3 })).rejects.toThrow(/one input/);
    await expect(createLimiter(context, { numberOfOutputs: 0 })).rejects.toThrow(/one output/);
    await expect(createLimiter(context, { numberOfOutputs: 3 })).rejects.toThrow(/one output/);
    await expect(createLimiter(context, { channelCountMode: "max" })).rejects.toThrow(
      /channelCountMode/,
    );
    await expect(createLimiter(context, { outputChannelCount: [1] })).rejects.toThrow(
      /channelCount/,
    );
    await expect(
      createLimiter(context, { channelCount: 2, outputChannelCount: [1] }),
    ).rejects.toThrow(/channelCount/);
    await expect(
      createLimiter(context, { channelCount: 2, outputChannelCount: [2, 2] }),
    ).rejects.toThrow(/outputChannelCount/);
    await expect(createLimiter(context, { lookahead: -0.001 })).rejects.toThrow(/lookahead/);
    await expect(createLimiter(context, { lookahead: Number.NaN })).rejects.toThrow(/lookahead/);
    await expect(createLimiter(context, { threshold: 1 })).rejects.toThrow(/threshold/);
    await expect(createLimiter(context, { attack: -0.001 })).rejects.toThrow(/attack/);
    await expect(createLimiter(context, { bypass: "yes" as never })).rejects.toThrow(/bypass/);
    await expect(createLimiter(context, { channelCount: 0 })).rejects.toThrow(/channelCount/);
    await expect(createLimiter(context, { outputChannelCount: [0] })).rejects.toThrow(
      /outputChannelCount/,
    );
  });

  it.runIf(supportsOfflineAudioWorklet())(
    "contains all custom AudioParams and typed getters",
    async () => {
      const context = new OfflineAudioContext({
        length: 128,
        numberOfChannels: 2,
        sampleRate: 48_000,
      });
      const limiter = await createLimiter(context);

      for (const descriptor of limiterParameterDescriptors) {
        const param = limiter.parameters.get(descriptor.name);
        expect(param).toBeInstanceOf(AudioParam);
        expect(param?.defaultValue).toBeCloseTo(descriptor.defaultValue, 5);
        expect(param?.minValue).toBeCloseTo(descriptor.minValue, 5);
        expect(param?.maxValue).toBeCloseTo(descriptor.maxValue, 5);
        expect(limiter[descriptor.name]).toBe(param);
      }
    },
  );
});
