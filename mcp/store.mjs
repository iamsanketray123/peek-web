import { mkdir, readFile, readdir, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

export class SnapshotStore {
  constructor(directory = process.env.PEEK_MCP_DATA_DIR || join(homedir(), ".local", "share", "peek-mcp")) {
    this.directory = directory;
  }
  async save(snapshot) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const id = randomUUID();
    const record = { ...snapshot, id, schemaVersion: 1 };
    const pending = join(this.directory, `${id}.tmp`);
    await writeFile(pending, JSON.stringify(record, null, 2), { flag: "wx", mode: 0o600 });
    await rename(pending, join(this.directory, `${id}.json`));
    return record;
  }
  async history(appleId, country, limit = 30) {
    let files;
    try { files = await readdir(this.directory); }
    catch (error) { if (error.code === "ENOENT") return []; throw error; }
    const records = [];
    for (const file of files.filter((f) => /^[\da-f-]{36}\.json$/.test(f))) {
      // Fail visibly on corrupted history instead of silently hiding observations.
      const record = JSON.parse(await readFile(join(this.directory, file), "utf8"));
      if (record.appleId === appleId && record.country === country && record.schemaVersion === 1) records.push(record);
    }
    return records.sort((a, b) => b.checkedAt.localeCompare(a.checkedAt)).slice(0, limit);
  }
}

export function compareSnapshots(current, previous) {
  if (!previous) return [];
  if (current.appleId !== previous.appleId || current.country !== previous.country) throw new Error("Cannot compare different apps or storefronts.");
  if (current.source !== previous.source) throw new Error("Cannot compare different rank sources.");
  return current.keywords.map((now) => {
    const before = previous.keywords.find((k) => k.term === now.term && !k.error);
    if (now.error || !before) return { term: now.term, status: "no_comparable_observation" };
    const delta = now.position !== null && before.position !== null ? before.position - now.position : null;
    return {
      term: now.term, previousPosition: before.position, position: now.position,
      delta, // Positive = moved toward position 1, never arithmetic on missing ranks.
      status: delta !== null ? (delta > 0 ? "improved" : delta < 0 ? "declined" : "unchanged")
        : now.position !== null ? "entered_returned_results"
        : before.position !== null ? "left_returned_results" : "not_found_in_either_result_set",
    };
  });
}
