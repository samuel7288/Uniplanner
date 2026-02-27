import { prisma } from "../lib/prisma";

export type PushSubscriptionInput = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type PushSubscriptionRecord = {
  id: number;
  userId: string;
  endpoint: string;
  p256dhKey: string;
  authKey: string;
  createdAt: Date;
};

let pushSubscriptionsInfraReady = false;

export async function ensurePushSubscriptionsInfrastructure(): Promise<void> {
  if (pushSubscriptionsInfraReady) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PushSubscription" (
      "id" SERIAL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "endpoint" TEXT NOT NULL UNIQUE,
      "p256dhKey" TEXT NOT NULL,
      "authKey" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PushSubscription_userId_fkey"
        FOREIGN KEY ("userId")
        REFERENCES "User"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "PushSubscription" ADD COLUMN IF NOT EXISTS "endpoint" TEXT NOT NULL DEFAULT ''`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "PushSubscription" ADD COLUMN IF NOT EXISTS "p256dhKey" TEXT NOT NULL DEFAULT ''`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "PushSubscription" ADD COLUMN IF NOT EXISTS "authKey" TEXT NOT NULL DEFAULT ''`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "PushSubscription" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription"("userId")`,
  );

  pushSubscriptionsInfraReady = true;
}

export async function upsertPushSubscription(
  userId: string,
  subscription: PushSubscriptionInput,
): Promise<void> {
  await ensurePushSubscriptionsInfrastructure();

  await prisma.$executeRaw`
    INSERT INTO "PushSubscription" ("userId", "endpoint", "p256dhKey", "authKey", "createdAt")
    VALUES (${userId}, ${subscription.endpoint}, ${subscription.keys.p256dh}, ${subscription.keys.auth}, NOW())
    ON CONFLICT ("endpoint")
    DO UPDATE SET
      "userId" = EXCLUDED."userId",
      "p256dhKey" = EXCLUDED."p256dhKey",
      "authKey" = EXCLUDED."authKey"
  `;
}

export async function listPushSubscriptionsForUser(userId: string): Promise<PushSubscriptionRecord[]> {
  await ensurePushSubscriptionsInfrastructure();

  return prisma.$queryRaw<PushSubscriptionRecord[]>`
    SELECT
      "id",
      "userId",
      "endpoint",
      "p256dhKey",
      "authKey",
      "createdAt"
    FROM "PushSubscription"
    WHERE "userId" = ${userId}
    ORDER BY "createdAt" DESC
  `;
}

export async function removePushSubscriptionByEndpoint(userId: string, endpoint: string): Promise<void> {
  await ensurePushSubscriptionsInfrastructure();
  await prisma.$executeRaw`
    DELETE FROM "PushSubscription"
    WHERE "userId" = ${userId}
      AND "endpoint" = ${endpoint}
  `;
}

export async function removeAllPushSubscriptionsForUser(userId: string): Promise<void> {
  await ensurePushSubscriptionsInfrastructure();
  await prisma.$executeRaw`
    DELETE FROM "PushSubscription"
    WHERE "userId" = ${userId}
  `;
}

