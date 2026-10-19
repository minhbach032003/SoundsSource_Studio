import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const hooks = existsSync('crates/pet/src/hooks.rs')
  ? readFileSync('crates/pet/src/hooks.rs', 'utf8')
  : readFileSync('crates/engine/src/pet/hooks.rs', 'utf8');
const code=hooks.match(/let code = r#"([\s\S]*?)"#;/)[1];
const callbacks=new Map();
const pending=[];
const context=vm.createContext({process:{env:{HOME:'/fixture'},pid:123,cwd:()=>'/fixture'},Date,
  realpathSync:()=>'/fixture/same.sock',
  createConnection:(_path,connected)=>{
    const client={write:payload=>process.stdout.write(payload),end:()=>{},on:()=>{}};
    pending.push(connected); return client;
  }});
vm.runInContext(ts.transpile(code.replace(/^import .*;$/gm,'').replace('export default function','function extension')),context);
context.extension({on:(name,fn)=>callbacks.set(name,fn)});
for(const name of ['session_start','agent_start','tool_call','agent_settled','session_shutdown']) {
  callbacks.get(name)({toolName:'Read'});
  while(pending.length) pending.shift()();
}
