# Financial foundation rules

These rules are the contract for later roadmap steps. Manual accounts, categories, payees and the exact-decimal manual transaction ledger are implemented. Exchange rates, transfers, reconciliation, budgets and shared access remain later steps. See [manual transactions](manual-transactions.md) for posting and audit rules.

The [Categories phase](categories.md) now adds income/expense classification, a composite ownership/type key, stable category identities, archive semantics and a transaction-assignment guard. The ledger must use that guard and restrictive composite references when implemented.

The [Payees phase](payees.md) adds private counterparties and retained merge identities. New assignments resolve to an active canonical payee; historical reads may resolve archived identities. Ledger operations must use the exported guards and restrictive owner/payee references, acquiring the User owner lock before other financial row locks.

## Ownership

- Derive the owner exclusively from the verified session. Reject owner fields in request DTOs. Apply the owner predicate to every read and mutation, including pagination, exports, archive/restore, and future attachments.
- Another owner's ID and a nonexistent ID both return 404. Return explicit response fields; never expose ownership or authentication internals.
- `FinancialAccount` has a unique `(userId, id)` key. Future transaction account relations must reference both columns together. Categories, payees, goals, and future related records require the same owner-scoped validation and database relations. Checking that an ID exists without its owner is insufficient.
- Archive keeps the record and its history. Archived accounts are readable and restorable but cannot be edited or accept new ledger activity. Restoration is explicit. No hard-delete endpoint exists.
- Sharing will introduce an explicit membership/permission model in its own step. Owning a personal account grants no access to anyone else's data.

## Money and currency

- Store amounts as PostgreSQL DECIMAL(20,4); use Prisma Decimal for arithmetic and exact decimal strings in JSON. Do not use JavaScript Number for financial arithmetic. Input is limited to 15 whole digits; enforce bounds again on future derived balances.
- Currency is an ISO-style three-letter code in the API's supported registry. `/accounts/options` supplies the actual list and fractional precision. The browser consumes this snapshot, rather than deciding validity from its own ICU version.
- Currency is immutable after account creation. Profile base currency is a display/reporting preference and never modifies account currencies or amounts.
- Amounts owned are positive; amounts owed are negative. All types accept zero, negative and positive balances. Type changes never invert signs. Format each amount with its own currency and the user's locale.
- Keep different currencies separate. Do not sum them or claim a converted total without explicit exchange-rate data, dates, rounding rules and source amounts. Cross-currency transfers must preserve both actual account amounts.

## Opening balances and the ledger

- The opening balance is the owner's starting amount as of the opening date. It is not income, an expense, an investment return, or a transfer.
- There is no independently writable current balance. A posted account balance derives from its opening amount plus its posted signed ledger movements. Pending/cleared/reconciled balances will need separately documented definitions.
- Opening balances and dates are editable only before transaction history exists. Deleted and moved-out history also locks those fields. Account updates and ledger writes serialize on the same owner lock.
- Transfers must have linked atomic ledger movements and must not inflate income/expense reports. Never store only one side of a transfer.
- Future financial writes must update their ledger relationships atomically, enforce account ownership and active status inside that transaction, and define concurrent-edit/idempotency behavior. No transaction is implemented by the account editor.

## Dates and privacy

- Opening dates are calendar dates (PostgreSQL DATE / JSON YYYY-MM-DD), not instants. Today follows the authenticated owner's saved timezone, with UTC fallback. `/accounts/options` returns that date for matching client validation. Refreshing the page refreshes the snapshot; the API remains authoritative across midnight or preference changes.
- Creation, modification and archive times are UTC instants. They are audit metadata, not transaction dates.
- Institution and notes are optional plain text. Never render them as HTML. Do not log financial values, names, notes, credentials, or session tokens. Existing Winston audit events contain only event/account identifiers.
