import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Download, RefreshCw, Upload, Zap, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImageUploader } from '@/components/ImageUploader';
import { ImageComparison } from '@/components/ImageComparison';
import { useCredits } from '@/hooks/use-credits';
import { useToast } from '@/hooks/use-toast';


// ─── Pure-JS Enhancement Worker (no importScripts — starts instantly) ─────────
const WORKER_SRC = `
var c255 = 1 / 255;

// ── Clamp to [0,255] uint8
function cl(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }

// ── Fast horizontal box-blur (single RGBA buffer, radius in px) ────────────
function hBlur(src, dst, w, h, r) {
  var inv = 1 / (2 * r + 1);
  for (var y = 0; y < h; y++) {
    var row = y * w;
    var rS = 0, gS = 0, bS = 0;
    for (var x = -r; x <= r; x++) {
      var xx = x < 0 ? 0 : x >= w ? w - 1 : x;
      var i = (row + xx) * 4;
      rS += src[i]; gS += src[i+1]; bS += src[i+2];
    }
    for (var x2 = 0; x2 < w; x2++) {
      var ni = (row + x2) * 4;
      dst[ni] = rS * inv | 0; dst[ni+1] = gS * inv | 0; dst[ni+2] = bS * inv | 0; dst[ni+3] = src[ni+3];
      var lo = x2 - r < 0 ? 0 : (x2 - r) >= w ? w - 1 : x2 - r;
      var hi = x2 + r + 1 < 0 ? 0 : (x2 + r + 1) >= w ? w - 1 : x2 + r + 1;
      var li = (row + lo) * 4, hi2 = (row + hi) * 4;
      rS += src[hi2]   - src[li];
      gS += src[hi2+1] - src[li+1];
      bS += src[hi2+2] - src[li+2];
    }
  }
}

// ── Vertical box-blur ──────────────────────────────────────────────────────
function vBlur(src, dst, w, h, r) {
  var inv = 1 / (2 * r + 1);
  for (var x = 0; x < w; x++) {
    var rS = 0, gS = 0, bS = 0;
    for (var y = -r; y <= r; y++) {
      var yy = y < 0 ? 0 : y >= h ? h - 1 : y;
      var i = (yy * w + x) * 4;
      rS += src[i]; gS += src[i+1]; bS += src[i+2];
    }
    for (var y2 = 0; y2 < h; y2++) {
      var ni = (y2 * w + x) * 4;
      dst[ni] = rS * inv | 0; dst[ni+1] = gS * inv | 0; dst[ni+2] = bS * inv | 0; dst[ni+3] = src[ni+3];
      var lo = y2 - r < 0 ? 0 : y2 - r >= h ? h - 1 : y2 - r;
      var hi = y2 + r + 1 < 0 ? 0 : y2 + r + 1 >= h ? h - 1 : y2 + r + 1;
      var li = (lo * w + x) * 4, hi2 = (hi * w + x) * 4;
      rS += src[hi2]   - src[li];
      gS += src[hi2+1] - src[li+1];
      bS += src[hi2+2] - src[li+2];
    }
  }
}

// ── 3-pass box-blur ≈ Gaussian blur ───────────────────────────────────────
function gaussBlur(data, w, h, sigma) {
  var r = Math.max(1, Math.round(sigma * 1.2));
  var tmp1 = new Uint8ClampedArray(data.length);
  var tmp2 = new Uint8ClampedArray(data.length);
  hBlur(data, tmp1, w, h, r); vBlur(tmp1, tmp2, w, h, r);
  hBlur(tmp2, tmp1, w, h, r); vBlur(tmp1, tmp2, w, h, r);
  hBlur(tmp2, tmp1, w, h, r); vBlur(tmp1, data,  w, h, r);
}

// ── Simplified median-like bilateral denoise (3×3 box mean + edge gate) ──
function bilateralDenoise(data, w, h, strength) {
  var out = new Uint8ClampedArray(data.length);
  var thresh = 255 * (1 - strength);
  for (var y = 1; y < h - 1; y++) {
    for (var x = 1; x < w - 1; x++) {
      var ci = (y * w + x) * 4;
      var cr = data[ci], cg = data[ci+1], cb = data[ci+2];
      var rS = 0, gS = 0, bS = 0, cnt = 0;
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          var ni = ((y+dy)*w + (x+dx)) * 4;
          var dr = Math.abs(data[ni]-cr), dg = Math.abs(data[ni+1]-cg), db = Math.abs(data[ni+2]-cb);
          if (dr + dg + db <= thresh * 3) {
            rS += data[ni]; gS += data[ni+1]; bS += data[ni+2]; cnt++;
          }
        }
      }
      if (cnt > 0) { out[ci] = rS/cnt|0; out[ci+1] = gS/cnt|0; out[ci+2] = bS/cnt|0; }
      else         { out[ci] = cr;       out[ci+1] = cg;       out[ci+2] = cb; }
      out[ci+3] = data[ci+3];
    }
  }
  // copy border pixels
  for (var i = 0; i < w; i++) {
    var t = i*4, b2 = ((h-1)*w+i)*4;
    out[t]=data[t]; out[t+1]=data[t+1]; out[t+2]=data[t+2]; out[t+3]=data[t+3];
    out[b2]=data[b2]; out[b2+1]=data[b2+1]; out[b2+2]=data[b2+2]; out[b2+3]=data[b2+3];
  }
  for (var i2 = 0; i2 < h; i2++) {
    var l = i2*w*4, r2 = (i2*w+w-1)*4;
    out[l]=data[l]; out[l+1]=data[l+1]; out[l+2]=data[l+2]; out[l+3]=data[l+3];
    out[r2]=data[r2]; out[r2+1]=data[r2+1]; out[r2+2]=data[r2+2]; out[r2+3]=data[r2+3];
  }
  data.set(out);
}

// ── Unsharp masking (two-pass: fine + texture) ─────────────────────────────
function unsharpMask(data, w, h, amount) {
  var fine = new Uint8ClampedArray(data);
  gaussBlur(fine, w, h, 0.8);
  var tex = new Uint8ClampedArray(data);
  gaussBlur(tex, w, h, 2.5);
  var a1 = amount * 0.7, a2 = amount * 0.45;
  for (var i = 0; i < data.length; i += 4) {
    data[i]   = cl(data[i]   + a1*(data[i]   - fine[i])   + a2*(data[i]   - tex[i]));
    data[i+1] = cl(data[i+1] + a1*(data[i+1] - fine[i+1]) + a2*(data[i+1] - tex[i+1]));
    data[i+2] = cl(data[i+2] + a1*(data[i+2] - fine[i+2]) + a2*(data[i+2] - tex[i+2]));
  }
}

// ── CLAHE-like local contrast (per-tile histogram equalization with clipping) 
function localContrast(data, w, h, strength) {
  var tileW = Math.max(32, w >> 4), tileH = Math.max(32, h >> 4);
  var tilesX = Math.ceil(w / tileW), tilesY = Math.ceil(h / tileH);
  // compute per-tile L (luminance) LUT
  var luts = [];
  for (var ty = 0; ty < tilesY; ty++) {
    luts[ty] = [];
    for (var tx = 0; tx < tilesX; tx++) {
      var x0 = tx * tileW, y0 = ty * tileH;
      var x1 = Math.min(x0 + tileW, w), y1 = Math.min(y0 + tileH, h);
      var hist = new Int32Array(256);
      var n = 0;
      for (var y = y0; y < y1; y++) for (var x = x0; x < x1; x++) {
        var i = (y*w+x)*4;
        var L = (data[i]*77 + data[i+1]*150 + data[i+2]*29) >> 8;
        hist[L]++; n++;
      }
      // Clip + redistribute
      var clip = Math.max(1, Math.round(n / 256 * (1 + strength * 4)));
      var excess = 0;
      for (var j = 0; j < 256; j++) { if (hist[j] > clip) { excess += hist[j] - clip; hist[j] = clip; } }
      var add = (excess / 256) | 0;
      for (var j2 = 0; j2 < 256; j2++) hist[j2] += add;
      // Build CDF LUT
      var lut = new Uint8Array(256), cdf = 0, cdfMin = -1;
      for (var j3 = 0; j3 < 256; j3++) {
        cdf += hist[j3];
        if (cdfMin < 0 && hist[j3] > 0) cdfMin = cdf;
        lut[j3] = n > cdfMin ? ((cdf - cdfMin) / (n - cdfMin) * 255 + 0.5) | 0 : 0;
      }
      luts[ty][tx] = lut;
    }
  }
  // Apply with bilinear tile interpolation
  for (var y2 = 0; y2 < h; y2++) {
    var ty2 = Math.min((y2 / tileH - 0.5), tilesY - 1);
    var ty2f = Math.max(0, ty2 | 0), ty2c = Math.min(tilesY - 1, ty2f + 1);
    var wy = ty2 - ty2f; if (wy < 0) wy = 0;
    for (var x2 = 0; x2 < w; x2++) {
      var idx = (y2*w+x2)*4;
      var L2 = (data[idx]*77 + data[idx+1]*150 + data[idx+2]*29) >> 8;
      var tx2 = Math.min((x2 / tileW - 0.5), tilesX - 1);
      var tx2f = Math.max(0, tx2 | 0), tx2c = Math.min(tilesX - 1, tx2f + 1);
      var wx = tx2 - tx2f; if (wx < 0) wx = 0;
      var lf = luts[ty2f][tx2f][L2], rf = luts[ty2f][tx2c][L2];
      var lc = luts[ty2c][tx2f][L2], rc = luts[ty2c][tx2c][L2];
      var newL = (lf*(1-wx)*(1-wy) + rf*wx*(1-wy) + lc*(1-wx)*wy + rc*wx*wy) | 0;
      var scale = L2 > 0 ? newL / L2 : 1;
      // Blend: strength controls mix between original L and CLAHE L
      var mix = strength * 0.85;
      var s2 = 1 - mix + mix * scale;
      data[idx]   = cl(data[idx]   * s2);
      data[idx+1] = cl(data[idx+1] * s2);
      data[idx+2] = cl(data[idx+2] * s2);
    }
  }
}

// ── Saturation boost (RGB → HSL → boost S → RGB) ──────────────────────────
function boostSaturation(data, amount) {
  for (var i = 0; i < data.length; i += 4) {
    var r = data[i]*c255, g = data[i+1]*c255, b = data[i+2]*c255;
    var mx = Math.max(r,g,b), mn = Math.min(r,g,b), d = mx-mn;
    if (d < 0.001) continue;
    var l = (mx+mn)*0.5;
    var s = l > 0.5 ? d/(2-mx-mn) : d/(mx+mn);
    var h;
    if (mx === r) h = (g-b)/d + (g<b?6:0);
    else if (mx === g) h = (b-r)/d + 2;
    else h = (r-g)/d + 4;
    h /= 6;
    s = Math.min(1, s * (1 + amount * 0.7));
    // HSL back to RGB
    var q = l < 0.5 ? l*(1+s) : l+s-l*s, p = 2*l-q;
    function hue2rgb(t) {
      if(t<0) t+=1; if(t>1) t-=1;
      if(t<1/6) return p+(q-p)*6*t;
      if(t<1/2) return q;
      if(t<2/3) return p+(q-p)*(2/3-t)*6;
      return p;
    }
    data[i]   = cl(hue2rgb(h+1/3)*255);
    data[i+1] = cl(hue2rgb(h)*255);
    data[i+2] = cl(hue2rgb(h-1/3)*255);
  }
}

// ── Lanczos kernel ─────────────────────────────────────────────────────────
function lanczosKernel(x, a) {
  if (x === 0) return 1;
  if (Math.abs(x) >= a) return 0;
  var px = Math.PI * x;
  return a * Math.sin(px) * Math.sin(px/a) / (px * px);
}

// ── Lanczos upscale (a=2, moderate quality, reasonable speed) ─────────────
function lanczosUpscale(src, sw, sh, dw, dh) {
  var dst = new Uint8ClampedArray(dw * dh * 4);
  var a = 2, scaleX = sw/dw, scaleY = sh/dh;
  for (var dy = 0; dy < dh; dy++) {
    var sy = dy * scaleY;
    var sy0 = Math.floor(sy);
    for (var dx = 0; dx < dw; dx++) {
      var sx = dx * scaleX;
      var sx0 = Math.floor(sx);
      var rS = 0, gS = 0, bS = 0, aS = 0, wS = 0;
      for (var ky = -a+1; ky <= a; ky++) {
        var wy = lanczosKernel(sy - (sy0+ky), a);
        for (var kx = -a+1; kx <= a; kx++) {
          var wx = lanczosKernel(sx - (sx0+kx), a);
          var w2 = wy * wx;
          var px2 = Math.max(0,Math.min(sw-1, sx0+kx));
          var py = Math.max(0,Math.min(sh-1, sy0+ky));
          var si = (py*sw+px2)*4;
          rS += src[si]*w2; gS += src[si+1]*w2; bS += src[si+2]*w2; aS += src[si+3]*w2; wS += w2;
        }
      }
      if (wS !== 0) { rS/=wS; gS/=wS; bS/=wS; aS/=wS; }
      var di = (dy*dw+dx)*4;
      dst[di]=cl(rS); dst[di+1]=cl(gS); dst[di+2]=cl(bS); dst[di+3]=cl(aS);
    }
  }
  return dst;
}

// ── Main ───────────────────────────────────────────────────────────────────
self.addEventListener('message', function(e) {
  if (e.data.type !== 'enhance') return;
  var d = e.data;
  var w = d.width, h = d.height;
  var sharp  = d.sharpness  / 100;
  var dnoise = d.denoise    / 100;
  var cont   = d.contrast   / 100;
  var sat    = d.saturation / 100;
  var up     = d.upscale;

  try {
    var data = new Uint8ClampedArray(d.imageData);

    if (dnoise > 0.02) bilateralDenoise(data, w, h, dnoise);
    if (cont   > 0.02) localContrast(data, w, h, cont);
    if (sat    > 0.02) boostSaturation(data, sat);
    if (sharp  > 0.02) unsharpMask(data, w, h, sharp);

    var outW = w, outH = h;
    if (up && up > 1) {
      outW = w * up; outH = h * up;
      postMessage({ type: 'progress', pct: 70 });
      data = lanczosUpscale(data, w, h, outW, outH);
      // post-upscale sharpening
      unsharpMask(data, outW, outH, 0.4);
    }

    postMessage({ type: 'done', imageData: data, width: outW, height: outH }, [data.buffer]);
  } catch(err) {
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
    const url = URL.createObjectURL(blob);
    const w = new Worker(url);
    // Resolve immediately — pure JS worker needs no loading time
    _enhWorker = w;
    resolve(w);
  });
  return _enhReadyPromise;
}

// ─── Preset definitions ───────────────────────────────────────────────────────
const PRESETS = [
  { id: 'auto',   label: 'Auto Enhance', icon: '✨', sharpness: 55, denoise: 30, contrast: 50, saturation: 30, upscale: false as false },
  { id: 'sharp',  label: 'Ultra Sharp',  icon: '🔪', sharpness: 90, denoise: 10, contrast: 40, saturation: 20, upscale: false as false },
  { id: 'vivid',  label: 'Vivid Colors', icon: '🎨', sharpness: 40, denoise: 20, contrast: 60, saturation: 70, upscale: false as false },
  { id: 'hd2x',   label: 'HD 2×',        icon: '🚀', sharpness: 70, denoise: 25, contrast: 55, saturation: 35, upscale: 2 as 2 },
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
  const { useCredit, isAuthenticated, login } = useCredits();
  const { toast } = useToast();
  const [originalUrl, setOriginalUrl]   = useState<string | null>(null);
  const [resultUrl, setResultUrl]       = useState<string | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress]         = useState(0);
  const [activePreset, setActivePreset] = useState<string>('auto');
  const [settings, setSettings] = useState({ sharpness: 55, denoise: 30, contrast: 50, saturation: 30 });
  const [upscale, setUpscale]   = useState<false | 2 | 4>(false);
  const [resultSize, setResultSize] = useState<{ w: number; h: number } | null>(null);

  const applyPreset = (id: string) => {
    const p = PRESETS.find(p => p.id === id);
    if (!p) return;
    setActivePreset(id);
    setSettings({ sharpness: p.sharpness, denoise: p.denoise, contrast: p.contrast, saturation: p.saturation });
    setUpscale(p.upscale as false | 2 | 4);
  };

  const handleFileSelect = useCallback((file: File) => {
    setOriginalUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setOriginalFile(file);
    setResultUrl(prev => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return null;
    });
    setResultSize(null);
  }, []);

  const clearSelection = useCallback(() => {
    setOriginalUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setOriginalFile(null);
    setResultUrl(prev => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return null;
    });
    setResultSize(null);
  }, []);

  const processImage = useCallback(async () => {
    if (!originalFile) return;

    if (!isAuthenticated) {
      toast({ variant: 'destructive', title: 'Sign in required', description: 'Please log in to process images.' });
      login();
      return;
    }

    const creditResult = await useCredit('Image Enhancement');
    if (!creditResult.ok) {
      if (creditResult.error === 'login_required') {
        toast({ variant: 'destructive', title: 'Sign in required', description: 'Please log in to process images.' });
        login();
      } else if (creditResult.error === 'no_credits') {
        toast({ variant: 'destructive', title: 'No credits', description: 'You need at least 1 credit. Claim your daily free credits or buy more on the Pricing page.' });
      } else {
        toast({ variant: 'destructive', title: 'Error', description: creditResult.error ?? 'Failed to use credit' });
      }
      return;
    }

    setIsProcessing(true);
    setProgress(10);
    try {
      const worker = await getEnhWorker();

      const img = new Image();
      const imgUrl = URL.createObjectURL(originalFile);
      img.src = imgUrl;
      await new Promise(r => { img.onload = r; });
      URL.revokeObjectURL(imgUrl);

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setProgress(30);

      const result = await new Promise<{ imageData: Uint8ClampedArray; width: number; height: number }>((resolve, reject) => {
        worker.onmessage = (e) => {
          if (e.data.type === 'done')     resolve(e.data);
          else if (e.data.type === 'error')    reject(new Error(e.data.message));
          else if (e.data.type === 'progress') setProgress(e.data.pct);
        };
        worker.onerror = (err) => { err.preventDefault(); reject(new Error('Worker error')); };
        worker.postMessage({
          type: 'enhance',
          imageData: imageData.data,
          width: canvas.width, height: canvas.height,
          sharpness: settings.sharpness, denoise: settings.denoise,
          contrast:  settings.contrast,  saturation: settings.saturation,
          upscale,
        }, [imageData.data.buffer]);
      });

      setProgress(95);
      const outCanvas = document.createElement('canvas');
      outCanvas.width = result.width; outCanvas.height = result.height;
      outCanvas.getContext('2d')!.putImageData(
        new ImageData(result.imageData, result.width, result.height), 0, 0
      );
      setResultSize({ w: result.width, h: result.height });
      setResultUrl(outCanvas.toDataURL('image/png'));
    } catch (err) {
      console.error('Enhancement failed', err);
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  }, [originalFile, settings, upscale, isAuthenticated, login, useCredit, toast]);

  const downloadResult = useCallback(() => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl; a.download = 'enhanced.png'; a.click();
  }, [resultUrl]);

  return (
    <div className="min-h-screen pb-20">
      {/* Hero */}
      <header className="pt-16 pb-10 px-6 text-center max-w-3xl mx-auto">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center justify-center p-2 px-4 rounded-full bg-primary/10 text-primary mb-5 ring-1 ring-primary/20">
          <Zap className="w-4 h-4 mr-2" />
          <span className="text-sm font-semibold tracking-wide uppercase">100% In-Browser · No Upload · 2 Free Daily Credits</span>
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="text-4xl md:text-5xl font-extrabold mb-4 text-balance">
          Enhance Images to <span className="text-gradient">Next Level HD</span>
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="text-muted-foreground text-lg">
          Local contrast · Bilateral denoise · Multi-pass sharpening · Saturation boost · Lanczos 2× upscale — all instantly in your browser.
        </motion.p>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Upload / Result panel */}
        <motion.div layout className="glass-panel rounded-3xl p-4 md:p-8">
          <AnimatePresence mode="wait">
            {!resultUrl ? (
              <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <ImageUploader onFileSelect={handleFileSelect} selectedFileUrl={originalUrl} onClear={clearSelection} />
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
                  <Button onClick={() => setResultUrl(null)} variant="outline" className="gap-2">
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
                    <button key={p.id} onClick={() => applyPreset(p.id)}
                      className={`flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                        activePreset === p.id
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background/50 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                      }`}>
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
                      <button key={String(u)} onClick={() => setUpscale(u)}
                        className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition-all ${
                          upscale === u
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border text-muted-foreground hover:border-primary/40'
                        }`}>
                        {u === false ? 'Original' : `${u}× HD`}
                      </button>
                    ))}
                  </div>
                  {upscale && (
                    <p className="text-xs text-muted-foreground">
                      Output will be {upscale}× larger ({upscale === 4 ? 'may take ~1 min for large images' : '~10–20 seconds'}).
                    </p>
                  )}
                </div>
              </div>

              {/* Fine-tune sliders + Enhance button */}
              <div className="glass-panel rounded-2xl p-6 space-y-5">
                <div className="flex items-center gap-2 mb-1">
                  <SlidersHorizontal className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold">Fine-tune</h3>
                </div>
                <Slider label="Sharpness"  value={settings.sharpness}  onChange={v => setSettings(s => ({ ...s, sharpness: v }))} />
                <Slider label="Denoise"    value={settings.denoise}    onChange={v => setSettings(s => ({ ...s, denoise: v }))} />
                <Slider label="Contrast"   value={settings.contrast}   onChange={v => setSettings(s => ({ ...s, contrast: v }))} />
                <Slider label="Saturation" value={settings.saturation} onChange={v => setSettings(s => ({ ...s, saturation: v }))} />

                {isProcessing ? (
                  <div className="space-y-2">
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <motion.div className="h-full bg-primary rounded-full"
                        animate={{ width: `${progress}%` }} transition={{ ease: 'easeOut', duration: 0.4 }} />
                    </div>
                    <p className="text-center text-sm text-muted-foreground">
                      {upscale ? 'Upscaling… this takes a moment' : 'Enhancing…'}
                    </p>
                  </div>
                ) : (
                  <Button onClick={processImage} className="w-full gap-2 text-base py-5" size="lg">
                    <Sparkles className="w-4 h-4" /> Enhance Image
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
