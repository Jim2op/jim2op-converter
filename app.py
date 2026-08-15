import io
import os
import shutil
import tempfile
import threading
import time
import uuid
from pathlib import Path
from flask import Flask, jsonify, request, send_file, send_from_directory, flash, get_flashed_messages
from PIL import Image, ImageSequence
import imageio_ffmpeg

# Simple Flask web app for image conversion

APP_DIR = Path(__file__).parent
OUT_DIR = APP_DIR / "OUT"
OUT_DIR.mkdir(exist_ok=True)

VIDEO_EXT = {'.mp4', '.mov', '.avi', '.mkv', '.webm'}
ALLOWED_EXT = {'.png', '.jpg', '.jpeg', '.bmp', '.gif', '.tiff', '.webp', '.avif'} | VIDEO_EXT
SUPPORTED_FORMATS = ['PNG', 'JPEG', 'WEBP', 'BMP', 'TIFF', 'GIF', 'AVIF']
MODES = ['RGBA', 'L', 'CMYK', 'P']
# Audio output formats supported for video -> audio extraction
AUDIO_FORMATS = {'MP3', 'WAV', 'OGG', 'M4A'}
VIDEO_QUALITY_CHOICES = ('1080', '720', '480', '360')
AUDIO_QUALITY_CHOICES = ('320', '256', '192', '128', '96')
YOUTUBE_JOBS = {}
YOUTUBE_JOBS_LOCK = threading.Lock()

app = Flask(__name__)
app.secret_key = os.environ.get('FLASK_SECRET', 'dev-secret')


def _detect_browser_for_ytdlp():
    """Return the first local browser profile yt-dlp can read."""
    candidates = (
        ('chrome', os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Google', 'Chrome', 'User Data')),
        ('edge', os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Microsoft', 'Edge', 'User Data')),
        ('firefox', os.path.join(os.environ.get('APPDATA', ''), 'Mozilla', 'Firefox', 'Profiles')),
    )
    for browser, profile_path in candidates:
        if profile_path and os.path.isdir(profile_path):
            return (browser,)
    return None


def _build_ytdlp_auth_options():
    """Build yt-dlp authentication options without exposing cookie contents."""
    cookies_path = os.environ.get('YT_COOKIES_FILE') or os.environ.get('YTDLP_COOKIES')
    if not cookies_path:
        cookies_path = os.path.join(str(APP_DIR), 'cookies', 'cookies.txt')
    if cookies_path and os.path.isfile(cookies_path):
        return {'cookiefile': cookies_path}
    if not os.environ.get('YT_COOKIES_FILE') and not os.environ.get('YTDLP_COOKIES'):
        requested_browser = os.environ.get('YT_BROWSER', '').strip().lower()
        if requested_browser in {'chrome', 'edge', 'firefox', 'chromium', 'brave', 'opera', 'vivaldi'}:
            return {'cookiesfrombrowser': (requested_browser,)}
        browser = _detect_browser_for_ytdlp()
        if browser:
            return {'cookiesfrombrowser': browser}
    return {}


def _build_ytdlp_ffmpeg_options():
    """Point yt-dlp at the ffmpeg binary bundled by imageio-ffmpeg."""
    return {'ffmpeg_location': imageio_ffmpeg.get_ffmpeg_exe()}


def _youtube_quality_choices(output_format: str) -> tuple[str, ...]:
    return VIDEO_QUALITY_CHOICES if output_format.upper() == 'MP4' else AUDIO_QUALITY_CHOICES


def _youtube_quality_options(output_format: str, quality: str) -> dict:
    output_format = output_format.upper()
    choices = _youtube_quality_choices(output_format)
    if output_format not in {'MP4', *AUDIO_FORMATS} or quality not in choices:
        raise ValueError('Unsupported YouTube quality')
    if output_format == 'MP4':
        return {
            'format': f'bestvideo[height<={quality}]+bestaudio/best[height<={quality}]',
            'merge_output_format': 'mp4',
        }
    return {
        'format': 'bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': output_format.lower(),
            'preferredquality': quality,
        }],
    }


