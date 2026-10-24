import assert from 'node:assert/strict';

// Test-fixture routing only. No browser imports, actions, fallback props or catalogue mutation.
export const basicFixturePackage = './adapters/gohtmx/tests/fixtures/basic-audit';
export const basicFixtureRoute = '/basic-audit/';
export const basicRootSelector = '[data-audit-main] > [data-basic-component]';
export const basicSourcePrefixes = ['adapters/gohtmx/tests/fixtures/basic-audit/', 'internal/sduicatalogue/'];
export function baselineFixture(value = 'advanced') {
  assert(['advanced', 'basic'].includes(value), 'fixture must be advanced or basic');
  return value;
}
export function validateBasicMatrix(matrix, manifest, revision) {
  assert.equal(matrix.fixture, 'basic', 'explicit basic matrix required');
  assert.equal(matrix.source?.revision, revision, 'basic matrix source revision');
  assert.equal(manifest.basicNames?.length, 48, 'exact basic source inventory');
  assert.equal(new Set(manifest.basicNames).size, 48, 'unique basic names');
  assert.equal(manifest.cases?.length, 48, 'exact basic manifest cases');
  assert.equal(matrix.auditCases?.length, 48, 'exact basic matrix cases');
  const expected = manifest.basicNames.map(name => `basic:${name}`).sort();
  assert.deepEqual(matrix.auditCases.map(item => item.caseId).sort(), expected, 'basic matrix exact case set');
  const profiles = ['live', 'static'].flatMap(mode => ['desktop', 'mobile'].flatMap(size => ['light', 'dark'].map(theme => `${mode}-${size}-${theme}`)));
  for (const [index, name] of manifest.basicNames.entries()) {
    const fixture = manifest.cases[index], item = matrix.auditCases.find(item => item.caseId === `basic:${name}`);
    assert.match(name, /^[a-z][a-z0-9-]*$/, 'basic template name');
    assert.equal(fixture.name, `basic/${name}`);
    assert.equal(fixture.template, name);
    assert.match(fixture.propsSHA256, /^[a-f0-9]{64}$/, 'actual canonical fixture props hash');
    assert.equal(item.componentIdentity, fixture.name);
    assert.equal(item.fixtureIdentity, `basic-fixture:${fixture.name}`);
    assert.equal(item.template, fixture.template);
    assert.equal(item.fixturePropsSHA256, fixture.propsSHA256, 'matrix matches compiled canonical props');
    assert.equal(item.family, 'basic');
    assert.deepEqual(item.aliasMapping, {requestedName: fixture.name, relation: 'canonical-basic-template'});
    assert.equal(item.sourceSHA, revision);
    assert.deepEqual(item.surface, ['live-basic', 'static-basic']);
    assert.deepEqual(item.profileIds, profiles);
  }
  return true;
}
