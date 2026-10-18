# elysdui UI examples

Run the standalone gallery from the repository root:

```sh
go run ./examples/gohtmx/gallery
```

Open <http://127.0.0.1:8091/components>. The server has no login, database, PocketBase, research, or external-service dependency.

Use `-addr` only with a loopback address:

```sh
go run ./examples/gohtmx/gallery -addr 127.0.0.1:8092
```

The gallery serves native Go templates, htmx fragments, shared UI assets, local fixtures, and the retained Ely attribution and licence files.

The shared implementations and assets live in the root `ui` package. This package owns the gallery shell and example responses. Open `/components/usage` to check independent component instances, submitted values, keyboard navigation, and caller-supplied data. See [the shared UI guide](../../../README.md) for template properties and implementation boundaries.
