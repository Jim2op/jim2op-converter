import type { Express, Request, Response } from "express";
import multer from "multer";
import sharp from "sharp";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const UPLOAD_DIRECTORY = path.join(os.tmpdir(), "converter-manus-uploads");
const WORK_DIRECTORY = path.join(os.tmpdir(), "converter-manus-jobs");
const WORKER_DIRECTORY = path.join(process.cwd(), "workers");
const PYTHON_EXECUTABLE = process.env.PYTHON_EXECUTABLE || "python3";
const COOKIES_DIRECTORY = process.env.YTDLP_COOKIES_DIRECTORY || path.join(process.cwd(), "cookies");
const IMAGE_FORMATS = ["PNG", "JPEG", "WEBP", "BMP", "TIFF", "GIF", "AVIF"] as const;
const AUDIO_FORMATS = new Set(["MP3", "WAV", "OGG", "M4A"]);
const VIDEO_FORMATS = new Set(["GIF", ...Array.from(AUDIO_FORMATS)]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".bmp", ".gif", ".tiff", ".webp", ".avif"]);
const MIME_TYPES: Record<string, string> = {
  PNG: "image/png", JPEG: "image/jpeg", WEBP: "image/webp", BMP: "image/bmp", TIFF: "image/tiff", GIF: "image/gif", AVIF: "image/avif",
  MP3: "audio/mpeg", WAV: "audio/wav", OGG: "audio/ogg", M4A: "audio/mp4", MP4: "video/mp4",
};

type DownloadJob = {
  state: string;
  progress: number;
  startedAt: number;
  format: string;
  quality: string;
  workDirectory?: string;
  speed?: number | string | null;
  eta?: number | string | null;
  error?: string | null;
  cookiesIssue?: string | null;
  outputPath?: string;
  filename?: string;
  mimetype?: string;
  archive?: boolean;
  completedItems?: number;
  totalItems?: number | null;
  currentItem?: string | null;
  message?: string | null;
};

export type MediaRouteOptions = {
  pythonExecutable?: string;
  workerDirectory?: string;
  cookiesDirectory?: string;
  workDirectory?: string;
};

const youtubeJobs = new Map<string, DownloadJob>();
const spotifyJobs = new Map<string, DownloadJob>();

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => callback(null, UPLOAD_DIRECTORY),
  filename: (_request, file, callback) => callback(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024, files: 10 } });

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const extensionFor = (format: string) => format.toLowerCase() === "jpeg" ? "jpg" : format.toLowerCase();
const safeName = (name: string) => path.basename(name, path.extname(name)).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "converted-file";
const qualityValues = (format: string) => format === "MP4" ? ["1080", "720", "480", "360"] : ["320", "256", "192", "128", "96"];

async function prepareDirectories() {
  await Promise.all([fs.mkdir(UPLOAD_DIRECTORY, { recursive: true }), fs.mkdir(WORK_DIRECTORY, { recursive: true })]);
}

async function hasCookieDirectory(directory: string) {
  try { return (await fs.stat(directory)).isDirectory(); } catch { return false; }
}

async function removeFiles(files: Array<string | undefined>) {
  await Promise.all(files.filter(Boolean).map(file => fs.rm(file as string, { force: true, recursive: true }).catch(() => undefined)));
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const process = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args]);
    let errorOutput = "";
    process.stderr.on("data", chunk => { errorOutput += chunk.toString(); });
    process.on("error", reject);
    process.on("close", code => code === 0 ? resolve() : reject(new Error(errorOutput.trim() || `FFmpeg exited with status ${code}.`)));
  });
}

