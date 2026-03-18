// apps/server/prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
