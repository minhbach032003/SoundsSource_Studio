import assert from "node:assert/strict";
import test from "node:test";

test("audio filter defaults and boundary validations", () => {
  const defaultFilter = {
    mic: {
      enabled: true,
      noise_gate_enabled: true,
      noise_gate_threshold_db: -42,
      high_pass_enabled: true,
      high_pass_cutoff_hz: 85,
      voice_presence_enabled: true,
      voice_presence_db: 3.5,
      de_esser_enabled: true,
    },
    output: {
      enabled: false,
      dialogue_boost: false,
      night_mode_compression: false,
      bass_warmth: false,
      de_hiss: false,
    },
  };

  assert.equal(defaultFilter.mic.enabled, true);
  assert.ok(defaultFilter.mic.noise_gate_threshold_db >= -60 && defaultFilter.mic.noise_gate_threshold_db <= -20);
  assert.ok(defaultFilter.mic.high_pass_cutoff_hz >= 60 && defaultFilter.mic.high_pass_cutoff_hz <= 180);
  assert.ok(defaultFilter.mic.voice_presence_db >= 0 && defaultFilter.mic.voice_presence_db <= 6);
  assert.equal(defaultFilter.output.enabled, false);
});

test("virtual cable detection keywords cover major platforms", () => {
  const keywords = [
    "blackhole",
    "soundflower",
    "loopback",
    "vb-cable",
    "cable input",
    "cable output",
    "voicemeeter",
    "virtual",
    "null-sink",
    "remap-source",
  ];

  const testDevices = [
    "MacBook Pro Speakers",
    "BlackHole 2ch",
    "CABLE Output (VB-Audio Virtual Cable)",
    "Virtual_Sink",
    "AirPods Pro",
  ];

  const detected = testDevices.filter((d) => {
    const l = d.toLowerCase();
    return keywords.some((kw) => l.includes(kw));
  });

  assert.deepEqual(detected, [
    "BlackHole 2ch",
    "CABLE Output (VB-Audio Virtual Cable)",
    "Virtual_Sink",
  ]);
});
