export const CODER_ADDRESS = "warforge://operator/coder";
export const BRIDGES = Object.freeze({
  coder: "warforge://bridge/coder",
  github: "warforge://bridge/github",
  terminal: "warforge://bridge/terminal",
  judge: "warforge://bridge/test-harness"
});

export const OPERATIONS = Object.freeze({
  context: BRIDGES.coder,
  progress: BRIDGES.coder,
  disconnect: BRIDGES.coder,
  rejoin: BRIDGES.coder,
  terminate: BRIDGES.coder,
  fail: BRIDGES.coder,
  intervene: BRIDGES.coder,
  observe: BRIDGES.coder,
  read: BRIDGES.github,
  write: BRIDGES.github,
  submit: BRIDGES.github,
  artifact: BRIDGES.github,
  run: BRIDGES.terminal,
  evaluate: BRIDGES.judge,
  finalize: BRIDGES.judge
});

// All adapters are handed an already bound channel by the host.
export class LocalCoderAdapter {
  constructor(channel) {
    this.channel = channel;
  }

  invoke(operation, input) {
    return this.channel.invoke(operation, input);
  }
}

export class HumanCoderAdapter extends LocalCoderAdapter {}
