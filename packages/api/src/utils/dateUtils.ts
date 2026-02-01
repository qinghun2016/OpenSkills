/**
 * Date utilities for consistent timezone handling.
 * All stored and log timestamps use UTC (ISO 8601); display conversion happens in the UI layer.
 */

/**
 * Returns current time as UTC ISO 8601 string for logging and stored timestamps.
 * Use this instead of Date.now() when writing to logs so all log lines have comparable, human-readable time.
 */
export function logTimestampUTC(): string {
  return new Date().toISOString();
}
