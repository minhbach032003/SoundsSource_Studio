import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { splitPetSessions, SPLIT_PET_MAX } from "../src/lib/petMood.ts";

test("Pi extension hook intercepts subagent tools and dispatches distinct subagent events", () => {
  const code = readFileSync("crates/pet/src/hooks.rs", "utf8");
  const extracted = code.match(/let code = r#"([\s\S]*?)"#;/)?.[1];
  assert.ok(extracted, "extracted hook extension code from hooks.rs");

  const emitted = [];
  const callbacks = new Map();
  const pending = [];
  const context = vm.createContext({
    process: { env: { HOME: "/fixture" }, pid: 4242, cwd: () => "/fixture/project" },
    Date,
    Set,
    Map,
    String,
    Array,
    realpathSync: (p) => p,
    createConnection: (_path, connected) => {
      pending.push(connected);
      return {
        write: (payload) => {
          payload
            .trim()
            .split("\n")
            .forEach((line) => {
              if (line) emitted.push(JSON.parse(line));
            });
        },
        end: () => {},
        on: () => {},
      };
    },
  });

  vm.runInContext(
    ts.transpile(
      extracted.replace(/^import .*;$/gm, "").replace("export default function", "function extension")
    ),
    context
  );
  context.extension({ on: (name, fn) => callbacks.set(name, fn) });

  // 1. Session start & prompt
  callbacks.get("session_start")();
  while (pending.length) pending.shift()();
  callbacks.get("agent_start")();
  while (pending.length) pending.shift()();

  // 2. Parent calls a single subagent
  callbacks.get("tool_call")({
    toolName: "subagent",
    toolCallId: "call_single_1",
    args: { agent: "code-reviewer", task: "Review commit changes" },
  });
  while (pending.length) pending.shift()();

  // Verify subagent start payload was emitted
  const subagentStart = emitted.find(
    (e) => e.eventName === "SubagentStart" && e.sessionId === "pi-4242/subagent-code-reviewer"
  );
  assert.ok(subagentStart, "emitted SubagentStart with child session ID");
  assert.equal(subagentStart.agentKind, "subagent");
  assert.ok(subagentStart.message.includes("Review commit changes"));

  // 3. Subagent tool ends
  callbacks.get("tool_execution_end")({
    toolName: "subagent",
    toolCallId: "call_single_1",
  });
  while (pending.length) pending.shift()();

  const subagentStop = emitted.find(
    (e) => e.eventName === "SubagentStop" && e.sessionId === "pi-4242/subagent-code-reviewer"
  );
  const subagentEnd = emitted.find(
    (e) => e.eventName === "SessionEnd" && e.sessionId === "pi-4242/subagent-code-reviewer"
  );
  assert.ok(subagentStop, "emitted SubagentStop");
  assert.ok(subagentEnd, "emitted SessionEnd to clean up subagent");

  // 4. Test parallel subagents fan-out
  callbacks.get("tool_call")({
    toolName: "workflow",
    toolCallId: "call_parallel_1",
    args: {
      workflow: "parallel",
      args: {
        tasks: [
          { agent: "architect", task: "Design API" },
          { agent: "tester", task: "Write unit tests" },
        ],
      },
    },
  });
  while (pending.length) pending.shift()();

  const archStart = emitted.find(
    (e) => e.eventName === "SubagentStart" && e.sessionId === "pi-4242/subagent-architect"
  );
  const testerStart = emitted.find(
    (e) => e.eventName === "SubagentStart" && e.sessionId === "pi-4242/subagent-tester"
  );
  assert.ok(archStart, "emitted parallel subagent 1 start");
  assert.ok(testerStart, "emitted parallel subagent 2 start");
});

test("splitPetSessions dynamically clusters parent and concurrent subagents", () => {
  const activeSessions = [
    { id: "pi-4242", agent_kind: "pi", state: "working", project: "/project" },
    { id: "pi-4242/subagent-architect", agent_kind: "subagent", state: "working", project: "/project" },
    { id: "pi-4242/subagent-tester", agent_kind: "subagent", state: "working", project: "/project" },
    { id: "pi-4242/subagent-extra", agent_kind: "subagent", state: "working", project: "/project" },
  ];

  const splitOff = splitPetSessions(activeSessions, false);
  assert.equal(splitOff.length, 0, "split disabled produces empty split set");

  const splitOn = splitPetSessions(activeSessions, true);
  assert.equal(splitOn.length, SPLIT_PET_MAX, `split enabled caps at ${SPLIT_PET_MAX}`);
  assert.equal(splitOn[0].id, "pi-4242", "first pet is the parent agent");
  assert.equal(splitOn[1].id, "pi-4242/subagent-architect", "second pet is subagent 1");
  assert.equal(splitOn[2].id, "pi-4242/subagent-tester", "third pet is subagent 2");
});

test("Rust pet statemap and hooks support subagent agent kind and events", () => {
  const statemapSrc = readFileSync("crates/pet/src/statemap.rs", "utf8");
  const eventSrc = readFileSync("crates/pet/src/event.rs", "utf8");
  const sessionSrc = readFileSync("crates/pet/src/session.rs", "utf8");

  assert.ok(statemapSrc.includes('"subagent" => match event_name'), "statemap recognizes subagent kind");
  assert.ok(statemapSrc.includes("SubagentStart"), "statemap maps SubagentStart");
  assert.ok(statemapSrc.includes("SubagentStop"), "statemap maps SubagentStop");
  assert.ok(eventSrc.includes("Subagent"), "AgentKind enum includes Subagent variant");
  assert.ok(sessionSrc.includes("parity_subagent_lifecycle_and_split"), "Rust test verifies subagent lifecycle in SessionStore");
});
