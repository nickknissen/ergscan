# Ask an agent about your workouts (MCP)

[← Back to README](../README.md)

ErgScan includes a small [MCP](https://modelcontextprotocol.io) server that
lets an AI agent, such as Claude Code, read your saved workouts. It needs
[private sync](private-sync.md).

The MCP server runs on your computer and links to your history like a new
phone or tablet. It downloads the encrypted history and decrypts it on your
computer, so the sync server still only stores and sends data it cannot read.
What the agent asks for does leave your computer: the tools' answers become
part of the agent's conversation, and are sent to whoever runs the agent's
model.

## Set it up

You need Node.js 20.19+ or 22.12+ and a copy of this repository with its
dependencies installed (`npm install`).

1. Link your computer, with the address of your ErgScan deployment:

   ```sh
   node mcp/ergscan-mcp.mjs link --server https://ergscan.example
   ```

   It shows a QR code and a link, valid for five minutes.
2. On a device that already syncs, scan the QR code with the camera. You can
   also open **Settings → Private sync**, paste the link and choose
   **Approve new device**.
3. Add the server to your agent. In Claude Code:

   ```sh
   claude mcp add ergscan -e TZ=Europe/Copenhagen -- node /path/to/ergscan/mcp/ergscan-mcp.mjs
   ```

   `TZ` sets the time zone for workout times and for the days you ask about.
   It is only needed when the computer uses a different time zone from you.

Then ask, for example, "How did my rowing go this week?".

The key to your history is saved in `~/.config/ergscan-mcp/device.json`,
readable only by you. Set `ERGSCAN_MCP_DEVICE` to keep it elsewhere.

## Tools

Both tools only read. They never change your history.

| Tool | What it returns |
| --- | --- |
| `list_workouts` | Workouts, newest first, optionally between two days: time, distance, pace per 500 m, watts, stroke rate, heart rate, drag factor, feeling and notes |
| `get_workout` | One workout with every split or interval, rest included, and each split's highest heart rate when you added a watch recording. Optionally the watch heart rate averaged over windows of a chosen length |

Each call downloads the history again if it has changed, so workouts you
save on your phone show up straight away.

## Unlink

```sh
node mcp/ergscan-mcp.mjs unlink
```

This removes your computer from your linked devices and deletes the key file.
Removing it under **Settings → Private sync → Show linked devices** on
another device also works. The tools then report that the computer is no
longer linked.
