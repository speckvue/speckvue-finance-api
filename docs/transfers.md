# Transfers

A transfer is one owned FinancialTransfer aggregate with mandatory source and destination accounts. The two principal movements are derived from that row, so a half-transfer cannot be created, edited or deleted through the API. A separate fee may be charged to the source, destination or another owned account. Transfer principal is neither income nor spending; the fee is an expense, optionally assigned to an expense category.

## Endpoints

Session ownership is mandatory. Every mutation requires Origin and CSRF. DTOs reject owner fields, supplied exchange rates, movements and other response-only fields.

| Endpoint                                   | Behavior                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| GET /transfers                             | Active postings, newest date then UUID, 50 per page                    |
| GET /transfers?status=deleted              | Retained deleted aggregates                                            |
| GET /transfers?accountId=UUID&after=UUID   | Filter any principal/fee account and continue with the same filters    |
| GET /transfers/:id                         | Current aggregate and all derived signed movements                     |
| GET /transfers/:id/history?before=REVISION | Immutable snapshots, 50 per page; nextRevision continues older history |
| POST /transfers                            | Create the entire transfer using a requestId UUID                      |
| PATCH /transfers/:id                       | Full replacement of the aggregate with the expected revision           |
| DELETE /transfers/:id                      | JSON {revision}; reverses both principals and any fee atomically       |

Create fields: sourceAccountId, destinationAccountId, sentAmount, receivedAmount, date, optional notes (2,000 characters), optional feeAmount (default "0"), feeAccountId and feeCategoryId, plus requestId. Updates use revision instead of requestId. Amounts are exact positive strings limited to 15 whole digits, at most four decimals, and the relevant account currency precision. A zero fee is allowed and must have null/omitted fee references. A positive fee requires its charged account; its category may be null for Uncategorized. Same-currency principal amounts must match. Self-transfers are rejected. There is no API for mutating an individual side or fee.

## Amounts, fees and rates

The principal amounts exclude any fee recorded separately. For example, send USD 100 with a USD 2 source fee: the source decreases by USD 102 and the destination increases by USD 100. For a USD 2 destination fee, the source decreases by USD 100 and the destination increases by USD 98. If a statement shows only a net receipt, add the destination fee back to obtain the principal when also recording that fee. Never record the same fee twice.

Cross-currency transfers retain both actual principal amounts. exchangeRate is destination units per one source unit: receivedAmount / sentAmount, half-up rounded to 30 decimal places using an 80-significant-digit Decimal context. It is stored in DECIMAL(50,30), so supported tiny and large ratios remain nonzero and within range. It is descriptive; balance calculations always use the actual account amounts. No market quote, automatic conversion, FX gain/loss, or combined cross-currency total is invented.

Responses include names, currencies, principal amounts, rate, fee and category, calendar date, notes, revision, timestamps, deletion state, accountsArchived and movements. Each signed movement has accountId, accountName, currency, role and classification. Principal roles outgoing/incoming have classification transfer; the fee role has classification expense. Future income/spending reports must exclude principal and include active transfer fees, alongside manual expenses/refunds. Fees stay attached to the aggregate and cannot be edited separately on the manual transaction endpoint.

## Safety and balances

Every mutation locks the User owner row before other financial work, matching accounts, categories, payees and manual transactions. All involved old/new accounts must be owned and active. All account opening dates must be on or before the transfer date; the date must be no later than today in the user's saved timezone. Archived fee categories can be retained by an existing transfer, but new assignments require an active owned expense category and valid parent.

The shared account-balances query combines manual postings and the source, destination and fee movements. It groups by account without mixing currencies, and ignores deleted movements for amounts while retaining history for opening-field locks. Reads use repeatable snapshots. Every create, edit and reversal verifies all affected old/new account balances against ±999999999999999.9999; failure rolls back the aggregate and audit row. Manual transaction writes use the same query, so they cannot bypass transfer effects when checking limits.

Opening amounts/dates lock after any manual or transfer history, including deleted, moved-out and former fee-account links. TransferRevision snapshots retain old account IDs/names, currency amounts, rates and fees. Runtime grants allow only SELECT/INSERT on audit tables. Restrictive composite ownership/category-kind foreign keys are deferred until commit to permit complete owner-deletion cascades; normal dangling references remain prohibited.

Concurrent stale updates/deletion return 409. Create request keys are unique per owner with normalized payload hashes; identical retries return the same record, changed payloads conflict, and retrying a deleted create never resurrects it. Repeating a successful deletion with its original expected revision does not reverse balances twice. Fixed Winston events log no financial values, names, notes or request hashes.
