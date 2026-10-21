import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const view = readFileSync("src/views/CleanerView.svelte", "utf8");
const rust = readFileSync("crates/app/src/cmd_cleaner.rs", "utf8");
const policy = readFileSync("crates/core/src/cleaner_policy.rs", "utf8");

function lib(invoke = async () => ({})) {
  const source = readFileSync("src/lib/cleaner.ts", "utf8")
    .replace(/^import .*;$/gm, "")
    .replaceAll("export ", "");
  const context = vm.createContext({ invoke, isTauri: () => true, navigator: { userAgent: "" } });
  vm.runInContext(
    `${ts.transpile(source)}
globalThis.api = { safeCategoryIds, cancelScan, getScanProgress, executeClean };`,
    context
  );
  return context.api;
}

test("only self-regenerating categories are pre-selected", () => {
  const { safeCategoryIds } = lib();
  const result = {
    categories: [
      { id: "user_caches", risk: "safe" },
      { id: "xcode_derived_data", risk: "safe" },
      { id: "system_trash", risk: "review" },
      { id: "installer_files", risk: "review" },
    ],
  };
  const selected = safeCategoryIds(result);
  assert.equal(selected.size, 2);
  assert.ok(selected.has("user_caches"));
  // The Trash holds files the user deleted but has not committed to losing, and
  // Downloads holds files they chose to keep. A one-click clean must not take either.
  assert.equal(selected.has("system_trash"), false);
  assert.equal(selected.has("installer_files"), false);
  assert.equal(safeCategoryIds(null).size, 0);
});

test("every category the scanner can emit has a risk rating in the policy", () => {
  // A category added to the scanner without a rating falls through to "review", which is
  // safe but silent. This test makes the omission visible instead.
  const ids = new Set();
  for (const match of rust.matchAll(/id:\s*"([a-z_0-9]+)"\.into\(\)/g)) ids.add(match[1]);
  for (const match of rust.matchAll(/\(\s*"([a-z_0-9]+)",\s*$/gm)) ids.add(match[1]);
  for (const match of rust.matchAll(/^\s+"([a-z_0-9]+)",$/gm)) ids.add(match[1]);
  // Ids that belong to other features in the same file, not clean categories.
  for (const notACategory of ["dns_flush", "quicklook_reset", "memory_purge", "launch_services_rebuild"]) {
    ids.delete(notACategory);
  }

  assert.ok(ids.size >= 20, `expected the scanner's category ids, found ${ids.size}`);
  const unrated = [...ids].filter(
    (id) => !policy.includes(`"${id}"`)
  );
  assert.deepEqual(unrated, [], "these scan categories carry no explicit risk rating");
});

test("the view no longer walks the whole disk just because the tab opened", () => {
  // The mount effect used to call handleScanClean(), so entering the tab started a full
  // filesystem scan nobody asked for.
  const mount = view.slice(view.indexOf("// Initial load"), view.indexOf("/// Polls the backend"));
  assert.equal(
    mount.includes("handleScanClean()"),
    false,
    "mounting must not start a scan"
  );
  assert.ok(mount.includes("fetchMetrics()"), "cheap metrics still load on mount");
  assert.ok(view.includes("Scan now"), "an explicit scan action is offered instead");
});

test("a running scan reports its stage and can be cancelled", () => {
  assert.ok(view.includes("getScanProgress"), "polls the backend's own scan counters");
  assert.ok(view.includes("scanProgress?.stage"), "shows which part of the system it is in");
  assert.ok(view.includes("bytes_seen"), "shows a running total");
  assert.ok(view.includes("handleCancelScan"), "offers a cancel action");

  // The backend has to honour it inside the walk, not just between categories.
  assert.ok(rust.includes("pub fn cleaner_cancel_scan"), "cancel command exists");
  assert.ok(rust.includes("pub fn cleaner_scan_progress"), "progress command exists");
  const walk = rust.slice(rust.indexOf("pub fn calculate_dir_size"));
  assert.ok(
    walk.slice(0, 1400).includes("scan_cancelled()"),
    "the directory walk itself must check for cancellation"
  );
  // The same walk measures sizes during a clean, so the flag must not outlive the scan
  // that set it or the next clean reports zero bytes for files it really deleted.
  assert.ok(
    rust.includes("SCAN_RUNNING.load(Ordering::Relaxed) && SCAN_CANCEL.load"),
    "cancellation only applies while a scan is running"
  );
  assert.ok(rust.includes("SCAN_CANCEL.swap(false"), "the flag is cleared with the run");
  assert.ok(rust.includes("pub cancelled: bool"), "a partial scan says so");
});

test("cleaning deletes the reviewed scan rather than re-walking the disk", () => {
  const clean = rust.slice(
    rust.indexOf("pub async fn cleaner_execute_clean"),
    rust.indexOf("// 2. Smart Application Uninstaller")
  );
  assert.ok(clean.includes("REVIEWED_SCAN"), "uses the scan the user reviewed");
  assert.equal(
    clean.includes("perform_system_scan()"),
    false,
    "re-scanning cost a second full walk and could delete paths that were never shown"
  );
  assert.ok(
    clean.includes("Scan the system before cleaning"),
    "cleaning without a reviewed scan is refused with a reason"
  );
});

test("a clean reports what each category gave back, including the parts that failed", async () => {
  assert.ok(rust.includes("pub struct CleanCategoryOutcome"), "per-category outcome exists");
  assert.ok(rust.includes("pub skipped: Vec<String>"), "skipped categories are named");
  assert.ok(view.includes("lastCleanResult"), "the view keeps the last result on screen");
  assert.ok(view.includes("outcome.errors"), "per-category errors are rendered");

  const { executeClean } = lib(async () => ({
    bytes_reclaimed: 10,
    items_removed: 2,
    errors: ["boom"],
    categories: [{ id: "a", name: "A", bytes_reclaimed: 10, items_removed: 2, errors: ["boom"] }],
    skipped: ["b"],
  }));
  const result = await executeClean(["a", "b"]);
  assert.equal(result.categories.length, 1);
  assert.equal(result.skipped[0], "b");
});

test("deleting a reviewed category needs a second, separate confirmation", () => {
  assert.ok(view.includes("reviewAcknowledged"), "an explicit acknowledgement exists");
  assert.ok(view.includes("canConfirmClean"), "confirmation is gated on it");
  const guard = view.slice(view.indexOf("async function handleConfirmClean"));
  assert.ok(
    guard.slice(0, 300).includes("if (!canConfirmClean)"),
    "the confirm handler refuses until the review box is ticked"
  );
  assert.ok(
    view.includes('confirmVariant={selectedReviewCategories.length > 0 ? "destructive"'),
    "the dialog looks destructive when it is"
  );
});

test("the numbers that decide whether to clean are visible on every tab", () => {
  const strip = view.slice(view.indexOf("Persistent status strip"), view.indexOf("Navigation Tabs"));
  for (const label of ["Disk free", "Memory", "Swap in use", "Found on disk"]) {
    assert.ok(strip.includes(label), `${label} is on the always-visible strip`);
  }
  assert.ok(strip.includes("text-(--error)"), "pressure is colour-coded, not just printed");
});

test("CleanerView keeps the zero-emoji rule", () => {
  assert.equal(
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(view),
    false,
    "CleanerView.svelte must contain zero emojis"
  );
});
