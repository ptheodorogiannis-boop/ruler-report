import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../src/lib/db';
import { api, makeCompany } from './helpers';

test('timeline events: an image (upload or https) is stored, validated, serialised and clearable', async () => {
  const { token, project } = await makeCompany();
  const c = await api(token, 'POST', '/timeline-events', { project_id: project.id, title: 'New creative', date: '2026-09-15', image: '/api/media/abc123' });
  assert.equal(c.status, 201, JSON.stringify(c.json));
  assert.equal(c.json.data.image, '/api/media/abc123');
  const id = c.json.data.id;
  assert.equal((await api(token, 'GET', `/timeline-events/${id}`)).json.data.image, '/api/media/abc123');
  assert.equal((await db.timelineEvent.findUniqueOrThrow({ where: { id } })).image, '/api/media/abc123', 'column exists in the database');
  assert.equal((await api(token, 'POST', '/timeline-events', { project_id: project.id, title: 'Bad', image: 'http://insecure/x.png' })).status, 422, 'plain http is rejected');
  assert.equal((await api(token, 'POST', '/timeline-events', { project_id: project.id, title: 'Bad', image: 'javascript:alert(1)' })).status, 422);
  const u = await api(token, 'PUT', `/timeline-events/${id}`, { image: 'https://cdn.example.com/launch.png' });
  assert.equal(u.json.data.image, 'https://cdn.example.com/launch.png');
  assert.equal((await api(token, 'PUT', `/timeline-events/${id}`, { image: null })).json.data.image, null, 'null clears the image');
  const plain = await api(token, 'POST', '/timeline-events', { project_id: project.id, title: 'No picture' });
  assert.equal(plain.json.data.image, null, 'events without an image serialise image as null');
});
