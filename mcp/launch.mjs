import { register } from "tsx/esm/api";
import "./network.mjs";
register();
// Keep stdout exclusively for MCP protocol messages.
const { start } = await import("./server.mjs");
await start();
