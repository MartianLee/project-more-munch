// apps/server/prisma/seed.ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const apiKey = process.env.SEED_API_KEY;
  if (!apiKey) {
    throw new Error('SEED_API_KEY environment variable is required');
  }

  const user = await prisma.user.upsert({
    where: { apiKey },
    update: {},
    create: {
      nickname: 'admin',
      apiKey,
    },
  });

  console.log(`User created/found: ${user.nickname} (id: ${user.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
