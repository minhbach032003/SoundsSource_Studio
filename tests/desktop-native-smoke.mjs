// Opt-in real macOS input smoke test. Requires Accessibility + Screen Recording.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
const exec=promisify(execFile);
const root=mkdtempSync(join(tmpdir(),'desktop-native-'));
const bundle=join(root,'DesktopFixture.app');
const bin=join(bundle,'Contents/MacOS/fixture');
const state=join(root,'state.json');
const bundle_id=`io.soundssource.desktop-fixture-${process.pid}`;
let child;
const wait=async predicate=>{
  for(let n=0;n<100;n++) { try { const value=JSON.parse(readFileSync(state,'utf8')); if(predicate(value)) return value; } catch {} await new Promise(r=>setTimeout(r,50)); }
  throw new Error('Native fixture state did not reach expected result: '+readFileSync(state,'utf8'));
};
try {
  mkdirSync(join(bundle,'Contents/MacOS'),{recursive:true});
  writeFileSync(join(bundle,'Contents/Info.plist'),`<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${bundle_id}</string><key>CFBundleExecutable</key><string>fixture</string><key>CFBundleName</key><string>DesktopFixture</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`);
  await exec('swiftc',['tests/desktop-native-fixture.swift','-o',bin],{timeout:60000});
  child=spawn(bin,[state],{stdio:'inherit'});
  const initial=await wait(v=>v.active && !!v.button);
  const run=async action=>JSON.parse((await exec(resolve('target/debug/examples/desktop_smoke'),[JSON.stringify({...action,bundle_id})],{timeout:15000})).stdout);
  const typed=await run({kind:'type_text',text:'Xin chào 世界'});
  assert.equal(typed.verified,false);
  await wait(v=>v.text==='Xin chào 世界');
  await run({kind:'press_key',key:'tab'});
  await wait(v=>v.keys.includes(48));
  await run({kind:'click',...initial.button});
  await wait(v=>v.clicks===1);
  await run({kind:'scroll',direction:'down',amount:5,...initial.scroll});
  await wait(v=>v.scrollY>initial.scrollY);
  console.log('PASS real CGEvents: Unicode typing, Tab, click and scroll into disposable Cocoa app; receiver state verified. Not signed-app/Gemini acceptance.');
} finally {
  if(child && child.exitCode===null) { child.kill('SIGTERM'); await new Promise(r=>child.once('exit',r)); }
  rmSync(root,{recursive:true,force:true});
}
