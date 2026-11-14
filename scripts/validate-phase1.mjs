import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Checks planning-artifact consistency only. This is not an OpenAPI conformance
// validator, a runtime state engine, or a substitute for PostgreSQL tests.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'README.md',
  'docs/REPOSITORY_ASSESSMENT.md',
  'docs/ARCHITECTURE.md',
  'docs/DATABASE.md',
  'docs/BUSINESS_RULES.md',
  'docs/STATE_MACHINES.md',
  'docs/ROUTES.md',
  'docs/API.md',
  'docs/IMPLEMENTATION_PLAN.md',
  'docs/TEST_PLAN.md',
  'docs/contracts/critical-commands.openapi.json',
  'docs/contracts/replacement-workflow.json',
];

for (const file of required) {
  assert((await stat(path.join(root, file))).isFile(), `Missing ${file}`);
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (['.git', 'node_modules', '.local', '.next', 'dist', 'test-results', 'playwright-report'].includes(entry.name)) return [];
      return listFiles(full);
    }
    return [full];
  }));
  return nested.flat();
}

const markdown = (await listFiles(root)).filter((file) => file.endsWith('.md'));
let linkCount = 0;
for (const file of markdown) {
  const content = await readFile(file, 'utf8');
  assert(!content.includes('\uFFFD'), `Invalid Unicode in ${file}`);
  // Markdown link targets in these documents use simple paths without spaces.
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1];
    if (/^(?:https?:|mailto:|#)/i.test(target)) continue;
    const relative = decodeURIComponent(target.split('#')[0]);
    const resolved = path.resolve(path.dirname(file), relative);
    const fromRoot = path.relative(root, resolved);
    assert(!fromRoot.startsWith('..') && !path.isAbsolute(fromRoot), `Link escapes workspace: ${target}`);
    assert((await stat(resolved)).isFile(), `Broken link in ${file}: ${target}`);
    linkCount += 1;
  }
}

const parse = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const spec = await parse('docs/contracts/critical-commands.openapi.json');
const workflow = await parse('docs/contracts/replacement-workflow.json');
assert.equal(spec.openapi, '3.1.0');
assert.equal(spec.servers[0].url, '/api/v1');
assert.equal(spec.components.securitySchemes.sessionCookie.name, '__Host-hb_session');
assert.deepEqual(spec.security, [{ sessionCookie: [] }]);

function resolveRef(reference) {
  assert(reference.startsWith('#/'), `External schema reference not supported: ${reference}`);
  const parts = reference.slice(2).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  const value = parts.reduce((node, key) => node?.[key], spec);
  assert(value !== undefined, `Unresolved JSON reference: ${reference}`);
  return value;
}

let refCount = 0;
function visit(value) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.$ref === 'string') {
    resolveRef(value.$ref);
    refCount += 1;
  }
  if (value.type === 'object' && Array.isArray(value.required)) {
    assert.equal(new Set(value.required).size, value.required.length, 'Duplicate required property');
    for (const property of value.required) {
      assert(Object.hasOwn(value.properties ?? {}, property), `Required property absent: ${property}`);
    }
  }
  for (const child of Object.values(value)) visit(child);
}
visit(spec);

