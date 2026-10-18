# SDUI implementation and verification matrix

This matrix covers the supplied server-driven UI design and the expanded request
for the widest feasible component support. The public contract is
[sdui.md](sdui.md); grammar details are in [sdui-composition.md](sdui-composition.md).

## Verification gates

The core gate passed before catalogue/composition expansion: PR #5 commit
`cc9cbae920d3c078866b672f835637a9f0ba174b`, including both hosted test and Chromium
jobs in [run 38599012302](https://github.com/mrchypark/elysdui/actions/runs/38599012302).

Expanded verification passed at commit
`ed90987a16415920524481eb59278595e1f27ad1`: both the general test job and actual
Chromium job completed successfully in
[run 38614498267](https://github.com/mrchypark/elysdui/actions/runs/38614498267).
This includes all 1,361 contract mount representatives and the real Go action/
activation regressions. Later commits must pass their own PR checks; the table
below states covered cases rather than promising every possible behavior.

## Catalogue coverage: distinct measurements

| Measure | Coverage | Evidence |
| --- | --- | --- |
| Primary catalogue stories | 624 across 44 chapters and 7 families | Existing components.json reconciled by generator |
| Qualified primary/alias names | 1,313 | Per-name contract, not 1,313 independent implementations |
| Public basic templates | 48 | Explicit public allowlist; helper templates excluded |
| Generated configurable contracts | 1,361, plus the ten built-in definitions | adapters/gohtmx/catalogue_manifest.json.gz |
| Caller-data render fixtures | 2,159 | Strict JSON decode, compile, render and escaping checks |
| Meaningful caller-data customization | Every generated contract | Per-name mutation probe, excluding wrapper-only Disabled changes |
| Source fixture accounting | 639 catalogue fixtures +742 preview fixtures | Generator tests and manifest metadata |
| Browser mount smoke | One caller-data representative per 1,361 contracts | adapters/gohtmx/tests/browser/sdui-catalogue-browser-test.mjs; hosted run 38614498267 passed |
| Browser behavior | Explicit representative interactions below | Does not imply every property permutation or provider operation |

Contracts contain recursive meaningful properties derived from actual renderer
sinks and caller fixtures. They do not inject gallery data at runtime. The
machine-readable `excluded` entries explain unsupported escape hatches for each
contract; `ely catalog` and the generator's `-describe` option expose the data.
External-provider functionality, device permissions, file-system integrations,
and authenticated services remain host-owned. Browser smoke intercepts external
fixture resources locally and does not claim those integrations work.

## Requirement and test matrix

| Requirement | Implementation | Verification |
| --- | --- | --- |
| Server Screen/Node separate from component catalogue | Immutable compiled Plan and opt-in Registry | schema/registry/render tests |
| Basic ExecuteTemplate + advanced RenderComponent | Explicit per-template/component contracts | All generated fixtures and mutation probes |
| Versioned strict JSON | Version1, unknown/duplicate/trailing fields rejected | schema tests + fuzz corpus |
| Bounded recursive props | Closed objects, arrays, discriminated unions, enums/defaults, numeric bounds, nullability | values tests + malicious nested inputs + race |
| Binding grammar | RFC6901 pointers, scoped params/items, legacy dotted paths | composition tests, escaped keys, arrays, missing/wrong values |
| Local reuse | Typed templates/use/params/paramBindings, deterministic ID namespaces | cycles, parameter/target injection, expansion budgets |
| Conditions | eq/ne/exists/all/any/not, no expression evaluator | typed equality, absence/null, invalid AST |
| Repetition | Stable unique item keys, bounded expansion, lexical scope | duplicate/missing keys, reorder identity, limits |
| Named slots | Host-declared targets, allowed node types/cardinality, compiled children only | valid HTML structure, nested form and unsupported slot rejection |
| Loaders/actions | Host registry, request-aware auth and parsed values/files | unknown capability/target, per-resource auth and cross-principal tests |
| Multiple events | events list, sourceAction selector, explicitly typed detail payload | ambiguity, reserved fields, wrong detail, unknown-selector ancestor rejection |
| Native form transport | FormData, repeated fields, files and submitter retained | unit + actual Go/Chromium upload and repeated values |
| Action input validation | Explicit host Authorize/Run validation; client payload type checks are convenience only | example validates multiplicity, file size, values; forged browser data never trusted |
| HTML region contract | OuterHTML same stable region ID, buffered rendering | invalid markup, duplicate/conflicting IDs, partial failure tests |
| Initial and future branch assets | Static dependency union across reusable/conditional/repeated/slotted trees, CSS closure, explicit map dependency | render tests, existing family browser suite, hidden-then-mounted Lottie |
| Lifecycle/remount/cleanup | Document-delegated transport, HTMX swap notification, Ely cleanup | repeated swaps, detached handler checks, all-contract mount smoke |
| CSS/resource security | Narrow semantic color/font/token/URL policies, no arbitrary Attrs/Class/hx or renderer selectors | negative property tests, local-default URL enforcement |
| Specialized content | Static sandbox HTML, audited Goldmark destinations, resource-free vector Lottie, closed Devtools inert metadata | malicious HTML/Markdown/CSS/URLs/animation tests |
| Auth/CSRF | Mandatory host callbacks, constant-time token comparison | missing/invalid auth and CSRF, request-aware authorization before replay |
| Duplicate mutation | Bounded principal/action/target replay cache and canonical request fingerprint | concurrent/repeated requests, files, conflicts, TTL/capacity, panic/failure |
| Stale DOM prevention | Abort + latest-request + connected-target identity guards | deliberately late old response cannot replace newer DOM |
| Browser transient state | Focus restoration, native successful controls, untouched outside-target drafts | focus, named-control clobbering, Back/Forward, pagehide teardown |
| Validated activation | Compile + host capability resolution before atomic CAS | invalid candidate keeps old plan, concurrent publishers, immutable snapshots |
| Draft/preview | Decode/Compile/Render without Activate; CLI validate/schema | syntax + semantics remain separate from publishing |
| Revision/rollback | Store History, 16 retained revisions, rollback creates new revision | unknown/evicted revision, CAS, pinned in-flight request, replay continuity |
| External configuration | Bounded local file load/watch, validated atomic replacement | malformed/invalid update retained, valid update activated, cancellation |
| Stale page after activation | Revision carried in POST;409 before mutation, sdui:stale notification | draft retained, explicit reload, newly active screen works |
| No user-bound schema cache | Plans/history contain definitions only; data loaded per request | cross-user handler and activation tests |
| Tooling | Registry-derived Draft2020-12 editor schema, validate/schema/catalog CLI | deterministic export, local refs, valid/invalid samples, core command tests |

## Deliberate integration limits

- The library does not execute schema-supplied code, SQL, arbitrary HTML, arbitrary
  URLs, CSS, or remote template references. It never fetches schema URLs.
- Host authentication, durable data storage, distributed business idempotency,
  provider credentials, and administrative publishing permissions are integration
  responsibilities. Process-local replay and revision history are not durable
  deployment storage, and rollback never reverses completed business mutations.
- Templates are immutable trusted host code. A malicious custom renderer is
  outside the JSON safety boundary. Host URL policies must be narrow allowlists.
- A region cannot be conditional or repeated: targets must exist with stable
  identity. Arbitrary HTML nesting is not accepted; use structural containers
  and declared slots. Not every component's text field is a composition slot.
- Assets for all potential branches are preloaded, rather than fetching arbitrary
  new scripts from action responses. A changed schema revision requires an
  explicit page reload before mutation, which also loads its new dependency set.
- Business state is server-owned. The adapter restores focus, but does not merge
  arbitrary dirty values into server replacements or preserve every widget's
  ephemeral open/scroll/selection state. Such behavior needs explicit host policy.
- Payload mappings do not replace server-side validation. A caller can forge HTTP
  requests; every action must validate its actual resource and submitted values.
- JSON Schema assists editing and structural checks. Compile and host runtime
  validation remain authoritative for IDs, references, budgets, capabilities,
  semantic resource formats and data-dependent expansion.
