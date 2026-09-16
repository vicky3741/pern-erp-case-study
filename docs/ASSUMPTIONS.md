# Assumptions and Design Choices

Places the brief leaves open, and the call made — worth reading before a
technical interview about this project.

## Roles

The brief describes exactly two roles, ADMIN and SALES, with a clear split of
who does what. That split is implemented as: **SALES** runs the sales desk
(customers, enquiries, quotations, converting an accepted quotation) and can
*read* everything including stock; **ADMIN** can do everything SALES can, plus
every operation that *moves stock* — confirm (reserve), cancel (release),
dispatch, and adjust inventory directly. This mirrors the brief's own
language ("Admin: Manage inventory, Confirm Sales Orders, Process dispatch").

## Schema — one row per line item, never JSON

The brief explicitly warns against storing the workflow in JSON columns.
Every document (enquiry, quotation, sales order, dispatch) has its own child
table for line items (`enquiry_items`, `quotation_items`,
`sales_order_items`, `dispatch_items`), each with proper foreign keys to
`products` and a `UNIQUE (documentId, productId)` index so the same product
cannot appear twice on one document. See `docs/ER-DIAGRAM.md` for the full
reasoning per table.

## Inventory — two numbers, not three

`inventory` stores `physicalQty` and `reservedQty`. `availableQty` is never
stored — it is always `physicalQty - reservedQty`, computed in one function
(`backend/src/modules/inventory/availability.ts`). This was a deliberate
choice over adding a third column: a stored `availableQty` can drift out of
sync with the other two if any write path forgets to update it; a derived
value cannot drift, because there is nothing to keep in sync.

## Document numbering

Numbers follow `<PREFIX>-<YYYYMM>-<0001>` (e.g. `ENQ-202609-0001`), reset
monthly, allocated from a `document_sequences` table using an atomic
`INSERT ... ON CONFLICT DO UPDATE ... RETURNING` inside the same transaction
that creates the document. This is not in the brief's example API list, but it
is the kind of detail that matters once two people create an enquiry at the
same second — see `backend/src/utils/documentNumber.ts`.

## API shape

The brief's example endpoints are followed closely
(`POST /auth/login`, `POST /enquiries`, `POST /quotations/:id/status`,
`POST /quotations/:id/convert`, `POST /sales-orders/:id/confirm`), with a few
additions the brief invites ("You are free to improve the API design."):

- `PATCH` rather than the brief's `POST` for status changes
  (`/enquiries/:id/status`, `/quotations/:id/status`) — a status change is an
  idempotent-in-intent partial update, which is what `PATCH` is for.
- `POST /sales-orders/:id/dispatch` rather than a bare `POST /dispatches`,
  because a dispatch never exists independently of the order it fulfills, and
  nesting it makes that relationship explicit in the URL.
- A dedicated `/inventory` resource, separate from `/products`, since
  inventory has its own read/adjust operations distinct from the product
  master itself.

Every list endpoint returns the same pagination envelope
(`{ data, meta: { page, limit, total, totalPages, ... } }`), and every error
the same shape (`{ success: false, message, details? }`), so the frontend has
exactly one way to handle each case.

## Money

Every currency figure is `Decimal(12,2)` in Postgres and `Prisma.Decimal` in
application code — never `Float` or JavaScript `number` for anything that gets
summed or compared. `pricing.ts` explains the specific rounding rule (per line,
not once at the end) in its own comment.

## Concurrency

The brief's "Important Backend Challenge" is solved with
`SELECT ... FOR UPDATE` row locks inside the transaction that reserves stock,
ordering the locked rows by `productId` to make a two-product deadlock
between two orders impossible. This is covered at length in the main README
and in `backend/src/modules/inventory/reservation.ts`.

## What a "restricted operation" means, for Mandatory Test 5

The brief asks for a test proving "an unauthorized user cannot perform a
restricted operation." Read here as: any operation the role matrix reserves
for ADMIN, attempted by a SALES token — confirm, cancel, dispatch, inventory
adjustment, product creation — each checked for both the correct status code
**and** that nothing in the database actually changed, since a 403 that still
wrote to the database would be worse than no check at all.

## Testing against a real database, not mocks

The mandatory and bonus tests run against an actual PostgreSQL database
(`TEST_DATABASE_URL`), truncated and rebuilt between files, rather than a
mocked Prisma client. The concurrency tests specifically need real,
overlapping database transactions and real row locks — a mock cannot
reproduce a race condition, only assert that code was called in some order.

## Seed data

Six products span the categories the brief's example alludes to (bearings,
hydraulics, fasteners, power transmission, seals, motors), each with a
realistic opening `physicalQty` and `reservedQty` starting at 0 — a
reservation is something a confirmed sales order creates, so seeding one
without the order that caused it would describe a state the application
itself could never produce.
