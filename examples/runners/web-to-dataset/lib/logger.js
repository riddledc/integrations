const SERVICE = "web-to-dataset-runner";

function fmt(level, msg, extra = {}) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE,
    message: msg,
    ...extra,
  });
}

const logger = {
  info(msg, extra) {
    process.stdout.write(fmt("info", msg, extra) + "\n");
  },
  warn(msg, extra) {
    process.stdout.write(fmt("warn", msg, extra) + "\n");
  },
  error(msg, extra) {
    process.stderr.write(fmt("error", msg, extra) + "\n");
  },
};

module.exports = { logger };
