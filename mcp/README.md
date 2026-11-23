# ErgScan MCP server

Lets an AI agent, such as Claude Code, read the rowing workouts you saved in
[ErgScan](https://github.com/nickknissen/ergscan) and synced with
private sync.

It links to your history like a new phone or tablet, downloads the encrypted
history and decrypts it on your computer. The sync server only stores and
sends data it cannot read. The tools' answers do become part of the agent's
conversation.

```sh
# 1. Link this computer, then approve it from a device that already syncs
npx -y @nickknissen/ergscan-mcp link --server https://your-ergscan.example

# 2. Add it to your agent, e.g. Claude Code
claude mcp add ergscan -e TZ=Europe/Copenhagen -- npx -y @nickknissen/ergscan-mcp
```

`TZ` sets the time zone for workout times. It is only needed when the
computer uses a different time zone from you.

Tools, both read-only:

- `list_workouts`: workouts between two days, newest first, with time,
  distance, pace per 500 m, watts, stroke rate, heart rate, feeling and notes
- `get_workout`: one workout with every split or interval, rest included

To remove access, run `npx -y @nickknissen/ergscan-mcp unlink`.

See the [full documentation](https://github.com/nickknissen/ergscan/blob/main/docs/mcp.md).
Requires Node.js 20.19 or later.
