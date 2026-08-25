import type { Context, Config } from "@netlify/functions";

/**
 * Remote MCP server hosted on a single Netlify Function.
 * Implements the MCP "Streamable HTTP" transport using plain
 * JSON-RPC 2.0 over POST (no SSE needed for basic tool calls).
 *
 * Endpoint (after deploy): https://<your-site>.netlify.app/mcp
 * (mapped via netlify.toml redirect — see below)
 */

const SERVER_INFO = {
  name: "zylospire-mcp",
  version: "1.0.0",
};

// ---------------------------------------------------------------------------
// 1) DEFINE YOUR TOOLS HERE
//    Add one entry per tool: schema (what Claude sees) + handler (what runs).
// ---------------------------------------------------------------------------

type ToolHandler = (args: any, context: Context) => Promise<any>;

const TOOLS: Record<
  string,
  { description: string; inputSchema: any; handler: ToolHandler }
> = {
  get_site_status: {
    description:
      "Returns basic status/info about the ZyloSpire site (example tool — replace with real data).",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              site: "zylospire.netlify.app",
              status: "ok",
              time: new Date().toISOString(),
            }),
          },
        ],
      };
    },
  },

  // Example: a tool that calls an external API using a secret stored
  // in a Netlify environment variable (never hardcode keys in code!).
  call_external_api_example: {
    description:
      "Example tool showing how to call an external API securely using an env var API key.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query or input" },
      },
      required: ["query"],
    },
    handler: async (args) => {
      // IMPORTANT: this must be the *name* of the env var you set in the
      // Netlify dashboard (Site settings -> Environment variables),
      // never the literal key value itself.
      const apiKey = Deno.env.get("EXTERNAL_API_KEY");
      if (!apiKey) {
        return {
          content: [
            {
              type: "text",
              text: "EXTERNAL_API_KEY is not set in Netlify environment variables.",
            },
          ],
          isError: true,
        };
      }

      // Replace this URL/body/model with the real endpoint you're calling.
      // (e.g. an OpenAI-compatible /v1/chat/completions endpoint)
      const res = await fetch("https://REPLACE-WITH-REAL-BASE-URL/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "REPLACE-WITH-MODEL-NAME",
          messages: [{ role: "user", content: args.query }],
        }),
      });

      if (!res.ok) {
        return {
          content: [
            {
              type: "text",
              text: `Upstream API error: ${res.status} ${await res.text()}`,
            },
          ],
          isError: true,
        };
      }

      const data = await res.json();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data),
          },
        ],
      };
    },
  },
};

// ---------------------------------------------------------------------------
// 2) JSON-RPC / MCP PROTOCOL HANDLING (usually no need to edit below)
// ---------------------------------------------------------------------------

function jsonRpcResult(id: any, result: any) {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id: any, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export default async (req: Request, context: Context) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  if (req.method !== "POST") {
    return new Response("MCP endpoint: use POST with JSON-RPC 2.0 body", {
      status: 405,
      headers: corsHeaders(),
    });
  }

  // Optional: protect the endpoint with a shared secret header.
  // Set MCP_ACCESS_TOKEN in Netlify env vars to enable this check.
  const requiredToken = Deno.env.get("MCP_ACCESS_TOKEN");
  if (requiredToken) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${requiredToken}`) {
      return new Response(
        JSON.stringify(jsonRpcError(null, -32001, "Unauthorized")),
        { status: 401, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
      );
    }
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify(jsonRpcError(null, -32700, "Parse error")),
      { status: 400, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
    );
  }

  const { id, method, params } = body;
  let response;

  try {
    switch (method) {
      case "initialize":
        response = jsonRpcResult(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        });
        break;

      case "notifications/initialized":
        // No response needed for notifications
        return new Response(null, { status: 202, headers: corsHeaders() });

      case "tools/list":
        response = jsonRpcResult(id, {
          tools: Object.entries(TOOLS).map(([name, t]) => ({
            name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        });
        break;

      case "tools/call": {
        const toolName = params?.name;
        const tool = TOOLS[toolName];
        if (!tool) {
          response = jsonRpcError(id, -32601, `Unknown tool: ${toolName}`);
          break;
        }
        const result = await tool.handler(params?.arguments || {}, context);
        response = jsonRpcResult(id, result);
        break;
      }

      default:
        response = jsonRpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err: any) {
    response = jsonRpcError(id, -32000, err?.message || "Internal error");
  }

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export const config: Config = {
  path: "/mcp",
};
