import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Download, RefreshCw, Upload, Zap, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImageUploader } from '@/components/ImageUploader';
import { ImageComparison } from '@/components/ImageComparison';

// ─── Enhancement Worker (blob URL — avoids Replit MIME-type issues) ──────────
const WORKER_SRC = /* javascript */ `
importScripts('https://docs.opencv.org/4.9.0/opencv.js');

var cvReady = false;
function notifyReady() { cvReady = true; postMessage({ type: 'ready' }); }
if (typeof cv !== 'undefined' && cv.Mat) { notifyReady(); }
else if (typeof cv !== 'undefined') { cv['onRuntimeInitialized'] = notifyReady; }

function clampByte(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

self.addEventListener('message', function(e) {
  if (e.data.type === 'ping') { postMessage({ type: cvReady ? 'ready' : 'loading' }); return; }
  if (e.data.type !== 'enhance') return;
  if (!cvReady) { postMessage({ type: 'error', message: 'OpenCV not ready' }); return; }

  var d = e.data;
  var width = d.width, height = d.height;
  var sharpness  = d.sharpness  / 100;
  var denoise    = d.denoise    / 100;
  var contrast   = d.contrast   / 100;
  var saturation = d.saturation / 100;
  var upscale    = d.upscale;           // false | 2 | 4

  try {
    var srcRGBA = new cv.Mat(height, width, cv.CV_8UC4);
    srcRGBA.data.set(d.imageData);
    var srcRGB = new cv.Mat();
    cv.cvtColor(srcRGBA, srcRGB, cv.COLOR_RGBA2RGB);
    srcRGBA.delete();

    var work = srcRGB.clone();
    srcRGB.delete();

    // ── 1. BILATERAL DENOISE (edge-preserving noise removal) ──────────────
    if (denoise > 0.02) {
      var dSigma = 5 + Math.round(denoise * 30);
      var bilateral = new cv.Mat();
      cv.bilateralFilter(work, bilateral, 9, dSigma, dSigma);
      work.delete(); work = bilateral;
    }

    // ── 2. LOCAL CONTRAST (CLAHE on L channel of LAB) ─────────────────────
    if (contrast > 0.02) {
      var lab = new cv.Mat();
      cv.cvtColor(work, lab, cv.COLOR_RGB2Lab);
      var planes = new cv.MatVector();
      cv.split(lab, planes);
      lab.delete();

      var lIn   = planes.get(0);
      var lOut  = new cv.Mat();
      var clahe = cv.createCLAHE(1 + contrast * 5, new cv.Size(8, 8));
      clahe.apply(lIn, lOut);
      clahe.delete(); lIn.delete();

      var aCh = planes.get(1), bCh = planes.get(2);
      var lCh = new cv.MatVector();
      lCh.push_back(lOut); lCh.push_back(aCh); lCh.push_back(bCh);

      var labOut = new cv.Mat();
      cv.merge(lCh, labOut);
      // free in order: wrappers → vector → underlying planes
      lOut.delete(); aCh.delete(); bCh.delete(); lCh.delete(); planes.delete();

      var rgbOut = new cv.Mat();
      cv.cvtColor(labOut, rgbOut, cv.COLOR_Lab2RGB);
      labOut.delete();
      work.delete(); work = rgbOut;
    }

    // ── 3. SATURATION BOOST (per-pixel HSV-S boost in JS) ─────────────────
    if (saturation > 0.02) {
      var hsv = new cv.Mat();
      cv.cvtColor(work, hsv, cv.COLOR_RGB2HSV);
      var boost = 1 + saturation * 0.65;
      var hd = hsv.data;
      for (var i = 1; i < hd.length; i += 3) {
        hd[i] = clampByte(Math.round(hd[i] * boost));
      }
      var satRgb = new cv.Mat();
      cv.cvtColor(hsv, satRgb, cv.COLOR_HSV2RGB);
      hsv.delete(); work.delete(); work = satRgb;
    }

    // ── 4. TWO-PASS UNSHARP MASKING ────────────────────────────────────────
    if (sharpness > 0.02) {
      // Fine detail pass (sigma 0.5)
      var b1 = new cv.Mat();
      cv.GaussianBlur(work, b1, new cv.Size(0, 0), 0.5);
      var s1 = new cv.Mat();
      var w1 = 1 + sharpness * 0.9;
      cv.addWeighted(work, w1, b1, -(w1 - 1), 0, s1);
      b1.delete(); work.delete();

      // Mid-frequency pass (sigma 1.5) — lifts texture & edges
      var b2 = new cv.Mat();
      cv.GaussianBlur(s1, b2, new cv.Size(0, 0), 1.5);
      var s2 = new cv.Mat();
      var w2 = 1 + sharpness * 0.45;
      cv.addWeighted(s1, w2, b2, -(w2 - 1), 0, s2);
      b2.delete(); s1.delete(); work = s2;
    }

    // ── 5. LANCZOS 2× / 4× UPSCALE + post-sharpening ────────────────────
    if (upscale && upscale > 1) {
      var newW = width * upscale, newH = height * upscale;
      var up = new cv.Mat();
      cv.resize(work, up, new cv.Size(newW, newH), 0, 0, cv.INTER_LANCZOS4);
      work.delete();
      var ub = new cv.Mat();
      cv.GaussianBlur(up, ub, new cv.Size(0, 0), 0.4);
      var us = new cv.Mat();
      cv.addWeighted(up, 1.6, ub, -0.6, 0, us);
      ub.delete(); up.delete(); work = us;
    }

    // ── Output RGBA ────────────────────────────────────────────────────────
    var out = new cv.Mat();
    cv.cvtColor(work, out, cv.COLOR_RGB2RGBA);
    work.delete();

    var buf = new Uint8ClampedArray(out.data.length);
    buf.set(out.data);
    var outW = out.cols, outH = out.rows;
    out.delete();

    postMessage({ type: 'done', imageData: buf, width: outW, height: outH }, [buf.buffer]);
  } catch (err) {
    postMessage({ type: 'error', message: String(err) });
  }
});
`;

