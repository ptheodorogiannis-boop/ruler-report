// Task 6: which demo screen an app link opens.
import assert from 'node:assert/strict';
import test from 'node:test';
import { matchRoute } from '../src/router';
import { routeGroup, routeKey, type Manifest } from '../src/route-key';

const paths = ['/overview', '/projects', '/projects/1?tab=overview', '/projects/1?tab=goals', '/projects/3?tab=reports', '/projects/1/connect', '/projects/1/connect/facebook_ads', '/settings?tab=branding', '/settings?tab=team', '/reports', '/dashboards', '/templates/3'];
const manifest: Manifest = { version: 1, capturedAt: '', langs: ['en', 'el'], chrome: 'overview', routes: paths.map((p) => ({ path: p, key: routeKey(p), group: routeGroup(routeKey(p)) })) };

test('captured screens', () => {
  assert.deepEqual(matchRoute('/overview', manifest), { kind: 'captured', key: 'overview', group: 'overview', path: '/overview', query: '' });
  const goals = matchRoute('/projects/1?tab=goals', manifest);
  assert.equal(goals.kind === 'captured' && goals.key, 'projects-1-goals');
  assert.equal(goals.kind === 'captured' && goals.group, 'projects-1');
  const plain = matchRoute('/projects/1', manifest);
  assert.equal(plain.kind === 'captured' && plain.key, 'projects-1-overview', 'a project without ?tab opens its overview tab');
  assert.equal((matchRoute('/settings', manifest) as any).key, 'settings-branding');
  assert.equal((matchRoute('/templates/3', manifest) as any).group, 'templates');
});

test('connect forms of other projects reuse the captured form', () => {
  const r = matchRoute('/projects/4/connect/facebook_ads', manifest);
  assert.equal(r.kind === 'captured' && r.key, 'projects-1-connect-facebook_ads');
});

test('live views', () => {
  assert.deepEqual(matchRoute('/reports/1', manifest), { kind: 'live', view: 'report', id: 1, query: '' });
  assert.deepEqual(matchRoute('/dashboards/2', manifest), { kind: 'live', view: 'dashboard', id: 2, query: '' });
  assert.deepEqual(matchRoute('/reports/new?kind=dashboard&project=1', manifest), { kind: 'live', view: 'new', query: 'kind=dashboard&project=1' });
  assert.deepEqual(matchRoute('/r/AbC123', manifest), { kind: 'live', view: 'public-report', token: 'AbC123', query: '' });
  assert.deepEqual(matchRoute('/d/tok?preset=last_7d&lang=el', manifest), { kind: 'live', view: 'public-dashboard', token: 'tok', query: 'preset=last_7d&lang=el' });
  assert.deepEqual(matchRoute('/login', manifest), { kind: 'live', view: 'login', query: '' });
  assert.deepEqual(matchRoute('/', manifest), { kind: 'live', view: 'login', query: '' });
});

test('anything else is missing, never an error', () => {
  assert.deepEqual(matchRoute('/nope', manifest), { kind: 'missing', path: '/nope' });
  assert.deepEqual(matchRoute('/reports/1/studio', manifest), { kind: 'missing', path: '/reports/1/studio' });
  assert.deepEqual(matchRoute('/projects/99?tab=goals', manifest), { kind: 'missing', path: '/projects/99' });
});