def _update_youtube_progress(job: dict, event: dict):
    status = event.get('status')
    if status == 'downloading':
        job['state'] = 'downloading'
    elif status == 'finished':
        job['state'] = 'processing'

    percent = str(event.get('_percent_str', '')).strip().rstrip('%')
    try:
        job['progress'] = max(0.0, min(100.0, float(percent)))
    except ValueError:
        pass

    job['speed'] = event.get('_speed_str') or job.get('speed')
    job['eta'] = event.get('_eta_str') or job.get('eta')


def _youtube_job_public_state(job: dict) -> dict:
    elapsed = max(0, int(time.time() - job['started_at']))
    return {
        'state': job['state'],
        'progress': job['progress'],
        'speed': job.get('speed'),
        'eta': job.get('eta'),
        'elapsed': elapsed,
        'error': job.get('error'),
    }


def _set_youtube_job(job_id: str, **updates):
    with YOUTUBE_JOBS_LOCK:
        job = YOUTUBE_JOBS.get(job_id)
        if job:
            job.update(updates)


def _run_youtube_job(job_id: str, youtube_url: str, output_format: str, quality: str):
    job = YOUTUBE_JOBS[job_id]
    try:
        ytdlp = None
        try:
            import yt_dlp as ytdlp
        except Exception:
            try:
                import youtube_dl as ytdlp
            except Exception:
                ytdlp = None
        if ytdlp is None:
            raise RuntimeError('YouTube downloads require yt-dlp or youtube_dl. Please install one of them and try again.')

        with tempfile.TemporaryDirectory() as tmpdir:
            ydl_opts = {
                'outtmpl': os.path.join(tmpdir, '%(id)s.%(ext)s'),
                'quiet': True,
                'progress_hooks': [lambda event: _update_youtube_progress(job, event)],
                **_build_ytdlp_ffmpeg_options(),
                **_youtube_quality_options(output_format, quality),
                **_build_ytdlp_auth_options(),
            }
            with ytdlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(youtube_url, download=True)

            files = list(Path(tmpdir).glob('*'))
            if not files:
                raise RuntimeError('Download failed (no output file)')
            downloaded = files[0]
            suffix = downloaded.suffix or ('.mp4' if output_format == 'MP4' else f'.{output_format.lower()}')
            result_fd, result_path = tempfile.mkstemp(suffix=suffix)
            os.close(result_fd)
            shutil.copyfile(downloaded, result_path)
            title = (info.get('title') or 'youtube').replace('/', '_').replace('\\', '_')
            extension = 'mp4' if output_format == 'MP4' else output_format.lower()
            mimetype = 'video/mp4' if output_format == 'MP4' else {
                'MP3': 'audio/mpeg',
                'WAV': 'audio/wav',
                'OGG': 'audio/ogg',
                'M4A': 'audio/mp4',
            }[output_format]
            _set_youtube_job(
                job_id,
                state='completed',
                progress=100.0,
                result_path=result_path,
                download_name=f'{title}.{extension}',
                mimetype=mimetype,
            )
    except Exception as error:
        cookies_path = os.environ.get('YT_COOKIES_FILE') or os.environ.get('YTDLP_COOKIES')
        auth_options = _build_ytdlp_auth_options()
        guidance = _youtube_auth_guidance(cookies_path, auth_options)
        _set_youtube_job(job_id, state='failed', error=f'{error}. {guidance}')


def _youtube_auth_guidance(cookies_path: str | None, auth_options: dict) -> str:
    """Return safe setup guidance for YouTube authentication failures."""
    if cookies_path and 'cookiefile' not in auth_options:
        configuration = (
            "The configured cookie file was not found on the server; mount a fresh cookies.txt "
            "file into the server or container and set YT_COOKIES_FILE to its absolute path."
        )
    elif 'cookiefile' not in auth_options:
        configuration = (
            "For a hosted server, export a fresh cookies.txt file from an authenticated YouTube "
            "session, mount it into the server or container, and set YT_COOKIES_FILE to its absolute path."
        )
    else:
        configuration = (
            "The server cookie file may be expired; export a fresh cookies.txt file from an authenticated "
            "YouTube session and replace the mounted server or container secret."
        )
    return (
        f"{configuration} See "
        "https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp."
    )


