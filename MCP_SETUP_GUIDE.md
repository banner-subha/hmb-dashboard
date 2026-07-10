# HMB Dashboard — MCP Server Setup Guide

Connect Claude to your HMB sales data. Let you chat about sales in plain English.

---

## Overview

The MCP server is a Node.js HTTP server that:
1. Fetches `latest.json` from Supabase Storage once on startup
2. Exposes 8 tools that Claude can call to query sales data
3. Runs on Railway as a long-lived web service

**Data is fetched on server start.** To refresh, restart the server (Railway > Deploy > Redeploy).

---

## Files Structure

```
hmb-dashboard/mcp-server/
├── package.json              # Node.js dependencies & scripts
├── railway.json              # Railway build/deploy config
├── node_modules/             # Installed dependencies (gitignored)
└── src/
    ├── index.js              # Main entry — Express HTTP server + tool registration
    ├── dataLoader.js         # Fetches latest.json from Supabase on startup
    ├── analysis.js           # Shared helpers (filter, sort, calculate)
    └── tools/
        ├── overview.js       # get_sales_overview
        ├── states.js         # get_state_sales
        ├── districts.js      # get_district_sales
        ├── products.js       # get_product_mix
        ├── trends.js         # get_sales_trend
        ├── alerts.js         # get_alerts_and_risks
        ├── dealers.js        # get_top_dealers
        └── ask.js            # ask_sales_question (keyword-driven, no API key)
```

---

## Available Tools (8 total)

| Tool | Description |
|---|---|
| `get_sales_overview` | Top-level KPIs: total cur/prev, MoM%, pending, daily rates, alert counts |
| `get_state_sales` | State-by-state breakdown. Optional: filter by state name |
| `get_district_sales` | District-level breakdown. Optional: filter by state and/or district |
| `get_product_mix` | Product-wise (IG, GI, IGG, P, RS, SS) with share, MoM, pending |
| `get_sales_trend` | Monthly history over last N months with totals and top states/products |
| `get_alerts_and_risks` | Active alerts. Optional: filter by severity (CRITICAL/HIGH/MEDIUM) |
| `get_top_dealers` | Top dealers by volume. Optional: limit, state, district, min volume |
| `ask_sales_question` | Natural language — "which state dropped the most?", "show me IG in West Bengal" |

---

## Deploy to Railway (Step by Step)

### 1. Push to GitHub

Create a new GitHub repo and push only the `mcp-server/` folder:

```bash
cd hmb-dashboard/mcp-server
git init
git add .
git commit -m "Initial MCP server"
git remote add origin https://github.com/YOUR_USERNAME/hmb-mcp-server.git
git branch -M main
git push -u origin main
```

### 2. Create Railway Project

1. Go to [railway.app](https://railway.app) and log in
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your `hmb-mcp-server` repo
4. Railway auto-detects Node.js and runs `npm install` + `npm start`

### 3. Get Your URL

Once deployed, Railway gives you a URL like:

```
https://hmb-sales-server.up.railway.app
```

The MCP endpoint is:

```
https://hmb-sales-server.up.railway.app/mcp
```

### 4. Connect Claude

1. Open Claude Desktop
2. Go to **Settings** → **MCP Servers** → **Add MCP Server**
3. Enter the URL: `https://hmb-sales-server.up.railway.app/mcp`
4. Click **Connect**
5. Claude will discover all 8 tools automatically

---

## Test Locally (Before Deploying)

```bash
cd hmb-dashboard/mcp-server
npm install
npm start
```

Server starts on `http://localhost:3001`. MCP endpoint: `POST /mcp`

To test with curl:

```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
```

---

## Example Questions You Can Ask Claude

- "What's our total sales this month vs last month?"
- "Which state dropped the most?"
- "Show me IG sales in West Bengal"
- "Top 10 dealers by volume"
- "Are there any critical alerts?"
- "What's the pending volume across all states?"
- "How have sales trended over the last 3 months?"
- "Which products are performing worst?"
- "Show me districts in Jharkhand"
- "What's the current daily despatch rate vs target?"

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Server won't start | Check Railway logs for errors. Ensure `latest.json` URL is accessible |
| Claude shows "Connection failed" | Verify the URL has `/mcp` at the end. Check Railway is running |
| Data is stale | Hit **Redeploy** in Railway to re-fetch latest.json |
| Railway app stops | Free tier goes to sleep after inactivity. Add a health check or upgrade plan |
| Port already in use | Set `PORT=3002` env var in Railway |

---

## Architecture

```
[Supabase Storage]
    │
    ▼ (fetched once on startup)
[Node.js HTTP Server] ─── Express ─── POST /mcp ─── MCP SDK
    │                                                   │
    ▼                                                   ▼
[8 Tool Handlers]                              [Claude Desktop]
    │
    ▼
[In-memory data from latest.json]
```
