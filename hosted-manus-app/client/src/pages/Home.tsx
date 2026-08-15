// Signal Ledger: preserves the legacy image, video/audio, and YouTube tool structure while providing hosted browser-safe image modes.
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronDown,
  FileImage,
  Gauge,
  ImageIcon,
  Info,
  LockKeyhole,
  Maximize2,
  Moon,
  PlayCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Sun,
  Upload,
  Video,
  X,
} from "lucide-react";

type OutputFormat = "PNG" | "JPEG" | "WEBP";
type ConversionState = "idle" | "ready" | "working" | "complete" | "error";
type WorkMode = "convert" | "resize" | "compress";

const OUTPUTS: Record<OutputFormat, { mime: string; extension: string; label: string }> = {
  PNG: { mime: "image/png", extension: "png", label: "PNG · lossless" },
  JPEG: { mime: "image/jpeg", extension: "jpg", label: "JPEG · compact" },
  WEBP: { mime: "image/webp", extension: "webp", label: "WebP · web-ready" },
};

const MODE_COPY: Record<WorkMode, { label: string; helper: string; icon: typeof ArrowRight }> = {
  convert: { label: "Convert", helper: "Change the output format", icon: ArrowRight },
  resize: { label: "Resize", helper: "Set new image dimensions", icon: Maximize2 },
  compress: { label: "Compress", helper: "Reduce output file size", icon: Gauge },
};

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toFixed(exponent ? 1 : 0)} ${units[exponent]}`;
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [format, setFormat] = useState<OutputFormat>("WEBP");
  const [workMode, setWorkMode] = useState<WorkMode>("convert");
  const [state, setState] = useState<ConversionState>("idle");
  const [message, setMessage] = useState("Choose one image to begin.");
  const [isDragging, setIsDragging] = useState(false);
  const [dark, setDark] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [resizeWidth, setResizeWidth] = useState(0);
  const [resizeHeight, setResizeHeight] = useState(0);
  const [keepRatio, setKeepRatio] = useState(true);
  const [compression, setCompression] = useState(78);

  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const selectFile = (candidate?: File) => {
    if (!candidate) return;
    if (!candidate.type.startsWith("image/")) {
      setState("error");
      setMessage("Choose a standard image file to use the hosted converter.");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(candidate);
    const image = new Image();
    image.onload = () => {
      setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
      setResizeWidth(image.naturalWidth);
      setResizeHeight(image.naturalHeight);
    };
    image.src = url;
    setPreviewUrl(url);
    setFile(candidate);
    setState("ready");
    setMessage("Ready on this device. Choose a mode, then make the output.");
  };

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null); setPreviewUrl(null); setState("idle"); setDimensions({ width: 0, height: 0 });
    setMessage("Choose one image to begin.");
    if (inputRef.current) inputRef.current.value = "";
  };

  const updateWidth = (value: number) => {
    const width = Math.max(1, value || 1);
    setResizeWidth(width);
    if (keepRatio && dimensions.width) setResizeHeight(Math.max(1, Math.round(width * dimensions.height / dimensions.width)));
  };

  const updateHeight = (value: number) => {
    const height = Math.max(1, value || 1);
    setResizeHeight(height);
    if (keepRatio && dimensions.height) setResizeWidth(Math.max(1, Math.round(height * dimensions.width / dimensions.height)));
  };

  const convert = () => {
    if (!file || !previewUrl) return;
    setState("working");
    setMessage(`${MODE_COPY[workMode].label} in your browser…`);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const targetWidth = workMode === "resize" ? resizeWidth : image.naturalWidth;
      const targetHeight = workMode === "resize" ? resizeHeight : image.naturalHeight;
      canvas.width = Math.max(1, targetWidth || image.naturalWidth);
      canvas.height = Math.max(1, targetHeight || image.naturalHeight);
      const context = canvas.getContext("2d");
      if (!context) { setState("error"); setMessage("Your browser could not prepare this image."); return; }
      if (format === "JPEG") { context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height); }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const quality = workMode === "compress" ? compression / 100 : 0.92;
      canvas.toBlob((blob) => {
        if (!blob) { setState("error"); setMessage("This output format is not supported by your browser."); return; }
        const filename = file.name.replace(/\.[^/.]+$/, "") || "converted-image";
        const downloadUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = downloadUrl;
        anchor.download = `${filename}.${OUTPUTS[format].extension}`;
        anchor.click();
        URL.revokeObjectURL(downloadUrl);
        setState("complete");
        setMessage(`${MODE_COPY[workMode].label} complete. ${OUTPUTS[format].label} is downloading now.`);
      }, OUTPUTS[format].mime, quality);
    };
    image.onerror = () => { setState("error"); setMessage("This image could not be read in the browser."); };
    image.src = previewUrl;
  };

  const statusIcon = state === "complete" ? <Check /> : state === "working" ? <Sparkles className="animate-pulse" /> : state === "error" ? <Info /> : <ShieldCheck />;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f6f8fc] text-[#122033] dark:bg-[#111827] dark:text-[#edf4ff]">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Converter home"><span className="brand-mark"><img src="/manus-storage/converter-mark_3ad5921c.png" alt="" /><i /></span><span className="brand-word"><b>Converter</b><small>CBR/01</small></span></a>
        <nav className="header-nav" aria-label="Legacy tools"><a className="active" href="#workbench">Image converter</a><a href="#legacy-tools">Video &amp; audio</a><a href="#legacy-tools">YouTube</a></nav>
        <button className="theme-button" onClick={() => setDark((value) => !value)} aria-label="Switch color theme">{dark ? <Sun size={18} /> : <Moon size={18} />}<span>{dark ? "Light" : "Dark"}</span></button>
      </header>

      <main id="top">
        <section className="hero-grid">
          <div className="hero-copy"><p className="eyebrow"><span /> One workspace · three tools</p><h1>Change the format.<br /><em>Keep the file.</em></h1><p className="hero-lede">The familiar converter toolset, now with private browser modes for format conversion, resize, and compression.</p><div className="hero-actions"><a href="#workbench" className="primary-action">Choose an image <ArrowRight size={18} /></a><span className="quiet-proof"><LockKeyhole size={15} /> Private by default</span></div></div>
          <div className="hero-art" aria-hidden="true"><img src="/manus-storage/converter-paper-texture_71b50f0c.png" alt="" /><div className="hero-schematic"><span>01 SOURCE</span><b>PNG</b><i /><span>02 TARGET</span><b>WEBP</b><i /><span>03 OUTPUT</span></div></div>
        </section>

        <section className="proof-strip" aria-label="Privacy assurances"><div><code>01</code><ShieldCheck /><span><strong>Source stays local.</strong> Browser processing only.</span></div><div><code>02</code><FileImage /><span><strong>Target stays explicit.</strong> PNG, JPEG, or WebP.</span></div><div><code>03</code><ArrowDownToLine /><span><strong>Output downloads direct.</strong> No account or queue.</span></div></section>

        <section className="legacy-tools" id="legacy-tools" aria-labelledby="legacy-tools-title">
          <div className="legacy-tools-heading"><p className="eyebrow"><span /> Familiar toolset</p><h2 id="legacy-tools-title">The original modes, clearly mapped.</h2></div>
          <div className="legacy-tool-grid">
            <article className="legacy-card active"><span className="legacy-code">01</span><ImageIcon /><div><b>Image converter</b><p>Convert, resize, and compress browser-readable images.</p></div><span className="hosted-tag">HOSTED</span></article>
            <article className="legacy-card"><span className="legacy-code">02</span><Video /><div><b>Video &amp; audio</b><p>GIF and audio extraction remain in the local converter.</p></div><span className="local-tag">LOCAL ONLY</span></article>
            <article className="legacy-card"><span className="legacy-code">03</span><PlayCircle /><div><b>YouTube downloader</b><p>yt-dlp and private cookies remain in the local converter.</p></div><span className="local-tag">LOCAL ONLY</span></article>
          </div>
        </section>

        <section className="workbench-section" id="workbench">
          <div className="section-heading"><div><p className="eyebrow"><span /> Image workbench</p><h2>Same converter. More image modes.</h2></div><p>Choose a local image, choose a hosted browser mode, and download the result immediately.</p></div>
          <div className="mode-tabs" role="tablist" aria-label="Image modes">{(Object.keys(MODE_COPY) as WorkMode[]).map((mode) => { const Icon = MODE_COPY[mode].icon; return <button key={mode} className={workMode === mode ? "selected" : ""} onClick={() => { setWorkMode(mode); setState(file ? "ready" : "idle"); setMessage(file ? `${MODE_COPY[mode].label} mode is ready on this device.` : "Choose one image to begin."); }} role="tab" aria-selected={workMode === mode}><Icon size={17} /><span><b>{MODE_COPY[mode].label}</b><small>{MODE_COPY[mode].helper}</small></span></button>; })}</div>
          <div className="workbench-grid">
            <div className="convert-panel">
              <div className="step-heading"><span>01</span><div><b>Choose source</b><small>Drop a file or select one</small></div></div>
              <input ref={inputRef} className="sr-only" type="file" accept="image/*" onChange={(event) => selectFile(event.target.files?.[0])} />
              {!file ? <button className={`drop-zone ${isDragging ? "is-dragging" : ""}`} onClick={() => inputRef.current?.click()} onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setIsDragging(false)} onDrop={(event) => { event.preventDefault(); setIsDragging(false); selectFile(event.dataTransfer.files[0]); }}><span className="drop-icon"><Upload size={24} /></span><strong>Drop an image here</strong><small>or choose one from this device</small><span className="browse-link">Browse files</span></button> : <div className="selected-file"><div className="file-preview"><img src={previewUrl || ""} alt="Selected file preview" /></div><div className="file-copy"><span className="file-chip"><ImageIcon size={14} /> {file.type.replace("image/", "").toUpperCase() || "IMAGE"}</span><strong>{file.name}</strong><small>{formatBytes(file.size)} · {dimensions.width} × {dimensions.height} px · ready locally</small></div><button className="icon-button" onClick={reset} aria-label="Remove selected file"><X size={18} /></button></div>}

              <div className="ledger-flow" aria-label="Conversion flow"><div className={file ? "ledger-stage active" : "ledger-stage"}><code>01</code><span>SOURCE</span><b>{file ? file.type.replace("image/", "").toUpperCase() : "IMAGE"}</b></div><i /><div className="ledger-stage active"><code>02</code><span>MODE</span><b>{MODE_COPY[workMode].label.toUpperCase()}</b></div><i /><div className="ledger-stage"><code>03</code><span>OUTPUT</span><b>{format}</b></div></div>

              <div className="format-row"><div className="step-heading"><span>02</span><div><b>{workMode === "resize" ? "Set dimensions" : workMode === "compress" ? "Set compression" : "Select output"}</b><small>{workMode === "resize" ? "Keep the image ratio or set both sides" : workMode === "compress" ? "Choose output format and compression strength" : "Choose the downloaded format"}</small></div></div>
                {workMode === "resize" && <div className="mode-control-grid"><label>Width <input type="number" min="1" value={resizeWidth || ""} onChange={(event) => updateWidth(Number(event.target.value))} /></label><label>Height <input type="number" min="1" value={resizeHeight || ""} onChange={(event) => updateHeight(Number(event.target.value))} /></label><label className="ratio-toggle"><input type="checkbox" checked={keepRatio} onChange={(event) => setKeepRatio(event.target.checked)} /> Keep ratio</label></div>}
                {workMode === "compress" && <div className="compression-control"><div><span>Output quality</span><b>{compression}%</b></div><input type="range" min="30" max="95" value={compression} onChange={(event) => setCompression(Number(event.target.value))} /><small>Lower values create smaller JPEG or WebP files.</small></div>}
                <div className="format-options">{(Object.keys(OUTPUTS) as OutputFormat[]).map((option) => <button key={option} onClick={() => setFormat(option)} className={`format-option ${format === option ? "selected" : ""}`}><b>{option}</b><small>{OUTPUTS[option].label.split(" · ")[1]}</small></button>)}</div>
              </div>
              <div className={`conversion-status ${state}`} role="status" aria-live="polite"><span>{state === "complete" ? <Check /> : state === "working" ? <Sparkles className="animate-pulse" /> : state === "error" ? <Info /> : <ShieldCheck />}</span><p><b>{state === "working" ? `${MODE_COPY[workMode].label} locally` : state === "complete" ? "Output ready" : state === "error" ? "Needs attention" : `${MODE_COPY[workMode].label} mode`}</b>{message}</p></div>
              <button className="convert-button" onClick={convert} disabled={!file || state === "working"}>{state === "working" ? `${MODE_COPY[workMode].label}…` : <>{MODE_COPY[workMode].label} to {format} <ArrowRight size={18} /></>}</button>
            </div>
            <aside className="side-rail"><div className="side-card visual-card"><div className="artifact-frame"><img src="/manus-storage/image-tool-art_e52627e1.png" alt="Abstract file conversion illustration" /><span>FORMAT / LOCAL</span></div><div><span className="mini-label">HOSTED IMAGE MODES</span><h3>Convert, resize, compress.</h3><p>These modes run in the browser and retain the original converter’s direct download flow.</p></div></div><div className="side-card privacy-card"><div className="artifact-frame"><img src="/manus-storage/video-tool-art_8413329c.png" alt="Private device processing illustration" /><span>DEVICE / ONLY</span></div><div><span className="mini-label">YOUR PRIVACY</span><h3>No account. No file transfer.</h3><p>The hosted app does not send your selected image to a conversion server.</p></div></div></aside>
          </div>
        </section>

        <section className="boundary-section" id="boundaries"><div className="boundary-copy"><p className="eyebrow"><span /> Capability notes</p><h2>Clear about where each mode runs.</h2><p>Hosted browser modes cover common image work. The legacy Video &amp; audio and YouTube modes are retained in the tool map, but need local software and private credentials to operate.</p></div><div className="boundary-list"><article><code>01</code><span className="capability-icon blue"><ImageIcon /></span><div><b>Image converter</b><p>Convert, resize, and compress in this hosted browser app.</p></div><Check className="available" /></article><article><code>02</code><span className="capability-icon green"><Video /></span><div><b>Video &amp; audio</b><p>GIF and audio export require local FFmpeg.</p></div><span className="local-tag">LOCAL ONLY</span></article><article><code>03</code><span className="capability-icon coral"><PlayCircle /></span><div><b>YouTube downloader</b><p>Requires local yt-dlp and private cookie files.</p></div><span className="local-tag">LOCAL ONLY</span></article></div></section>
      </main>
      <footer><a className="brand" href="#top"><span className="brand-mark"><img src="/manus-storage/converter-mark_3ad5921c.png" alt="" /><i /></span><span className="brand-word"><b>Converter</b><small>CBR/01</small></span></a><p>Legacy tools retained · Hosted image modes expanded</p><button onClick={reset}><RotateCcw size={14} /> Reset workspace</button></footer>
    </div>
  );
}
