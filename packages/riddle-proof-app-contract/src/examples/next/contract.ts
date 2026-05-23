import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { installRiddleProofContract } from "@riddledc/riddle-proof-app-contract/browser";

export function useRouteContract() {
  const pathname = usePathname();

  useEffect(() => {
    installRiddleProofContract({
      version: "my-app.proof.v1",
      route: pathname ?? undefined,
      getState: () => ({
        route: pathname || "",
      }),
    });
  }, [pathname]);
}
