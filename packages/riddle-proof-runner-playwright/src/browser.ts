type PlaywrightModule = {
  chromium: {
    launch: (options: Record<string, unknown>) => Promise<{
      newContext: (options: Record<string, unknown>) => Promise<{
        newPage: () => Promise<{
          goto: (url: string, options?: Record<string, unknown>) => Promise<unknown>;
          screenshot: (options?: Record<string, unknown>) => Promise<Buffer>;
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

type PlaywrightBrowserLauncher = PlaywrightModule["chromium"];

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

function isMissingPlaywrightExecutable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /Executable doesn't exist|playwright install/i.test(message);
}

export async function launchPlaywrightBrowser(
  launcher: PlaywrightBrowserLauncher,
  launchOptions: Record<string, unknown>,
  options: { browserName: string; playwrightBrowsersPath?: string } = { browserName: "chromium" },
) {
  try {
    return await launcher.launch(launchOptions);
  } catch (error) {
    const canUseSystemChrome = options.browserName === "chromium"
      && options.playwrightBrowsersPath === undefined
      && isMissingPlaywrightExecutable(error);
    if (!canUseSystemChrome) throw error;
    return launcher.launch({ ...launchOptions, channel: "chrome" });
  }
}

export async function createPlaywrightBrowserSession(options: {
  viewport?: {
    width: number;
    height: number;
    hasTouch?: boolean;
    isMobile?: boolean;
  };
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
  const browser = await launchPlaywrightBrowser(playwright[browserName], launchOptions, {
    browserName,
    playwrightBrowsersPath: process.env.PLAYWRIGHT_BROWSERS_PATH,
  });
  const context = await browser.newContext({
    viewport: options.viewport
      ? { width: options.viewport.width, height: options.viewport.height }
      : undefined,
    hasTouch: options.viewport?.hasTouch,
    isMobile: options.viewport?.isMobile,
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
