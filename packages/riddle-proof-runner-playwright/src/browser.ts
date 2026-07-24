type PlaywrightModule = {
  chromium: {
    launch: (options: Record<string, unknown>) => Promise<{
      newContext: (options: Record<string, unknown>) => Promise<{
        newPage: () => Promise<{
          goto: (url: string, options?: Record<string, unknown>) => Promise<unknown>;
          evaluate: <T>(expression: (() => T) | string) => Promise<T>;
          screenshot: (options?: Record<string, unknown>) => Promise<Buffer>;
          setDefaultTimeout: (ms: number) => void;
          setDefaultNavigationTimeout: (ms: number) => void;
          url: () => string;
          close: () => Promise<void>;
        }>;
        close: () => Promise<void>;
      }>;
      version: () => string;
      close: () => Promise<void>;
    }>;
  };
};

type PlaywrightBrowserLauncher = PlaywrightModule["chromium"];

let cachedPlaywrightModule: PlaywrightModule | undefined;
let cachedPlaywrightError: Error | undefined;

const MAX_EXTRA_HTTP_HEADER_COUNT = 64;
const MAX_EXTRA_HTTP_HEADER_NAME_LENGTH = 256;
const MAX_EXTRA_HTTP_HEADER_VALUE_LENGTH = 8_192;
const MAX_EXTRA_HTTP_HEADER_TOTAL_LENGTH = 65_536;
const HTTP_HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u;
const INVALID_HTTP_HEADER_VALUE_PATTERN = /[\u0000-\u0008\u000A-\u001F\u007F]/u;

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

function validateExtraHTTPHeaders(
  input: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> | undefined {
  if (input === undefined) return undefined;
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("extraHTTPHeaders must be a plain object containing valid string HTTP headers.");
  }
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("extraHTTPHeaders must be a plain object containing valid string HTTP headers.");
  }

  const entries = Object.entries(input);
  if (entries.length > MAX_EXTRA_HTTP_HEADER_COUNT) {
    throw new TypeError("extraHTTPHeaders exceeds the supported header count.");
  }

  const normalized: Record<string, string> = Object.create(null);
  const normalizedNames = new Set<string>();
  let totalLength = 0;
  for (const [name, value] of entries) {
    if (
      name.length === 0
      || name.length > MAX_EXTRA_HTTP_HEADER_NAME_LENGTH
      || !HTTP_HEADER_NAME_PATTERN.test(name)
      || normalizedNames.has(name.toLowerCase())
    ) {
      throw new TypeError("extraHTTPHeaders contains an invalid or duplicate header name.");
    }
    if (
      typeof value !== "string"
      || value.length > MAX_EXTRA_HTTP_HEADER_VALUE_LENGTH
      || INVALID_HTTP_HEADER_VALUE_PATTERN.test(value)
    ) {
      throw new TypeError("extraHTTPHeaders contains an invalid header value.");
    }
    totalLength += name.length + value.length;
    if (totalLength > MAX_EXTRA_HTTP_HEADER_TOTAL_LENGTH) {
      throw new TypeError("extraHTTPHeaders exceeds the supported total size.");
    }
    normalizedNames.add(name.toLowerCase());
    normalized[name] = value;
  }
  return Object.freeze(normalized);
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
  extraHTTPHeaders?: Readonly<Record<string, string>>;
}) {
  const extraHTTPHeaders = validateExtraHTTPHeaders(options.extraHTTPHeaders);
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
    extraHTTPHeaders,
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
