import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';

const maximumBalance = new Prisma.Decimal('999999999999999.9999');
type AccountBalance = {
  id: string;
  balance: Prisma.Decimal;
  hasHistory: boolean;
};

/** Derives account balances from manual postings and linked transfer movements without mixing currencies. */
const readAccountBalances = async (
  tx: Prisma.TransactionClient,
  userId: string,
  accountIds: string[],
) => {
  const ids = [...new Set(accountIds)];
  if (!ids.length) return new Map<string, AccountBalance>();
  const selection = Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));
  const rows = await tx.$queryRaw<AccountBalance[]>(Prisma.sql`
    WITH movements AS (
      SELECT "accountId", CASE WHEN "deletedAt" IS NOT NULL THEN 0 WHEN "kind" = 'expense' THEN -"amount" ELSE "amount" END AS delta
      FROM "ManualTransaction" WHERE "userId" = ${userId}::uuid AND "accountId" IN (${selection})
      UNION ALL
      SELECT "sourceAccountId", CASE WHEN "deletedAt" IS NULL THEN -"sentAmount" ELSE 0 END
      FROM "FinancialTransfer" WHERE "userId" = ${userId}::uuid AND "sourceAccountId" IN (${selection})
      UNION ALL
      SELECT "destinationAccountId", CASE WHEN "deletedAt" IS NULL THEN "receivedAmount" ELSE 0 END
      FROM "FinancialTransfer" WHERE "userId" = ${userId}::uuid AND "destinationAccountId" IN (${selection})
      UNION ALL
      SELECT "feeAccountId", CASE WHEN "deletedAt" IS NULL THEN -"feeAmount" ELSE 0 END
      FROM "FinancialTransfer" WHERE "userId" = ${userId}::uuid AND "feeAmount" > 0 AND "feeAccountId" IN (${selection})
    ), totals AS (SELECT "accountId",SUM(delta) AS delta,COUNT(*) AS entries FROM movements GROUP BY "accountId")
    SELECT a."id", a."openingBalance" + COALESCE(t.delta,0) AS balance,
      (COALESCE(t.entries,0) > 0 OR EXISTS(SELECT 1 FROM "TransactionRevision" r WHERE r."userId" = a."userId" AND r."snapshot"->>'accountId' = a."id"::text)
       OR EXISTS(SELECT 1 FROM "TransferRevision" r WHERE r."userId" = a."userId" AND
        (r."snapshot"->>'sourceAccountId' = a."id"::text OR r."snapshot"->>'destinationAccountId' = a."id"::text OR r."snapshot"->>'feeAccountId' = a."id"::text))) AS "hasHistory"
    FROM "FinancialAccount" a LEFT JOIN totals t ON t."accountId" = a."id"
    WHERE a."userId" = ${userId}::uuid AND a."id" IN (${selection})`);
  return new Map(rows.map((row) => [row.id, row]));
};

/** Runs after each atomic posting change, including reversal, for every affected old/new account. */
const assertAccountBalances = async (
  tx: Prisma.TransactionClient,
  userId: string,
  ids: string[],
) => {
  const balances = await readAccountBalances(tx, userId, ids);
  if (balances.size !== new Set(ids).size)
    throw new NotFoundException('Account not found');
  for (const row of balances.values())
    if (row.balance.abs().gt(maximumBalance))
      throw new ConflictException(
        'The resulting balance exceeds the supported range',
      );
};
export { assertAccountBalances, maximumBalance };
export default readAccountBalances;
