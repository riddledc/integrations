import { useEffect } from "react";
import {
  installRiddleProofContract,
  uninstallRiddleProofContract,
} from "@riddledc/riddle-proof-app-contract/browser";

export function useRiddleProofContract(getMode: () => string) {
  useEffect(() => {
    installRiddleProofContract({
      version: "my-app.proof.v1",
      getState: () => ({
        mode: getMode(),
      }),
    });

    return () => {
      uninstallRiddleProofContract();
    };
  }, [getMode]);
}
