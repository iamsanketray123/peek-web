import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("real stdio process negotiates MCP, lists tools and validates calls", async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("../launch.mjs", import.meta.url))], cwd: tmpdir(), stderr: "pipe" });
  const client = new Client({ name: "peek-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 9);
    assert.equal(tools.find((t) => t.name === "capture_snapshot").annotations.readOnlyHint, false);
    const result = await client.callTool({ name: "list_apps", arguments: {} });
    assert.equal(result.structuredContent.apps.medo.appleId, "6807894442");
    const bad = await client.callTool({ name: "check_ranks", arguments: { app: "medo", country: "xx", keywords: ["pill"] } });
    assert.equal(bad.isError, true);
  } finally { await client.close(); }
});

test("portable config resolves this installation and works outside its project directory", () => {
  const script = fileURLToPath(new URL("../client-config.mjs", import.meta.url));
  const config = JSON.parse(execFileSync(process.execPath, [script], { cwd: tmpdir(), encoding: "utf8" }));
  assert.equal(config.mcpServers["peek-aso"].command, process.execPath);
  assert.equal(config.mcpServers["peek-aso"].args[0], fileURLToPath(new URL("../launch.mjs", import.meta.url)));
});
