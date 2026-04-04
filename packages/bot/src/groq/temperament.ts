/**
 * Dynamic temperature based on recent activity.
 *
 * The more messages Quinn sends in a rolling window, the higher the temperature.
 * When quiet, temperature settles back to the baseline.
 *
 * Baseline: 0.7  (calm, coherent)
 * Max:      2.0  (spicy, chaotic)
 * Window:   10 minutes
 * Ramp:     each message in the window adds ~0.06 to temperature
 */

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const BASE_TEMP = 0.7;
const MAX_TEMP = 2.0;
const TEMP_PER_MESSAGE = 0.06;

const timestamps: number[] = [];

export function recordMessage(): void {
  timestamps.push(Date.now());
}

export function getTemperature(): number {
  const cutoff = Date.now() - WINDOW_MS;

  while (timestamps.length > 0 && timestamps[0] < cutoff) {
    timestamps.shift();
  }

  const temp = BASE_TEMP + timestamps.length * TEMP_PER_MESSAGE;
  return Math.min(temp, MAX_TEMP);
}
