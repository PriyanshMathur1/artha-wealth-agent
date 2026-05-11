import { auth } from '@clerk/nextjs/server';

const hasClerkKeys = Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export async function getUserIdOrDevFallback() {
  if (!hasClerkKeys) {
    if (process.env.NODE_ENV === 'production') {
      console.error('CRITICAL: Clerk keys missing in production environment. Refusing to fallback to local-dev-user.');
      return null;
    }
    return 'local-dev-user';
  }

  try {
    const { userId } = await auth();
    return userId;
  } catch {
    return null;
  }
}
