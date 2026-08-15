import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIRECTORY = path.join(__dirname, 'static');
const UPLOAD_DIRECTORY = path.join(os.tmpdir(), 'jim2op-converter-uploads');
const WORK_DIRECTORY = path.join(os.tmpdir(), 'jim2op-converter-jobs');
const DEFAULT_PYTHON_EXECUTABLE = process.env.PYTHON_EXECUTABLE || (process.platform === 'win32' ? 'python' : 'python3');
const DEFAULT_YTDLP_WORKER = path.join(__dirname, 'python', 'yt_dlp_worker.py');
const DEFAULT_SPOTIFY_WORKER = path.join(__dirname, 'python', 'spotify_worker.py');
const DEFAULT_COOKIES_DIRECTORY = process.env.YTDLP_COOKIES_DIRECTORY || path.join(__dirname, 'cookies');
const IMAGE_FORMATS = ['PNG', 'JPEG', 'WEBP', 'BMP', 'TIFF', 'GIF', 'AVIF'];
const AUDIO_FORMATS = new Set(['MP3', 'WAV', 'OGG', 'M4A']);
const VIDEO_FORMATS = new Set(['GIF', ...AUDIO_FORMATS]);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.tiff', '.webp', '.avif']);
const MIME_TYPES = {
  PNG: 'image/png', JPEG: 'image/jpeg', WEBP: 'image/webp', BMP: 'image/bmp',
  TIFF: 'image/tiff', GIF: 'image/gif', AVIF: 'image/avif',
  MP3: 'audio/mpeg', WAV: 'audio/wav', OGG: 'audio/ogg', M4A: 'audio/mp4', MP4: 'video/mp4',
};

const youtubeJobs = new Map();
const spotifyJobs = new Map();

await Promise.all([
  fs.mkdir(UPLOAD_DIRECTORY, { recursive: true }),
  fs.mkdir(WORK_DIRECTORY, { recursive: true }),
]);

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => callback(null, UPLOAD_DIRECTORY),
  filename: (_request, file, callback) => callback(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 800 * 1024 * 1024, files: 10 },
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const extensionFor = (format) => format.toLowerCase() === 'jpeg' ? 'jpg' : format.toLowerCase();
const safeName = (name) => path.basename(name, path.extname(name)).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'converted-file';
const qualityValues = (format) => format === 'MP4' ? ['1080', '720', '480', '360'] : ['320', '256', '192', '128', '96'];

async function hasCookieDirectory(directory) {
  try {
    return (await fs.stat(directory)).isDirectory();
  } catch {
    return false;
  }
}

async function removeFiles(files) {
  await Promise.all(files.filter(Boolean).map((file) => fs.rm(file, { force: true }).catch(() => {})));
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const process = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args]);
    let errorOutput = '';
    process.stderr.on('data', (chunk) => { errorOutput += chunk.toString(); });
    process.on('error', reject);
    process.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(errorOutput.trim() || `FFmpeg exited with status ${code}.`));
    });
  });
}

function imageOutputOptions(format) {
  const output = format.toLowerCase();
  return output === 'jpeg' ? { quality: 90, mozjpeg: true } : { quality: 90 };
}

async function convertImage(file, format) {
  const outputFormat = format.toLowerCase() === 'jpeg' ? 'jpeg' : format.toLowerCase();
  const converted = await sharp(file.path, { animated: true }).toFormat(outputFormat, imageOutputOptions(format)).toBuffer();
  return { buffer: converted, filename: `${safeName(file.originalname)}.${extensionFor(format)}`, mimetype: MIME_TYPES[format] };
}

async function convertVideo(file, format) {
  const outputPath = path.join(WORK_DIRECTORY, `${randomUUID()}.${extensionFor(format)}`);
  const cleanup = [file.path, outputPath];
  try {
    if (format === 'GIF') {
      // FFmpeg provides a stable GIF path that works across current Node and browser toolchains.
      await runFfmpeg(['-y', '-i', file.path, '-vf', 'fps=15,scale=iw:-2:flags=lanczos', outputPath]);
    } else if (format === 'MP3') {
      await runFfmpeg(['-y', '-i', file.path, '-vn', '-c:a', 'libmp3lame', '-q:a', '2', outputPath]);
    } else if (format === 'WAV') {
      await runFfmpeg(['-y', '-i', file.path, '-vn', '-c:a', 'pcm_s16le', outputPath]);
    } else if (format === 'OGG') {
      await runFfmpeg(['-y', '-i', file.path, '-vn', '-c:a', 'libvorbis', outputPath]);
    } else if (format === 'M4A') {
      await runFfmpeg(['-y', '-i', file.path, '-vn', '-c:a', 'aac', '-b:a', '192k', outputPath]);
    } else {
      throw new Error('Video input can only be converted to GIF or extracted as MP3, WAV, OGG, or M4A.');
    }
    const buffer = await fs.readFile(outputPath);
    return { buffer, filename: `${safeName(file.originalname)}.${extensionFor(format)}`, mimetype: MIME_TYPES[format] };
  } finally {
    await removeFiles(cleanup);
  }
}

