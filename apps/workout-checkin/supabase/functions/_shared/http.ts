function corsHeaders(req?: Request) {
  const configured = (Deno.env.get('CORS_ORIGINS') ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);
  if (Deno.env.get('APP_ENV') === 'production' && !configured.length) {
    throw new Error('cors_origins_required');
  }
  const requestOrigin = req?.headers.get('Origin') ?? '';
  const allowedOrigin = configured.includes(requestOrigin) ? requestOrigin : configured[0] ?? '*';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret, x-kakao-skill-secret',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

export function jsonResponse(body: unknown, init: ResponseInit = {}, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req), ...(init.headers ?? {}) },
  });
}

export function textResponse(text: string, init: ResponseInit = {}, req?: Request): Response {
  return new Response(text, { ...init, headers: { ...corsHeaders(req), ...(init.headers ?? {}) } });
}

export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return textResponse('ok', {}, req);
  return null;
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get('Authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}
