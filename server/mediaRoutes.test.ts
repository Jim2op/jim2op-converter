import express from "express";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerMediaRoutes } from "./mediaRoutes";

let baseUrl = "";
let stopServer: (() => Promise<void>) | undefined;
let workerBaseUrl = "";
let stopWorkerServer: (() => Promise<void>) | undefined;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  await registerMediaRoutes(app);
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not bind test server.");
  baseUrl = `http://127.0.0.1:${address.port}`;
  stopServer = () => new Promise(resolve => server.close(() => resolve()));

  const workerApp = express();
  workerApp.use(express.json());
  workerApp.use(express.urlencoded({ extended: true }));
  await registerMediaRoutes(workerApp, { workerDirectory: path.join(process.cwd(), "test", "fixtures") });
  const workerServer = await new Promise<ReturnType<typeof workerApp.listen>>(resolve => {
    const listener = workerApp.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const workerAddress = workerServer.address();
  if (!workerAddress || typeof workerAddress === "string") throw new Error("Could not bind worker test server.");
  workerBaseUrl = `http://127.0.0.1:${workerAddress.port}`;
  stopWorkerServer = () => new Promise(resolve => workerServer.close(() => resolve()));
});

afterAll(async () => { await stopServer?.(); await stopWorkerServer?.(); });

async function waitForCompletion(endpoint: string, jobId: string) {
  let payload: Record<string, unknown> = {};
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await fetch(`${workerBaseUrl}${endpoint}/${jobId}`);
    payload = await response.json() as Record<string, unknown>;
    if (payload.state === "completed" || payload.state === "failed") return payload;
    await new Promise(resolve => setTimeout(resolve, 15));
  }
  return payload;
}

describe("Manus media route contract", () => {
  it("preserves the format configuration consumed by the existing static client", async () => {
    const response = await fetch(`${baseUrl}/api/config`);
    const payload = await response.json() as { image_formats: string[]; spotify_audio_qualities: string[] };
    expect(response.status).toBe(200);
    expect(payload.image_formats).toEqual(expect.arrayContaining(["PNG", "JPEG", "BMP", "AVIF"]));
    expect(payload.spotify_audio_qualities).toEqual(["320", "256", "192", "128", "96"]);
  });

  it("returns the legacy validation errors for missing uploads and invalid downloader URLs", async () => {
    const missingUpload = await fetch(`${baseUrl}/api/convert`, { method: "POST" });
    expect(missingUpload.status).toBe(400);
    await expect(missingUpload.json()).resolves.toMatchObject({ error: "No file was uploaded." });

    const invalidYoutube = await fetch(`${baseUrl}/api/youtube/download`, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "youtube_url=https%3A%2F%2Fexample.com",
    });
    expect(invalidYoutube.status).toBe(400);

    const invalidSpotify = await fetch(`${baseUrl}/api/spotify/download`, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "spotify_url=https%3A%2F%2Fexample.com",
    });
    expect(invalidSpotify.status).toBe(400);
  });

  it("converts an uploaded PNG to a JPEG attachment through the legacy endpoint", async () => {
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 75, g: 156, b: 211 } } }).png().toBuffer();
    const form = new FormData();
    form.append("format", "JPEG");
    form.append("image", new Blob([png], { type: "image/png" }), "fixture.png");
    const response = await fetch(`${baseUrl}/api/convert`, { method: "POST", body: form });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/jpeg");
    expect(response.headers.get("content-disposition")).toContain("fixture.jpg");
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it("polls a YouTube worker job and serves its completed result", async () => {
    const start = await fetch(`${workerBaseUrl}/api/youtube/download`, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "youtube_url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dfixture&format=MP3&quality=192",
    });
    const started = await start.json() as { job_id: string };
    const progress = await waitForCompletion("/api/youtube/progress", started.job_id);
    expect(progress.state).toBe("completed");
    const result = await fetch(`${workerBaseUrl}/api/youtube/result/${started.job_id}`);
    expect(result.headers.get("content-type")).toContain("audio/mpeg");
    expect((await result.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it("forwards Spotify playlist item status during polling and serves its ZIP result", async () => {
    const start = await fetch(`${workerBaseUrl}/api/spotify/download`, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "spotify_url=https%3A%2F%2Fopen.spotify.com%2Fplaylist%2Ffixture&format=M4A&quality=256",
    });
    const started = await start.json() as { job_id: string };
    let sawLiveItem = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const response = await fetch(`${workerBaseUrl}/api/spotify/progress/${started.job_id}`);
      const progress = await response.json() as { state: string; completedItems: number; totalItems: number | null; currentItem: string | null };
      sawLiveItem ||= progress.totalItems === 3 && Boolean(progress.currentItem);
      if (progress.state === "completed") {
        expect(progress.completedItems).toBe(3);
        expect(progress.totalItems).toBe(3);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 15));
    }
    expect(sawLiveItem).toBe(true);
    const result = await fetch(`${workerBaseUrl}/api/spotify/result/${started.job_id}`);
    expect(result.headers.get("content-type")).toContain("application/zip");
    expect((await result.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });
});