function writeJob(job, updates) {
  Object.assign(job, updates);
}

function publicJob(job) {
  return {
    state: job.state,
    progress: clamp(job.progress, 0, 100),
    speed: job.speed || null,
    eta: job.eta || null,
    elapsed: Math.max(0, Math.floor((Date.now() - job.startedAt) / 1000)),
    error: job.error || null,
    cookiesIssue: job.cookiesIssue || null,
    completedItems: Number.isFinite(job.completedItems) ? job.completedItems : 0,
    totalItems: Number.isFinite(job.totalItems) ? job.totalItems : null,
    currentItem: job.currentItem || null,
    message: job.message || null,
  };
}

function validYoutubeUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    return hostname === 'youtube.com' || hostname === 'youtu.be' || hostname.endsWith('.youtube.com');
  } catch {
    return false;
  }
}

function spotifyResourceKind(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    if (hostname !== 'spotify.com' && !hostname.endsWith('.spotify.com')) return null;
    const pathParts = url.pathname.split('/').filter(Boolean);
    const resource = pathParts[0] === 'embed' ? pathParts[1] : pathParts[0];
    return ['track', 'album', 'playlist'].includes(resource) ? resource : null;
  } catch {
    return null;
  }
}

function processSpotifyJob(jobId, url, kind, format, quality, runtime) {
  const job = spotifyJobs.get(jobId);
  if (!job) return;
  const workerArgs = [
    runtime.spotifyWorkerPath,
    '--url', url,
    '--kind', kind,
    '--output-directory', job.workDirectory,
    '--format', format,
    '--quality', quality,
    '--cookies-directory', runtime.cookiesDirectory,
  ];
  const worker = spawn(runtime.pythonExecutable, workerArgs, { windowsHide: true });
  let stdoutBuffer = '';
  let stderr = '';

  // The Spotify worker mirrors the YouTube JSON protocol and adds item counts for playlist status updates.
  const handleMessage = (line) => {
    if (!line.trim()) return;
    try {
      const message = JSON.parse(line);
      if (message.event === 'started') {
        writeJob(job, {
          state: 'downloading', progress: 0,
          cookiesConfigured: Boolean(message.cookies_configured),
          cookiesIssue: message.cookies_issue || null,
        });
      } else if (message.event === 'progress') {
        writeJob(job, {
          state: message.state || 'downloading',
          progress: message.progress || 0,
          speed: message.speed,
          eta: message.eta,
          completedItems: Number.isFinite(message.completed) ? message.completed : job.completedItems,
          totalItems: Number.isFinite(message.total) ? message.total : job.totalItems,
          currentItem: message.current_item || job.currentItem,
          message: message.message || job.message,
        });
      } else if (message.event === 'complete') {
        writeJob(job, {
          state: 'completed', progress: 100, outputPath: message.path,
          filename: message.filename || `spotify.${extensionFor(format)}`,
          mimetype: message.mimetype || MIME_TYPES[format],
          archive: Boolean(message.archive),
          completedItems: Number.isFinite(message.completed) ? message.completed : job.completedItems,
          totalItems: Number.isFinite(message.total) ? message.total : job.totalItems,
          currentItem: null,
          message: message.archive ? 'Playlist archive is ready' : 'Audio file is ready',
        });
      } else if (message.event === 'error') {
        writeJob(job, { state: 'failed', error: message.error || 'spotDL could not complete the download.' });
      }
    } catch {
      // Ignore non-JSON provider diagnostics; stderr is retained for an actionable job error.
    }
  };

  worker.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || '';
    lines.forEach(handleMessage);
  });
  worker.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  worker.on('error', (error) => writeJob(job, { state: 'failed', error: `Could not start Python spotDL worker: ${error.message}` }));
  worker.on('close', (code) => {
    handleMessage(stdoutBuffer);
    if (code !== 0 && job.state !== 'failed' && job.state !== 'completed') {
      writeJob(job, { state: 'failed', error: stderr.trim() || 'spotDL worker exited before the download completed.' });
    }
  });
}

