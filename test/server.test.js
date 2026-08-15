import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import request from 'supertest';
import { createApp } from '../server.js';

const app = createApp();

test('the JavaScript shell serves all browser routes', async () => {
  for (const path of ['/', '/image', '/video', '/youtube']) {
    const response = await request(app).get(path);
    assert.equal(response.status, 200);
    assert.match(response.text, /id="app"/);
    assert.match(response.text, /\/static\/app\.js/);
  }
});

test('the Node API exposes client-side format choices', async () => {
  const response = await request(app).get('/api/config');
  assert.equal(response.status, 200);
  assert.ok(response.body.image_formats.includes('PNG'));
  assert.ok(response.body.video_outputs.includes('GIF'));
  assert.ok(response.body.youtube_video_qualities.includes('720'));
});

test('the Node API reports a missing upload as JSON', async () => {
  const response = await request(app).post('/api/convert');
  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'No file was uploaded.');
});

test('the Node API converts an uploaded PNG into a JPEG download', async () => {
  const fixture = await sharp({
    create: { width: 4, height: 4, channels: 3, background: { r: 75, g: 156, b: 211 } },
  }).png().toBuffer();
  const response = await request(app)
    .post('/api/convert')
    .field('source', 'image')
    .field('format', 'JPEG')
    .attach('image', fixture, { filename: 'fixture.png', contentType: 'image/png' });

  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /image\/jpeg/);
  assert.match(response.headers['content-disposition'], /fixture\.jpg/);
  assert.ok(response.body.length > 0);
});
