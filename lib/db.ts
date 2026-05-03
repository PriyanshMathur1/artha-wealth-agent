import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

// Prisma 7 dropped the `datasourceUrl` constructor option. With a Neon Postgres
// (the project's @prisma/adapter-neon dependency) the supported pattern is to
// pass a driver adapter that owns the connection string.

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const hasDatabase = Boolean(process.env.DATABASE_URL);

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? (
  hasDatabase ? createClient() : (null as unknown as PrismaClient)
);

if (process.env.NODE_ENV !== 'production' && hasDatabase) globalForPrisma.prisma = prisma;
