# Categories

Categories are private to the authenticated owner. Nothing is seeded automatically. Each category is either `income` or `expense`, with an optional top-level parent of the same type. One level of subcategories is supported.

## Endpoints

| Endpoint                     | Behavior                                                      |
| ---------------------------- | ------------------------------------------------------------- |
| GET /categories              | All owned categories, including archived records              |
| GET /categories/:id          | One owned category; missing and foreign IDs return 404        |
| POST /categories             | Create a category                                             |
| PATCH /categories/:id        | Replace editable details of an active category                |
| POST /categories/:id/move    | Move up/down within the active sibling group                  |
| POST /categories/:id/archive | Archive this category and all active children atomically      |
| POST /categories/:id/restore | Restore this category only; its parent must already be active |

Create/update accept `name`, `kind`, `description`, `color`, `icon`, and `parentId`. The name normalizes Unicode with NFKC and trims whitespace, then must contain 1–60 characters without control characters. Description is optional single-line text up to 240 characters; blank/omitted values clear it. `parentId` is a UUID or null/omitted for a root. Colors are slate, lime, blue, purple, orange, rose. Icons are tag, home, food, transport, shopping, income, health, education, travel, gift, leisure, work.

Names are case-insensitively unique within an owner's type/parent group, including archived categories. Names may repeat in a different group or income/expense type. Restore or rename an existing category instead of creating a duplicate. A manually managed SQL expression index enforces sibling-name uniqueness. Keep this index when editing future migrations.

List and mutation responses are `{ items }`, containing the complete owned collection in stable position/ID order. Mutation snapshots are read within their transaction. The client groups roots with their children. The collection is bounded to 500 categories including archives, so no partial/paginated tree is presented. Reordering accepts only `{ direction: 'up' | 'down' }`, swaps adjacent active siblings, and leaves other groups unchanged. Moving beyond a boundary is a no-op. Position is never accepted from the browser.

## Hierarchy and concurrency

Income/expense type is immutable. Active categories may be renamed, restyled, described, promoted to root, or moved under another active root of the same type. A root with any children (including archived children) cannot itself become a child. Self-parenting, cycles, deeper nesting, foreign parents and archived parents are rejected. A composite self-reference enforces owner/type agreement in PostgreSQL; the service enforces depth and active-state rules.

All category mutations lock the owner's User row in a database transaction. This serializes creation, hierarchy, archive/restore and reordering for the same owner, including duplicate-name and archive/child-creation races. It does not lock another owner's categories. Archive retries preserve existing archive timestamps. Root restoration does not implicitly restore children that were deliberately archived earlier. Archived categories are read-only until restored.

## Transaction history contract

There is no delete endpoint, no identity replacement and no income/expense reclassification. Rename, customization, ordering, reparenting and archive retain the category ID. Future transaction records must reference `(userId, categoryId, categoryKind)` against Category's unique `(userId, id, kind)` key, with restrictive deletion behavior. Moving a category changes its current grouping; it must not rewrite stored transaction amounts or IDs.

`CategoriesService.requireAssignable(tx, userId, id, kind)` is exported for the manual-transactions step. Call it **inside the same database transaction** before assigning a category to a new or recategorized transaction. It takes the same owner lock as archives, verifies ownership and matching type, and rejects archived categories or inactive parents. Existing historical references must remain readable after archival; do not run this new-assignment guard simply to display old transactions. Type means income/expense classification, not the amount sign (a refund may retain an expense category). Transfers will not use income/expense categories.

The transaction ledger is not implemented in this step. No transaction counts or simulated usage flags are invented. The composite key, stable identities and tested assignment guard are the foundation for wiring real transaction references when that module is built.

## Security and verification

Owner IDs come from the verified session and are rejected in create/update DTOs. All reads and writes include the owner predicate. Mutations require allowed Origin and session-bound CSRF, use strict DTO validation and the existing Redis throttle, and return safe errors. Financial labels/descriptions are not logged; Winston emits fixed category audit events after commits. Nothing is cached in Redis.

The additive migration creates Category and its constraints; `scripts/migrate.cjs` grants the runtime role access. Existing users, accounts and sessions are preserved. Real PostgreSQL/Redis tests cover ownership, validation, customization, parent rules, reserved names, ordering, cascaded archive/explicit restore, assignment guard, database foreign keys, concurrency races and the 500-category cap.
