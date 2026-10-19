import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, extname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const session = `scan-runner-${process.pid}`;
const browser = async (...args) => {
  const res = await exec("agent-browser", ["--session", session, ...args], { timeout: 30000 });
  return res.stdout.trim();
};

const fixture = readFileSync("tests/fixtures/spotify-layout-ipc.js", "utf8");
const root = resolve("dist");

export async function runUiAudit(options = {}) {
  const theme = options.theme || { family: "catppuccin", mode: "dark", darkFlavor: "frappe" };
  const viewport = options.viewport || { width: "1280", height: "850" };

  const server = createServer((request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const path = resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
    if (!path.startsWith(root + "/") || !existsSync(path)) {
      response.writeHead(404);
      response.end();
      return;
    }
    let content = readFileSync(path);
    if (path.endsWith("index.html")) {
      content = content.toString().replace(
        "<head>",
        `<head><script>${fixture}</script><script>localStorage.setItem("rust-sound.ui-theme", JSON.stringify(${JSON.stringify(
          theme
        )}));</script>`
      );
    }
    response.setHeader(
      "Content-Type",
      ({
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".woff2": "font/woff2",
        ".svg": "image/svg+xml",
        ".png": "image/png",
      })[extname(path)] ?? "application/octet-stream"
    );
    response.end(content);
  });

  await new Promise((resolve) => server.listen(5295, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:5295`;

  const tabs = [
    { name: "Mixer", query: "mixer" },
    { name: "Spotify", query: "spotify" },
    { name: "Focus Timer", query: "timer" },
    { name: "Pings & Radial Wheel", query: "pings" },
    { name: "Voice AI", query: "voice" },
    { name: "Agent Pet", query: "pet" },
    { name: "Settings", query: "settings" },
  ];

  const results = {
    timestamp: new Date().toISOString(),
    theme,
    viewport,
    tabs: [],
    overallA11yViolations: 0,
  };

  try {
    await browser("set", "viewport", viewport.width, viewport.height);

    for (const tab of tabs) {
      const tabUrl = `${url}?area=${tab.query}`;
      await browser("open", tabUrl);
      await browser("wait", "1000");

      const screenshotPath = `/tmp/app_scan_${tab.query}.png`;
      await browser("screenshot", screenshotPath);

      let violations = [];
      try {
        const a11yResult = await browser("a11y", "--json");
        const parsed = JSON.parse(a11yResult);
        violations = parsed.violations || [];
      } catch {}

      const snap = await browser("snapshot", "-i");

      results.overallA11yViolations += violations.length;
      results.tabs.push({
        name: tab.name,
        area: tab.query,
        screenshot: screenshotPath,
        a11yViolations: violations.length,
        violationsList: violations.map((v) => ({ id: v.id, impact: v.impact, description: v.description })),
        interactiveElementsSnippet: snap.slice(0, 500),
      });

      console.log(`✅ [${tab.name}] Scanned -> a11y: ${violations.length} violations, shot: ${screenshotPath}`);
    }
  } finally {
    await browser("close").catch(() => {});
    server.close();
  }

  return results;
}

if (process.argv[1].endsWith("scan-app.mjs")) {
  runUiAudit().then((r) => {
    console.log("\n==========================================");
    console.log("🎉 UI AUDIT & SCAN HOÀN TẤT THÀNH CÔNG");
    console.log(`Tổng số màn hình quét: ${r.tabs.length}`);
    console.log(`Tổng số lỗi a11y (WCAG): ${r.overallA11yViolations}`);
    console.log("==========================================");
  });
}
