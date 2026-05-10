const AudioWorkletNodeBase = globalThis.AudioWorkletNode ?? class {};

export class LimiterAudioWorkletNode extends AudioWorkletNodeBase {
  get attack(): AudioParam {
    return getRequiredParam(this, "attack");
  }

  get release(): AudioParam {
    return getRequiredParam(this, "release");
  }

  get threshold(): AudioParam {
    return getRequiredParam(this, "threshold");
  }

  get preGain(): AudioParam {
    return getRequiredParam(this, "preGain");
  }

  get postGain(): AudioParam {
    return getRequiredParam(this, "postGain");
  }

  get bypass(): AudioParam {
    return getRequiredParam(this, "bypass");
  }
}

function getRequiredParam(node: AudioWorkletNode, name: string): AudioParam {
  const param = node.parameters.get(name);
  if (!param) {
    throw new Error(`Limiter parameter "${name}" is not available.`);
  }
  return param;
}
