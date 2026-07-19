import type { RiddleProofProfileSetupAction } from "@riddledc/riddle-proof-core";

type SetupActionResult = {
  action: string;
  label: string;
  ok: boolean;
  reason?: string;
};

export type SetupActionPage = {
  click: (...args: unknown[]) => Promise<unknown>;
  tap: (...args: unknown[]) => Promise<unknown>;
  fill: (...args: unknown[]) => Promise<unknown>;
  press: (...args: unknown[]) => Promise<unknown>;
  waitForTimeout: (...args: unknown[]) => Promise<unknown>;
  evaluate: (...args: unknown[]) => Promise<unknown>;
  locator?: (...args: unknown[]) => unknown;
};

export async function executeSetupActions(
  page: SetupActionPage,
  actions: RiddleProofProfileSetupAction[] = [],
) {
  const executed: SetupActionResult[] = [];
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];
    const type = String(action?.type || "").replace(/_/g, " ");
    const normalizedType = String(action?.type || "").toLowerCase();
    try {
      if (normalizedType === "wait") {
        const rawMs = Number(action?.ms || action?.timeout_ms || 300);
        await page.waitForTimeout(Math.max(1, Number.isFinite(rawMs) ? rawMs : 300));
      } else if (normalizedType === "click" || normalizedType === "tap") {
        if (action?.selector) await page.click(action.selector as string);
      } else if (normalizedType === "fill") {
        if (action?.selector) await page.fill(action.selector, String(action?.value || ""));
      } else if (normalizedType === "press") {
        if (action?.selector && action?.key) await page.press(action.selector as string, String(action.key));
      } else if (normalizedType === "window_eval" && action?.script) {
        await page.evaluate(action.script as string);
      }
      executed.push({ action: normalizedType, label: action?.label || `action-${index}`, ok: true });
    } catch (error) {
      const actionLabel = normalizedType || `action-${index}`;
      executed.push({
        action: actionLabel,
        label: action?.label || `action-${index}`,
        ok: false,
        reason: String(error && (error as { message?: string }).message
          ? (error as { message?: string }).message
          : error),
      });
      if (action?.optional !== true) {
        throw new Error(`Setup action ${action?.type || index} failed: ${executed.at(-1)?.reason}`);
      }
      }
  }
  return executed;
}
