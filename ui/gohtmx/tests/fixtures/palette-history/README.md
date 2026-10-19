# Palette historical test inputs

These versioned fixtures remove the tests' dependency on intermediate Git
commits that are absent after a squash merge. They are public repository source,
not browser evidence. The runtime, observers, desired contracts, negative
controls, deadlines, and raw functional assertions are unchanged.

## Provenance and bounded scope

`manifest.json` records the original repository, full commit and tree IDs, source
paths, Git blob IDs, byte lengths, and SHA256 values. The loader pins the complete
manifest SHA256 independently of any report or invocation and rejects altered,
missing, or foreign manifest entries. It verifies every vendored source's byte
length, SHA256, and Git blob ID before exposing any entry. Unknown revisions and
paths fail closed. There is no historical Git or network fallback.

- `0a972e071452f7bdb9bc64f6d27d50c042108885`, tree
  `c400233c889a6701682ded31429a3ce0127bacf0`: 42 distinct production and asset
  paths used by `loadPaletteInputs`. Only fixed digests are needed.
- `ee28495c7cd6581d49d53874e831c6cea40930a4`, tree
  `c2d6ed91c378f59070fde8d626df2748e9fd837c`: 29 loaded asset paths used by
  `loadActivationInputs`. Only fixed digests are needed.
- `ac28651be2869bab709bc617a3f7c50bf68d50f5`, tree
  `a477b667c38849efcc80e5d49e9125ccdc014356`: the original interaction runtime
  for strict guard reversal checks, plus the original activation validator,
  browser driver, and passive observer for unchanged-body comparisons.
- `4ba625b64cd991cf3874639aace590eae70f279d`, tree
  `52e904d3926ff01682913f0b38ee5ef16c29ada1`: the exact pre-policy transport
  validator imported by the optional immutable archived-report regression.

The five source files total 264,037 bytes. They retain their original bytes,
including comments. They are not current runtime code and must not be edited or
executed as browser drivers. The archived transport validator is imported from
its verified bytes, with its original historical source inventory intact.
Fonts, catalogues, and other hash-only inputs are deliberately not duplicated.
Their existing current-source SHA256 comparisons still use the original fixed
baseline digests. Repaired production remains independently pinned to the
reviewed runtime/template/catalogue values and committed current HEAD.

The current palette source inventory binds the loader, regression test, this
README, the manifest, and all five source fixtures. This is repository-owned
source provenance, not a claim of signed upstream authenticity or a new native
browser result. The repository [license](../../../../../LICENSE) applies.

## Reproducing the provenance

In a historical checkout containing the original objects, independently compare
all manifest records using these commands (substitute each recorded value):

```sh
git rev-parse "$commit^{tree}"
git rev-parse "$commit:$path"
git show "$commit:$path" > original-source
wc -c < original-source
sha256sum original-source
git hash-object original-source
```

For the five entries with a `fixture` field, also compare `original-source`
byte-for-byte with that file under this directory. A mismatch is a failure;
never regenerate the pins from the candidate runtime to make a test pass.

Run `node scripts/palette-history-fixtures-test.mjs` from the repository root for
fixed-inventory, tamper, missing-file, and foreign-entry regressions. It copies
only these fixture data to a temporary directory with no Git repository.

For the full current-source proof, use a clean main-like clone lacking the four
intermediate commits, or initialize and commit a source snapshot as a new
single-commit repository with no alternates. Verify each original commit is
absent with `git cat-file -e`, then run `npm test` and the input/replay checks.
The full harness still requires current Git HEAD/tree/clean-source identity and
reads current committed repaired assets. A bare non-Git source archive is not
claimed to work. Browser/native evidence must come from its separate CI runs.
