import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import ytdl from '@distube/ytdl-core';
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
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const extensionFor = (format) => format.toLowerCase() === 'jpeg' ? 'jpg' : format.toLowerCase();
const safeName = (name) => path.basename(name, path.extname(name)).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'converted-file';
const qualityValues = (format) => format === 'MP4' ? ['1080', '720', '480', '360'] : ['320', '256', '192', '128', '96'];

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
  };
}

async function downloadYoutubeSource(job, url, destination, format) {
  const filter = format === 'MP4' ? 'audioandvideo' : 'audioonly';
  const source = ytdl(url, { filter, quality: 'highest' });
  const file = (await import('node:fs')).createWriteStream(destination);
  source.on('progress', (_chunkLength, downloaded, total) => {
    if (total) writeJob(job, { state: 'downloading', progress: (downloaded / total) * 72 });
  });
  await new Promise((resolve, reject) => {
    source.on('error', reject);
    file.on('error', reject);
    file.on('finish', resolve);
    source.pipe(file);
  });
}

async function processYoutubeJob(jobId, url, format, quality) {
  const job = youtubeJobs.get(jobId);
  if (!job) return;
  const sourcePath = path.join(WORK_DIRECTORY, `${jobId}.source`);
  const outputPath = path.join(WORK_DIRECTORY, `${jobId}.${extensionFor(format)}`);
  try {
    writeJob(job, { state: 'downloading', progress: 0 });
    const metadata = await ytdl.getInfo(url);
    job.title = safeName(metadata.videoDetails.title || 'youtube');
    await downloadYoutubeSource(job, url, sourcePath, format);
    writeJob(job, { state: 'processing', progress: 78 });

    if (format === 'MP4') {
      const scale = quality === '1080' ? null : `scale=-2:'min(ih,${quality})'`;
      const args = ['-y', '-i', sourcePath];
      if (scale) args.push('-vf', scale);
      args.push('-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', outputPath);
      await runFfmpeg(args);
    } else {
      const audioArgs = {
        MP3: ['-vn', '-c:a', 'libmp3lame', '-b:a', `${quality}k`],
        WAV: ['-vn', '-c:a', 'pcm_s16le'],
        OGG: ['-vn', '-c:a', 'libvorbis', '-b:a', `${quality}k`],
        M4A: ['-vn', '-c:a', 'aac', '-b:a', `${quality}k`],
      }[format];
      await runFfmpeg(['-y', '-i', sourcePath, ...audioArgs, outputPath]);
    }
    writeJob(job, { state: 'completed', progress: 100, outputPath, filename: `${job.title}.${extensionFor(format)}`, mimetype: MIME_TYPES[format] });
  } catch (error) {
    writeJob(job, { state: 'failed', error: error.message || 'YouTube download failed.' });
    await removeFiles([outputPath]);
  } finally {
    await removeFiles([sourcePath]);
  }
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use('/static', express.static(STATIC_DIRECTORY, { maxAge: '1h' }));

  app.get('/api/config', (_request, response) => {
    response.json({
      image_formats: IMAGE_FORMATS,
      video_outputs: ['GIF', ...AUDIO_FORMATS],
      youtube_video_qualities: qualityValues('MP4'),
      youtube_audio_qualities: qualityValues('MP3'),
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
      if (!ytdl.validateURL(url)) {
        const error = new Error('Enter a valid YouTube video URL.');
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
      processYoutubeJob(jobId, url, format, quality);
      response.status(202).json({ job_id: jobId, state: 'queued' });
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
  app.get(['/', '/image', '/video', '/youtube'], (_request, response) => response.sendFile(path.join(STATIC_DIRECTORY, 'index.html')));

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
