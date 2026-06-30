import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log:
    process.env.PRISMA_LOG_QUERIES === 'true'
      ? ['query', 'error', 'warn']
      : process.env.NODE_ENV === 'development'
        ? ['error', 'warn']
        : ['error'],
});

export default prisma;