async function convertImage(file: Express.Multer.File, format: string) {
  if (format === "BMP") {
    const outputPath = path.join(WORK_DIRECTORY, `${randomUUID()}.bmp`);
    try {
      await runFfmpeg(["-y", "-i", file.path, "-frames:v", "1", outputPath]);
      return { buffer: await fs.readFile(outputPath), filename: `${safeName(file.originalname)}.bmp`, mimetype: MIME_TYPES.BMP };
    } finally { await removeFiles([outputPath]); }
  }
  const outputFormat = (format.toLowerCase() === "jpeg" ? "jpeg" : format.toLowerCase()) as "png" | "jpeg" | "webp" | "tiff" | "gif" | "avif";
  const options = outputFormat === "jpeg" ? { quality: 90, mozjpeg: true } : { quality: 90 };
  const buffer = await sharp(file.path, { animated: true }).toFormat(outputFormat, options).toBuffer();
  return { buffer, filename: `${safeName(file.originalname)}.${extensionFor(format)}`, mimetype: MIME_TYPES[format] };
}

async function convertVideo(file: Express.Multer.File, format: string) {
  const outputPath = path.join(WORK_DIRECTORY, `${randomUUID()}.${extensionFor(format)}`);
  try {
    if (format === "GIF") await runFfmpeg(["-y", "-i", file.path, "-vf", "fps=15,scale=iw:-2:flags=lanczos", outputPath]);
    else if (format === "MP3") await runFfmpeg(["-y", "-i", file.path, "-vn", "-c:a", "libmp3lame", "-q:a", "2", outputPath]);
    else if (format === "WAV") await runFfmpeg(["-y", "-i", file.path, "-vn", "-c:a", "pcm_s16le", outputPath]);
    else if (format === "OGG") await runFfmpeg(["-y", "-i", file.path, "-vn", "-c:a", "libvorbis", outputPath]);
    else if (format === "M4A") await runFfmpeg(["-y", "-i", file.path, "-vn", "-c:a", "aac", "-b:a", "192k", outputPath]);
    else throw new Error("Video input can only be converted to GIF or extracted as MP3, WAV, OGG, or M4A.");
    return { buffer: await fs.readFile(outputPath), filename: `${safeName(file.originalname)}.${extensionFor(format)}`, mimetype: MIME_TYPES[format] };
  } finally {
    await removeFiles([file.path, outputPath]);
  }
}

function publicJob(job: DownloadJob) {
  return {
    state: job.state, progress: clamp(job.progress, 0, 100), speed: job.speed || null, eta: job.eta || null,
    elapsed: Math.max(0, Math.floor((Date.now() - job.startedAt) / 1000)), error: job.error || null,
    cookiesIssue: job.cookiesIssue || null, completedItems: Number.isFinite(job.completedItems) ? job.completedItems : 0,
    totalItems: Number.isFinite(job.totalItems) ? job.totalItems : null, currentItem: job.currentItem || null, message: job.message || null,
  };
}

function validYoutubeUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    return hostname === "youtube.com" || hostname === "youtu.be" || hostname.endsWith(".youtube.com");
  } catch { return false; }
}

function spotifyResourceKind(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (hostname !== "spotify.com" && !hostname.endsWith(".spotify.com")) return null;
    const segments = url.pathname.split("/").filter(Boolean);
    const resource = segments[0] === "embed" ? segments[1] : segments[0];
    return ["track", "album", "playlist"].includes(resource) ? resource : null;
  } catch { return null; }
}