// ─── Worker singleton ─────────────────────────────────────────────────────────
let _enhWorker: Worker | null = null;
let _enhReadyPromise: Promise<Worker> | null = null;

function getEnhWorker(): Promise<Worker> {
  if (_enhReadyPromise) return _enhReadyPromise;
  _enhReadyPromise = new Promise<Worker>((resolve) => {
    const blob = new Blob([WORKER_SRC], { type: 'application/javascript' });
    const w = new Worker(URL.createObjectURL(blob));
    // onerror: swallow so Vite overlay never fires; OpenCV may still load fine
    w.onerror = (e) => { e.preventDefault(); };
    w.onmessage = (e) => {
      if (e.data.type === 'ready') { _enhWorker = w; resolve(w); }
    };
    w.postMessage({ type: 'ping' });
  });
  return _enhReadyPromise;
}

// ─── Preset definitions ───────────────────────────────────────────────────────
const PRESETS = [
  { id: 'auto',   label: 'Auto Enhance', icon: '✨', sharpness: 55, denoise: 30, contrast: 50, saturation: 30, upscale: false },
  { id: 'sharp',  label: 'Ultra Sharp',  icon: '🔪', sharpness: 90, denoise: 10, contrast: 40, saturation: 20, upscale: false },
  { id: 'vivid',  label: 'Vivid Colors', icon: '🎨', sharpness: 40, denoise: 20, contrast: 60, saturation: 70, upscale: false },
  { id: 'hd',     label: 'HD 2×',        icon: '🚀', sharpness: 70, denoise: 25, contrast: 55, saturation: 35, upscale: 2 },
];

