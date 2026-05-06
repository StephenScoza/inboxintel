import fs from "fs/promises";
import path from "path";

type LogLevel = "INFO" | "WARN" | "ERROR";

const logDir = path.resolve(process.cwd(), "logs");
const logFile = path.join(logDir, "inboxintel.log");

let logDirReady: Promise<void> | null = null;

function ensureLogDir(): Promise<void> {
  if (!logDirReady) {
    logDirReady = fs.mkdir(logDir, { recursive: true }).then(() => undefined);
  }

  return logDirReady;
}

function formatDetails(details?: Record<string, unknown>): string {
  if (!details || Object.keys(details).length === 0) {
    return "";
  }

  return ` ${JSON.stringify(details)}`;
}

function write(level: LogLevel, message: string, details?: Record<string, unknown>) {
  const prefix = `[InboxIntel][${level}]`;
  const line = `${prefix} ${message}${formatDetails(details)}`;

  if (level === "ERROR") {
    console.error(line);
  } else if (level === "WARN") {
    console.warn(line);
  } else {
    console.log(line);
  }

  const persistedLine = `${new Date().toISOString()} ${line}\n`;
  void ensureLogDir()
    .then(() => fs.appendFile(logFile, persistedLine, "utf8"))
    .catch((error) => {
      console.error(
        `[InboxIntel][ERROR] Failed to persist log entry ${JSON.stringify({
          message,
          error: error instanceof Error ? error.message : "Unknown log persistence error"
        })}`
      );
    });
}

export const logger = {
  info(message: string, details?: Record<string, unknown>) {
    write("INFO", message, details);
  },
  warn(message: string, details?: Record<string, unknown>) {
    write("WARN", message, details);
  },
  error(message: string, details?: Record<string, unknown>) {
    write("ERROR", message, details);
  }
};
