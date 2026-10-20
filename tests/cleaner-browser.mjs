// Automated Browser Verification for macOS System Cleaner Studio
import { mkdtempSync, writeFileSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';

const exec = promisify(execFile);
const root = realpathSync(mkdtempSync(join(tmpdir(), 'cleaner-ui-')));
const session = `cleaner-browser-${process.pid}`;
const browser = async (...args) =>
  (await exec('agent-browser', ['--session', session, ...args], { timeout: 35000 })).stdout;
const evaluate = async (code) => JSON.parse(await browser('eval', code));

let server;

try {
  symlinkSync(resolve('node_modules'), join(root, 'node_modules'));
  symlinkSync(resolve('src'), join(root, 'src'));
  symlinkSync(resolve('public'), join(root, 'public'));

  writeFileSync(
    join(root, 'toast.js'),
    `export const toastState = Object.fromEntries(['info','error','success'].map(k => [k, msg => window.feedback.push([k, msg])]));`
  );

  writeFileSync(
    join(root, 'ipc.js'),
    `export const isTauri = () => true;
    export async function invoke(name, args) {
      window.calls.push([name, args]);
      if (name === 'cleaner_scan_system') {
        return {
          categories: [
            {
              id: 'user_caches',
              name: 'User Application Caches',
              description: 'Temporary app caches in ~/Library/Caches',
              group: 'system',
              size_bytes: 450 * 1024 * 1024,
              item_count: 512,
              paths: ['/Users/mac/Library/Caches/mock-cache']
            },
            {
              id: 'xcode_derived_data',
              name: 'Xcode DerivedData',
              description: 'Build indexes and intermediate outputs',
              group: 'developer',
              size_bytes: 1500 * 1024 * 1024,
              item_count: 1240,
              paths: ['/Users/mac/Library/Developer/Xcode/DerivedData/App-123']
            }
          ],
          total_size_bytes: 1950 * 1024 * 1024,
          total_item_count: 1752,
          scanned_at_secs: 1792100000
        };
      }
      if (name === 'cleaner_execute_clean') {
        return { bytes_reclaimed: 1950 * 1024 * 1024, items_removed: 1752, errors: [] };
      }
      if (name === 'cleaner_scan_apps') {
        return [
          {
            id: 'com.brave.Browser',
            name: 'Brave Browser',
            path: '/Applications/Brave Browser.app',
            bundle_id: 'com.brave.Browser',
            version: '1.68.0',
            bundle_size_bytes: 400 * 1024 * 1024,
            leftover_size_bytes: 150 * 1024 * 1024,
            total_size_bytes: 550 * 1024 * 1024,
            leftovers: [
              { path: '/Users/mac/Library/Application Support/BraveSoftware', size_bytes: 120 * 1024 * 1024, category: 'Application Support' },
              { path: '/Users/mac/Library/Preferences/com.brave.Browser.plist', size_bytes: 30 * 1024 * 1024, category: 'Preferences' }
            ]
          },
          {
            id: 'com.spotify.client',
            name: 'Spotify',
            path: '/Applications/Spotify.app',
            bundle_id: 'com.spotify.client',
            version: '1.2.35',
            bundle_size_bytes: 250 * 1024 * 1024,
            leftover_size_bytes: 80 * 1024 * 1024,
            total_size_bytes: 330 * 1024 * 1024,
            leftovers: [
              { path: '/Users/mac/Library/Caches/com.spotify.client', size_bytes: 80 * 1024 * 1024, category: 'Caches' }
            ]
          }
        ];
      }
      if (name === 'cleaner_uninstall_app') {
        return { app_name: 'Brave Browser', bundle_removed: true, leftovers_removed: 2, bytes_reclaimed: 550 * 1024 * 1024, errors: [] };
      }
      if (name === 'cleaner_optimize_task') {
        return { task_id: args.taskId, task_name: 'DNS Flush', success: true, message: 'DNS cache cleared', duration_ms: 12 };
      }
      if (name === 'cleaner_get_platform_info') {
        return {
          os: 'macos',
          is_windows: false,
          is_macos: true,
          hostname: 'Developer-Mac',
          default_disk_label: 'Macintosh HD',
        };
      }
      if (name === 'cleaner_get_hardware_metrics') {
        return {
          cpu_usage_percent: 24.5,
          cpu_core_count: 8,
          memory_total_bytes: 16 * 1024 * 1024 * 1024,
          memory_used_bytes: 8.5 * 1024 * 1024 * 1024,
          memory_free_bytes: 7.5 * 1024 * 1024 * 1024,
          memory_used_percent: 53.1,
          swap_total_bytes: 2 * 1024 * 1024 * 1024,
          swap_used_bytes: 0,
          disk_total_bytes: 500 * 1024 * 1024 * 1024,
          disk_available_bytes: 180 * 1024 * 1024 * 1024,
          disk_used_bytes: 320 * 1024 * 1024 * 1024,
          disk_used_percent: 64.0,
          disk_mount_point: '/',
          net_bytes_received: 1048576,
          net_bytes_transmitted: 524288,
          uptime_seconds: 86400
        };
      }
      return null;
    }`
  );

  writeFileSync(
    join(root, 'index.html'),
    `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Cleaner UI Test</title></head><body><div id="app" class="p-6"></div><script type="module" src="/main.js"></script></body></html>`
  );

  writeFileSync(
    join(root, 'main.js'),
    `import { mount } from 'svelte';
    import CleanerView from '@/views/CleanerView.svelte';
    import ToastHost from '@/components/ui/ToastHost.svelte';
    import './src/styles.css';
    window.feedback = [];
    window.calls = [];
    mount(CleanerView, { target: document.querySelector('#app') });
    mount(ToastHost, { target: document.body });`
  );

  const aliases = {
    '@/lib/toast.svelte': join(root, 'toast.js'),
    '@tauri-apps/api/core': join(root, 'ipc.js'),
    '@': resolve('src'),
  };

  server = await createServer({
    configFile: false,
    root,
    plugins: [svelte({ configFile: false }), tailwindcss()],
    resolve: { alias: aliases, dedupe: ['svelte'] },
    optimizeDeps: { exclude: ['@lucide/svelte'] },
    server: { port: 0, host: '127.0.0.1', fs: { allow: [root, process.cwd()] } },
  });

  await server.listen();
  const url = `http://127.0.0.1:${server.httpServer.address().port}`;

  console.log(`Launching agent-browser at ${url}...`);
  await browser('open', url);
  await browser('wait', 'h2');

  // Verify Header
  const title = await evaluate(`document.querySelector('h2').textContent`);
  assert.equal(title, 'macOS System Studio & Cleaner');
  console.log('PASS: Header title verified');

  // TAB 1: Deep Clean assertions
  await browser('wait', '--text', 'User Application Caches');
  assert.ok(await evaluate(`document.body.textContent.includes('1.9 GB')`));
  assert.ok(await evaluate(`document.body.textContent.includes('Xcode DerivedData')`));

  // Toggle path expansion
  await browser('eval', `document.querySelectorAll('button[title="View paths"]')[0].click()`);
  await browser('wait', '--text', '/Users/mac/Library/Caches/mock-cache');
  assert.ok(await evaluate(`document.body.textContent.includes('/Users/mac/Library/Caches/mock-cache')`));
  console.log('PASS: Category path expansion verified');

  // Capture Deep Clean tab
  await browser('screenshot', '/tmp/cleaner-tab-deepclean.png');

  // Trigger Clean Confirmation Modal
  await browser('eval', `[...document.querySelectorAll('button')].find(b => b.textContent.includes('Clean Selected')).click()`);
  await browser('wait', '[role="dialog"]');
  assert.ok(await evaluate(`document.querySelector('[role="dialog"]').textContent.includes('Confirm Deep Cleanup')`));

  // Confirm deletion in modal
  await browser('eval', `[...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.includes('Clean Selected')).click()`);
  await browser('wait', '--fn', `window.calls.some(c => c[0] === 'cleaner_execute_clean')`);
  assert.ok(await evaluate(`window.feedback.some(f => f[0] === 'success' && f[1].includes('Cleaned 1.9 GB'))`));
  console.log('PASS: Deep clean modal confirmation and execution verified');

  // TAB 2: App Uninstaller assertions
  await browser('eval', `[...document.querySelectorAll('button')].find(b => b.textContent.includes('App Uninstaller')).click()`);
  await browser('wait', '--text', 'Brave Browser');
  assert.ok(await evaluate(`document.body.textContent.includes('Spotify')`));
  assert.ok(await evaluate(`document.body.textContent.includes('550 MB')`));

  // Search filter
  await browser('eval', `(() => {
    const input = document.querySelector('input[placeholder="Search installed applications…"]');
    input.value = 'Brave';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await browser('wait', '--fn', `!document.body.textContent.includes('Spotify')`);
  assert.ok(await evaluate(`document.body.textContent.includes('Brave Browser')`));
  console.log('PASS: App uninstaller live search filter verified');

  // Expand remnants
  await browser('eval', `document.querySelector('button[title="Inspect remnants"]').click()`);
  await browser('wait', '--text', '/Users/mac/Library/Application Support/BraveSoftware');
  assert.ok(await evaluate(`document.body.textContent.includes('120 MB')`));
  console.log('PASS: App leftovers discovery and breakdown verified');
  await browser('screenshot', '/tmp/cleaner-tab-uninstaller.png');

  // TAB 3: System Optimizer assertions
  await browser('eval', `[...document.querySelectorAll('button')].find(b => b.textContent.includes('System Optimizer')).click()`);
  await browser('wait', '--text', 'DNS & mDNS Cache Flush');
  assert.ok(await evaluate(`document.body.textContent.includes('QuickLook & Thumbnail Refresh')`));
  assert.ok(await evaluate(`document.body.textContent.includes('RAM Memory Purge')`));
  assert.ok(await evaluate(`document.body.textContent.includes('LaunchServices Database Rebuild')`));

  await browser('eval', `[...document.querySelectorAll('button')].find(b => b.textContent.includes('Flush DNS Cache')).click()`);
  await browser('wait', '--fn', `window.calls.some(c => c[0] === 'cleaner_optimize_task' && c[1].taskId === 'dns_flush')`);
  assert.ok(await evaluate(`window.feedback.some(f => f[0] === 'success' && f[1].includes('DNS Flush'))`));
  console.log('PASS: System optimizer task execution verified');
  await browser('screenshot', '/tmp/cleaner-tab-optimizer.png');

  // TAB 4: Hardware Status assertions
  await browser('eval', `[...document.querySelectorAll('button')].find(b => b.textContent.includes('Hardware Status')).click()`);
  await browser('wait', '--text', 'CPU Usage');
  assert.ok(await evaluate(`document.body.textContent.includes('24.5%')`));
  assert.ok(await evaluate(`document.body.textContent.includes('53.1%')`));
  assert.ok(await evaluate(`document.body.textContent.includes('Macintosh HD')`));
  assert.ok(await evaluate(`document.body.textContent.includes('System Uptime')`));
  console.log('PASS: Hardware status live meters verified');

  // Capture Screenshot for visual inspection
  const screenshotPath = '/tmp/cleaner-ui-verified.png';
  await browser('screenshot', screenshotPath);
  console.log(`PASS: Visual snapshot saved to ${screenshotPath}`);

  console.log('ALL BROWSER CLEANER UI CHECKS PASSED (100%)');
} finally {
  await browser('close').catch(() => {});
  await server?.close();
  rmSync(root, { recursive: true, force: true });
}