function startWorker(pythonExecutable: string, job: DownloadJob, workerPath: string, args: string[], jobMap: Map<string, DownloadJob>, jobId: string, source: "youtube" | "spotify") {
  const worker = spawn(pythonExecutable, [workerPath, ...args], { windowsHide: true });
  let stdoutBuffer = "";
  let stderr = "";
  const updateFromMessage = (line: string) => {
    if (!line.trim()) return;
    try {
      const message = JSON.parse(line) as Record<string, unknown>;
      if (message.event === "started") Object.assign(job, { state: "downloading", progress: 0, cookiesIssue: message.cookies_issue || null });
      else if (message.event === "progress") Object.assign(job, {
        state: message.state || "downloading", progress: message.progress || 0, speed: message.speed || null, eta: message.eta || null,
        completedItems: Number.isFinite(message.completed) ? message.completed : job.completedItems,
        totalItems: Number.isFinite(message.total) ? message.total : job.totalItems,
        currentItem: message.current_item || job.currentItem, message: message.message || job.message,
      });
      else if (message.event === "complete") Object.assign(job, {
        state: "completed", progress: 100, outputPath: message.path, filename: message.filename || `${source}.${extensionFor(job.format)}`,
        mimetype: message.mimetype || MIME_TYPES[job.format], archive: Boolean(message.archive),
        completedItems: Number.isFinite(message.completed) ? message.completed : job.completedItems,
        totalItems: Number.isFinite(message.total) ? message.total : job.totalItems,
        currentItem: null, message: message.archive ? "Playlist archive is ready" : "Download is ready",
      });
      else if (message.event === "error") Object.assign(job, { state: "failed", error: message.error || `${source} worker could not complete the download.` });
    } catch { /* Provider diagnostics remain available in the terminal without corrupting job state. */ }
  };
  worker.stdout.on("data", chunk => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || "";
    lines.forEach(updateFromMessage);
  });
  worker.stderr.on("data", chunk => { stderr += chunk.toString(); });
  worker.on("error", error => Object.assign(job, { state: "failed", error: `Could not start ${source} worker: ${error.message}` }));
  worker.on("close", code => {
    updateFromMessage(stdoutBuffer);
    if (code !== 0 && job.state !== "failed" && job.state !== "completed") Object.assign(job, { state: "failed", error: stderr.trim() || `${source} worker exited before completion.` });
    jobMap.set(jobId, job);
  });
}

function sendCompletedResult(response: Response, jobMap: Map<string, DownloadJob>, jobId: string) {
  return async () => {
    const job = jobMap.get(jobId);
    if (!job) return response.status(404).json({ error: "Download job not found." });
    if (job.state !== "completed" || !job.outputPath) return response.status(409).json({ error: "Download is not complete." });
    try {
      const buffer = await fs.readFile(job.outputPath);
      response.type(job.mimetype || "application/octet-stream").attachment(job.filename || "download").send(buffer);
      await removeFiles([job.workDirectory, job.outputPath]);
      jobMap.delete(jobId);
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : "Could not read completed download." });
    }
  };
}

