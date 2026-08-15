// Signal Ledger: browser-first conversion workbench with factual privacy and capability feedback.
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronDown,
  FileImage,
  ImageIcon,
  Info,
  LockKeyhole,
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

const OUTPUTS: Record<OutputFormat, { mime: string; extension: string; label: string }> = {
  PNG: { mime: "image/png", extension: "png", label: "PNG · lossless" },
  JPEG: { mime: "image/jpeg", extension: "jpg", label: "JPEG · compact" },
  WEBP: { mime: "image/webp", extension: "webp", label: "WebP · web-ready" },
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
  const [state, setState] = useState<ConversionState>("idle");
  const [message, setMessage] = useState("Choose one image to begin.");
  const [isDragging, setIsDragging] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const selectFile = (candidate?: File) => {
    if (!candidate) return;
    if (!candidate.type.startsWith("image/")) {
      setState("error");
      setMessage("Choose a standard image file to use the hosted converter.");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(candidate));
    setFile(candidate);
    setState("ready");
    setMessage("Ready on this device. Pick an output and convert.");
  };

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setState("idle");
    setMessage("Choose one image to begin.");
    if (inputRef.current) inputRef.current.value = "";
  };

  const convert = () => {
    if (!file || !previewUrl) return;
    setState("working");
    setMessage("Converting in your browser…");
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        setState("error");
        setMessage("Your browser could not prepare this image.");
        return;
      }
      if (format === "JPEG") {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.drawImage(image, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) {
          setState("error");
          setMessage("This output format is not supported by your browser.");
          return;
        }
        const filename = file.name.replace(/\.[^/.]+$/, "") || "converted-image";
        const downloadUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = downloadUrl;
        anchor.download = `${filename}.${OUTPUTS[format].extension}`;
        anchor.click();
        URL.revokeObjectURL(downloadUrl);
        setState("complete");
        setMessage(`${OUTPUTS[format].label} is ready. Your download has started.`);
      }, OUTPUTS[format].mime, 0.92);
    };
    image.onerror = () => {
      setState("error");
      setMessage("This image could not be read in the browser.");
    };
    image.src = previewUrl;
  };

  const statusIcon = state === "complete" ? <Check /> : state === "working" ? <Sparkles className="animate-pulse" /> : state === "error" ? <Info /> : <ShieldCheck />;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f6f8fc] text-[#122033] dark:bg-[#111827] dark:text-[#edf4ff]">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Converter home">
          <span className="brand-mark"><img src="/manus-storage/converter-transfer-logo_a3adb507.png" alt="" /><i /></span>
          <span className="brand-word"><b>Converter</b><small>CBR/01</small></span>
        </a>
        <nav className="header-nav" aria-label="Main navigation">
          <a className="active" href="#workbench">Image converter</a>
          <a href="#boundaries">How it works</a>
        </nav>
        <button className="theme-button" onClick={() => setDark((value) => !value)} aria-label="Switch color theme">
          {dark ? <Sun size={18} /> : <Moon size={18} />}
          <span>{dark ? "Light" : "Dark"}</span>
        </button>
      </header>

      <main id="top">
        <section className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow"><span /> Browser-first conversion</p>
            <h1>Change the format.<br /><em>Keep the file.</em></h1>
            <p className="hero-lede">Convert images directly in your browser, without creating an account or sending a file to a server.</p>
            <div className="hero-actions">
              <a href="#workbench" className="primary-action">Convert an image <ArrowRight size={18} /></a>
              <span className="quiet-proof"><LockKeyhole size={15} /> Private by default</span>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <img src="/manus-storage/converter-signal-ledger-hero_cae1a676.png" alt="" />
            <div className="hero-schematic" aria-hidden="true"><span>01 SOURCE</span><b>PNG</b><i /><span>02 TARGET</span><b>WEBP</b><i /><span>03 OUTPUT</span></div>
          </div>
        </section>

        <section className="proof-strip" aria-label="Privacy assurances">
          <div><code>01</code><ShieldCheck /><span><strong>Source stays local.</strong> Browser processing only.</span></div>
          <div><code>02</code><FileImage /><span><strong>Target stays explicit.</strong> PNG, JPEG, or WebP.</span></div>
          <div><code>03</code><ArrowDownToLine /><span><strong>Output downloads direct.</strong> No account or queue.</span></div>
        </section>

        <section className="workbench-section" id="workbench">
          <div className="section-heading">
            <div><p className="eyebrow"><span /> Image workbench</p><h2>One file in. One format out.</h2></div>
            <p>Start with a standard browser-readable image. The conversion happens locally, then the completed file downloads immediately.</p>
          </div>

          <div className="workbench-grid">
            <div className="convert-panel">
              <div className="step-heading"><span>01</span><div><b>Choose source</b><small>Drop a file or select one</small></div></div>
              <input ref={inputRef} className="sr-only" type="file" accept="image/*" onChange={(event) => selectFile(event.target.files?.[0])} />
              {!file ? (
                <button
                  className={`drop-zone ${isDragging ? "is-dragging" : ""}`}
                  onClick={() => inputRef.current?.click()}
                  onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(event) => { event.preventDefault(); setIsDragging(false); selectFile(event.dataTransfer.files[0]); }}
                >
                  <span className="drop-icon"><Upload size={24} /></span>
                  <strong>Drop an image here</strong>
                  <small>or choose one from this device</small>
                  <span className="browse-link">Browse files</span>
                </button>
              ) : (
                <div className="selected-file">
                  <div className="file-preview"><img src={previewUrl || ""} alt="Selected file preview" /></div>
                  <div className="file-copy"><span className="file-chip"><ImageIcon size={14} /> {file.type.replace("image/", "").toUpperCase() || "IMAGE"}</span><strong>{file.name}</strong><small>{formatBytes(file.size)} · ready in this browser</small></div>
                  <button className="icon-button" onClick={reset} aria-label="Remove selected file"><X size={18} /></button>
                </div>
              )}

              <div className="ledger-flow" aria-label="Conversion flow">
                <div className={file ? "ledger-stage active" : "ledger-stage"}><code>01</code><span>SOURCE</span><b>{file ? file.type.replace("image/", "").toUpperCase() : "IMAGE"}</b></div>
                <i /><div className="ledger-stage active"><code>02</code><span>TARGET</span><b>{format}</b></div>
                <i /><div className="ledger-stage"><code>03</code><span>OUTPUT</span><b>DOWNLOAD</b></div>
              </div>

              <div className="format-row">
                <div className="step-heading"><span>02</span><div><b>Select output</b><small>Choose the downloaded format</small></div></div>
                <div className="format-options">
                  {(Object.keys(OUTPUTS) as OutputFormat[]).map((option) => <button key={option} onClick={() => setFormat(option)} className={`format-option ${format === option ? "selected" : ""}`}><b>{option}</b><small>{OUTPUTS[option].label.split(" · ")[1]}</small></button>)}
                </div>
              </div>

              <div className={`conversion-status ${state}`} role="status" aria-live="polite">
                <span>{statusIcon}</span><p><b>{state === "working" ? "Processing locally" : state === "complete" ? "Conversion complete" : state === "error" ? "Needs attention" : "Local conversion"}</b>{message}</p>
              </div>
              <button className="convert-button" onClick={convert} disabled={!file || state === "working"}>{state === "working" ? "Converting…" : <>Convert to {format} <ArrowRight size={18} /></>}</button>
            </div>

            <aside className="side-rail">
              <div className="side-card visual-card"><div className="artifact-frame"><img src="/manus-storage/converter-image-workbench_ca08c40c.png" alt="Abstract file conversion illustration" /><span>FORMAT / LOCAL</span></div><div><span className="mini-label">SUPPORTED HERE</span><h3>Image conversion, without upload.</h3><p>Browser-readable images become PNG, JPEG, or WebP while staying on this device.</p></div></div>
              <div className="side-card privacy-card"><div className="artifact-frame"><img src="/manus-storage/converter-privacy-device_4c9a1696.png" alt="Private device processing illustration" /><span>DEVICE / ONLY</span></div><div><span className="mini-label">YOUR PRIVACY</span><h3>No account. No file transfer.</h3><p>This hosted version does not send your image to a conversion server.</p></div></div>
            </aside>
          </div>
        </section>

        <section className="boundary-section" id="boundaries">
          <div className="boundary-copy"><p className="eyebrow"><span /> Capability notes</p><h2>Clear about what this hosted app can do.</h2><p>Hosted browser tools are ideal for common image formats. Video, audio, and YouTube downloads need local software and private credentials, so they stay in the local converter rather than being represented as broken buttons here.</p></div>
          <div className="boundary-list">
            <article><code>01</code><span className="capability-icon blue"><ImageIcon /></span><div><b>Images</b><p>Available now — private, in-browser conversion.</p></div><Check className="available" /></article>
            <article><code>02</code><span className="capability-icon green"><Video /></span><div><b>Video & audio</b><p>Requires local FFmpeg. Not included in this hosted app.</p></div><span className="local-tag">LOCAL ONLY</span></article>
            <article><code>03</code><span className="capability-icon coral"><PlayCircle /></span><div><b>YouTube downloads</b><p>Requires local yt-dlp and private cookies. Not hosted here.</p></div><span className="local-tag">LOCAL ONLY</span></article>
          </div>
        </section>
      </main>

      <footer><a className="brand" href="#top"><span className="brand-mark"><img src="/manus-storage/converter-transfer-logo_a3adb507.png" alt="" /><i /></span><span className="brand-word"><b>Converter</b><small>CBR/01</small></span></a><p>Browser-safe image conversion · private by design</p><button onClick={reset}><RotateCcw size={14} /> Reset workspace</button></footer>
    </div>
  );
}