const requiredCommands = {
  '/purchases/{id}/receipts': 'receivePurchase',
  '/sales/{id}/confirm': 'confirmSale',
  '/payments': 'recordPayment',
  '/payments/{id}/reverse': 'reversePayment',
  '/replacements/before-sale': 'intakeBeforeSale',
  '/warranty-claims': 'intakeCustomerWarranty',
  '/replacement-dispatches': 'dispatchReplacements',
  '/replacements/{id}/review': 'reviewReplacement',
  '/replacement-receipts': 'receiveReplacements',
  '/replacements/{id}/inspect': 'inspectReplacement',
  '/replacements/{id}/deliver': 'deliverReplacement',
  '/replacements/{id}/reject': 'rejectReplacement',
  '/replacements/{id}/resolve-rejection': 'resolveRejection',
};
assert.deepEqual(Object.keys(spec.paths).sort(), Object.keys(requiredCommands).sort());
const operationIds = new Set();
for (const [route, operationId] of Object.entries(requiredCommands)) {
  const operation = spec.paths[route].post;
  assert.equal(operation.operationId, operationId);
  assert(!operationIds.has(operationId), `Duplicate operation ID: ${operationId}`);
  operationIds.add(operationId);
  assert(operation['x-required-permission'], `Missing permission on ${route}`);
  assert.equal(operation.requestBody.required, true);
  assert(operation.requestBody.content['application/json'].schema.$ref);
  const parameters = operation.parameters.map((parameter) => parameter.$ref ? resolveRef(parameter.$ref) : parameter);
  for (const header of ['Idempotency-Key', 'X-CSRF-Token']) {
    assert(parameters.some((parameter) => parameter.name === header && parameter.in === 'header' && parameter.required), `Missing ${header} on ${route}`);
  }
  const placeholders = [...route.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
  const pathParameters = parameters.filter((parameter) => parameter.in === 'path');
  assert.deepEqual(pathParameters.map((parameter) => parameter.name).sort(), placeholders.sort());
  assert(pathParameters.every((parameter) => parameter.required));
  assert(Object.keys(operation.responses).some((code) => /^2\d\d$/.test(code)));
  for (const code of ['401', '403', '409', '422']) {
    assert(operation.responses[code], `Missing documented ${code} on ${route}`);
  }
}

const businessRules = await readFile(path.join(root, 'docs/BUSINESS_RULES.md'), 'utf8');
for (const rule of workflow.guardRules) {
  assert(businessRules.includes(`**${rule}:**`), `Unknown workflow rule ${rule}`);
}
assert.equal(workflow.status, 'DESIGN_ONLY');
assert.equal(new Set(workflow.states).size, workflow.states.length);
assert(workflow.states.includes(workflow.initialState));
const keys = new Set();
for (const transition of workflow.transitions) {
  assert(workflow.states.includes(transition.from));
  assert(workflow.states.includes(transition.to));
  assert(transition.sources.length > 0);
  assert(!workflow.terminalAdjudicationStates.includes(transition.from), 'Terminal adjudication cannot transition');
  for (const source of transition.sources) {
    assert(workflow.sources.includes(source));
    const key = `${source}:${transition.from}:${transition.event}`;
    assert(!keys.has(key), `Ambiguous workflow transition: ${key}`);
    keys.add(key);
  }
}
for (const source of workflow.sources) {
  const reachable = new Set([workflow.initialState]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const transition of workflow.transitions) {
      if (transition.sources.includes(source) && reachable.has(transition.from) && !reachable.has(transition.to)) {
        reachable.add(transition.to);
        changed = true;
      }
    }
  }
  assert(reachable.has('COMPLETED'), `${source} cannot reach completion`);
  assert(reachable.has('REJECTED'), `${source} cannot reach rejection`);
  assert.equal(reachable.has('READY_FOR_CUSTOMER_DELIVERY'), source === 'CUSTOMER_WARRANTY');
}
for (const event of workflow.nonTransitionEvents) assert(workflow.states.includes(event.state));
assert.equal(workflow.normalSaleEligibility.ownership, 'SHOP');
assert.equal(workflow.customerRelease.ownership, 'CUSTOMER');
assert.equal(workflow.customerRelease.commercialState, 'RESERVED');
assert.equal(workflow.postReceiptSuccessor.commercialState, 'UNAVAILABLE');

const tests = await readFile(path.join(root, 'docs/TEST_PLAN.md'), 'utf8');
for (let number = 1; number <= 15; number += 1) {
  const id = `T${String(number).padStart(2, '0')}`;
  assert(tests.includes(`| ${id} |`), `Missing acceptance scenario ${id}`);
}

console.log(`PASS: ${required.length} deliverables; ${markdown.length} Markdown files; ${linkCount} local links.`);
console.log(`PASS: ${operationIds.size} critical command contracts; ${refCount} local JSON references.`);
console.log(`PASS: ${workflow.transitions.length} replacement edges; source reachability and guard references; 15 planned acceptance scenarios.`);
console.log('Scope: artifact consistency only. No ERP operations, database, browser, or full OpenAPI conformance tests ran.');