def _youtube_format_options(output_format: str) -> dict:
    """Build yt-dlp format options that tolerate codec/container differences."""
    output_format = output_format.upper()
    if output_format in AUDIO_FORMATS:
        return {
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': output_format.lower(),
                'preferredquality': '192',
            }],
        }
    if output_format == 'MP4':
        return {
            'format': 'bestvideo+bestaudio/best',
            'merge_output_format': 'mp4',
        }
    return {}


def _has_alpha(img: Image.Image) -> bool:
    try:
        bands = img.getbands()
        return 'A' in bands or 'a' in bands
    except Exception:
        return img.mode in ('RGBA', 'LA') or ('transparency' in img.info)


def _choose_mode_auto(fmt: str, img: Image.Image) -> str:
    fmt_up = fmt.upper()
    has_alpha = _has_alpha(img)
    if fmt_up == 'JPEG':
        return 'RGB'
    if fmt_up in ('PNG', 'WEBP', 'AVIF'):
        return 'RGBA' if has_alpha else 'RGB'
    if fmt_up == 'GIF':
        return 'P'
    if fmt_up in ('BMP', 'TIFF'):
        return img.mode if img.mode not in ('P', '1') else 'RGB'
    return 'RGB'


@app.route('/', methods=['GET'])
@app.route('/image', methods=['GET'])
@app.route('/video', methods=['GET'])
@app.route('/youtube', methods=['GET'])
def frontend_app():
    """Serve one static shell; routing and view rendering live in app.js."""
    return send_from_directory(app.static_folder, 'index.html')


@app.route('/api/config', methods=['GET'])
def app_config():
    """Expose UI options without embedding Python values in frontend markup."""
    return jsonify({
        'image_formats': SUPPORTED_FORMATS,
        'video_outputs': ['GIF', *sorted(AUDIO_FORMATS)],
        'youtube_video_qualities': VIDEO_QUALITY_CHOICES,
        'youtube_audio_qualities': AUDIO_QUALITY_CHOICES,
    })


@app.route('/api/youtube/download', methods=['POST'])
@app.route('/youtube/download', methods=['POST'])  # Backward-compatible API alias.
def youtube_download():
    youtube_url = (request.form.get('youtube_url') or '').strip()
    output_format = (request.form.get('format') or 'MP4').upper()
    default_quality = '720' if output_format == 'MP4' else '192'
    quality = (request.form.get('quality') or default_quality).strip()

    if not youtube_url:
        return jsonify({'error': 'YouTube URL is required'}), 400
    try:
        _youtube_quality_options(output_format, quality)
    except ValueError as error:
        return jsonify({'error': str(error)}), 400

    job_id = uuid.uuid4().hex
    with YOUTUBE_JOBS_LOCK:
        YOUTUBE_JOBS[job_id] = {
            'state': 'queued',
            'progress': 0.0,
            'speed': None,
            'eta': None,
            'started_at': time.time(),
            'error': None,
            'result_path': None,
            'download_name': None,
            'mimetype': None,
        }
    worker = threading.Thread(
        target=_run_youtube_job,
        args=(job_id, youtube_url, output_format, quality),
        daemon=True,
    )
    worker.start()
    return jsonify({'job_id': job_id, 'state': 'queued'}), 202


@app.route('/api/youtube/progress/<job_id>', methods=['GET'])
@app.route('/youtube/progress/<job_id>', methods=['GET'])  # Backward-compatible API alias.
def youtube_progress(job_id: str):
    with YOUTUBE_JOBS_LOCK:
        job = YOUTUBE_JOBS.get(job_id)
        if not job:
            return jsonify({'error': 'Download job not found'}), 404
        return jsonify(_youtube_job_public_state(job))


