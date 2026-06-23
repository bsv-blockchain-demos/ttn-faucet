// Prisma 7 requires a driver adapter for SQLite and generates the client
// to a custom output directory (./generated/prisma) rather than @prisma/client.
// The url is no longer read from schema.prisma; it is passed via the adapter.
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../generated/prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL ?? 'file:./prisma/dev.db'
  const adapter = new PrismaBetterSqlite3({ url })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
