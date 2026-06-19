# Design Generator MCP Server

Lets Claude read and edit product slot content, search Canto images, and manage design projects — directly from the Claude chat interface or Claude Desktop.

## Tools available

| Tool | What it does |
|------|-------------|
| `list_projects` | List all design projects |
| `list_products` | List products in a project (requires CSV upload) |
| `get_product_slots` | Get full slot content for a product |
| `update_product_slot` | Edit title / description / icon callouts in a slot |
| `search_canto` | Search Canto DAM by keyword or SKU |
| `list_canto_albums` | List Canto albums and folders |
| `assign_photo` | Assign a Canto image to a product slot |

## Setup

### 1. Configure the deployed app

Add to `.env.local` (already done — **never commit this file**):

```
MCP_API_KEY=<your-secret-key>
```

The deployed app on Vercel also needs this env var — add it in the Vercel dashboard under **Settings → Environment Variables**.

### 2. Install dependencies

```bash
cd mcp-server
npm install
```

### 3. Configure Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "design-generator": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/design-generator/mcp-server/src/index.ts"],
      "env": {
        "DESIGN_GENERATOR_URL": "https://your-app.vercel.app",
        "MCP_API_KEY": "<your-secret-key>"
      }
    }
  }
}
```

Replace:
- `/absolute/path/to/design-generator` — full path to this repo on your machine  
- `https://your-app.vercel.app` — your deployed app URL  
- `<your-secret-key>` — the value from `.env.local`

Restart Claude Desktop after saving the config.

### 4. Verify it works

In Claude Desktop, you should see a hammer icon (🔨) indicating tools are available. Ask:

> "List my design projects"

Claude will call `list_projects` and show your projects.

## Example workflow

```
You: List my design projects
Claude: [calls list_projects] Here are your projects: ...

You: Show me the products in the "Duramax Parts" project
Claude: [calls list_products] Found 12 products: DH515146, DETAIL5, ...

You: Search Canto for photos of DH515146
Claude: [calls search_canto] Found 8 images: ...

You: Assign the first lifestyle photo to product DH515146, slot a1
Claude: [calls assign_photo] Done — photo "DH515146-lifestyle-01.jpg" assigned to slot a1

You: The description in slot b1 for DH515146 is too long. Rewrite it to be more punchy, under 120 characters
Claude: [calls get_product_slots, then update_product_slot] Updated.
```

## Development

Run the server directly for testing:

```bash
cd mcp-server
DESIGN_GENERATOR_URL=http://localhost:3000 MCP_API_KEY=<key> npx tsx src/index.ts
```

The server uses **stdio transport** — it reads JSON-RPC from stdin and writes to stdout. Claude Desktop manages the process lifecycle automatically.
