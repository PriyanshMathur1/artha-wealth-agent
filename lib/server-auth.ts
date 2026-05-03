import { auth } from '@clerk/nextjs/server';

const hasClerkKeys = Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export async function getUserIdOrDevFallback() {
  if (!hasClerkKeys) return 'local-dev-user';

  try {
    const { userId } = await auth();
    return userId;
  } catch {
    return null;
  }
}
