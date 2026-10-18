import { createServer } from 'vite';
import { resolve, join } from 'node:path';
import { mkdtempSync, writeFileSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';

const exec = promisify(execFile);
const root = realpathSync(mkdtempSync(join(tmpdir(), 'pet-stress-')));

let server;
try {
  symlinkSync(resolve('node_modules'), join(root, 'node_modules'));
  symlinkSync(resolve('src'), join(root, 'src'));
  symlinkSync(resolve('public'), join(root, 'public'));

  writeFileSync(join(root, 'index.html'), `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><title>10 Pets Running Stress Test</title></head>
  <body style="background: #151b23; color: #f1f5f9; padding: 20px; font-family: system-ui;">
    <h2>10 Pets Running Concurrently (Stress & Long-Run Freeze Detection)</h2>
    <div id="container" style="display: flex; flex-wrap: wrap; gap: 15px;"></div>
    <script type="module" src="/main.js"></script>
  </body>
</html>`);

  writeFileSync(join(root, 'main.js'), `import { PetRenderer, PET_MOTION } from '@/shared/lib/petRenderer';
    window.renderers = [];
    window.__drawCounts = new Array(10).fill(0);
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(...args) {
      if (this.canvas.isConnected && this.canvas.dataset.index !== undefined) {
        window.__drawCounts[Number(this.canvas.dataset.index)]++;
      }
      return draw.apply(this, args);
    };

    const petList = [
      { slug: "work-blue-cat", state: "working" },
      { slug: "code-frenzy-cat", state: "working" },
      { slug: "boba", state: "working" },
      { slug: "eddy", state: "working" },
      { slug: "shinchan-3", state: "working" },
      { slug: "super-saiyan-goku", state: "working" },
      { slug: "wode-daodun-3d", state: "working" },
      { slug: "work-blue-cat", state: "reading" },
      { slug: "code-frenzy-cat", state: "reading" },
      { slug: "boba", state: "reading" }
    ];

    const container = document.getElementById('container');
    petList.forEach(({ slug, state }, i) => {
      const card = document.createElement('div');
      card.style.cssText = 'border: 1px solid #334155; padding: 10px; border-radius: 8px; text-align: center; width: 140px;';
      card.innerHTML = '<div style="font-size: 11px; margin-bottom: 5px;">#' + (i+1) + ': ' + slug + '<br>(' + state + ')</div>';

      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 240;
      canvas.dataset.index = String(i);
      canvas.style.cssText = 'width: 120px; height: 120px; image-rendering: ' + (PET_MOTION[slug]?.pixel ? 'pixelated' : 'auto');
      card.appendChild(canvas);
      container.appendChild(card);

      const r = new PetRenderer(canvas, slug);
      r.setState(state);
      r.load('/pets/' + slug + '/spritesheet.webp');
      window.renderers.push(r);
    });

    window.dispose = () => window.renderers.forEach(r => r.destroy());
  `);

  server = await createServer({
    configFile: false,
    root,
    resolve: { alias: { '@': resolve('src') } },
    server: { port: 0, host: '127.0.0.1', fs: { allow: [root, process.cwd()] } }
  });
  await server.listen();
  const port = server.httpServer.address().port;
  console.log('Stress test server listening on http://127.0.0.1:' + port);

  const browser = async (...args) => (await exec('agent-browser', ['--session', 'stress-10', ...args], { timeout: 45000 })).stdout;
  await browser('open', 'http://127.0.0.1:' + port);
  await browser('wait', '--fn', 'window.renderers?.length === 10 && window.renderers.every(r => r.loaded)');
  console.log('All 10 pets loaded successfully. Monitoring continuous animation over 15 seconds...');

  const history = [];
  for (let s = 1; s <= 4; s++) {
    await new Promise(r => setTimeout(r, 3500));
    const raw = await browser('eval', 'JSON.stringify(window.__drawCounts)');
    const counts = typeof raw === 'string' && raw.startsWith('"') ? JSON.parse(JSON.parse(raw)) : JSON.parse(raw);
    console.log('T=' + (s * 3.5) + 's draw counts: ' + JSON.stringify(counts));
    history.push(counts);
  }

  // Verify that every single pet was continuously animating and never froze
  for (let i = 0; i < 10; i++) {
    assert.ok(history[0][i] > 0, 'Pet #' + (i+1) + ' must render initially');
    assert.ok(history[1][i] > history[0][i], 'Pet #' + (i+1) + ' must not freeze at T=7.0s');
    assert.ok(history[2][i] > history[1][i], 'Pet #' + (i+1) + ' must not freeze at T=10.5s');
    assert.ok(history[3][i] > history[2][i], 'Pet #' + (i+1) + ' must not freeze at T=14.0s');
  }

  console.log('PASS: All 10 pets ran concurrently without freezing for 15 seconds!');
  await browser('screenshot', '/tmp/10-pets-stress.png');
  await browser('eval', 'window.dispose()');
  await browser('close');
} finally {
  await server?.close();
  rmSync(root, { recursive: true, force: true });
}
