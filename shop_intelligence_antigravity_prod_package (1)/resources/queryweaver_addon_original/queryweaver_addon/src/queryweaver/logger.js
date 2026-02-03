import pino from "pino";
export function getLogger(existingLogger) {
  if (existingLogger && typeof existingLogger.info === "function") return existingLogger;
  return pino({ level: process.env.LOG_LEVEL || "info" });
}
