# Financial accounts

Accounts belong to the authenticated user. The API never accepts an owner ID from the browser. Reads, updates, archiving, and restoring always scope queries to the verified session owner. Another user's account returns 404. Mutations require an allowed Origin and session-bound CSRF token.

CSRF token bootstrap requests use `THROTTLE_LIMIT`, allowing normal account-saving activity without consuming the stricter `AUTH_THROTTLE_LIMIT`. Other authentication endpoints retain the strict budget. Both values and the time window come from `.env`.

| Endpoint                      | Behavior                                                                  |
| ----------------------------- | ------------------------------------------------------------------------- |
| GET /accounts?status=active   | Active accounts; default filter                                           |
| GET /accounts?status=archived | Archived accounts                                                         |
| GET /accounts/:id             | One owned account                                                         |
| POST /accounts                | Create an account                                                         |
| PATCH /accounts/:id           | Replace an active account's editable details                              |
| POST /accounts/:id/archive    | Archive without deleting; retries preserve the original archive timestamp |
| POST /accounts/:id/restore    | Restore an archived account                                               |

Create and update accept `name` (1–80 trimmed characters, no control characters), `type` (`bank`, `cash`, `credit_card`, `investment`, `loan`, `other`), `currency` (a currency supported by the Node Intl runtime), `openingBalance` (a decimal **string**), and `openingBalanceDate` (a real YYYY-MM-DD date, no later than the current UTC date). Amounts owed are negative, including credit card and loan liabilities. Names need not be unique.

Money stays in PostgreSQL DECIMAL(20,4), Prisma Decimal, and JSON decimal strings. The input allows up to 15 integer digits and at most four fractional digits, further restricted to the currency's precision. Exponent notation, comma separators, and numeric JSON amounts are rejected. Responses use four decimal places; the frontend formats them exactly for the user's locale and each account's currency. No floating-point balance arithmetic or automatic currency conversion is performed.

Lists return `{ items, nextCursor }`, at most 50 items per page, in stable UUID order. Pass `after=nextCursor` with the same status filter to continue. Accounts preserve their balances when archived. Archived accounts cannot be edited until restored. There is no hard-delete API, bank synchronization, transaction ledger, or current-balance calculation in this phase.

The additive migration creates `FinancialAccount`; the old sample `speckvue_archive.Account` remains inaccessible. Run `npm run db:deploy` to apply migrations and grant the runtime role access to the new table. Docker's migration service applies the same script. Existing user and session data remains in place.

Verification includes real PostgreSQL tests for exact decimal round trips, all supported account types, ownership isolation, invalid inputs, CSRF, archival, restoration, and pagination. `npm run test:database` uses disposable PostgreSQL and Redis. The connected browser suite in the sibling web repository covers the account lifecycle and responsive navigation.