@app.route('/api/youtube/result/<job_id>', methods=['GET'])
@app.route('/youtube/result/<job_id>', methods=['GET'])  # Backward-compatible API alias.
def youtube_result(job_id: str):
    with YOUTUBE_JOBS_LOCK:
        job = YOUTUBE_JOBS.get(job_id)
        if not job:
            return jsonify({'error': 'Download job not found'}), 404
        if job['state'] != 'completed':
            if job['state'] == 'failed':
                return jsonify({'error': job['error']}), 422
            return jsonify({'error': 'Download is not complete'}), 409
        result_path = job['result_path']
        download_name = job['download_name']
        mimetype = job['mimetype']

    response = send_file(
        result_path,
        mimetype=mimetype,
        as_attachment=True,
        download_name=download_name,
    )

    def cleanup():
        try:
            os.unlink(result_path)
        except FileNotFoundError:
            pass
        with YOUTUBE_JOBS_LOCK:
            YOUTUBE_JOBS.pop(job_id, None)

    response.call_on_close(cleanup)
    return response


def _redirect_source(source: str):
    """Return conversion failures as JSON for the client-side application."""
    messages = get_flashed_messages()
    return jsonify({'error': messages[0] if messages else 'Conversion failed.'}), 400


@app.route('/api/convert', methods=['POST'])
@app.route('/convert', methods=['POST'])  # Backward-compatible API alias.
def convert():
    # Support either an uploaded file or a YouTube URL
    source = request.form.get('source', 'video')
    youtube_url = (request.form.get('youtube_url') or '').strip()
    file = request.files.get('image')

    out_fmt = request.form.get('format', 'PNG')
    preserve_anim = request.form.get('preserve_anim') == 'on'
    quality = 90

    out_fmt_up = out_fmt.upper()

    # If neither a file nor a YouTube URL was provided, complain
    if not youtube_url and (not file or file.filename == ''):
        flash('No file or YouTube URL provided')
        return _redirect_source(source)

    # Handle YouTube URL downloads (server-side) before file-based processing
    if youtube_url:
        ytdlp = None
        try:
            import yt_dlp as ytdlp
        except Exception:
            try:
                import youtube_dl as ytdlp
            except Exception:
                ytdlp = None

        if ytdlp is None:
            flash('YouTube downloads require yt-dlp or youtube_dl. Please install one of them and try again.')
            return _redirect_source(source)

        import tempfile
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                # Configure downloader based on desired output
                ydl_opts = {
                    'outtmpl': os.path.join(tmpdir, '%(id)s.%(ext)s'),
                    'quiet': True,
                    **_build_ytdlp_ffmpeg_options(),
                }

                format_options = _youtube_format_options(out_fmt_up)
                if format_options:
                    ydl_opts.update(format_options)
                else:
                    flash('YouTube conversion currently supports MP4 video or audio outputs (MP3/WAV/OGG/M4A).')
                    return _redirect_source(source)

                auth_options = _build_ytdlp_auth_options()
                ydl_opts.update(auth_options)
                cookies_path = os.environ.get('YT_COOKIES_FILE') or os.environ.get('YTDLP_COOKIES')
                if cookies_path and 'cookiefile' not in auth_options and not os.path.isfile(cookies_path):
                    flash(
                        'Configured YouTube cookie file was not found on the server; '
                        'continuing with an unauthenticated download attempt.'
                    )

                # Attempt download and provide actionable guidance for authentication failures.
                try:
                    with ytdlp.YoutubeDL(ydl_opts) as ydl:
                        info = ydl.extract_info(youtube_url, download=True)
                except Exception as e:
                    errstr = str(e)
                    guidance = _youtube_auth_guidance(cookies_path, auth_options)
                    flash(f'YouTube download failed: {errstr}. {guidance}')
                    return _redirect_source(source)

                # Find the downloaded file in the temp dir
                files = list(Path(tmpdir).glob('*'))
                if not files:
                    flash('Download failed (no output file)')
                    return _redirect_source(source)

                downloaded = files[0]
                out_bytes = io.BytesIO()
                with open(downloaded, 'rb') as f:
                    out_bytes.write(f.read())
                out_bytes.seek(0)

                # Prepare download name
                title = (info.get('title') or 'youtube').replace('/', '_').replace('\\', '_')
                if out_fmt_up in AUDIO_FORMATS:
                    mimemap = {
                        'MP3': 'audio/mpeg',
                        'WAV': 'audio/wav',
                        'OGG': 'audio/ogg',
                        'M4A': 'audio/mp4'
                    }
                    mimetype = mimemap.get(out_fmt_up, 'application/octet-stream')
                    return send_file(out_bytes, mimetype=mimetype, as_attachment=True, download_name=f"{title}.{out_fmt_up.lower()}")
                elif out_fmt_up == 'MP4':
                    return send_file(out_bytes, mimetype='video/mp4', as_attachment=True, download_name=f"{title}.mp4")
        finally:
            pass

    # From here on, handle uploaded files (images or videos)
    if not file:
        flash('No file uploaded')
        return _redirect_source(source)

    if file.filename == '':
        flash('No selected file')
        return _redirect_source(source)

    name = file.filename
    ext = Path(name).suffix.lower()
    if ext not in ALLOWED_EXT:
        flash('Unsupported file extension')
        return _redirect_source(source)

    base_name = Path(name).stem
    out_ext = out_fmt_up.lower()
    out_filename = f"{base_name}.{out_ext}"
    out_bytes = io.BytesIO()

    # Handle video inputs first, before treating the upload as an image
    if ext in VIDEO_EXT:
        import tempfile
        try:
            from moviepy.video.io.VideoFileClip import VideoFileClip
        except ImportError:
            try:
                from moviepy.editor import VideoFileClip
            except ImportError as e:
                flash('Video conversion requires moviepy. Please install it and try again.')
                return _redirect_source(source)

        # Save uploaded stream to a temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as vtmp:
            tmp_video_path = vtmp.name
            file.stream.seek(0)
            vtmp.write(file.stream.read())

        try:
            clip = VideoFileClip(tmp_video_path)

            # If the user requested an audio output, extract audio
            if out_fmt_up in AUDIO_FORMATS:
                if not clip.audio:
                    flash('No audio track found in the uploaded video')
                    return _redirect_source(source)

                tmp_audio = tempfile.NamedTemporaryFile(delete=False, suffix='.' + out_fmt_up.lower())
                tmp_audio_path = tmp_audio.name
                tmp_audio.close()

                try:
                    # let moviepy pick codec based on extension
                    clip.audio.write_audiofile(tmp_audio_path)
                    with open(tmp_audio_path, 'rb') as f:
                        out_bytes.write(f.read())
                    out_bytes.seek(0)

                    mimemap = {
                        'MP3': 'audio/mpeg',
                        'WAV': 'audio/wav',
                        'OGG': 'audio/ogg',
                        'M4A': 'audio/mp4'
                    }
                    mimetype = mimemap.get(out_fmt_up, 'application/octet-stream')
                    return send_file(out_bytes, mimetype=mimetype, as_attachment=True, download_name=out_filename)
                except Exception as e:
                    flash(f'Audio extraction failed: {e}')
                    return _redirect_source(source)
                finally:
                    try:
                        os.remove(tmp_audio_path)
                    except Exception:
                        pass

            # Otherwise, support GIF conversion (existing behavior)
            if out_fmt_up == 'GIF':
                tmp_gif = tempfile.NamedTemporaryFile(delete=False, suffix='.gif')
                tmp_gif_path = tmp_gif.name
                tmp_gif.close()

                try:
                    # MoviePy 2 removed the legacy `program` keyword; it now selects ffmpeg internally.
                    clip.write_gif(tmp_gif_path, fps=min(15, clip.fps or 15), logger=None)
                    with open(tmp_gif_path, 'rb') as f:
                        out_bytes.write(f.read())
                    out_bytes.seek(0)
                    try:
                        clip.reader.close()
                    except Exception:
                        pass
                    try:
                        if clip.audio:
                            clip.audio.reader.close_proc()
                    except Exception:
                        pass

                    mimetype = 'image/gif'
                    return send_file(out_bytes, mimetype=mimetype, as_attachment=True, download_name=out_filename)
                except Exception as e:
                    flash(f'Video conversion failed: {e}')
                    return _redirect_source(source)
                finally:
                    try:
                        os.remove(tmp_gif_path)
                    except Exception:
                        pass

            flash('Video input can only be converted to GIF or extracted as audio (MP3/WAV/OGG/M4A)')
            return _redirect_source(source)
        finally:
            try:
                os.remove(tmp_video_path)
            except Exception:
                pass

    # Read image into Pillow
    try:
        file.stream.seek(0)
        img = Image.open(file.stream)
    except Exception as e:
        flash(f'Error opening image: {e}')
        return _redirect_source(source)

    # Determine desired mode automatically
    desired_mode = _choose_mode_auto(out_fmt_up, img)

    # Filename for download
    base_name = Path(name).stem
    out_ext = out_fmt_up.lower()
    out_filename = f"{base_name}.{out_ext}"

    # Animated handling
    is_animated = getattr(img, 'is_animated', False) or getattr(img, 'n_frames', 1) > 1
    # AVIF animation support may not be reliable in all Pillow builds/plugins; keep False for now
    animated_supported = out_fmt_up in ('GIF', 'WEBP', 'TIFF')

    out_bytes = io.BytesIO()

    save_params = {}
    if out_fmt_up in ('JPEG', 'WEBP', 'AVIF'):
        save_params['quality'] = quality

    try:
        if is_animated and preserve_anim and animated_supported:
            # process frames
            frames = []
            for frame in ImageSequence.Iterator(img):
                f = frame.convert('RGBA') if desired_mode == 'P' and frame.mode != 'RGBA' else frame.copy()
                if desired_mode == 'P':
                    f = f.convert('RGBA') if f.mode != 'RGBA' else f
                    f = f.convert('P', palette=Image.ADAPTIVE)
                elif desired_mode and desired_mode != f.mode:
                    f = f.convert(desired_mode)
                frames.append(f)

            first, rest = frames[0], frames[1:] if len(frames) > 1 else []

            save_kwargs = dict(save_params)
            save_kwargs.update({'save_all': True, 'append_images': rest, 'loop': img.info.get('loop', 0), 'duration': img.info.get('duration', 100)})

            if out_fmt_up == 'GIF' and first.mode != 'P':
                first = first.convert('P', palette=Image.ADAPTIVE)

            first.save(out_bytes, format=out_fmt_up, **save_kwargs)
        else:
            # single-frame
            save_img = img
            if desired_mode == 'P':
                save_img = img.convert('RGBA') if img.mode != 'RGBA' else img
                save_img = save_img.convert('P', palette=Image.ADAPTIVE)
            elif desired_mode and desired_mode != img.mode:
                save_img = img.convert(desired_mode)

            if out_fmt_up == 'JPEG' and save_img.mode in ('RGBA', 'LA'):
                save_img = save_img.convert('RGB')

            save_img.save(out_bytes, format=out_fmt_up, **save_params)

        out_bytes.seek(0)
        # Derive mimetype
        mimetype = f'image/{out_fmt_up.lower() if out_fmt_up != "JPEG" else "jpeg"}'
        return send_file(out_bytes, mimetype=mimetype, as_attachment=True, download_name=out_filename)

    except Exception as e:
        flash(f'Conversion failed: {e}')
        return _redirect_source(source)


if __name__ == '__main__':
    # Run locally for testing; in production use a WSGI server
    app.run(host='0.0.0.0', port=5000, debug=True)
