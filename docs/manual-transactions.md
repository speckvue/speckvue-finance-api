# Manual transactions

Manual postings support income, expenses and refunds. A positive exact amount is required. Income and refunds add to the account balance; expenses subtract. Refunds use expense categories so future spending reports can subtract refunds from spending. An opening balance is never income. [Linked transfers](transfers.md) use their own aggregate and remain separate from manual income/expense entries. Pending/cleared statuses, reconciliation and advanced search belong to later roadmap steps.

## Contract

All endpoints require the verified owner session. Mutations additionally require Origin and CSRF. Unknown fields, including owner and writable balance fields, are rejected.

| Endpoint                                      | Behavior                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| GET /transactions                             | Posted entries, newest calendar date then UUID first; 50 per page            |
| GET /transactions?status=deleted              | Retained deleted entries                                                     |
| GET /transactions?accountId=UUID&after=UUID   | Optional owned account filter and keyset continuation using the same filters |
| GET /transactions/:id                         | Current entry, including deleted records                                     |
| GET /transactions/:id/history?before=REVISION | Immutable snapshots, newest first, 50 per page; returns nextRevision         |
| POST /transactions                            | Create with requestId UUID; retries cannot post a second movement            |
| PATCH /transactions/:id                       | Full replacement with the expected revision                                  |
| DELETE /transactions/:id                      | JSON body {revision}; soft deletion reverses the balance effect              |

Create fields: accountId, optional/null payeeId, kind (income, expense, refund), positive amount string, date (YYYY-MM-DD), optional notes up to 2,000 characters, splits (1–20 categoryId/amount lines), and requestId. Each categoryId may be null for Uncategorized. Split amounts are positive, use the account currency precision, and must sum exactly to the total. Combine repeated categories, including repeated Uncategorized lines. Amounts allow 15 whole digits and at most four decimal places, further restricted by currency precision.

Update uses the same posting fields with revision instead of requestId. The response includes account/currency names, resolved payee name, category labels, exact four-place amounts, revision, timestamps and deletion state. List responses return items and nextCursor. Calendar dates must fall between the account opening date and today in the owner's saved timezone. Audit timestamps are UTC instants.

## Balance and concurrency rules

Balances are derived from opening balance plus all non-deleted signed postings. There is no writable balance column. Reject a create, edit, move or delete if its resulting account balance exceeds ±999999999999999.9999; every database change rolls back together. Never aggregate different currencies. An edit may move an entry between accounts of the same currency, reversing the old account and posting the new one atomically. Cross-currency moves are rejected.

Every financial mutation locks the User owner row before other financial locks. Account editing and archival use this same lock as category/payee mutations and ledger writes. Concurrent stale edits return 409. A repeated successful deletion with the previous revision returns the deleted record without applying another reversal. Create keys are unique per owner; the normalized original request hash must match on retry. Reuse with a different payload returns 409. The key survives edits and deletion and cannot resurrect a deleted posting.

Opening balance and opening date lock once the account has any revision history, including deleted or moved-out activity. Name/type/institution/notes remain editable on active accounts. Balance corrections use explicit postings; a dedicated adjustment workflow is a later feature. Archived accounts remain readable; restore before creating, changing or deleting their entries.

New assignments require owned active accounts, matching active categories (income for income; expense for expense/refund), and active canonical payees. Edits can retain an existing archived category/payee without erasing history. Newly chosen references must be assignable. A merged payee resolves to its survivor for current display and new assignments; immutable prior snapshots retain their original labels.

## Storage and privacy

ManualTransaction, TransactionSplit and TransactionRevision use restrictive composite owner foreign keys. Reference checks are deferred until commit so deleting an owner can finish all related cascades. Audit snapshots are append-only for the runtime role: SELECT/INSERT only. Owner deletion can cascade the private records. Revisions retain the financial values and labels visible at each create/edit/delete. History pages use revision cursors and do not impose an arbitrary edit-count cap.

Run the controlled migration script to apply schema, constraints, history lookup index and runtime grants. Financial values, names, notes, request hashes and snapshots never enter logs. Logs contain fixed transaction events and ordinary safe request metadata.
