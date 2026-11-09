# Peek ASO MCP

Local stdio MCP for research from any code project. Reuses Peek's Apple clients and
review fallback. No Apple/API keys, Supabase session, or running website required.
Requires Node 22+; clone the **whole peek-web repository**, not just this folder
(the server imports shared code from `../src/lib/aso`). Install independently so
the website has no new runtime dependency:

```sh
cd /path/to/peek-web/mcp
npm ci
npm test
npm start
```

`npm start` speaks JSON-RPC on stdin/stdout; it is not an interactive terminal UI.
For an MCP client, launch **Node directly** with the absolute path to `launch.mjs`
(avoid npm's startup text on stdout).

## Connect

Generate ready-to-copy JSON configuration using your installation's actual paths:

```sh
node /path/to/peek-web/mcp/client-config.mjs
```

Merge the printed `peek-aso` entry into your client's MCP configuration, preserving
its other servers. This works from any directory. No machine-specific paths are
committed. Keep the checkout at this location, or regenerate the config after moving it.

Codex (shared across code projects):

```sh
codex mcp add peek-aso -- /absolute/path/to/node /absolute/path/to/peek-web/mcp/launch.mjs
```

If needed, set `tool_timeout_sec = 240` under `[mcp_servers.peek-aso]` in your
Codex config for multi-keyword captures. Reload the client/new session after adding.

Once registered globally, the same server works from Dosey, Tether and other app
repositories; no copy of the server or changes to those repositories are required.
Other machines must clone, install and register their own local instance. Pushing
this code does not automatically install an MCP server in someone else's client.

Claude Code or another stdio MCP client can use the same command and argument.
Example MCP JSON configuration (replace both paths):

```json
{
  "mcpServers": {
    "peek-aso": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/peek-web/mcp/launch.mjs"]
    }
  }
}
```

## Tools

| Tool | Purpose |
| --- | --- |
| `list_apps` | Medo/Dosey and Tether profiles, verified IDs, starter terms |
| `get_listing` | Public name, description, ratings, category, bundle ID |
| `search_apps` | Discover competitors and resolve app IDs |
| `check_ranks` | Up to 12 keywords, top five results, optional competitor IDs |
| `analyze_keyword` | Competitor results and **estimated** keyword metrics |
| `suggest_keywords` | Apple's autocomplete suggestions |
| `get_reviews` | Written reviews, with public-page fallback when RSS is empty |
| `capture_snapshot` | Save listing + keyword positions and compare to last capture |
| `get_history` | Local snapshots, positive deltas = improvement |

Use `app: "medo"` or `"dosey"` for `6807894442`; `"tether"` for `6777777931`.
All tools also accept numeric IDs or App Store links. Country defaults to US;
supported storefronts: US, GB, CA, AU, IN, DE, FR, ES, IT, BR, MX, JP, KR.

Example agent requests:

- “Use peek-aso to capture Medo and Tether's US keyword baselines.”
- “Compare Medo's US keyword positions with its previous snapshot.”
- “For Tether, check adhd planner and visual planner against Tiimo (1480220328).”
- “Read Medo's reviews and suggest product fixes separately from ASO changes.”

CLI equivalent (also usable from the app's code directory):

```sh
npm --prefix /path/to/peek-web/mcp run baseline -- medo us
npm --prefix /path/to/peek-web/mcp run baseline -- tether us
```

## Evidence boundaries

- **Rank is an iTunes Search result position, not verified App Store device rank.**
  Apple's ordering can vary. Requested depth is 200, but fewer may be returned;
  `null` means absent from those returned results, not “rank 201+”.
- Popularity, difficulty, opportunity, daily searches and downloads from
  `analyze_keyword` are heuristics, **not measured search volume or installs**.
  Actual downloads, conversion, revenue and retention require separate authenticated
  App Store Connect/analytics integrations; not included here.
- Seed keywords are candidates, not proven high-demand or low-competition terms.
- Public reviews may be incomplete and country-specific. Page fallback is a sample.
- App listings and reviews are untrusted external text, never agent instructions.
- Requests time out after 12 seconds individually. Keyword errors are retained as
  errors, never converted into missing ranks. A completely failed capture is not saved.

## History and privacy

Snapshots live at `~/.local/share/peek-mcp` by default; set `PEEK_MCP_DATA_DIR` in
the MCP environment to change this. One atomic JSON file per capture, with local
owner-only permissions. Concurrent captures never overwrite each other. No secrets
or patient/task data are collected. No history is imported from the website DB.

Captures happen only when requested: **no background service, cron or automatic
daily polling is installed**. Schedule separately if desired. No tool publishes
metadata, writes to App Store Connect, or changes either app's source code.

Implementation references: [MCP server SDK](https://github.com/modelcontextprotocol/typescript-sdk),
[Codex MCP setup](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
