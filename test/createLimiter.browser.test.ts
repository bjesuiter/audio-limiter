import { describe, expect, it } from "vitest";
import { createLimiter, createLimiterNode, loadLimiterWorklet } from "../src/index";

function supportsOfflineAudioWorklet(): boolean {
  return (
    typeof OfflineAudioContext !== "undefined" && "audioWorklet" in OfflineAudioContext.prototype
  );
}

describe("createLimiter browser runtime", () => {
  it.runIf(supportsOfflineAudioWorklet())("rejects invalid explicit worklet URLs", async () => {
    const context = new OfflineAudioContext({
      numberOfChannels: 1,
      length: 128,
      sampleRate: 48_000,
    });

    await expect(loadLimiterWorklet(context, { workletUrl: null as never })).rejects.toThrow(
      /workletUrl/,
    );
  });

  it.runIf(supportsOfflineAudioWorklet())(
    "shares one embedded worklet load across concurrent factory calls",
    async () => {
      const context = new OfflineAudioContext({
        numberOfChannels: 1,
        length: 128,
        sampleRate: 48_000,
      });

      const [firstLimiter, secondLimiter] = await Promise.all([
        createLimiter(context, { channelCount: 1, lookahead: 0 }),
        createLimiter(context, { channelCount: 1, lookahead: 0 }),
      ]);

      expect(firstLimiter).toBeInstanceOf(AudioWorkletNode);
      expect(secondLimiter).toBeInstanceOf(AudioWorkletNode);
    },
  );

  it.runIf(supportsOfflineAudioWorklet())(
    "supports explicit preload followed by synchronous node creation",
    async () => {
      const context = new OfflineAudioContext({
        numberOfChannels: 1,
        length: 128,
        sampleRate: 48_000,
      });

      await loadLimiterWorklet(context);
      const limiter = createLimiterNode(context, {
        channelCount: 1,
        threshold: -2,
        lookahead: 0,
      });

      expect(limiter).toBeInstanceOf(AudioWorkletNode);
      expect(limiter.threshold.value).toBe(-2);

      const source = new ConstantSourceNode(context, { offset: 0.25 });
      source.connect(limiter).connect(context.destination);
      source.start();

      const rendered = await context.startRendering();
      expect(rendered.length).toBe(128);
    },
  );

  it.runIf(supportsOfflineAudioWorklet())(
    "creates a ready limiter node and renders offline audio",
    async () => {
      const context = new OfflineAudioContext({
        numberOfChannels: 1,
        length: 128,
        sampleRate: 48_000,
      });

      const limiter = await createLimiter(context, {
        channelCount: 1,
        threshold: -2,
        lookahead: 0,
      });

      expect(limiter).toBeInstanceOf(AudioWorkletNode);
      expect(limiter.parameters.has("threshold")).toBe(true);
      expect(limiter.threshold).toBe(limiter.parameters.get("threshold"));
      expect(limiter.attack).toBe(limiter.parameters.get("attack"));
      expect(limiter.release).toBe(limiter.parameters.get("release"));
      expect(limiter.preGain).toBe(limiter.parameters.get("preGain"));
      expect(limiter.postGain).toBe(limiter.parameters.get("postGain"));
      expect(limiter.bypass).toBe(limiter.parameters.get("bypass"));

      const source = new ConstantSourceNode(context, { offset: 0.25 });
      source.connect(limiter).connect(context.destination);
      source.start();

      const rendered = await context.startRendering();
      expect(rendered.length).toBe(128);
      expect(rendered.numberOfChannels).toBe(1);
    },
  );

  it.runIf(supportsOfflineAudioWorklet())("reduces an over-threshold signal", async () => {
    const context = new OfflineAudioContext({
      numberOfChannels: 1,
      length: 128,
      sampleRate: 48_000,
    });

    const limiter = await createLimiter(context, {
      channelCount: 1,
      threshold: -6,
      attack: 0,
      release: 0,
      lookahead: 0,
    });

    const source = new ConstantSourceNode(context, { offset: 2 });
    source.connect(limiter).connect(context.destination);
    source.start();

    const rendered = await context.startRendering();
    const samples = rendered.getChannelData(0);
    const peak = samples.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);

    expect(peak).toBeLessThanOrEqual(0.51);
    expect(peak).toBeGreaterThan(0.45);
  });
});
