import assert from "node:assert/strict";
import test from "node:test";

test("performance memory byte-to-MB conversions and boundary checks", () => {
  const bytesToMb = (bytes) => Number((bytes / (1024 * 1024)).toFixed(1));

  assert.equal(bytesToMb(52428800), 50.0);
  assert.equal(bytesToMb(104857600), 100.0);
  assert.equal(bytesToMb(1073741824), 1024.0);

  // Status thresholds
  const getRamStatus = (mb) => {
    if (mb < 90) return "OPTIMAL";
    if (mb < 200) return "ELEVATED";
    return "HIGH";
  };

  assert.equal(getRamStatus(42.5), "OPTIMAL");
  assert.equal(getRamStatus(89.9), "OPTIMAL");
  assert.equal(getRamStatus(120.0), "ELEVATED");
  assert.equal(getRamStatus(250.0), "HIGH");
});

test("benchmark statistical calculations (avg, min, max latency)", () => {
  const latencies = [0.6, 0.8, 1.2, 0.7, 0.9, 0.5, 0.8, 1.0, 0.7, 0.8];
  const sum = latencies.reduce((a, b) => a + b, 0);
  const avg = Number((sum / latencies.length).toFixed(2));
  const min = Math.min(...latencies);
  const max = Math.max(...latencies);

  assert.equal(avg, 0.8);
  assert.equal(min, 0.5);
  assert.equal(max, 1.2);
  assert.ok(avg < 5.0, "IPC latency should be well under 5ms");
});

test("background mode throttle policy", () => {
  const getPollingIntervalMs = (isHidden, ecoModeEnabled) => {
    if (isHidden && ecoModeEnabled) {
      return 15000; // 15s in background
    }
    return 1500; // 1.5s active
  };

  assert.equal(getPollingIntervalMs(false, true), 1500);
  assert.equal(getPollingIntervalMs(false, false), 1500);
  assert.equal(getPollingIntervalMs(true, true), 15000);
  assert.equal(getPollingIntervalMs(true, false), 1500);
});
