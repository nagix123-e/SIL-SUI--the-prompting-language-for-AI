# Portable SIL/SUI MCP kit

This directory makes the local SIL/SUI compiler available to any MCP-capable agent. It offers two standard transports:

- **Streamable HTTP, JSON response mode** at `http://127.0.0.1:8765/mcp`, shared by several local agents.
- **stdio**, for MCP clients that launch one local server process per agent.

The server exposes `run_sil` and `search_sil_presets`. It parses, validates, formats, compiles, inspects, graphs, quantizes, patches in memory, and assesses evidence. It never executes a task described by SIL/SUI. It accepts inline `source` only; MCP clients cannot read arbitrary local files through it.

## Install from a GitHub release ZIP

Requires Node.js 22.13 or newer and npm. After extracting the release ZIP:

```bash
cd sil-sui-mcp-kit-v0.4.0
npm ci
npm run mcp -- init
npm run mcp -- serve
```

The service binds to loopback only and generates a private bearer token in `portable-mcp/.runtime/local.json`. Keep that file private. It does not open a network-facing port.

In another terminal, print the HTTP connection fragment:

```bash
npm run mcp -- config http
```

Copy the resulting `mcpServers.sil-sui` object into an agent's MCP configuration. Agents that support only stdio can use:

```bash
npm run mcp -- config stdio
```

The configuration shape differs between agent products, but both use standard MCP connection fields: `url` plus `Authorization` for HTTP, or `command`, `args`, and `cwd` for stdio.

## Commands

```text
npm run mcp -- init
npm run mcp -- serve [--host 127.0.0.1] [--port 8765]
npm run mcp -- config http
npm run mcp -- config stdio
```

Run `init` once for each extracted installation. The HTTP server refuses non-loopback bind addresses by design. Use a separately designed and authenticated deployment rather than exposing this local compiler over a LAN or the Internet.
