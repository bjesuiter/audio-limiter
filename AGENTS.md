# AGENTS.md

Guidance for AI agents working in this repository.

## Package manager

Use **Bun** for dependency and script commands.

Prefer:

```sh
bun install
bun run type-check
bun run test:browser
bun run build
```

Avoid introducing npm/pnpm/yarn lockfile churn. If dependency metadata changes, keep the repository aligned with Bun rather than regenerating npm artifacts by accident.

## Project shape

This is a modern TypeScript Web Audio package for an AudioWorklet-based limiter.

Important paths:

- `src/index.ts` — public package entrypoint and exports.
- `src/modern/createLimiter.ts` — public factory/helper implementation:
  - `createLimiter(context, options)` is the primary async API.
  - `loadLimiterWorklet(context, { workletUrl })` preloads the processor for advanced users.
  - `createLimiterNode(context, options)` synchronously constructs the node and assumes the worklet is already loaded.
- `src/modern/types.ts` — public option and parameter types.
- `src/modern/parameters.ts` — AudioParam descriptor metadata.
- `src/modern/LimiterAudioWorkletNode.ts` — typed `AudioWorkletNode` subclass with convenience getters.
- `src/modern/workletCode.ts` — embedded AudioWorkletProcessor source string. Keep this browser/worklet-safe: no Node imports, no DOM assumptions beyond AudioWorklet globals.
- `test/*.browser.test.ts` — active Vitest Browser tests. These are the authoritative tests.
- `docs/limiter-audio-worklet/` — vendored reference implementation for comparison/research. Do not import from it in package code.
- `demo/` — old demo code; treat as stale until intentionally rebuilt.

## Public API rules

Keep the simple API first:

```ts
const limiter = await createLimiter(context, options);
```

Advanced API is available but secondary:

```ts
await loadLimiterWorklet(context, { workletUrl });
const limiter = createLimiterNode(context, options);
```

Important contracts:

- `createLimiter()` composes `loadLimiterWorklet()` plus `createLimiterNode()`.
- `createLimiterNode()` is synchronous and may throw if called before the processor is registered.
- `loadLimiterWorklet()` accepts loader-only options: currently `{ workletUrl?: string | URL }`.
- `CreateLimiterOptions` should remain `CreateLimiterNodeOptions & LoadLimiterWorkletOptions`.
- Cache only embedded/default worklet loads per `BaseAudioContext`; explicit `workletUrl` calls should always call `audioWorklet.addModule()`.
- Keep the flexible parameter model: `threshold`, `attack`, `release`, `preGain`, `postGain`, `bypass`, `lookahead`.
- Do not reintroduce `AudioContext.prototype` patching or the old sync wrapper API.

## Testing

Use Vitest Browser. The tests render through real browser `OfflineAudioContext`/`AudioWorklet` behavior.

Run before committing relevant changes:

```sh
bun run type-check
bun run test:browser
bun run build
```

When changing DSP/worklet code, add or update browser rendering tests under `test/`. Prefer behavior-level tests over exposing private internals.

Existing important coverage:

- factory smoke/runtime creation,
- preload + synchronous node creation,
- node shape and parameter descriptors,
- below-threshold pass-through,
- gain reduction,
- lookahead latency,
- parameter automation,
- bypass behavior.

## Build

Build uses `tsdown` via `tsdown.config.ts`.

The package emits ESM, CJS, sourcemaps, and declarations into `dist/`. `dist/` is ignored and should not be committed.

## TypeScript/style notes

- Strict TypeScript is enabled, including `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`.
- Be explicit when constructing option objects with optional fields; avoid passing `{ workletUrl: undefined }` to types where the property is optional but not `undefined`.
- Keep worklet code browser-safe and allocation-conscious. AudioWorklet code runs on the audio rendering thread.
- Prefer tests that validate rendered audio behavior instead of testing private helper structures directly.

## Cleanup cautions

- The old Karma/Webpack/Jasmine suite was removed. Do not recreate it.
- Legacy source files were removed in favor of `src/modern/*`.
- `demo/` may still reference old patterns; verify before using it as documentation or test evidence.
- `docs/limiter-audio-worklet/` is reference material only; do not wire it into source, tests, or build output.
