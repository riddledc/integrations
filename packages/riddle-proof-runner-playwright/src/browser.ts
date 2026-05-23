type PlaywrightModule = {
  chromium: {
    launch: (options: Record<string, unknown>) => Promise<{
      newContext: (options: Record<string, unknown>) => Promise<{
        newPage: () => Promise<{
          goto: (url: string, options?: Record<string, unknown>) => Promise<unknown>;
          setDefaultTimeout: (ms: number) => void;
          setDefaultNavigationTimeout: (ms: number) => void;
          close: () => Promise<void>;
        }>;
        close: () => Promise<void>;
      }>;
      close: () => Promise<void>;
    }>;
  };
};

let cachedPlaywrightModule: PlaywrightModule | undefined;
let cachedPlaywrightError: Error | undefined;

const loadPlaywrightModule = new Function("return import('playwright')") as () => Promise<PlaywrightModule>;

async function importPlaywrightModule() {
  const moduleValue = await loadPlaywrightModule();
  if (moduleValue && typeof moduleValue === "object" && "default" in moduleValue && moduleValue.default) {
    return moduleValue.default as PlaywrightModule;
  }
  return moduleValue as unknown as PlaywrightModule;
}

export async function loadPlaywright() {
  if (cachedPlaywrightModule) return cachedPlaywrightModule;
  if (cachedPlaywrightError) throw cachedPlaywrightError;
  try {
    cachedPlaywrightModule = await importPlaywrightModule();
    return cachedPlaywrightModule;
  } catch (error) {
    const parsed = new Error(
      "Playwright is required for the local runner. Install it with `npm i -D playwright` or use the hosted runner.",
    );
    parsed.cause = error;
    cachedPlaywrightError = parsed;
    throw parsed;
  }
}

export async function createPlaywrightBrowserSession(options: {
  viewport?: { width: number; height: number };
  timeoutMs?: number;
  browser?: "chromium" | "firefox" | "webkit";
  launchArgs?: string[];
  headless?: boolean;
}) {
  const playwright = await loadPlaywright();
  const browserName = options.browser || "chromium";
  const launchOptions = {
    headless: options.headless !== false,
    args: options.launchArgs || [],
  };
  const browser = await playwright[browserName].launch(launchOptions);
  const context = await browser.newContext({
    viewport: options.viewport || undefined,
  });
  const page = await context.newPage();
  const timeoutMs = Number.isFinite(options.timeoutMs || 0) && (options.timeoutMs || 0) > 0
    ? options.timeoutMs
    : undefined;
  if (timeoutMs) {
    page.setDefaultTimeout(Math.min(timeoutMs, 120_000));
    page.setDefaultNavigationTimeout(Math.min(timeoutMs, 120_000));
  }
  return {
    browser,
    context,
    page,
  };
}

export async function closePlaywrightSession(session: { browser?: { close: () => Promise<void> } }) {
  await session.browser?.close();
}
