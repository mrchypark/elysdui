# v0.1.0 verification

Checked locally on 2026-10-13 with Go 1.27.0, Node 26.7.0 and Chromium.

- `go test ./...`: library, asset routes, rendering/escaping, gallery, exporter and real form example passed.
- `go vet ./...`: passed.
- `npm test`: theme contrast/validation/storage/aliases and expression evaluator passed.
- 39 JavaScript files: `node --check` passed.
- `npm run build:css`: stylesheet rebuilt with Tailwind 4.1.18.
- `/components/audit?aliases=1`: 1,313 chapter-qualified cases passed, zero failed; host API checks passed. Each case uses independent main/twin instances and synthetic caller data.
- Real Go form example: tag entry, native form POST through htmx, HTML-fragment replacement and adding a tag to the replaced control verified in Chromium.
- Gallery navigation: one common five-link header, one current-page marker, checked across all five routes and a component detail route.
- Theme screen: preset editing and both neutral previews verified. Page/header widths fit 320px and 390px viewports. Desktop screenshot: [theme preview](gohtmx/theme-preview.png).
- Original Ely MIT license compared with revision `49ed1f84056fa13347d68801b479a4a5a8e03b53`; notices retained. Unverified copied media replaced with original synthetic fixtures.

The behavior harness checks local interactions and host request contracts. It does not execute real financial, AI, authentication, collaboration or OS services. It is not a full accessibility certification, cross-browser test or pixel-parity certification. Complex chart details remain deferred.
