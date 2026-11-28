# Cursor Cloud delegation

`cursor_task` starts a hosted Cursor agent and returns a run ID immediately. Pi wakes the calling conversation when the run settles. For a local Cursor or Antigravity CLI, install [ACP](../acp/README.md) and use `acp_task` instead.

## Install and configure

Copy the `cursor` directory under `<P2_DATA_DIR>/plugins/` and run `npm ci --omit=dev --ignore-scripts` inside the installed directory. In **Settings › Cursor**:

- Save a Cursor API key or set `CURSOR_API_KEY` on the server. The stored key takes precedence. It lives in `<P2_DATA_DIR>/cursor-secrets.json` (0600), is write-only in Settings, and is redacted from SDK errors and results. **Test key** reports the key's name.
- Allow repositories by `owner/name` or `owner/*` (case-insensitive). None are allowed by default. Cursor clones the requested repo into its VM. The prompt, repository and tool results go to Cursor: check your team's privacy settings and do not send secrets.
- Optionally choose a default model. `cursor_models` lists the SDK's model IDs and accepted parameters for this key, cached for ten minutes. A CLI-style model name is mapped only when the match is unambiguous.
- Enable **Allow cloud agents to change repositories** to permit `agent` mode. Otherwise runs can only `plan`. An agent works on its own branch; Pi does not request automatic pull requests.
- Set the concurrent run caps (default: 6 overall, 4 per session; ceiling: 12).

## Use and recovery

`cursor_task` takes `prompt` and `repo`, plus optional `branch`, `mode` (`plan`, the default, or `agent`), `model`, `modelParams`, and `timeoutMinutes` (default 30, maximum 120). A replay of the same call gets the same run. Only the calling session can list, inspect, cancel or resume its runs. Read-only conversations cannot start or resume them.

`cursor_list`, `cursor_status`, `cursor_result`, and `cursor_cancel` work by run ID (no ID for list). Pi keeps up to 50 finished records, with up to 16,000 characters of result text. The wake quotes up to 1,500 characters and labels the result as untrusted. The run, ending and attempt identify its wake so a restart does not publish it twice.

Cloud runs continue at Cursor when Pi stops. On startup Pi reattaches with the saved Cursor agent and run IDs. If reattachment fails, a run with an agent ID becomes `interrupted`; `cursor_resume` can continue the same agent, with an optional `instruction`. Repository permissions, edit permissions and limits still apply. A finished, failed or cancelled run cannot be resumed.

## Upgrade from mixed local/cloud versions

The migration keeps cloud settings and cloud records. It maps old cloud `ask` records to `plan`, the mode the SDK actually ran. Local records are dropped, not resumed or replayed. Pi does not remove old `cursor-runs/` directories. Finish or cancel outstanding local workers before upgrading; this plugin no longer supervises them. The `cursor.run` source stays at version 1 so already published events remain readable.