// ─── Slider component ─────────────────────────────────────────────────────────
function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground font-medium">{label}</span>
        <span className="font-semibold text-foreground tabular-nums">{value}%</span>
      </div>
      <input
        type="range" min={0} max={100} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-full appearance-none bg-muted cursor-pointer accent-primary"
      />
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function ImageEnhancer() {
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl]     = useState<string | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cvStatus, setCvStatus]         = useState<'loading' | 'ready'>('loading');
  const [activePreset, setActivePreset] = useState<string>('auto');
  const [settings, setSettings] = useState({ sharpness: 55, denoise: 30, contrast: 50, saturation: 30 });
  const [upscale, setUpscale]   = useState<false | 2 | 4>(false);
  const [resultSize, setResultSize] = useState<{ w: number; h: number } | null>(null);

  // Preload OpenCV in background
  useEffect(() => {
    getEnhWorker().then(() => setCvStatus('ready')).catch(() => {});
  }, []);

  const applyPreset = (id: string) => {
    const p = PRESETS.find(p => p.id === id);
    if (!p) return;
    setActivePreset(id);
    setSettings({ sharpness: p.sharpness, denoise: p.denoise, contrast: p.contrast, saturation: p.saturation });
    setUpscale(p.upscale as false | 2 | 4);
  };

  const handleFileSelect = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    setOriginalUrl(url);
    setOriginalFile(file);
    setResultUrl(null);
    setResultSize(null);
  }, []);

  const clearSelection = useCallback(() => {
    setOriginalUrl(null);
    setOriginalFile(null);
    setResultUrl(null);
    setResultSize(null);
  }, []);

  const processImage = useCallback(async () => {
    if (!originalFile) return;
    setIsProcessing(true);
    try {
      const worker = await getEnhWorker();
      const img = new Image();
      img.src = URL.createObjectURL(originalFile);
      await new Promise(r => img.onload = r);

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const result = await new Promise<{ imageData: Uint8ClampedArray; width: number; height: number }>((resolve, reject) => {
        worker.onmessage = (e) => {
          if (e.data.type === 'done') resolve(e.data);
          else if (e.data.type === 'error') reject(new Error(e.data.message));
        };
        worker.postMessage({
          type: 'enhance',
          imageData: imageData.data,
          width: canvas.width,
          height: canvas.height,
          sharpness:  settings.sharpness,
          denoise:    settings.denoise,
          contrast:   settings.contrast,
          saturation: settings.saturation,
          upscale,
        }, [imageData.data.buffer]);
      });

      const outCanvas = document.createElement('canvas');
      outCanvas.width = result.width; outCanvas.height = result.height;
      const outCtx = outCanvas.getContext('2d')!;
      outCtx.putImageData(new ImageData(result.imageData, result.width, result.height), 0, 0);
      setResultSize({ w: result.width, h: result.height });
      setResultUrl(outCanvas.toDataURL('image/png'));
    } catch (err) {
      console.error('Enhancement failed', err);
    } finally {
      setIsProcessing(false);
    }
  }, [originalFile, settings, upscale]);

  const downloadResult = useCallback(() => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = 'enhanced.png';
    a.click();
  }, [resultUrl]);

  return (
    <div className="min-h-screen pb-20">
      {/* Hero */}
      <header className="pt-16 pb-10 px-6 text-center max-w-3xl mx-auto">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center justify-center p-2 px-4 rounded-full bg-primary/10 text-primary mb-5 ring-1 ring-primary/20">
          <Zap className="w-4 h-4 mr-2" />
          <span className="text-sm font-semibold tracking-wide uppercase">100% In-Browser · No API · No Credits</span>
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="text-4xl md:text-5xl font-extrabold mb-4 text-balance">
          Enhance Images to <span className="text-gradient">Next Level HD</span>
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="text-muted-foreground text-lg">
          CLAHE contrast · Bilateral denoise · Multi-pass sharpening · Saturation boost · Lanczos 2× upscale — all in your browser.
        </motion.p>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Upload / Result panel */}
        <motion.div layout className="glass-panel rounded-3xl p-4 md:p-8">
          <AnimatePresence mode="wait">
            {!resultUrl ? (
              <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <ImageUploader
                  onFileSelect={handleFileSelect}
                  selectedFileUrl={originalUrl}
                  onClear={clearSelection}
                />
              </motion.div>
            ) : (
              <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                <ImageComparison originalUrl={originalUrl!} resultUrl={resultUrl} />
                {resultSize && upscale && (
                  <p className="text-center text-sm text-muted-foreground">
                    Upscaled to {resultSize.w} × {resultSize.h} px
                  </p>
                )}
                <div className="flex flex-wrap justify-center gap-3 pt-2">
                  <Button onClick={clearSelection} variant="outline" className="gap-2">
                    <Upload className="w-4 h-4" /> New Image
                  </Button>
                  <Button onClick={() => { setResultUrl(null); }} variant="outline" className="gap-2">
                    <RefreshCw className="w-4 h-4" /> Re-enhance
                  </Button>
                  <Button onClick={downloadResult} className="gap-2">
                    <Download className="w-4 h-4" /> Download PNG
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Controls */}
        <AnimatePresence>
          {originalUrl && !resultUrl && (
            <motion.div key="controls" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
              className="grid md:grid-cols-2 gap-6">

              {/* Preset cards */}
              <div className="glass-panel rounded-2xl p-6 space-y-3">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold">Quick Presets</h3>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {PRESETS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => applyPreset(p.id)}
                      className={`flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                        activePreset === p.id
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background/50 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                      }`}
                    >
                      <span className="text-2xl">{p.icon}</span>
                      <span>{p.label}</span>
                    </button>
                  ))}
                </div>

                {/* Upscale toggle */}
                <div className="pt-2 space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Upscale Resolution</p>
                  <div className="flex gap-2">
                    {([false, 2, 4] as const).map((u) => (
                      <button
                        key={String(u)}
                        onClick={() => setUpscale(u)}
                        className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition-all ${
                          upscale === u
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border text-muted-foreground hover:border-primary/40'
                        }`}
                      >
                        {u === false ? 'No Upscale' : `${u}× HD`}
                      </button>
                    ))}
                  </div>
                  {upscale && (
                    <p className="text-xs text-muted-foreground">
                      Output will be {upscale}× larger. Processing may take a moment.
                    </p>
                  )}
                </div>
              </div>

              {/* Fine-tune sliders */}
              <div className="glass-panel rounded-2xl p-6 space-y-5">
                <div className="flex items-center gap-2 mb-1">
                  <SlidersHorizontal className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold">Fine-tune</h3>
                </div>
                <Slider label="Sharpness" value={settings.sharpness} onChange={v => setSettings(s => ({ ...s, sharpness: v }))} />
                <Slider label="Denoise" value={settings.denoise} onChange={v => setSettings(s => ({ ...s, denoise: v }))} />
                <Slider label="Contrast" value={settings.contrast} onChange={v => setSettings(s => ({ ...s, contrast: v }))} />
                <Slider label="Saturation" value={settings.saturation} onChange={v => setSettings(s => ({ ...s, saturation: v }))} />

                <Button
                  onClick={processImage}
                  disabled={isProcessing || cvStatus === 'loading'}
                  className="w-full mt-2 gap-2 text-base py-5"
                  size="lg"
                >
                  {isProcessing ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /> Enhancing…</>
                  ) : cvStatus === 'loading' ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /> Loading engine…</>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> Enhance Image</>
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
