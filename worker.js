// Cloudflare Worker: serves the static site and proxies Solana RPC calls.
// The real RPC URL (with its API key) lives in the SOLANA_RPC_URL secret,
// so it never appears in the browser code.

const ALLOWED_METHODS = new Set([
  "getSlot",
  "getAccountInfo",
  "getMultipleAccounts",
  "getProgramAccounts",
  "getTokenAccountBalance",
  "getBalance",
  "getLatestBlockhash",
]);

const JSON_HEADERS = { "content-type": "application/json" };

function rpcError(message, status, id = null) {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id }),
    { status, headers: JSON_HEADERS }
  );
}

async function handleRpc(request, env) {
  if (request.method !== "POST") return rpcError("POST only", 405);
  if (!env.SOLANA_RPC_URL) return rpcError("SOLANA_RPC_URL secret is not set", 500);

  // Only accept calls coming from this site's own pages.
  const origin = request.headers.get("origin");
  const self = new URL(request.url).origin;
  if (origin && origin !== self) return rpcError("Forbidden origin", 403);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return rpcError("Invalid JSON", 400);
  }

  const calls = Array.isArray(payload) ? payload : [payload];
  if (calls.length === 0 || calls.length > 20) return rpcError("Bad batch size", 400);
  for (const call of calls) {
    if (!call || !ALLOWED_METHODS.has(call.method)) {
      return rpcError(`Method not allowed: ${call && call.method}`, 403, call && call.id);
    }
  }

  const upstream = await fetch(env.SOLANA_RPC_URL, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { ...JSON_HEADERS, "cache-control": "no-store" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/rpc") return handleRpc(request, env);
    return env.ASSETS.fetch(request);
  },
};
