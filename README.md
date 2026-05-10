# audio-limiter

Modern AudioWorklet limiter for the Web Audio API.

This package exposes an explicit async factory. It does not patch `AudioContext.prototype`.

## Installation

```sh
npm install audio-limiter
```

## Usage

```ts
import { createLimiter } from "audio-limiter";

const context = new AudioContext();
const limiter = await createLimiter(context, {
  threshold: -6,
  lookahead: 0.005,
  attack: 0.003,
  release: 0.05,
});

const source = context.createBufferSource();
source.buffer = audioBuffer;
source.connect(limiter).connect(context.destination);
source.start();
```

`createLimiter()` works with both `AudioContext` and `OfflineAudioContext`:

```ts
const context = new OfflineAudioContext({
  numberOfChannels: 2,
  length: 44_100,
  sampleRate: 44_100,
});

const limiter = await createLimiter(context, { threshold: -2 });
```

## API

### `createLimiter(context, options?)`

Creates and returns a ready `LimiterAudioWorkletNode`.

```ts
const limiter = await createLimiter(context, options);
```

By default, the AudioWorklet processor is loaded from an embedded Blob URL. If your app needs to manage the worklet asset itself, pass `workletUrl`:

```ts
const limiter = await createLimiter(context, {
  workletUrl: "/assets/limiter-worklet.js",
});
```

### Advanced preload API

For most apps, use `createLimiter()`. If you want to preload the worklet during app setup and construct nodes synchronously later, use the advanced helpers:

```ts
import { createLimiterNode, loadLimiterWorklet } from "audio-limiter";

await loadLimiterWorklet(context);

const limiter = createLimiterNode(context, {
  threshold: -6,
  lookahead: 0.005,
});
```

`createLimiterNode()` assumes the processor was already registered with `loadLimiterWorklet()`. If it is called first, the browser will throw because the worklet processor name is not known yet.

`loadLimiterWorklet()` accepts only loader options:

```ts
await loadLimiterWorklet(context, {
  workletUrl: "/assets/limiter-worklet.js",
});
```

Worklet registration is cached per audio context. If `workletUrl` is provided for the first load, that URL is used; later loads for the same context reuse the existing registration.

### Options

| Option         | Type            |       Default | Description                                                                |
| -------------- | --------------- | ------------: | -------------------------------------------------------------------------- |
| `threshold`    | `number`        |          `-2` | Limiting threshold in dB.                                                  |
| `attack`       | `number`        |           `0` | Envelope attack time in seconds.                                           |
| `release`      | `number`        |         `0.1` | Envelope release time in seconds.                                          |
| `preGain`      | `number`        |           `0` | Input gain in dB before limiting.                                          |
| `postGain`     | `number`        |           `0` | Output gain in dB after limiting.                                          |
| `bypass`       | `boolean`       |       `false` | Pass input through without limiting.                                       |
| `lookahead`    | `number`        |       `0.005` | Delay in seconds used for limiter lookahead. Must be between `0` and `10`. |
| `workletUrl`   | `string \| URL` | embedded Blob | Optional caller-managed worklet module URL.                                |
| `channelCount` | `number`        |           `2` | Number of channels.                                                        |

The limiter uses one input and one output, with `channelCountMode: 'explicit'`.

### Parameters

The returned node is an `AudioWorkletNode`, so all limiter controls are native `AudioParam`s:

```ts
limiter.parameters.get("threshold")?.setValueAtTime(-8, context.currentTime);
```

For convenience, the same params are also available as typed getters:

```ts
limiter.threshold.setValueAtTime(-8, context.currentTime);
limiter.attack.setValueAtTime(0.005, context.currentTime);
limiter.release.setValueAtTime(0.1, context.currentTime);
limiter.preGain.setValueAtTime(3, context.currentTime);
limiter.postGain.setValueAtTime(0, context.currentTime);
limiter.bypass.setValueAtTime(1, context.currentTime);
```

## Development

```sh
bun install
bun run format:check
bun run lint
bun run type-check
bun run test:browser
bun run build
```

The browser tests use Vitest Browser with Playwright and render through `OfflineAudioContext`, so they exercise the real AudioWorklet path.

## Acknowledgements

Thanks to Robert Kamiński and the original [`robert8888/audio-limiter`](https://github.com/robert8888/audio-limiter) package. This version was rebuilt with a modern TypeScript/tsdown setup and an explicit factory API, using the original package as inspiration for the limiter design and parameter model.

## License

MIT
