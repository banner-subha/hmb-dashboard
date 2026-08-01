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
import { getRiskIntelligence } from './tools/risk.js';
import { getRootCauseAnalysis } from './tools/rootcause.js';
import { getRecommendedActions } from './tools/actions.js';
import { getInactiveDealers } from './tools/inactive.js';
import { getOrderPipeline } from './tools/pipeline.js';
import { getTargetAttainment } from './tools/targets.js';
import { getStateDetail } from './tools/stateDetail.js';
import { getDealerDetail } from './tools/dealerDetail.js';
import { getEntityTrend } from './tools/entityTrend.js';
import { getDataFreshness } from './tools/freshness.js';
import { compareEntities } from './tools/compare.js';

function createMcpServer() {
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

  server.tool('get_risk_intelligence',
    'Get risk-scored states, districts, and dealers with riskScore, impactTier, decline drivers, and concentration risk.',
    {
      entityType: z.enum(['state', 'district', 'dealer']).optional().describe('Filter by entity type'),
      minRiskScore: z.number().min(0).max(100).optional().describe('Only include entities with riskScore >= this value'),
      maxResults: z.number().int().min(1).max(200).optional().default(50).describe('Max results per entity type (default: 50)'),
      impactTier: z.string().optional().describe('Filter by impact tier (e.g. "Critical", "High")')
    },
    async ({ entityType, minRiskScore, maxResults, impactTier }) => {
      return {
        content: [{ type: 'text', text: JSON.stringify(getRiskIntelligence({ entityType, minRiskScore, maxResults, impactTier }), null, 2) }]
      };
    }
  );

  server.tool('get_root_cause_analysis',
    'Get AI-generated root cause analysis of the current month decline, by dimension (PRODUCT, STATE, DISTRICT, DEALER).',
    {
      dimension: z.string().optional().describe('Filter by dimension (PRODUCT, STATE, DISTRICT, DEALER)')
    },
    async ({ dimension }) => {
      return {
        content: [{ type: 'text', text: JSON.stringify(getRootCauseAnalysis({ dimension }), null, 2) }]
      };
    }
  );

  server.tool('get_recommended_actions',
    'Get prioritized recommended actions, escalation flags, dealer risks, and the executive summary.',
    {
      priority: z.string().optional().describe('Filter by priority (IMMEDIATE, HIGH, MEDIUM)')
    },
    async ({ priority }) => {
      return {
        content: [{ type: 'text', text: JSON.stringify(getRecommendedActions({ priority }), null, 2) }]
      };
    }
  );

  server.tool('get_inactive_dealers',
    'Get dealers with zero activity this period. Optionally filter by state or minimum previous volume.',
    {
      state: z.string().optional().describe('Filter by state name'),
      minPrevVolume: z.number().optional().describe('Only include dealers with prevVolume >= this value')
    },
    async ({ state, minPrevVolume }) => {
      return {
        content: [{ type: 'text', text: JSON.stringify(getInactiveDealers({ state, minPrevVolume }), null, 2) }]
      };
    }
  );

  server.tool('get_order_pipeline',
    'Get order-to-dispatch pipeline: order totals vs previous, MoM, pending backlog, avg dispatch lead time, dispatch gap, and per-state breakdown.',
    {
      state: z.string().optional().describe('Filter breakdown by state name')
    },
    async ({ state }) => {
      return {
        content: [{ type: 'text', text: JSON.stringify(getOrderPipeline({ state }), null, 2) }]
      };
    }
  );

  server.tool('get_target_attainment',
    'Get actual vs target attainment for the period, pace vs expected MTD, and per-state on-track/behind status.',
    {
      state: z.string().optional().describe('Filter breakdown by state name')
    },
    async ({ state }) => {
      return {
        content: [{ type: 'text', text: JSON.stringify(getTargetAttainment({ state }), null, 2) }]
      };
    }
  );

  server.tool('get_state_detail',
    'Get full detail for a single state, including product breakdown, order pipeline, risk, and pace metrics.',
    {
      state: z.string().describe('State name (e.g. "West Bengal")')
    },
    async ({ state }) => {
      return {
        content: [{ type: 'text', text: JSON.stringify(getStateDetail({ state }), null, 2) }]
      };
    }
  );

  server.tool('get_dealer_detail',
    'Get full detail for a single dealer by client name, including product breakdown, risk status, and recommended action.',
    {
      client: z.string().describe('Dealer/client name (e.g. "Ramesh Traders")')
    },
    async ({ client }) => {
      return {
        content: [{ type: 'text', text: JSON.stringify(getDealerDetail({ client }), null, 2) }]
      };
    }
  );

  server.tool('get_entity_trend',
    'Get monthly sales history for a specific state, district, dealer, or product over the last N months.',
    {
      entityType: z.enum(['state', 'district', 'dealer', 'product']).describe('Entity type to trend'),
      entityName: z.string().describe('Entity name (state, district, dealer client, or product code)'),
      months: z.number().int().min(1).optional().default(6).describe('Number of months to look back (default: 6)')
    },
    async ({ entityType, entityName, months }) => {
      return {
        content: [{ type: 'text', text: JSON.stringify(getEntityTrend({ entityType, entityName, months }), null, 2) }]
      };
    }
  );

  server.tool('get_data_freshness',
    'Get data freshness metadata: generatedAt, data as-of date, current/previous periods, rows processed, and available months.',
    {},
    async () => {
      return {
        content: [{ type: 'text', text: JSON.stringify(getDataFreshness(), null, 2) }]
      };
    }
  );

  server.tool('compare_entities',
    'Compare two entities (states, districts, dealers, or products) side by side.',
    {
      entityType: z.enum(['state', 'district', 'dealer', 'product']).describe('Entity type to compare'),
      entityA: z.string().describe('First entity name'),
      entityB: z.string().describe('Second entity name')
    },
    async ({ entityType, entityA, entityB }) => {
      return {
        content: [{ type: 'text', text: JSON.stringify(compareEntities({ entityType, entityA, entityB }), null, 2) }]
      };
    }
  );

  return server;
}

async function main() {
  try {
    console.error('HMB MCP Server: Loading data from Supabase...');
    await loadData();
    console.error(`HMB MCP Server: Data loaded successfully. ${data.states?.length || 0} states, ${data.districts?.length || 0} districts, ${data.dealers?.length || 0} dealers.`);
  } catch (err) {
    console.error('HMB MCP Server: Failed to load data:', err.message);
    process.exit(1);
  }

  const app = express();
  app.use(express.json());

  app.post('/mcp', async (req, res) => {
    // Stateless mode: each request gets a fresh server + transport because
    // the SDK's StreamableHTTPServerTransport is single-use. Reusing one
    // instance across requests breaks after the first exchange.
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });
    await server.connect(transport);
    res.on('close', () => {
      server.close().catch(() => {});
    });
    try {
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('HMB MCP Server: Request error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    }
  });

  // Stateless mode (sessionIdGenerator: undefined) has no session to stream
  // to or tear down, so these routes are not supported.
  app.get('/mcp', (req, res) => {
    res.status(405).send('Method Not Allowed');
  });

  app.delete('/mcp', (req, res) => {
    res.status(405).send('Method Not Allowed');
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