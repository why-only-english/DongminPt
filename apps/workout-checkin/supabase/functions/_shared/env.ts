export function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

export function optionalEnv(name: string, fallback = ''): string {
  return Deno.env.get(name) ?? fallback;
}

export const PHOTO_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24;
export const DASHBOARD_SESSION_TTL_DAYS = 90;
