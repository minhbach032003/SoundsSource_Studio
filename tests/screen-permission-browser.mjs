import { mkdtempSync, readFileSync, writeFileSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
const exec = promisify(execFile);
const root = realpathSync(mkdtempSync(join(tmpdir(), 'sound-permission-ui-')));
const session = `permission-${process.pid}`;
const browser = async (...args) => (await exec('agent-browser', ['--session', session, ...args], { timeout: 30000 })).stdout;
const evaluate = async code => JSON.parse(await browser('eval', code));
let server;
try {
  symlinkSync(resolve('node_modules'), join(root, 'node_modules'));
  symlinkSync(resolve('src'), join(root, 'src'));
  const view = readFileSync('src/views/VoiceAiView.svelte', 'utf8');
  const panel = view.slice(view.indexOf('{#if screenPermissionMissing && !geminiLiveState.isScreenSharing}'), view.indexOf('{#if geminiLiveState.isScreenSharing && geminiLiveState.screenShareIssue}'));
  writeFileSync(join(root, 'Panel.svelte'), `<script>
    import { ShieldAlert, Settings2, RotateCcw } from '@lucide/svelte';
    import { rebuildPermissionHint } from './src/lib/appIdentity';
    let screenPermissionMissing = $state(true);
    const geminiLiveState = { isScreenSharing: false };
    const signingIdentity = { permissions_reset_on_rebuild: new URLSearchParams(location.search).get('kind') !== 'certificate' };
    window.actions = [];
    const handleOpenScreenSettings = () => window.actions.push('settings');
    const recheckScreenPermission = () => window.actions.push('recheck');
    const startShareUnchecked = () => window.actions.push('share');
  </script><div class="relative h-screen bg-stone-950">${panel}</div>`);
  writeFileSync(join(root, 'index.html'), '<html lang="vi"><body><div id="app"></div><script type="module" src="/main.js"></script></body></html>');
  writeFileSync(join(root, 'main.js'), "import { mount } from 'svelte'; import Panel from './Panel.svelte'; import './src/styles.css'; mount(Panel, { target: document.querySelector('#app') });");
  server = await createServer({ configFile: false, root, plugins: [svelte({configFile:false}), tailwindcss()], resolve: { dedupe: ['svelte'] }, optimizeDeps: { exclude: ['@lucide/svelte'] }, server: { host: '127.0.0.1', port: 0, fs: { allow: [root, process.cwd()] } } });
  await server.listen();
  const url = `http://127.0.0.1:${server.httpServer.address().port}`;
  for (const kind of ['ad_hoc', 'certificate']) {
    await browser('set', 'viewport', '520', '740');
    await browser('open', `${url}/?kind=${kind}`);
    await browser('wait', '--text', 'Quyền ghi màn hình chưa khả dụng');
    const body = await evaluate('document.body.innerText');
    assert.ok(body.includes('đã bật'));
    assert.equal(body.includes('macos-signing-identity.sh'), kind === 'ad_hoc');
    console.log(await browser('snapshot', '-i'));
    await browser('press', 'Tab');
    assert.equal(await evaluate('document.activeElement.textContent.trim()'), 'Mở System Settings');
    await browser('press', 'Tab');
    await browser('press', 'Enter');
    assert.deepEqual(await evaluate('window.actions'), ['recheck']);
    await browser('snapshot', '-i');
    assert.ok(await evaluate(`Array.from(document.querySelectorAll('button')).every(el => { const r=el.getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight; })`));
    await browser('screenshot', `/tmp/rust-sound-permission-${kind}.png`);
    await browser('find', 'role', 'button', 'click', '--name', 'Đóng');
    await browser('snapshot', '-i');
    assert.ok(!(await evaluate('document.body.innerText')).includes('Quyền ghi màn hình chưa khả dụng'));
    console.log(`PASS ${kind}: rendered actual panel, keyboard recheck, visible controls and dismiss (handlers mocked)`);
  }
} finally {
  await browser('close').catch(() => {});
  await server?.close();
  rmSync(root, { recursive: true, force: true });
}
