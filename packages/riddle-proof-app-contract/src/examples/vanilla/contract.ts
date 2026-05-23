import { installRiddleProofContract, readRiddleProofContract } from "@riddledc/riddle-proof-app-contract/browser";

export function attachProofContract() {
  installRiddleProofContract({
    version: "my-app.proof.v1",
    getState: () => ({
      attached: true,
      time: Date.now(),
    }),
  });

  return readRiddleProofContract();
}
