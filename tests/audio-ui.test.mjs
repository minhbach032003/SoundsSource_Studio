import assert from 'node:assert/strict';
import test from 'node:test';
import { groupProcesses, processKey, displayName } from '../src/audio.ts';

test('one channel per bundle, playing first, unnamed processes remain separate', () => {
  const process = (pid, bundle_id, name, playing = false) => ({
    pid, bundle_id, name, object_id: pid, is_running_output: playing, is_regular_app: true,
  });
  const input = [process(1, 'com.spotify.client', 'client'),
    process(2, 'com.brave.Browser', 'Helper', true),
    process(3, 'com.brave.Browser', 'Brave Browser'),
    process(4, '', ''), process(5, '', '')];
  const result = groupProcesses(input);
  assert.equal(result.length, 4);
  assert.equal(result[0].name, 'Brave Browser');
  assert.equal(result[0].is_running_output, true);
  assert.equal(input[1].name, 'Helper');
  assert.notEqual(processKey(input[3]), processKey(input[4]));
  assert.equal(displayName(input[0]), 'Spotify');
  assert.equal(displayName(input[3]), 'Process 4');
  assert.deepEqual(groupProcesses([]), []);
});
