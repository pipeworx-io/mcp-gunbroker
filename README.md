# mcp-gunbroker

GunBroker MCP Pack — wraps the GunBroker firearms-marketplace API.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `gunbroker_search_items` | Search active GunBroker firearms-marketplace listings by keyword (e.g. "Glock 19", "AR-15 lower", "Henri 22 rifle"). Returns matching live listings with item IDs, titles, current/buy-now prices, bid counts, and time left. Public — needs only a GunBroker developer key (_apiKey). Supports pagination and sort. |
| `gunbroker_get_item` | Get full details for a single GunBroker listing by item ID — title, description, prices, seller, shipping, condition, category, and time remaining. Public — needs only a GunBroker developer key (_apiKey). |
| `gunbroker_seller_orders` | List the authenticated seller's sold orders (GunBroker /OrdersSold) — order IDs, buyers, item titles, totals, payment and shipping status. Seller tool: needs a GunBroker developer key (_apiKey) PLUS the seller's GunBroker username and password, which are exchanged for a short-lived access token on each call. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "gunbroker": {
      "url": "https://gateway.pipeworx.io/gunbroker/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Gunbroker data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
