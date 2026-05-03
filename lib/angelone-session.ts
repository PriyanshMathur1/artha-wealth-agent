import { hasDatabase, prisma } from './db';

const API_BASE = process.env.ANGEL_ONE_API_BASE ?? '';
const API_KEY  = process.env.NEXT_PUBLIC_ANGEL_ONE_CLIENT_ID ?? '';

function decodeJwtExp(jwt: string): number | null {
  try {
    const payload = jwt.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof decoded.exp === 'number' ? decoded.exp : null;
  } catch {
    return null;
  }
}

function isExpired(jwt: string): boolean {
  const exp = decodeJwtExp(jwt);
  if (!exp) return true;
  // Treat as expired if less than 5 minutes remaining
  return Date.now() / 1000 > exp - 300;
}

async function refreshWithToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${API_BASE}/rest/secure/angelbroking/jwt/v1/generateTokens`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${refreshToken}`,
          'X-UserType': 'USER',
          'X-SourceID': 'WEB',
          'X-PrivateKey': API_KEY,
          'X-MACaddress': '00:00:00:00:00:00',
          'X-ClientLocalIP': '127.0.0.1',
          'X-ClientPublicIP': '0.0.0.0',
        },
        body: JSON.stringify({ refreshToken }),
      }
    );
    const data = await res.json() as { status: boolean; data?: { jwtToken: string; refreshToken: string } };
    if (!data.status || !data.data?.jwtToken) return null;

    // Persist the new tokens
    if (hasDatabase) {
      await Promise.all([
        prisma.settings.upsert({
          where: { key: 'angel_one_jwt' },
          update: { value: data.data.jwtToken },
          create: { key: 'angel_one_jwt', value: data.data.jwtToken },
        }),
        prisma.settings.upsert({
          where: { key: 'angel_one_refresh_token' },
          update: { value: data.data.refreshToken },
          create: { key: 'angel_one_refresh_token', value: data.data.refreshToken },
        }),
      ]);
    }

    return data.data.jwtToken;
  } catch {
    return null;
  }
}

// Returns a valid Angel One JWT — auto-refreshes if expired.
// Falls back to the env var token (API-key level, for market data only).
export async function getValidToken(): Promise<string> {
  if (!hasDatabase) {
    return process.env.ANGEL_ONE_API_TOKEN ?? '';
  }

  const [jwtRecord, refreshRecord] = await Promise.all([
    prisma.settings.findUnique({ where: { key: 'angel_one_jwt' } }),
    prisma.settings.findUnique({ where: { key: 'angel_one_refresh_token' } }),
  ]);

  const jwt = jwtRecord?.value ?? '';
  const refreshToken = refreshRecord?.value ?? '';

  // If we have a valid non-expired JWT, use it directly
  if (jwt && !isExpired(jwt)) return jwt;

  // JWT is expired or missing — try to auto-refresh
  if (refreshToken) {
    const newJwt = await refreshWithToken(refreshToken);
    if (newJwt) return newJwt;
  }

  // Last resort: use the env var API-key token (market data only, not portfolio/history)
  return process.env.ANGEL_ONE_API_TOKEN ?? '';
}
