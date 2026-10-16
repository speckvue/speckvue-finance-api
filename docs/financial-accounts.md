# Financial accounts

Accounts belong to the authenticated user. The API never accepts an owner ID from the browser. Reads, updates, archiving, and restoring always scope queries to the verified session owner. Another user's account returns 404. Mutations require an allowed Origin and session-bound CSRF token.

CSRF token bootstrap requests use `THROTTLE_LIMIT`, allowing normal account-saving activity without consuming the stricter `AUTH_THROTTLE_LIMIT`. Other authentication endpoints retain the strict budget. Both values and the time window come from `.env`.

| Endpoint                      | Behavior                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------- |
| GET /accounts?status=active   | Active accounts; default filter                                                   |
| GET /accounts?status=archived | Archived accounts                                                                 |
| GET /accounts/:id             | One owned account                                                                 |
| GET /accounts/options         | Authoritative currencies, fractional precision, and today in the owner's timezone |
| POST /accounts                | Create an account                                                                 |
| PATCH /accounts/:id           | Replace an active account's editable details                                      |
| POST /accounts/:id/archive    | Archive without deleting; retries preserve the original archive timestamp         |
| POST /accounts/:id/restore    | Restore an archived account                                                       |

Create and update accept `name` (1â€“80 trimmed characters, no control characters), `type` (`bank`, `cash`, `credit_card`, `investment`, `loan`, `other`), `currency` (a currency supported by the API's Node Intl runtime), `openingBalance` (a decimal **string**), and `openingBalanceDate` (a real YYYY-MM-DD date, no later than today in the owner's saved timezone; UTC before onboarding). Optional `institution` (120 characters) and `notes` (1000 characters) trim whitespace; empty or omitted fields become null. Institution is single-line; notes allow line breaks and tabs, but other control characters are rejected. Store provider names, never passwords or bank credentials. Names need not be unique.

The currency is fixed after creation. An update attempting to change it returns 409; create a separate account for a different currency. Changing profile base currency never relabels or revalues an existing account. Account type remains editable while active; opening amount/date lock after any transaction history, including deleted or moved-out entries; changing type never flips an amount's sign. Both positive and negative balances are valid for every type: debt is negative, overdrafts are negative, and overpayments/credits in the owner's favor are positive. Zero is valid. Bank includes checking and savings; investment accounts hold a manual starting value until the investment module exists.

Money stays in PostgreSQL DECIMAL(20,4), Prisma Decimal, and JSON decimal strings. The input allows up to 15 integer digits and at most four fractional digits, further restricted to the currency's precision. Exponent notation, comma separators, and numeric JSON amounts are rejected. Responses use four decimal places; the frontend formats them exactly for the user's locale and each account's currency. No floating-point balance arithmetic or automatic currency conversion is performed.

Lists return `{ items, nextCursor }`, at most 50 items per page, in stable UUID order. Pass `after=nextCursor` with the same status filter to continue. Accounts preserve their balances when archived. Archived accounts cannot be edited until restored. There is no account hard-delete API or bank synchronization. Current balance is the opening amount plus non-deleted manual transaction movements. Responses include currentBalance and hasTransactions. See [manual transactions](manual-transactions.md).

The additive migration creates `FinancialAccount`; the old sample `speckvue_archive.Account` remains inaccessible. Run `npm run db:deploy` to apply migrations and grant the runtime role access to the new table. Docker's migration service applies the same script. Existing user and session data remains in place.

Subsequent additive migrations add optional institution/notes fields and a unique `(userId, id)` ownership key. Future ledger tables must use this composite key for account relations so a transaction cannot reference a different owner's account. Read [financial foundation rules](financial-foundation.md) before adding transactions or derived balances.

Verification includes real PostgreSQL tests for exact decimal round trips, all supported account types, ownership isolation, invalid inputs, CSRF, archival, restoration, and pagination. `npm run test:database` uses disposable PostgreSQL and Redis. The connected browser suite in the sibling web repository covers the account lifecycle and responsive navigation.
