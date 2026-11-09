import { fileURLToPath } from "node:url";

// Resolve paths on the machine doing the installation, not the author's Mac.
console.log(JSON.stringify({
  mcpServers: {
    "peek-aso": {
      command: process.execPath,
      args: [fileURLToPath(new URL("./launch.mjs", import.meta.url))],
    },
  },
}, null, 2));
