(() => {
  'use strict';

  const app = document.getElementById('app');
  const state = {
    config: {
      image_formats: ['PNG', 'JPEG', 'WEBP', 'BMP', 'TIFF', 'GIF', 'AVIF'],
      video_outputs: ['GIF', 'M4A', 'MP3', 'OGG', 'WAV'],
      youtube_video_qualities: ['1080', '720', '480', '360'],
      youtube_audio_qualities: ['320', '256', '192', '128', '96'],
    },
  };

  const icons = {
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="8.5" cy="9" r="1.5"></circle><path d="m4 17 5-5 4 4 2-2 5 3"></path></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m10 9 5 3-5 3V9Z"></path></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"></path></svg>',
  };

  const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);

  const optionList = (options, selected = '') => options.map((option) => (
    `<option value="${escapeHtml(option)}" ${option === selected ? 'selected' : ''}>${escapeHtml(option)}</option>`
  )).join('');

  const formatLabel = (format) => {
    const labels = { GIF: 'GIF (animated)', MP3: 'MP3 (audio)', WAV: 'WAV (audio)', OGG: 'OGG (audio)', M4A: 'M4A (audio)', MP4: 'MP4 (video)' };
    return labels[format] || format;
  };

  const toolCard = (path, type, title, description, accent, linkLabel) => `
    <a class="tool-card" href="${path}" data-route style="--card-accent: var(--${accent});">
      <span class="tool-icon">${icons[type]}</span>
      <h2>${title}</h2>
      <p>${description}</p>
      <span class="tool-link">${linkLabel} <span aria-hidden="true">→</span></span>
    </a>`;

  const homeView = () => `
    <section class="hero container">
      <p class="eyebrow">One workspace · three tools</p>
      <h1>Convert files with <span>less friction.</span></h1>
      <p class="hero-copy">Choose a tool, set the output you need, and download the result. No crowded controls or unnecessary steps.</p>
    </section>
    <section class="tool-grid container" aria-label="Conversion tools">
      ${toolCard('/image', 'image', 'Image converter', 'Convert common image formats and preserve animation where supported.', 'accent', 'Convert images')}
      ${toolCard('/video', 'video', 'Video &amp; audio', 'Turn video into a GIF, or extract its audio track in the format you prefer.', 'success', 'Convert media')}
      ${toolCard('/youtube', 'video', 'YouTube downloader', 'Download a public video or audio track with visible conversion progress.', 'danger', 'Open YouTube tool')}
    </section>`;

  const previewPlaceholder = (icon, label) => `
    <div class="preview-placeholder" id="previewPlaceholder">
      ${icons[icon]}
      <span>${label}</span>
    </div>`;

  const imageView = () => `
    <section class="page-shell container" style="--page-accent-color: var(--accent);">
      <div class="page-heading">
        <div><p class="eyebrow">Image tool</p><h1>Convert your images.</h1></div>
        <p>Choose your files, select an output format, and download the converted image when it is ready.</p>
      </div>
      <div class="workspace">
        <section class="panel" aria-labelledby="image-form-title"><div class="panel-body">
          <p class="panel-kicker">Upload and convert</p><h2 class="panel-title" id="image-form-title">Set up your image conversion</h2>
          <form id="imageForm" class="api-form" enctype="multipart/form-data">
            <input type="hidden" name="source" value="image">
            <div class="field"><label for="imageInput">Choose image files</label>
              <input class="input" type="file" name="image" id="imageInput" accept="image/*" multiple required>
              <span class="field-help">You can select more than one image. The first selection appears in the preview.</span>
            </div>
            <div class="field-row"><div class="field"><label for="formatSelect">Output format</label>
              <select class="select" name="format" id="formatSelect">${optionList(state.config.image_formats, 'PNG')}</select>
            </div></div>
            <label class="switch-row" for="preserveAnim"><input type="checkbox" id="preserveAnim" name="preserve_anim" checked>
              <span>Preserve animation when the selected format supports it</span></label>
            <div class="actions"><button class="button" type="submit">${icons.download} Convert &amp; download</button>
              <button class="button button-secondary" type="button" id="resetBtn">Reset</button></div>
            <p class="error-message" id="formError" role="alert" hidden></p>
          </form>
          <p class="panel-note">Supported formats: ${state.config.image_formats.map(escapeHtml).join(', ')}. Auto mode chooses a compatible color mode for the image and output format.</p>
        </div></section>
        <aside class="panel preview-panel" aria-labelledby="image-preview-title"><div class="panel-body">
          <div class="preview-label"><span id="image-preview-title">Preview</span><span>First file</span></div>
          <div class="preview-frame"><img id="previewImage" src="" alt="Selected image preview" hidden>${previewPlaceholder('image', 'Select an image to see it here.')}</div>
          <p class="file-meta" id="selectedCount" aria-live="polite"></p>
        </div></aside>
      </div>
    </section>`;

  const videoView = () => `
    <section class="page-shell container" style="--page-accent-color: var(--success);">
      <div class="page-heading">
        <div><p class="eyebrow">Video &amp; audio tool</p><h1>Move from video to sound.</h1></div>
        <p>Transform a local video into an animated GIF or extract the audio track in the format you need.</p>
      </div>
      <div class="workspace">
        <section class="panel" aria-labelledby="video-form-title"><div class="panel-body">
          <p class="panel-kicker">Upload and convert</p><h2 class="panel-title" id="video-form-title">Set up your media conversion</h2>
          <form id="videoForm" class="api-form" enctype="multipart/form-data">
            <input type="hidden" name="source" value="video">
            <div class="field"><label for="videoInput">Choose a video file</label>
              <input class="input" type="file" name="image" id="videoInput" accept="video/*" required>
              <span class="field-help">Accepted formats include MP4, MOV, AVI, MKV, and WEBM.</span>
            </div>
            <div class="field-row"><div class="field"><label for="formatSelect">Output type</label>
              <select class="select" name="format" id="formatSelect">${state.config.video_outputs.map((format) => `<option value="${format}">${formatLabel(format)}</option>`).join('')}</select>
            </div></div>
            <label class="switch-row" for="preserveAnim"><input type="checkbox" id="preserveAnim" name="preserve_anim" checked>
              <span>Preserve animation settings when creating a GIF</span></label>
            <div class="actions"><button class="button" type="submit">${icons.download} Convert &amp; download</button>
              <button class="button button-secondary" type="button" id="resetBtn">Reset</button></div>
            <p class="error-message" id="formError" role="alert" hidden></p>
          </form>
          <p class="panel-note">GIF output can be larger than the original file. Audio output preserves the sound track and omits the video.</p>
        </div></section>
        <aside class="panel preview-panel" aria-labelledby="video-preview-title"><div class="panel-body">
          <div class="preview-label"><span id="video-preview-title">Preview</span><span>Selected video</span></div>
          <div class="preview-frame"><video id="previewVideo" controls playsinline hidden></video>${previewPlaceholder('video', 'Select a video to preview it here.')}</div>
          <p class="file-meta" id="selectedFile" aria-live="polite"></p>
        </div></aside>
      </div>
    </section>`;

  const youtubeView = () => `
    <section class="page-shell container" style="--page-accent-color: var(--danger);">
      <div class="page-heading">
        <div><p class="eyebrow">YouTube tool</p><h1>Download with clarity.</h1></div>
        <p>Paste a public YouTube link, select an output and quality, then follow the conversion as it happens.</p>
      </div>
      <div class="workspace">
        <section class="panel" aria-labelledby="youtube-form-title"><div class="panel-body">
          <p class="panel-kicker">Link and convert</p><h2 class="panel-title" id="youtube-form-title">Set up your download</h2>
          <form id="youtubeForm">
            <input type="hidden" name="source" value="youtube">
            <div class="field"><label for="youtubeUrlInput">YouTube video URL</label>
              <input class="input" type="url" name="youtube_url" id="youtubeUrlInput" placeholder="https://www.youtube.com/watch?v=..." required>
              <span class="field-help">The link is used only to retrieve the video you choose.</span>
            </div>
            <div class="field-row">
              <div class="field"><label for="formatSelect">Output type</label>
                <select class="select" name="format" id="formatSelect"><option value="MP4">MP4 (video)</option>${state.config.video_outputs.filter((format) => format !== 'GIF').map((format) => `<option value="${format}">${formatLabel(format)}</option>`).join('')}</select>
              </div>
              <div class="field"><label for="qualitySelect" id="qualityLabel">Video quality</label>
                <select class="select" name="quality" id="qualitySelect"></select>
              </div>
            </div>
            <div class="actions"><button class="button" type="submit" id="downloadBtn">${icons.download} Convert &amp; download</button>
              <button class="button button-secondary" type="button" id="resetBtn">Reset</button></div>
            <p class="error-message" id="formError" role="alert" hidden></p>
          </form>
          <div class="progress-card" id="downloadProgress" hidden>
            <div class="progress-heading"><strong>Download progress</strong><span id="downloadState" role="status">Queued</span></div>
            <div class="progress-track" role="progressbar" aria-label="YouTube download progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="progress-bar" id="downloadProgressBar"></div></div>
            <p class="progress-stats" id="downloadStats"></p>
          </div>
          <p class="panel-note">Video quality controls resolution. Audio quality controls bitrate after extracting the audio track.</p>
        </div></section>
        <aside class="panel preview-panel" aria-labelledby="youtube-preview-title"><div class="panel-body">
          <div class="preview-label"><span id="youtube-preview-title">Preview</span><span>Video thumbnail</span></div>
          <div class="preview-frame"><img id="previewThumb" src="" alt="YouTube video thumbnail" hidden>${previewPlaceholder('video', 'Paste a YouTube link to show the video thumbnail.')}</div>
          <p class="file-meta">A thumbnail may not be available for every URL.</p>
        </div></aside>
      </div>
    </section>`;

  const pageForPath = (path) => ({ '/image': 'image', '/video': 'video', '/youtube': 'youtube' }[path] || 'home');

  const updateNavigation = (view) => {
    document.querySelectorAll('[data-view]').forEach((link) => link.classList.toggle('is-active', link.dataset.view === view));
  };

  const render = () => {
    const view = pageForPath(window.location.pathname);
    const accents = { home: 'var(--accent)', image: 'var(--accent)', video: 'var(--success)', youtube: 'var(--danger)' };
    // The root token colours shared navigation as well as the newly rendered view.
    document.body.style.setProperty('--page-accent-color', accents[view]);
    document.title = ({ home: 'Converter — File conversion made simple', image: 'Image converter — Converter', video: 'Video & audio converter — Converter', youtube: 'YouTube downloader — Converter' })[view];
    app.innerHTML = ({ home: homeView, image: imageView, video: videoView, youtube: youtubeView })[view]();
    updateNavigation(view);
    ({ image: bindImageView, video: bindVideoView, youtube: bindYoutubeView }[view] || (() => {}))();
  };

  // Preserve the filename suggested by Python when saving a fetch response as a browser download.
  const downloadResponse = async (response, fallbackName) => {
    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') || '';
    const filenameMatch = disposition.match(/filename\*?=(?:UTF-8''|\")?([^;\"]+)/i);
    const name = filenameMatch ? decodeURIComponent(filenameMatch[1].replace(/\"/g, '')) : fallbackName;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const apiError = async (response) => {
    try {
      const payload = await response.json();
      return payload.error || 'The conversion could not be completed.';
    } catch (_) {
      return 'The conversion could not be completed.';
    }
  };

  const submitConversion = async (form, button, errorElement) => {
    errorElement.hidden = true;
    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = 'Converting…';
    try {
      const response = await fetch('/api/convert', { method: 'POST', body: new FormData(form) });
      if (!response.ok) throw new Error(await apiError(response));
      await downloadResponse(response, 'converted-file');
    } catch (error) {
      errorElement.textContent = error.message;
      errorElement.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = originalText;
      button.prepend(document.createRange().createContextualFragment(icons.download));
    }
  };

  const bindImageView = () => {
    const form = document.getElementById('imageForm');
    const input = document.getElementById('imageInput');
    const image = document.getElementById('previewImage');
    const placeholder = document.getElementById('previewPlaceholder');
    const count = document.getElementById('selectedCount');
    const reset = document.getElementById('resetBtn');
    const error = document.getElementById('formError');
    const submit = form.querySelector('[type="submit"]');
    let previewUrl = null;

    const clearPreview = () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = null;
      image.removeAttribute('src');
      image.hidden = true;
      placeholder.hidden = false;
      count.textContent = '';
    };

    input.addEventListener('change', () => {
      const [file] = input.files;
      clearPreview();
      if (!file) return;
      previewUrl = URL.createObjectURL(file);
      image.src = previewUrl;
      image.hidden = false;
      placeholder.hidden = true;
      count.textContent = `${input.files.length} file${input.files.length === 1 ? '' : 's'} selected · ${file.name}`;
    });
    form.addEventListener('submit', (event) => { event.preventDefault(); submitConversion(form, submit, error); });
    reset.addEventListener('click', () => { form.reset(); clearPreview(); error.hidden = true; });
  };

  const bindVideoView = () => {
    const form = document.getElementById('videoForm');
    const input = document.getElementById('videoInput');
    const video = document.getElementById('previewVideo');
    const placeholder = document.getElementById('previewPlaceholder');
    const metadata = document.getElementById('selectedFile');
    const reset = document.getElementById('resetBtn');
    const error = document.getElementById('formError');
    const submit = form.querySelector('[type="submit"]');
    let previewUrl = null;

    // Object URLs provide an instant local preview before the video reaches Python.
    const clearPreview = () => {
      video.pause();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = null;
      video.removeAttribute('src');
      video.hidden = true;
      placeholder.hidden = false;
      metadata.textContent = '';
    };

    input.addEventListener('change', () => {
      const [file] = input.files;
      clearPreview();
      if (!file) return;
      previewUrl = URL.createObjectURL(file);
      video.src = previewUrl;
      video.hidden = false;
      placeholder.hidden = true;
      video.load();
      metadata.textContent = `${file.name} · ${(file.size / (1024 * 1024)).toFixed(1)} MB`;
    });
    form.addEventListener('submit', (event) => { event.preventDefault(); submitConversion(form, submit, error); });
    reset.addEventListener('click', () => { form.reset(); clearPreview(); error.hidden = true; });
  };

  const bindYoutubeView = () => {
    const form = document.getElementById('youtubeForm');
    const urlInput = document.getElementById('youtubeUrlInput');
    const format = document.getElementById('formatSelect');
    const quality = document.getElementById('qualitySelect');
    const qualityLabel = document.getElementById('qualityLabel');
    const thumbnail = document.getElementById('previewThumb');
    const placeholder = document.getElementById('previewPlaceholder');
    const button = document.getElementById('downloadBtn');
    const reset = document.getElementById('resetBtn');
    const error = document.getElementById('formError');
    const progress = document.getElementById('downloadProgress');
    const progressBar = document.getElementById('downloadProgressBar');
    const progressTrack = progressBar.parentElement;
    const status = document.getElementById('downloadState');
    const stats = document.getElementById('downloadStats');
    let activeJobId = null;
    let pollTimer = null;

    const updateQualityOptions = () => {
      const isVideo = format.value === 'MP4';
      const values = isVideo ? state.config.youtube_video_qualities : state.config.youtube_audio_qualities;
      const defaultValue = isVideo ? '720' : '192';
      qualityLabel.textContent = isVideo ? 'Video quality' : 'Audio quality';
      quality.innerHTML = values.map((value) => `<option value="${value}" ${value === defaultValue ? 'selected' : ''}>${value}${isVideo ? 'p' : ' kbps'}</option>`).join('');
    };

    const setProgress = (value, label, detail) => {
      const percent = Math.max(0, Math.min(100, Number(value) || 0));
      progressBar.style.width = `${percent}%`;
      progressTrack.setAttribute('aria-valuenow', String(percent));
      status.textContent = label;
      stats.textContent = detail;
    };

    const stopPolling = () => { if (pollTimer) window.clearTimeout(pollTimer); pollTimer = null; };

    // Poll the background Python job and request its result only once processing succeeds.
    const pollDownload = async (jobId) => {
      try {
        const response = await fetch(`/api/youtube/progress/${jobId}`);
        const job = await response.json();
        if (!response.ok) throw new Error(job.error || 'Unable to read download status.');
        const detail = [`Elapsed ${Math.floor(job.elapsed / 60)}m ${job.elapsed % 60}s`, job.speed, job.eta ? `ETA ${job.eta}` : ''].filter(Boolean).join(' · ');
        setProgress(job.progress, job.state, detail);
        if (job.state === 'completed') {
          activeJobId = null;
          window.location.assign(`/api/youtube/result/${jobId}`);
          return;
        }
        if (job.state === 'failed') throw new Error(job.error || 'Download failed.');
        pollTimer = window.setTimeout(() => pollDownload(jobId), 500);
      } catch (requestError) {
        error.textContent = requestError.message;
        error.hidden = false;
        button.disabled = false;
        activeJobId = null;
      }
    };

    const updateThumbnail = () => {
      let videoId = null;
      try {
        const parsed = new URL(urlInput.value.trim());
        if (parsed.hostname === 'youtu.be') videoId = parsed.pathname.slice(1);
        else if (parsed.hostname.endsWith('youtube.com')) videoId = parsed.searchParams.get('v');
      } catch (_) { videoId = null; }
      if (!videoId) {
        thumbnail.removeAttribute('src');
        thumbnail.hidden = true;
        placeholder.hidden = false;
        return;
      }
      thumbnail.src = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      thumbnail.onerror = () => { thumbnail.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`; };
      thumbnail.hidden = false;
      placeholder.hidden = true;
    };

    format.addEventListener('change', updateQualityOptions);
    urlInput.addEventListener('input', updateThumbnail);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (activeJobId) return;
      stopPolling();
      error.hidden = true;
      progress.hidden = false;
      button.disabled = true;
      setProgress(0, 'Starting', 'Preparing your conversion…');
      try {
        const response = await fetch('/api/youtube/download', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(new FormData(form)) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Unable to start download.');
        activeJobId = payload.job_id;
        pollDownload(activeJobId);
      } catch (requestError) {
        error.textContent = requestError.message;
        error.hidden = false;
        button.disabled = false;
      }
    });
    reset.addEventListener('click', () => {
      if (activeJobId) return;
      form.reset();
      updateQualityOptions();
      updateThumbnail();
      stopPolling();
      progress.hidden = true;
      error.hidden = true;
      setProgress(0, 'Queued', '');
    });
    updateQualityOptions();
  };

  const bindRouting = () => {
    document.addEventListener('click', (event) => {
      const link = event.target.closest('[data-route]');
      if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = new URL(link.href, window.location.origin);
      if (target.origin !== window.location.origin) return;
      event.preventDefault();
      window.history.pushState({}, '', target.pathname);
      render();
    });
    window.addEventListener('popstate', render);
  };

  const bindThemeMenu = () => {
    const button = document.getElementById('themeMenuButton');
    const menu = document.getElementById('themeMenu');
    if (!button || !menu) return;
    const close = () => { menu.classList.remove('is-open'); button.setAttribute('aria-expanded', 'false'); };
    button.addEventListener('click', () => {
      const open = menu.classList.toggle('is-open');
      button.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (event) => { if (!button.contains(event.target) && !menu.contains(event.target)) close(); });
  };

  const loadConfig = async () => {
    try {
      const response = await fetch('/api/config');
      if (response.ok) state.config = await response.json();
    } catch (_) {
      // The embedded defaults keep the static UI usable while the Python service restarts.
    }
  };

  document.addEventListener('DOMContentLoaded', async () => {
    bindRouting();
    bindThemeMenu();
    await loadConfig();
    render();
  });
})();