function processYoutubeJob(jobId, url, format, quality, runtime) {
  const job = youtubeJobs.get(jobId);
  if (!job) return;
  const workerArgs = [
    runtime.workerPath,
    '--url', url,
    '--output-directory', WORK_DIRECTORY,
    '--format', format,
    '--quality', quality,
    '--cookies-directory', runtime.cookiesDirectory,
    '--job-id', jobId,
  ];
  const worker = spawn(runtime.pythonExecutable, workerArgs, { windowsHide: true });
  let stdoutBuffer = '';
  let stderr = '';

  // The worker emits newline-delimited JSON so the browser can poll real yt-dlp progress.
  const handleMessage = (line) => {
    if (!line.trim()) return;
    try {
      const message = JSON.parse(line);
      if (message.event === 'started') {
        writeJob(job, {
          state: 'downloading', progress: 0,
          cookiesConfigured: Boolean(message.cookies_configured),
          cookiesIssue: message.cookies_issue || null,
        });
      } else if (message.event === 'progress') {
        writeJob(job, { state: message.state || 'downloading', progress: message.progress || 0, speed: message.speed, eta: message.eta });
      } else if (message.event === 'complete') {
        writeJob(job, {
          state: 'completed', progress: 100, outputPath: message.path,
          filename: message.filename || `youtube.${extensionFor(format)}`,
          mimetype: message.mimetype || MIME_TYPES[format],
          archive: Boolean(message.archive),
        });
      } else if (message.event === 'error') {
        writeJob(job, { state: 'failed', error: message.error || 'yt-dlp could not complete the download.' });
      }
    } catch {
      // Ignore non-JSON diagnostic output; stderr is retained for an actionable job error.
    }
  };

  worker.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || '';
    lines.forEach(handleMessage);
  });
  worker.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  worker.on('error', (error) => writeJob(job, { state: 'failed', error: `Could not start Python yt-dlp worker: ${error.message}` }));
  worker.on('close', (code) => {
    handleMessage(stdoutBuffer);
    if (code !== 0 && job.state !== 'failed' && job.state !== 'completed') {
      writeJob(job, { state: 'failed', error: stderr.trim() || 'yt-dlp worker exited before the download completed.' });
    }
  });
}

