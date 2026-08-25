# Remote MCP Server (Netlify Functions)

Ye ek **remote MCP server** hai jo Netlify Functions pe host hota hai. Isay deploy
karne ke baad Claude (ya koi bhi MCP-compatible client) is URL se connect ho kar
aapke defined tools use kar sakta hai:

```
https://transcendent-pony-ff06a2.netlify.app/mcp
```

## 1. Files ko apne project mein daalein

```
netlify/functions/mcp.mts   <- MCP server logic + tools
netlify.toml                <- routing config
```

Agar aapke existing project mein pehle se `netlify.toml` hai, to us mein sirf
`[[redirects]]` wala block add kar dein (upar wala poora file overwrite na karein).

## 2. Dependencies

Netlify Functions (`.mts` format, Edge-style) ko kisi extra npm package ki zaroorat
nahi — ye built-in `@netlify/functions` types use karta hai. Agar type-checking
error aaye to:

```bash
npm install -D @netlify/functions
```

## 3. Apne tools define karein

`mcp.mts` mein `TOOLS` object ke andar naya entry add karein — har tool ke 3 parts:
- `description` — Claude ko ye batata hai tool kya karta hai
- `inputSchema` — tool ko kya arguments chahiye
- `handler` — actual logic (apni site ka data fetch karna, DB query, external API call, etc.)

## 4. Secrets / API keys — SAFE tareeqa

**Kabhi bhi API key ko code mein hardcode na karein.** Netlify dashboard mein:

`Site settings → Environment variables → Add a variable`

Wahan add karein, masalan:
- `EXTERNAL_API_KEY` = (jo bhi key aap use karna chahte hain)
- `MCP_ACCESS_TOKEN` = (optional — endpoint ko password se protect karne ke liye)

Function ke andar `Deno.env.get("EXTERNAL_API_KEY")` se ye securely access hota hai —
kabhi bhi client/browser ko expose nahi hota.

⚠️ Jo key aapne is chat mein share ki thi, usay ab kahin bhi paste na karein aur
Netlify env var mein hi add karein — code mein kabhi nahi.

## 5. Deploy

```bash
netlify deploy --prod
```

ya GitHub se connected site hai to bas commit + push kar dein.

## 6. Connect karna (Claude / MCP client)

Deploy ke baad endpoint hoga:
```
https://transcendent-pony-ff06a2.netlify.app/mcp
```

Isay Claude.ai ke "Connectors" / custom MCP connector settings mein add karein,
ya kisi bhi MCP client (Claude Desktop config, etc.) mein:

```json
{
  "mcpServers": {
    "zylospire": {
      "url": "https://transcendent-pony-ff06a2.netlify.app/mcp"
    }
  }
}
```

Agar aapne `MCP_ACCESS_TOKEN` set kiya hai to client config mein
`Authorization: Bearer <token>` header bhi bhejna hoga.

## 7. Test karne ke liye (local ya deploy ke baad curl se)

```bash
curl -X POST https://transcendent-pony-ff06a2.netlify.app/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Ye aapke defined tools ki list wapas dega.