export async function registerMediaRoutes(app: Express, options: MediaRouteOptions = {}) {
  const runtime = {
    pythonExecutable: options.pythonExecutable || PYTHON_EXECUTABLE,
    workerDirectory: options.workerDirectory || WORKER_DIRECTORY,
    cookiesDirectory: options.cookiesDirectory || COOKIES_DIRECTORY,
    workDirectory: options.workDirectory || WORK_DIRECTORY,
  };
  await prepareDirectories();
  app.get("/api/config", async (_request, response) => response.json({
    image_formats: IMAGE_FORMATS, video_outputs: ["GIF", ...Array.from(AUDIO_FORMATS)], youtube_video_qualities: qualityValues("MP4"),
    youtube_audio_qualities: qualityValues("MP3"), spotify_audio_qualities: qualityValues("MP3"),
    youtube_cookies_configured: await hasCookieDirectory(runtime.cookiesDirectory),
  }));

  app.post("/api/convert", upload.array("image", 10), async (request: Request, response: Response) => {
    const files = (request.files || []) as Express.Multer.File[];
    const file = files[0];
    const format = String(request.body.format || "PNG").toUpperCase();
    try {
      if (!file) throw new Error("No file was uploaded.");
      const extension = path.extname(file.originalname).toLowerCase();
      let result: { buffer: Buffer; filename: string; mimetype: string };
      if (IMAGE_EXTENSIONS.has(extension)) {
        if (!IMAGE_FORMATS.includes(format as (typeof IMAGE_FORMATS)[number])) throw new Error("Unsupported image output format.");
        result = await convertImage(file, format);
        await removeFiles(files.map(entry => entry.path));
      } else if (VIDEO_EXTENSIONS.has(extension)) {
        if (!VIDEO_FORMATS.has(format)) throw new Error("Video input can only be converted to GIF or extracted as audio.");
        result = await convertVideo(file, format);
        await removeFiles(files.slice(1).map(entry => entry.path));
      } else throw new Error("Unsupported file type.");
      response.type(result.mimetype).attachment(result.filename).send(result.buffer);
    } catch (error) {
      await removeFiles(files.map(entry => entry.path));
      response.status(400).json({ error: error instanceof Error ? error.message : "The conversion could not be completed." });
    }
  });

  app.post("/api/youtube/download", (request, response) => {
    const url = String(request.body.youtube_url || "").trim();
    const format = String(request.body.format || "MP4").toUpperCase();
    const quality = String(request.body.quality || (format === "MP4" ? "720" : "192"));
    if (!validYoutubeUrl(url)) return response.status(400).json({ error: "Enter a valid YouTube video or playlist URL." });
    if (!(["MP4", ...Array.from(AUDIO_FORMATS)].includes(format) && qualityValues(format).includes(quality))) return response.status(400).json({ error: "Unsupported YouTube output or quality." });
    const jobId = randomUUID();
    const job: DownloadJob = { state: "queued", progress: 0, startedAt: Date.now(), format, quality, workDirectory: path.join(runtime.workDirectory, `youtube-${jobId}`) };
    youtubeJobs.set(jobId, job);
    startWorker(runtime.pythonExecutable, job, path.join(runtime.workerDirectory, "yt_dlp_worker.py"), ["--url", url, "--output-directory", runtime.workDirectory, "--format", format, "--quality", quality, "--cookies-directory", runtime.cookiesDirectory, "--job-id", jobId], youtubeJobs, jobId, "youtube");
    return response.status(202).json({ job_id: jobId, state: "queued" });
  });
  app.get("/api/youtube/progress/:jobId", (request, response) => {
    const job = youtubeJobs.get(request.params.jobId);
    return job ? response.json(publicJob(job)) : response.status(404).json({ error: "Download job not found." });
  });
  app.get("/api/youtube/result/:jobId", (request, response) => sendCompletedResult(response, youtubeJobs, request.params.jobId)());

  app.get("/api/spotify/preview", async (request, response) => {
    const url = String(request.query.url || "").trim();
    if (!spotifyResourceKind(url)) return response.status(400).json({ error: "Enter a valid public Spotify track, album, or playlist URL." });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const upstream = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, { signal: controller.signal });
      if (!upstream.ok) throw new Error("Spotify preview details are currently unavailable.");
      const payload = await upstream.json() as { title?: string; author_name?: string; thumbnail_url?: string };
      response.json({ title: payload.title || null, author: payload.author_name || null, thumbnail_url: payload.thumbnail_url || null });
    } catch (error) {
      response.status(502).json({ error: error instanceof Error ? error.message : "Spotify preview details are currently unavailable." });
    } finally { clearTimeout(timer); }
  });
  app.post("/api/spotify/download", (request, response) => {
    const url = String(request.body.spotify_url || "").trim();
    const kind = spotifyResourceKind(url);
    const format = String(request.body.format || "MP3").toUpperCase();
    const quality = String(request.body.quality || "192");
    if (!kind) return response.status(400).json({ error: "Enter a valid public Spotify track, album, or playlist URL." });
    if (!(AUDIO_FORMATS.has(format) && qualityValues(format).includes(quality))) return response.status(400).json({ error: "Unsupported Spotify audio output or quality." });
    const jobId = randomUUID();
    const job: DownloadJob = { state: "queued", progress: 0, startedAt: Date.now(), format, quality, workDirectory: path.join(runtime.workDirectory, `spotify-${jobId}`) };
    spotifyJobs.set(jobId, job);
    startWorker(runtime.pythonExecutable, job, path.join(runtime.workerDirectory, "spotify_worker.py"), ["--url", url, "--kind", kind, "--output-directory", job.workDirectory!, "--format", format, "--quality", quality, "--cookies-directory", runtime.cookiesDirectory], spotifyJobs, jobId, "spotify");
    return response.status(202).json({ job_id: jobId, state: "queued", kind });
  });
  app.get("/api/spotify/progress/:jobId", (request, response) => {
    const job = spotifyJobs.get(request.params.jobId);
    return job ? response.json(publicJob(job)) : response.status(404).json({ error: "Download job not found." });
  });
  app.get("/api/spotify/result/:jobId", (request, response) => sendCompletedResult(response, spotifyJobs, request.params.jobId)());
}