export function createApp(options = {}) {
  const runtime = {
    pythonExecutable: options.pythonExecutable || DEFAULT_PYTHON_EXECUTABLE,
    workerPath: options.workerPath || DEFAULT_YTDLP_WORKER,
    spotifyWorkerPath: options.spotifyWorkerPath || DEFAULT_SPOTIFY_WORKER,
    cookiesDirectory: options.cookiesDirectory || DEFAULT_COOKIES_DIRECTORY,
    spotifyMetadataFetcher: options.spotifyMetadataFetcher || fetch,
  };
  const app = express();
  app.disable('x-powered-by');
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use('/static', express.static(STATIC_DIRECTORY, { maxAge: '1h' }));

  app.get('/api/config', async (_request, response) => {
    response.json({
      image_formats: IMAGE_FORMATS,
      video_outputs: ['GIF', ...AUDIO_FORMATS],
      youtube_video_qualities: qualityValues('MP4'),
      youtube_audio_qualities: qualityValues('MP3'),
      spotify_audio_qualities: qualityValues('MP3'),
      youtube_cookies_configured: await hasCookieDirectory(runtime.cookiesDirectory),
    });
  });

  app.post('/api/convert', upload.array('image', 10), async (request, response, next) => {
    const files = request.files || [];
    const file = files[0];
    const body = request.body || {};
    const outputFormat = String(body.format || 'PNG').toUpperCase();
    try {
      if (!file) {
        const error = new Error('No file was uploaded.');
        error.status = 400;
        throw error;
      }
      const extension = path.extname(file.originalname).toLowerCase();
      let result;
      if (IMAGE_EXTENSIONS.has(extension)) {
        if (!IMAGE_FORMATS.includes(outputFormat)) {
          const error = new Error('Unsupported image output format.');
          error.status = 400;
          throw error;
        }
        result = await convertImage(file, outputFormat);
        await removeFiles(files.map((entry) => entry.path));
      } else if (VIDEO_EXTENSIONS.has(extension)) {
        if (!VIDEO_FORMATS.has(outputFormat)) {
          const error = new Error('Video input can only be converted to GIF or extracted as audio.');
          error.status = 400;
          throw error;
        }
        result = await convertVideo(file, outputFormat);
        await removeFiles(files.slice(1).map((entry) => entry.path));
      } else {
        const error = new Error('Unsupported file type.');
        error.status = 400;
        throw error;
      }
      response.type(result.mimetype).attachment(result.filename).send(result.buffer);
    } catch (error) {
      await removeFiles(files.map((entry) => entry.path));
      next(error);
    }
  });

  app.post('/api/youtube/download', async (request, response, next) => {
    try {
      const url = String(request.body.youtube_url || '').trim();
      const format = String(request.body.format || 'MP4').toUpperCase();
      const defaultQuality = format === 'MP4' ? '720' : '192';
      const quality = String(request.body.quality || defaultQuality);
      if (!validYoutubeUrl(url)) {
        const error = new Error('Enter a valid YouTube video or playlist URL.');
        error.status = 400;
        throw error;
      }
      if (!['MP4', ...AUDIO_FORMATS].includes(format) || !qualityValues(format).includes(quality)) {
        const error = new Error('Unsupported YouTube output or quality.');
        error.status = 400;
        throw error;
      }
      const jobId = randomUUID();
      youtubeJobs.set(jobId, { state: 'queued', progress: 0, startedAt: Date.now(), format, quality });
      processYoutubeJob(jobId, url, format, quality, runtime);
      response.status(202).json({ job_id: jobId, state: 'queued' });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/spotify/preview', async (request, response, next) => {
    try {
      const url = String(request.query.url || '').trim();
      if (!spotifyResourceKind(url)) {
        const error = new Error('Enter a valid public Spotify track, album, or playlist URL.');
        error.status = 400;
        throw error;
      }
      const upstream = await runtime.spotifyMetadataFetcher(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, {
        signal: AbortSignal.timeout(8_000),
      });
      if (!upstream.ok) throw new Error('Spotify preview details are currently unavailable.');
      const payload = await upstream.json();
      response.json({
        title: payload.title || null,
        author: payload.author_name || null,
        thumbnail_url: payload.thumbnail_url || null,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/spotify/download', async (request, response, next) => {
    try {
      const url = String(request.body.spotify_url || '').trim();
      const kind = spotifyResourceKind(url);
      const format = String(request.body.format || 'MP3').toUpperCase();
      const quality = String(request.body.quality || '192');
      if (!kind) {
        const error = new Error('Enter a valid public Spotify track, album, or playlist URL.');
        error.status = 400;
        throw error;
      }
      if (!AUDIO_FORMATS.has(format) || !qualityValues(format).includes(quality)) {
        const error = new Error('Unsupported Spotify audio output or quality.');
        error.status = 400;
        throw error;
      }
      const jobId = randomUUID();
      const workDirectory = path.join(WORK_DIRECTORY, `spotify-${jobId}`);
      spotifyJobs.set(jobId, { state: 'queued', progress: 0, startedAt: Date.now(), format, quality, kind, workDirectory });
      processSpotifyJob(jobId, url, kind, format, quality, runtime);
      response.status(202).json({ job_id: jobId, state: 'queued', kind });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/spotify/progress/:jobId', (request, response) => {
    const job = spotifyJobs.get(request.params.jobId);
    if (!job) return response.status(404).json({ error: 'Download job not found.' });
    return response.json(publicJob(job));
  });

  app.get('/api/spotify/result/:jobId', async (request, response, next) => {
    const job = spotifyJobs.get(request.params.jobId);
    if (!job) return response.status(404).json({ error: 'Download job not found.' });
    if (job.state !== 'completed') return response.status(409).json({ error: 'Download is not complete.' });
    try {
      const result = await fs.readFile(job.outputPath);
      response.type(job.mimetype).attachment(job.filename).send(result);
      await fs.rm(job.workDirectory, { recursive: true, force: true });
      spotifyJobs.delete(request.params.jobId);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/youtube/progress/:jobId', (request, response) => {
    const job = youtubeJobs.get(request.params.jobId);
    if (!job) return response.status(404).json({ error: 'Download job not found.' });
    return response.json(publicJob(job));
  });

  app.get('/api/youtube/result/:jobId', async (request, response, next) => {
    const job = youtubeJobs.get(request.params.jobId);
    if (!job) return response.status(404).json({ error: 'Download job not found.' });
    if (job.state !== 'completed') return response.status(409).json({ error: 'Download is not complete.' });
    try {
      response.type(job.mimetype).attachment(job.filename).send(await fs.readFile(job.outputPath));
      await removeFiles([job.outputPath]);
      youtubeJobs.delete(request.params.jobId);
    } catch (error) {
      next(error);
    }
  });

  // Every browser route returns the same static JavaScript shell; app.js owns view rendering.
  app.get(['/', '/image', '/video', '/youtube', '/spotify'], (_request, response) => response.sendFile(path.join(STATIC_DIRECTORY, 'index.html')));

  app.use((error, _request, response, _next) => {
    const status = error.status || (error.code && String(error.code).startsWith('LIMIT') ? 413 : 500);
    response.status(status).json({ error: error.message || 'The conversion could not be completed.' });
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = createApp();
  const port = Number(process.env.PORT || 5000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`Converter is running at http://127.0.0.1:${port}`);
  });
}
