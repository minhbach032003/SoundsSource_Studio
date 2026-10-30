import { mkdtempSync, writeFileSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
const exec = promisify(execFile);
const root = realpathSync(mkdtempSync(join(tmpdir(), 'desktop-control-ui-')));
const session = `desktop-${process.pid}`;
const browser = async (...args) => (await exec('agent-browser', ['--session',session,...args], {timeout:30000})).stdout;
const evaluate = async code => JSON.parse(await browser('eval', code));
const click = async name => { await browser('find','role','button','click','--name',name,'--exact'); await browser('snapshot','-i'); };
let server;
try {
  symlinkSync(resolve('node_modules'),join(root,'node_modules'));
  writeFileSync(join(root,'bridge.js'), `export const isTauri=()=>true;
    export async function invoke(name,args) {
      window.calls.push({name,args});
      if(name==='desktop_set_enabled') return '1';
      if(name==='desktop_prepare') return {id:'fixture',target:'Google Chrome — tab thử nghiệm',description:'Đóng tab Chrome đang chọn'};
      if(name==='desktop_approve') return {summary:'Đã đóng tab thử nghiệm',verified:true};
      if(name==='desktop_request_chrome_permission') throw new Error('Automation chưa được cấp. Mở System Settings.');
      return false;
    }`);
  writeFileSync(join(root,'Fixture.svelte'), `<script>
    import DesktopControl from '${resolve('src/components/DesktopControl.svelte')}';
    import { DesktopController } from '${resolve('src/lib/desktopControl.svelte.ts')}';
    const controller=new DesktopController(); window.controller=controller;
    window.calls=[];
  </script><main class="min-h-screen bg-(--paper) p-4"><DesktopControl {controller} available={true}/></main>`);
  writeFileSync(join(root,'index.html'), '<html lang="vi"><body><div id="app"></div><script type="module" src="/main.js"></script></body></html>');
  writeFileSync(join(root,'main.js'), `import {mount} from 'svelte'; import Fixture from './Fixture.svelte'; import '${resolve('src/styles.css')}'; mount(Fixture,{target:document.querySelector('#app')});`);
  server=await createServer({configFile:false,root,plugins:[svelte({configFile:false}),tailwindcss()],resolve:{alias:{'@tauri-apps/api/core':join(root,'bridge.js'),'@':resolve('src')},dedupe:['svelte']},optimizeDeps:{exclude:['@lucide/svelte']},server:{host:'127.0.0.1',port:0,fs:{allow:[root,process.cwd()]}}});
  await server.listen();
  const url=`http://127.0.0.1:${server.httpServer.address().port}`;
  for (const width of [520,1100]) {
    await browser('set','viewport',String(width),'820');
    await browser('open',url);
    await browser('wait','--text','Bật Desktop Control');
    await browser('snapshot','-i');
    await click('Bật Desktop Control');
    await browser('press','Escape');
    assert.equal(await evaluate('window.controller.enabled'),false);
    await click('Bật Desktop Control');
    await click('Bật điều khiển');
    assert.equal(await evaluate('window.controller.enabled'),true);
    await browser('eval',"void window.controller.run({kind:'close_chrome_tab'})");
    await browser('wait','--text','Xác nhận thao tác desktop');
    await browser('snapshot','-i');
    assert.equal(await evaluate("window.calls.filter(c=>c.name==='desktop_approve').length"),0);
    await browser('press','Escape');
    await browser('snapshot','-i');
    assert.equal(await evaluate('window.controller.enabled'),false);
    await click('Bật Desktop Control'); await click('Bật điều khiển');
    await browser('eval',"void window.controller.run({kind:'close_chrome_tab'})");
    await browser('wait','--text','Xác nhận thao tác desktop');
    await browser('snapshot','-i');
    await browser('press','Tab'); await browser('press','Tab');
    assert.equal(await evaluate('document.activeElement.textContent.trim()'),'Thực hiện đúng thao tác này');
    await browser('press','Enter');
    await browser('snapshot','-i');
    assert.equal(await evaluate("window.calls.filter(c=>c.name==='desktop_approve').length"),1);
    await click('Cấp quyền Chrome');
    assert.ok((await evaluate('document.body.innerText')).includes('Automation chưa được cấp'));
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'));
    await browser('screenshot',`/tmp/desktop-control-${width}.png`);
    console.log(`PASS ${width}px: actual Svelte component/controller, consent, Escape cancellation, keyboard approval, permission error (IPC mocked)`);
  }
} finally {
  await browser('close').catch(()=>{});
  await server?.close();
  rmSync(root,{recursive:true,force:true});
}
