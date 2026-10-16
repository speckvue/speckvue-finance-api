# Payees

Payees represent people, merchants and organizations. Records are private to the session owner and are never seeded. Names are not unique: two real people can share a name, and duplicate entries can be reviewed and merged explicitly. Optional notes help distinguish them.

## API

| Endpoint                 | Behavior                                                    |
| ------------------------ | ----------------------------------------------------------- |
| GET /payees              | Search and paginate active payees by default                |
| GET /payees/:id          | Read one owned record, including archived or merged sources |
| POST /payees             | Create a payee                                              |
| PATCH /payees/:id        | Rename or edit an active canonical payee                    |
| POST /payees/:id/archive | Archive a canonical payee, preserving its merged names      |
| POST /payees/:id/restore | Restore a canonical archived payee                          |
| POST /payees/:id/merge   | Merge the source into the active owned `targetId`           |

Create/update accept `name` (1–100 characters), `kind` (`person`, `merchant`, `organization`) and optional `notes` (500 characters). Names normalize NFKC Unicode and trim/collapse whitespace. Notes normalize NFKC and trim while retaining line breaks/tabs. Other control characters are rejected. Empty/omitted notes become null. Type is editable metadata, not an income/expense classification. Mutations return one serialized payee; merge returns the survivor. Owner IDs, merge metadata and timestamps are not accepted in editable DTOs.

Query options are `status=active|archived|merged`, optional `kind`, `q` (up to 100 characters), `after` UUID, and `excludeId` UUID for merge-target selection. Search is case-insensitive against the record's name/notes and its merged source names. Percent signs, underscores and backslashes are literal search characters. Kind/status apply to the returned record, so an active survivor is filtered by its own type even when an old merged name matched.

Lists return `{ items, nextCursor }`, at most 50 items per page. They use immutable creation time descending with UUID descending as a tie-breaker. Continue with the same filters and `after=nextCursor`; stale or foreign cursors return 404 and require a reload. Exclusion never widens ownership. Merged records are absent from both Active and Archived; the Merged filter exposes their retained details. `mergedNameCount` counts merged source records, not transactions.

## Merge and archive rules

All writes lock the owner's User row inside a database transaction. Self-merges, foreign sources/targets, archived targets and targets already merged elsewhere are rejected. Both active and archived canonical sources may be merged. The survivor keeps its existing ID, name, type and notes. The source keeps its ID, name, type, notes and creation time, gains merge metadata, and is archived. Its prior archive timestamp is retained when applicable.

If a source already has merged sources, all their pointers move directly to the new survivor in the same transaction. Chains remain one hop; opposing concurrent merges cannot form a cycle. Retrying the same merge into the same active survivor is idempotent. A source already merged elsewhere cannot be redirected through another merge request. Merged sources are permanently read-only through this API and cannot be independently restored. There is no unmerge or delete endpoint. The UI explicitly reviews the survivor and requires acknowledgement before merging.

Archiving a survivor keeps all historical identities. Archive retries preserve the archive timestamp. Restoring the survivor permits new assignments again; retained sources remain merged rather than becoming separate active payees. Neither rename nor merge discards source notes or silently combines them into the survivor's notes.

## Future transactions and ownership

`PayeesService` is exported with two transaction-scoped helpers:

- `requireAssignable(tx, userId, id)` resolves merged IDs to the canonical survivor and rejects an archived survivor. New or reassigned transactions must store the returned canonical ID.
- `resolveForHistory(tx, userId, id)` allows archived survivors when displaying old records. This preserves the original stored reference while enabling reports to group by the canonical payee.

Both helpers take the same owner lock as merge/archive. Future ledger operations must call them within the ledger write/read transaction, acquire the owner lock before other financial row locks, and use restrictive composite `(userId, payeeId)` references to Payee's unique `(userId, id)` key. Do not rewrite transaction amounts, categories or dates as a side effect of merging payees. Do not apply the active-assignment guard to historical display.

There is no transaction ledger in this step. These guards and stable identities are tested foundations for that module; no sample usage or transaction counts are invented.

## Security and verification

Session ownership predicates cover every read and mutation. PostgreSQL enforces same-owner merge references, valid kinds, no self-links and coherent merge/archive metadata. Application locking maintains the canonical-target invariant. Origin/CSRF, strict DTO validation and Redis rate limits remain in effect. Category/account data is untouched. Winston emits fixed audit events without payee labels, notes or search strings. Private payees are not cached.

The additive migration and controlled runtime-role grants preserve existing data. Disposable PostgreSQL/Redis tests cover all types, duplicate names, normalization, literal search, filtering, cursor ownership and tied-timestamp pagination, rename, archive/restore, source/target protections, retained details, idempotency, flattened chains, assignment/history resolution, database ownership constraints and concurrent merge/archive races.
