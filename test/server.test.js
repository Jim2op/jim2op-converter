import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import sharp from 'sharp';
import request from 'supertest';
import { createApp } from '../server.js';

const app = createApp();
const workerFixture = fileURLToPath(new URL('./fixtures/fake_yt_dlp_worker.py', import.meta.url));
const youtubeApp = createApp({ workerPath: workerFixture, cookiesDirectory: '/tmp/does-not-exist' });
const forbiddenWorkerFixture = fileURLToPath(new URL('./fixtures/fake_yt_dlp_403_worker.py', import.meta.url));
const forbiddenYoutubeApp = createApp({ workerPath: forbiddenWorkerFixture, cookiesDirectory: '/tmp/does-not-exist' });
const playlistWorkerFixture = fileURLToPath(new URL('./fixtures/fake_yt_dlp_playlist_worker.py', import.meta.url));
const playlistYoutubeApp = createApp({ workerPath: playlistWorkerFixture, cookiesDirectory: '/tmp/does-not-exist' });
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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

test('the Node bridge exposes yt-dlp worker progress and returns its completed result', async () => {
  const start = await request(youtubeApp)
    .post('/api/youtube/download')
    .type('form')
    .send({ youtube_url: 'https://www.youtube.com/watch?v=test-video', format: 'MP4', quality: '720' });
  assert.equal(start.status, 202);
  assert.ok(start.body.job_id);

  let progress;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    progress = await request(youtubeApp).get(`/api/youtube/progress/${start.body.job_id}`);
    if (progress.body.state === 'completed') break;
    await sleep(20);
  }
  assert.equal(progress.status, 200);
  assert.equal(progress.body.state, 'completed');
  assert.equal(progress.body.progress, 100);

  const result = await request(youtubeApp).get(`/api/youtube/result/${start.body.job_id}`);
  assert.equal(result.status, 200);
  assert.match(result.headers['content-type'], /video\/mp4/);
  assert.match(result.headers['content-disposition'], /test-download\.mp4/);
});

test('the Node bridge returns playlist downloads as ZIP archives', async () => {
  const start = await request(playlistYoutubeApp)
    .post('/api/youtube/download')
    .type('form')
    .send({ youtube_url: 'https://www.youtube.com/playlist?list=test-playlist', format: 'MP3', quality: '192' });
  assert.equal(start.status, 202);

  let progress;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    progress = await request(playlistYoutubeApp).get(`/api/youtube/progress/${start.body.job_id}`);
    if (progress.body.state === 'completed') break;
    await sleep(20);
  }
  assert.equal(progress.body.state, 'completed');

  const result = await request(playlistYoutubeApp).get(`/api/youtube/result/${start.body.job_id}`);
  assert.equal(result.status, 200);
  assert.match(result.headers['content-type'], /application\/zip/);
  assert.match(result.headers['content-disposition'], /test-playlist\.zip/);
});

test('the Node bridge relays yt-dlp 403 cookie recovery guidance to the frontend', async () => {
  const start = await request(forbiddenYoutubeApp)
    .post('/api/youtube/download')
    .type('form')
    .send({ youtube_url: 'https://www.youtube.com/watch?v=test-video', format: 'MP4', quality: '720' });
  assert.equal(start.status, 202);

  let progress;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    progress = await request(forbiddenYoutubeApp).get(`/api/youtube/progress/${start.body.job_id}`);
    if (progress.body.state === 'failed') break;
    await sleep(20);
  }
  assert.equal(progress.status, 200);
  assert.equal(progress.body.state, 'failed');
  assert.match(progress.body.error, /403 Forbidden/);
  assert.match(progress.body.cookiesIssue, /Netscape-format/);
});
