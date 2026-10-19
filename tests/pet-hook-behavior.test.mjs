import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import ts from 'typescript';
import vm from 'node:vm';

const hooksPath = existsSync('crates/pet/src/hooks.rs') ? 'crates/pet/src/hooks.rs' : 'crates/engine/src/pet/hooks.rs';
const hooks = readFileSync(hooksPath, 'utf8');
const script = hooks.match(/let script = r#"([\s\S]*?)"#;/)[1];
const code = hooks.match(/let code = r#"([\s\S]*?)"#;/)[1];

async function sockets(alias, action) {
  const home = mkdtempSync(join(tmpdir(), 'pet-hooks-'));
  const received = [[], []];
  const servers = [];
  try {
    for (const dir of ['.agentpet', '.rust-sound']) mkdirSync(join(home, dir));
    const paths = [join(home,'.agentpet/agentpet.sock'),join(home,'.rust-sound/pet.sock')];
    for (let i=0;i<(alias?1:2);i++) {
      const server = createServer(s => { let data=''; s.on('data', b=> data+=b); s.on('end',()=>{ if(data) received[i].push(JSON.parse(data)); }); });
      await new Promise(resolve=>server.listen(paths[i],resolve)); servers.push(server);
    }
    if (alias) symlinkSync(paths[0], paths[1]);
    await action(home);
    await new Promise(r=>setTimeout(r,120));
    return received;
  } finally {
    await Promise.all(servers.map(s=>new Promise(r=>s.close(r))));
    rmSync(home,{recursive:true,force:true});
  }
}
function dispatch(home, event) {
  return new Promise((resolve,reject)=> {
    const child=spawn('/bin/sh',['-c',script,'dispatcher','hook','--agent','claude'],{env:{...process.env,HOME:home}});
    let stderr=''; child.stderr.on('data',b=>stderr+=b); child.on('error',reject);
    child.on('exit',n=>n===0?resolve():reject(new Error(stderr)));
    child.stdin.end(JSON.stringify(event));
  });
}
for (const alias of [false,true]) {
  test(`real dispatcher preserves terminal fields and delivers once (alias=${alias})`, async()=> {
    const received=await sockets(alias, async home=> {
      for (const event of ['Stop','Notification','SessionEnd']) await dispatch(home,{session_id:'fixture',hook_event_name:event,cwd:'/fixture',transcript_path:'/fixture/log'});
    });
    assert.deepEqual(received[0].map(e=>e.event_name),['Stop','Notification','SessionEnd']);
    assert.equal(received[0][0].project,'/fixture');
    assert.equal(received[0][0].transcript_path,'/fixture/log');
    assert.equal(received[alias?0:1].length,3);
  });
}

test('actual generated Pi callbacks preserve tool and lifecycle, deduplicate aliases', async()=> {
  const received=await sockets(true, async home=> {
    const callbacks=new Map();
    const { createConnection }=await import('node:net');
    const { realpathSync }=await import('node:fs');
    const context=vm.createContext({createConnection,realpathSync,process:{env:{HOME:home},pid:123,cwd:()=>'/fixture'},Date});
    const source=code.replace(/^import .*;$/gm,'').replace('export default function','function extension');
    vm.runInContext(ts.transpile(source),context);
    context.extension({on:(name,fn)=>callbacks.set(name,fn)});
    for (const name of ['session_start','agent_start','tool_call','agent_settled','session_shutdown']) {
      callbacks.get(name)({toolName:'Read'});
    }
  });
  assert.equal(received[0].length,5);
  assert.equal(new Set(received[0].map(e=>e.sequence)).size,5);
  assert.ok(received[0].every(e=>Number.isSafeInteger(e.sequence)));
  assert.equal(received[0][2].tool_name ?? received[0][2].toolName,'Read');
  assert.deepEqual(received[0].map(e=>e.eventName),['SessionStart','UserPromptSubmit','PreToolUse','Stop','SessionEnd']);
});
