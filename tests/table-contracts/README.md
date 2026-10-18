# Paged DataTable functional contracts

This bounded suite exercises the registered `tables/DataTable` with `Paged=true`,
through `RenderComponent` and shared browser assets, without gallery wrappers.
Upstream contract reference: elysium revision `da3fdca`,
`src/tables/table.rs` (header sorting rising, falling, off; query/filter then
paging; selection), `src/tables/simple.rs` (plain `Table` is intentionally static).

Covered: numeric three-state sort and native button keyboard activation; physical
`FilterColumn` indexing (2 for the status after the selector and name cells),
search/filter intersection, visible-page selection and mixed checkbox state,
column visibility preserving the selector, page boundaries, empty matches,
disabled activation, independent instances, and two real HTMX replacements.
The Node test executes the complete production family initializer with a small
DOM adapter; it does not establish browser behavior. The browser suite uses the
Go-rendered fixture, production modules, and real HTMX requests.

Run `node table_contracts_test.mjs`, `go test . -run TestTableContracts`, and
`node scripts/table-contracts-browser-test.mjs`. The dedicated CI workflow also
runs `TABLE_NEGATIVE_CONTROL=sort-index` and
`TABLE_NEGATIVE_CONTROL=mixed-selection`, and `TABLE_NEGATIVE_CONTROL=restore-order`; only the named assertion failure kills
each mutant. Browser startup/infrastructure failures never count as kills.
Browser JSON evidence includes the exact checkout revision.

## Explicit boundaries

This is not full table-family parity. Non-paged DataTable, Shift multi-sort,
column resizing/reordering, grouping, editable grids, and source-driven virtual
windowing need separate functional units. `VirtualTable` with `TableSource=true`
currently renders only supplied rows with a total label, without a scrolling
window controller or a row-fetch contract. The Go rendering test checks that
plain and virtual source tables keep escaped cells and semantic headers; it does
not claim that virtual scrolling works. No asynchronous data request or server
error surface is promised by this client-only paged table.
