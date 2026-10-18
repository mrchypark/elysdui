# elysdui app example

Run this standalone `net/http` example from the repository root:

```sh
go run ./examples/gohtmx/form
```

Open <http://127.0.0.1:8092>. To use another loopback address:

```sh
go run ./examples/gohtmx/form -addr 127.0.0.1:8093
```

The form works as a normal `POST /submit` when JavaScript is unavailable. With htmx, it sends the same request and replaces only `#result`. A valid response contains an Ely `TagInput`; the shared `/assets/ely-controls.js` script initializes it on `htmx:after:swap`.

The example has no authentication, database, network, or service integration. Submitted values are only rendered in the response; they are not saved.

Run its tests with:

```sh
go test ./examples/gohtmx/form
```
