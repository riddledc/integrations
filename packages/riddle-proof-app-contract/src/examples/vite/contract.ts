import { onMount } from "solid-js";
import { installRiddleProofContract } from "@riddledc/riddle-proof-app-contract/browser";

export function bootstrapRiddleProofContract() {
  onMount(() => {
    installRiddleProofContract({
      version: "my-app.proof.v1",
      getState: () => ({
        ready: true,
      }),
    });
  });
}
