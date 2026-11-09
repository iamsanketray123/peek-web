// Optional CLI; emits the same structured data as the MCP capture tool.
import "./network.mjs";
import { PeekService } from "./service.mjs";
const service = new PeekService();
const app = process.argv[2];
if (!app) throw new Error("Usage: npm run baseline -- medo [us] (or tether)");
console.log(JSON.stringify(await service.capture(app, undefined, process.argv[3] || "us"), null, 2));
