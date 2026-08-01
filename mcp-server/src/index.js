import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { loadData, data } from './dataLoader.js';
import { getOverview } from './tools/overview.js';
import { getStates } from './tools/states.js';
import { getDistricts } from './tools/districts.js';
import { getProductMix } from './tools/products.js';
import { getSalesTrend } from './tools/trends.js';
import { getAlerts } from './tools/alerts.js';
import { getTopDealers } from './tools/dealers.js';
import { askSalesQuestion } from './tools/ask.js';

const server = new McpServer({
  name: 'hmb-sales-server',
  version: '1.0.0'
}, {
  capabilities: { tools: {} }
});

server.tool('get_sales_overview',
  'Get top-level sales KPIs — total current/previous/MoM, pending, daily rates, alert counts',
  {},
  async () => {
    return {
      content: [{ type: 'text', text: JSON.stringify(getOverview(), null, 2) }]
    };
  }
);

server.tool('get_state_sales',
  'Get state-by-state sales breakdown. Optionally filter by state name.',
  {
    state: z.string().optional().describe('Filter by state name (e.g. "West Bengal")')
  },
  async ({ state }) => {
    return {
      content: [{ type: 'text', text: JSON.stringify(getStates({ state }), null, 2) }]
    };
  }
);

server.tool('get_district_sales',
  'Get district-level sales breakdown. Optionally filter by state and/or district.',
  {
    state: z.string().optional().describe('Filter by state name'),
    district: z.string().optional().describe('Filter by district name')
  },
  async ({ state, district }) => {
    return {
      content: [{ type: 'text', text: JSON.stringify(getDistricts({ state, district }), null, 2) }]
    };
  }
);

server.tool('get_product_mix',
  'Get product-wise sales breakdown (IG, GI, IGG, P, RS, SS). Optionally filter by product code.',
  {
    product: z.string().optional().describe('Filter by product code (e.g. "IG", "GI")')
  },
  async ({ product }) => {
    return {
      content: [{ type: 'text', text: JSON.stringify(getProductMix({ product }), null, 2) }]
    };
  }
);

server.tool('get_sales_trend',
  'Get monthly sales history trend over the last N months.',
  {
    months: z.number().optional().default(6).describe('Number of months to look back (default: 6)')
  },
  async ({ months }) => {
    return {
      content: [{ type: 'text', text: JSON.stringify(getSalesTrend({ months }), null, 2) }]
    };
  }
);

server.tool('get_alerts_and_risks',
  'Get current alerts and risk items. Optionally filter by severity level.',
  {
    severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM']).optional().describe('Filter by severity: CRITICAL, HIGH, or MEDIUM')
  },
  async ({ severity }) => {
    return {
      content: [{ type: 'text', text: JSON.stringify(getAlerts({ severity }), null, 2) }]
    };
  }
);

server.tool('get_top_dealers',
  'Get top dealers ranked by current month volume. Optionally filter by state, district, or minimum volume.',
  {
    limit: z.number().optional().default(10).describe('Number of dealers to return (default: 10)'),
    state: z.string().optional().describe('Filter by state name'),
    district: z.string().optional().describe('Filter by district name'),
    minCur: z.number().optional().describe('Minimum current month volume filter')
  },
  async ({ limit, state, district, minCur }) => {
    return {
      content: [{ type: 'text', text: JSON.stringify(getTopDealers({ limit, state, district, minCur }), null, 2) }]
    };
  }
);

server.tool('ask_sales_question',
  'Ask a plain-English question about sales data. Returns a structured natural-language analysis. Examples: "whats our total sales this month?", "which state dropped the most?", "show me IG sales in West Bengal", "top 5 dealers", "are there any critical alerts?", "whats the pending volume?", "how have sales trended over the last 3 months?"',
  {
    question: z.string().describe('Your question about sales data in plain English')
  },
  async ({ question }) => {
    const result = askSalesQuestion({ question });
    return {
      content: [
        { type: 'text', text: result.text },
        { type: 'text', text: JSON.stringify(result, null, 2) }
      ]
    };
  }
);

async function main() {
  try {
    console.error('HMB MCP Server: Loading data from Supabase...');
    await loadData();
    console.error(`HMB MCP Server: Data loaded successfully. ${data.states?.length || 0} states, ${data.districts?.length || 0} districts, ${data.dealers?.length || 0} dealers.`);
  } catch (err) {
    console.error('HMB MCP Server: Failed to load data:', err.message);
    process.exit(1);
  }

  // Stateless transport: no sessionIdGenerator needed since each request
  // gets fresh data from the in-memory store and there's no per-session state.
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });
  await server.connect(transport);

  const app = express();
  app.use(express.json());

  app.post('/mcp', async (req, res) => {
    try {
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('HMB MCP Server: Request error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    }
  });

  // Streamable HTTP transport also expects GET (server->client stream)
  // and DELETE (session teardown) on the same route.
  app.get('/mcp', async (req, res) => {
    try {
      await transport.handleRequest(req, res);
    } catch (err) {
      console.error('HMB MCP Server: GET /mcp error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    }
  });

  app.delete('/mcp', async (req, res) => {
    try {
      await transport.handleRequest(req, res);
    } catch (err) {
      console.error('HMB MCP Server: DELETE /mcp error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    }
  });

  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.error(`HMB MCP Server: Listening on port ${PORT}. MCP endpoint: POST /mcp`);
  });
}

main().catch(err => {
  console.error('HMB MCP Server: Fatal error:', err);
  process.exit(1);
});