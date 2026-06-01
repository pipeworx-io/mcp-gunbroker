interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * GunBroker MCP Pack — wraps the GunBroker firearms-marketplace API.
 *
 * BYO credentials (nothing is stored; every call is stateless):
 *   - _apiKey: a GunBroker developer key, sent in the X-DevKey header on EVERY
 *     request. Required for all tools. Request one from GunBroker API Support.
 *   - username + password: required ONLY for seller tools (seller_orders). Used
 *     to mint a short-lived access token via POST /Users/AccessToken, which is
 *     then passed in the X-AccessToken header alongside X-DevKey.
 *
 * Endpoints used: GET /Items (search), GET /Items/{itemID} (detail),
 * GET /OrdersSold (seller, token-gated), POST /Users/AccessToken (token mint).
 *
 * Base defaults to PRODUCTION (https://api.gunbroker.com/v1). GunBroker also
 * runs a sandbox at https://api.sandbox.gunbroker.com/v1 with separate dev keys
 * and accounts; this pack targets production.
 *
 * Quirks verified against the live API:
 *   - A custom User-Agent header is mandatory — without it GunBroker returns
 *     403 text/plain "Custom User Agent string required per GunBroker API Support".
 *   - Missing/invalid X-DevKey returns 401 JSON with a developerMessage field.
 *   Because error bodies may be JSON or plain text, we surface the raw body text.
 */


const BASE = 'https://api.gunbroker.com/v1';
const UA = 'pipeworx-mcp-gunbroker/1.0 (+https://pipeworx.io)';

function devHeaders(apiKey: string): Record<string, string> {
  return {
    'X-DevKey': apiKey,
    'User-Agent': UA,
    Accept: 'application/json',
  };
}

async function gbGet(
  apiKey: string,
  path: string,
  params?: URLSearchParams,
  accessToken?: string,
): Promise<unknown> {
  const qs = params?.toString();
  const url = `${BASE}${path}${qs ? `?${qs}` : ''}`;
  const headers = devHeaders(apiKey);
  if (accessToken) headers['X-AccessToken'] = accessToken;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GunBroker: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Exchange username + password for a seller access token. Stateless: the token
 * is minted on every seller call and never persisted.
 */
async function getAccessToken(apiKey: string, username: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/Users/AccessToken`, {
    method: 'POST',
    headers: { ...devHeaders(apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GunBroker: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  const token = (data.accessToken ?? data.AccessToken) as string | undefined;
  if (!token) throw new Error(`GunBroker: token exchange returned no accessToken`);
  return token;
}

// -- Tool definitions --------------------------------------------------------

const tools: McpToolExport['tools'] = [
  {
    name: 'gunbroker_search_items',
    description:
      'Search active GunBroker firearms-marketplace listings by keyword (e.g. "Glock 19", "AR-15 lower", "Henri 22 rifle"). Returns matching live listings with item IDs, titles, current/buy-now prices, bid counts, and time left. Public — needs only a GunBroker developer key (_apiKey). Supports pagination and sort.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        _apiKey: { type: 'string', description: 'GunBroker developer key (X-DevKey). Required.' },
        Keywords: { type: 'string', description: 'Search keywords for active listings.' },
        PageSize: { type: 'number', description: 'Results per page (default 25, max 300).' },
        PageIndex: { type: 'number', description: 'Page number, 1-based (default 1).' },
        Sort: {
          type: 'number',
          description:
            'GunBroker sort code (e.g. 0=best match, 1=ending soonest, 13=lowest price). Optional.',
        },
      },
      required: ['_apiKey'],
    },
  },
  {
    name: 'gunbroker_get_item',
    description:
      'Get full details for a single GunBroker listing by item ID — title, description, prices, seller, shipping, condition, category, and time remaining. Public — needs only a GunBroker developer key (_apiKey).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        _apiKey: { type: 'string', description: 'GunBroker developer key (X-DevKey). Required.' },
        itemID: { type: 'string', description: 'GunBroker numeric item ID.' },
      },
      required: ['_apiKey', 'itemID'],
    },
  },
  {
    name: 'gunbroker_seller_orders',
    description:
      "List the authenticated seller's sold orders (GunBroker /OrdersSold) — order IDs, buyers, item titles, totals, payment and shipping status. Seller tool: needs a GunBroker developer key (_apiKey) PLUS the seller's GunBroker username and password, which are exchanged for a short-lived access token on each call.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        _apiKey: { type: 'string', description: 'GunBroker developer key (X-DevKey). Required.' },
        username: { type: 'string', description: 'GunBroker seller account username. Required.' },
        password: { type: 'string', description: 'GunBroker seller account password. Required.' },
        PageSize: { type: 'number', description: 'Results per page (default 25, max 300).' },
        PageIndex: { type: 'number', description: 'Page number, 1-based (default 1).' },
        TimeFrame: {
          type: 'number',
          description:
            'GunBroker time-frame filter for sold orders (e.g. recent N days). Optional.',
        },
      },
      required: ['_apiKey', 'username', 'password'],
    },
  },
];

// -- callTool dispatcher -----------------------------------------------------

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const apiKey = args._apiKey as string | undefined;
  const username = args.username as string | undefined;
  const password = args.password as string | undefined;
  delete args._context;
  delete args._apiKey;
  delete args.username;
  delete args.password;

  if (!apiKey) throw new Error('_apiKey (GunBroker developer key) is required for all GunBroker tools');

  switch (name) {
    case 'gunbroker_search_items': {
      const params = new URLSearchParams();
      if (args.Keywords) params.set('Keywords', String(args.Keywords));
      params.set('PageSize', String(Math.min(300, (args.PageSize as number) ?? 25)));
      params.set('PageIndex', String((args.PageIndex as number) ?? 1));
      if (args.Sort !== undefined) params.set('Sort', String(args.Sort));
      return gbGet(apiKey, '/Items', params);
    }
    case 'gunbroker_get_item':
      return gbGet(apiKey, `/Items/${encodeURIComponent(String(args.itemID))}`);
    case 'gunbroker_seller_orders': {
      if (!username || !password)
        throw new Error('username and password are required for gunbroker_seller_orders');
      const token = await getAccessToken(apiKey, username, password);
      const params = new URLSearchParams();
      params.set('PageSize', String(Math.min(300, (args.PageSize as number) ?? 25)));
      params.set('PageIndex', String((args.PageIndex as number) ?? 1));
      if (args.TimeFrame !== undefined) params.set('TimeFrame', String(args.TimeFrame));
      return gbGet(apiKey, '/OrdersSold', params, token);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
