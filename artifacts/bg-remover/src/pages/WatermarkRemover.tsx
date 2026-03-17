import { useState, useRef, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  UploadCloud, Paintbrush, Eraser, Trash2, Download,
  RefreshCw, ZoomIn, ZoomOut, RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useCredits } from '@/hooks/use-credits';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Worker singleton (blob URL avoids MIME-type issues with Replit proxy) ─
let _workerReadyPromise: Promise<Worker> | null = null;

const WORKER_SRC = /* javascript */ `
importScripts('https://docs.opencv.org/4.9.0/opencv.js');

var cvReady = false;
function notifyReady() { cvReady = true; postMessage({ type: 'ready' }); }
if (typeof cv !== 'undefined' && cv.Mat) { notifyReady(); }
else if (typeof cv !== 'undefined') { cv['onRuntimeInitialized'] = notifyReady; }

// ─── Helpers ────────────────────────────────────────────────────────────────
// Clamp integer to [0, 255]
function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

// ─── Global best-patch donor search ────────────────────────────────────────
// Collects ~30-50 border samples from just outside the mask boundary,
// then scans the entire image with adaptive stride to find the
// region whose pixels best match those border samples (lowest SSD).
// A coarse pass is followed by a fine pass around the best coarse candidate.
function findDonor(srcData, dilatedData, width, height, minX, minY, mW, mH) {

  // ── 1. Sample pixels just outside the mask boundary ──────────────────────
  var borderSamples = [];
  var SAMPLE_STEP = Math.max(1, Math.round(Math.min(mW, mH) / 18));
  var BORDER_RING  = Math.max(2, Math.round(Math.min(mW, mH) * 0.06)); // how far outside to sample

  for (var sy = Math.max(0, minY - BORDER_RING); sy <= Math.min(height - 1, minY + mH + BORDER_RING); sy += SAMPLE_STEP) {
    for (var sx = Math.max(0, minX - BORDER_RING); sx <= Math.min(width - 1, minX + mW + BORDER_RING); sx += SAMPLE_STEP) {
      if (dilatedData[sy * width + sx] > 0) continue; // skip masked pixels
      // Must be close to the mask edge
      var nearMask = false;
      for (var ny = Math.max(0, sy - BORDER_RING); ny <= Math.min(height - 1, sy + BORDER_RING) && !nearMask; ny++) {
        for (var nx = Math.max(0, sx - BORDER_RING); nx <= Math.min(width - 1, sx + BORDER_RING) && !nearMask; nx++) {
          if (dilatedData[ny * width + nx] > 0) nearMask = true;
        }
      }
      if (!nearMask) continue;
      var ni = (sy * width + sx) * 3;
      borderSamples.push({ r: srcData[ni], g: srcData[ni+1], b: srcData[ni+2], ox: sx - minX, oy: sy - minY });
    }
  }

  if (borderSamples.length === 0) return { x: -1, y: -1, borderSamples: [] };

  // ── 2. Coarse global scan ─────────────────────────────────────────────────
  var COARSE = Math.max(6, Math.round(Math.min(width, height) / 60));

  function scorePatch(dx, dy) {
    var ssd = 0, n = 0;
    for (var si = 0; si < borderSamples.length; si++) {
      var s = borderSamples[si];
      var px = dx + Math.max(0, Math.min(mW - 1, s.ox));
      var py = dy + Math.max(0, Math.min(mH - 1, s.oy));
      if (px < 0 || px >= width || py < 0 || py >= height) continue;
      var pi = (py * width + px) * 3;
      var dr = srcData[pi] - s.r, dg = srcData[pi+1] - s.g, db = srcData[pi+2] - s.b;
      ssd += dr*dr + dg*dg + db*db;
      n++;
    }
    return n > 0 ? ssd / n : Infinity;
  }

  function overlaps(dx, dy, stride) {
    for (var iy = dy; iy < dy + mH; iy += stride) {
      for (var ix = dx; ix < dx + mW; ix += stride) {
        var cy2 = Math.min(iy, height - 1), cx2 = Math.min(ix, width - 1);
        if (dilatedData[cy2 * width + cx2] > 0) return true;
      }
    }
    return false;
  }

  var bestScore = Infinity, bestX = -1, bestY = -1;
  for (var dy = 0; dy + mH <= height; dy += COARSE) {
    for (var dx = 0; dx + mW <= width; dx += COARSE) {
      if (overlaps(dx, dy, COARSE)) continue;
      var s2 = scorePatch(dx, dy);
      if (s2 < bestScore) { bestScore = s2; bestX = dx; bestY = dy; }
    }
  }

  if (bestX < 0) return { x: -1, y: -1, borderSamples: borderSamples };

  // ── 3. Fine scan around the coarse winner ─────────────────────────────────
  var FINE = Math.max(1, Math.round(COARSE / 3));
  var fx0 = Math.max(0, bestX - COARSE), fx1 = Math.min(width  - mW, bestX + COARSE);
  var fy0 = Math.max(0, bestY - COARSE), fy1 = Math.min(height - mH, bestY + COARSE);

  for (var fy = fy0; fy <= fy1; fy += FINE) {
    for (var fx = fx0; fx <= fx1; fx += FINE) {
      if (overlaps(fx, fy, FINE)) continue;
      var s3 = scorePatch(fx, fy);
      if (s3 < bestScore) { bestScore = s3; bestX = fx; bestY = fy; }
    }
  }

  return { x: bestX, y: bestY, borderSamples: borderSamples };
}

self.addEventListener('message', function (e) {
  if (e.data.type === 'ping') { postMessage({ type: cvReady ? 'ready' : 'loading' }); return; }
  if (e.data.type !== 'inpaint') return;
  if (!cvReady) { postMessage({ type: 'error', message: 'OpenCV not ready' }); return; }

  var imageData = e.data.imageData, maskData = e.data.maskData;
  var width = e.data.width, height = e.data.height;

  try {
    // === Build RGBA → RGB source ===
    var srcRGBA = new cv.Mat(height, width, cv.CV_8UC4);
    srcRGBA.data.set(imageData);
    var srcRGB = new cv.Mat();
    cv.cvtColor(srcRGBA, srcRGB, cv.COLOR_RGBA2RGB);
    srcRGBA.delete();

    // === Binary mask from painted alpha ===
    var rawMask = new cv.Mat(height, width, cv.CV_8UC1);
    for (var i = 0; i < maskData.length; i += 4)
      rawMask.data[i / 4] = maskData[i + 3] > 10 ? 255 : 0;
    var k3 = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
    var dilated = new cv.Mat();
    cv.dilate(rawMask, dilated, k3);
    k3.delete(); rawMask.delete();

    // === Mask bounding box ===
    var minX = width, maxX = 0, minY = height, maxY = 0;
    for (var my = 0; my < height; my++) {
      for (var mx = 0; mx < width; mx++) {
        if (dilated.data[my * width + mx] > 0) {
          if (mx < minX) minX = mx; if (mx > maxX) maxX = mx;
          if (my < minY) minY = my; if (my > maxY) maxY = my;
        }
      }
    }
    var mW = maxX - minX + 1, mH = maxY - minY + 1;

    // === Try to find a texture-matched donor patch ===
    var donor = findDonor(srcRGB.data, dilated.data, width, height, minX, minY, mW, mH);
    var finalRGB = srcRGB.clone(); // start as copy of original

    if (donor.x >= 0 && mW >= 3 && mH >= 3) {
      // ── Direct clone-stamp path (no Poisson) ────────────────────────────
      // 1. Build a full-image mat with donor pixels placed at mask position
      var donorFull = srcRGB.clone();
      var donorROI  = srcRGB.roi(new cv.Rect(donor.x, donor.y, mW, mH));
      var dstROI    = donorFull.roi(new cv.Rect(minX, minY, mW, mH));
      donorROI.copyTo(dstROI);
      donorROI.delete(); dstROI.delete();

      // 2. Spatially-varying color correction
      //    Compute per-edge offsets (target - donor) for top/bottom/left/right
      //    then bilinearly interpolate across the patch so each pixel gets its
      //    own correction — eliminates the visible rectangular colour boundary.
      var borderSamples = donor.borderSamples;
      var dfData = donorFull.data;
      var origRGB = srcRGB.data;

      // Accumulators for 4 edges
      var eR = [0,0,0,0], eG = [0,0,0,0], eB = [0,0,0,0], eN = [0,0,0,0];
      var T15 = mH * 0.20, B15 = mH * 0.80;
      var L15 = mW * 0.20, R15 = mW * 0.80;

      for (var bsi2 = 0; bsi2 < borderSamples.length; bsi2++) {
        var bs2 = borderSamples[bsi2];
        var bpx2 = donor.x + Math.max(0, Math.min(mW - 1, bs2.ox));
        var bpy2 = donor.y + Math.max(0, Math.min(mH - 1, bs2.oy));
        var bpi2 = (bpy2 * width + bpx2) * 3;
        var dr2 = bs2.r - origRGB[bpi2], dg2 = bs2.g - origRGB[bpi2+1], db2 = bs2.b - origRGB[bpi2+2];
        // Each sample can contribute to multiple edges based on proximity
        if (bs2.oy < T15)  { eR[0]+=dr2; eG[0]+=dg2; eB[0]+=db2; eN[0]++; } // top
        if (bs2.oy >= B15) { eR[1]+=dr2; eG[1]+=dg2; eB[1]+=db2; eN[1]++; } // bottom
        if (bs2.ox < L15)  { eR[2]+=dr2; eG[2]+=dg2; eB[2]+=db2; eN[2]++; } // left
        if (bs2.ox >= R15) { eR[3]+=dr2; eG[3]+=dg2; eB[3]+=db2; eN[3]++; } // right
      }
      // Average each edge; missing edge falls back to global mean
      var glob = [0,0,0], gn = 0;
      for (var bsi3 = 0; bsi3 < borderSamples.length; bsi3++) {
        var bs3 = borderSamples[bsi3];
        var bpx3 = donor.x + Math.max(0, Math.min(mW - 1, bs3.ox));
        var bpy3 = donor.y + Math.max(0, Math.min(mH - 1, bs3.oy));
        var bpi3 = (bpy3 * width + bpx3) * 3;
        glob[0] += bs3.r - origRGB[bpi3]; glob[1] += bs3.g - origRGB[bpi3+1]; glob[2] += bs3.b - origRGB[bpi3+2]; gn++;
      }
      var gR = gn > 0 ? glob[0]/gn : 0, gG = gn > 0 ? glob[1]/gn : 0, gB = gn > 0 ? glob[2]/gn : 0;
      var topR = eN[0]>0 ? eR[0]/eN[0] : gR, topG = eN[0]>0 ? eG[0]/eN[0] : gG, topB = eN[0]>0 ? eB[0]/eN[0] : gB;
      var botR = eN[1]>0 ? eR[1]/eN[1] : gR, botG = eN[1]>0 ? eG[1]/eN[1] : gG, botB = eN[1]>0 ? eB[1]/eN[1] : gB;
      var lftR = eN[2]>0 ? eR[2]/eN[2] : gR, lftG = eN[2]>0 ? eG[2]/eN[2] : gG, lftB = eN[2]>0 ? eB[2]/eN[2] : gB;
      var rgtR = eN[3]>0 ? eR[3]/eN[3] : gR, rgtG = eN[3]>0 ? eG[3]/eN[3] : gG, rgtB = eN[3]>0 ? eB[3]/eN[3] : gB;

      // Apply spatially-varying correction via bilinear interpolation
      var mW1 = Math.max(1, mW - 1), mH1 = Math.max(1, mH - 1);
      for (var ccy = minY; ccy < minY + mH; ccy++) {
        var ry = (ccy - minY) / mH1; // 0=top 1=bottom
        for (var ccx = minX; ccx < minX + mW; ccx++) {
          var ccpi = (ccy * width + ccx) * 3;
          var rx = (ccx - minX) / mW1; // 0=left 1=right
          // Bilinear: average of vertical and horizontal interpolations
          var crR = 0.5 * ((1-ry)*topR + ry*botR) + 0.5 * ((1-rx)*lftR + rx*rgtR);
          var crG = 0.5 * ((1-ry)*topG + ry*botG) + 0.5 * ((1-rx)*lftG + rx*rgtG);
          var crB = 0.5 * ((1-ry)*topB + ry*botB) + 0.5 * ((1-rx)*lftB + rx*rgtB);
          dfData[ccpi]   = clamp(dfData[ccpi]   + Math.round(crR));
          dfData[ccpi+1] = clamp(dfData[ccpi+1] + Math.round(crG));
          dfData[ccpi+2] = clamp(dfData[ccpi+2] + Math.round(crB));
        }
      }

      // 3. Feathered alpha blend — wider sigma (22%) for a softer, less visible seam
      var featherW = Math.max(5, Math.min(45, Math.round(Math.min(mW, mH) * 0.22)));
      var featherMask = new cv.Mat();
      cv.GaussianBlur(dilated, featherMask, new cv.Size(0, 0), featherW);

      // Per-pixel blend in JS: finalRGB = alpha*donorFull + (1-alpha)*srcRGB
      var origData   = srcRGB.data;
      var alphaData  = featherMask.data;
      var resultData = finalRGB.data;
      var totalPx    = width * height;
      for (var ppi = 0; ppi < totalPx; ppi++) {
        var alpha = alphaData[ppi];
        if (alpha === 0) continue;
        var base = ppi * 3;
        var a = alpha / 255;
        var ia = 1 - a;
        resultData[base]   = clamp(Math.round(a * dfData[base]   + ia * origData[base]));
        resultData[base+1] = clamp(Math.round(a * dfData[base+1] + ia * origData[base+1]));
        resultData[base+2] = clamp(Math.round(a * dfData[base+2] + ia * origData[base+2]));
      }

      donorFull.delete(); featherMask.delete();
    } else {
      // ── Inpaint fallback ─────────────────────────────────────────────────
      doInpaint(srcRGB, dilated, finalRGB);
    }

    // === Sharpen the inner core only (preserves feathered edges) ===
    var erodeKs = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(11, 11));
    var innerMask = new cv.Mat();
    cv.erode(dilated, innerMask, erodeKs);
    erodeKs.delete();
    if (cv.countNonZero(innerMask) > 0) {
      var blurred = new cv.Mat();
      cv.GaussianBlur(finalRGB, blurred, new cv.Size(0, 0), 0.8);
      var sharpened = new cv.Mat();
      cv.addWeighted(finalRGB, 1.3, blurred, -0.3, 0, sharpened);
      blurred.delete();
      sharpened.copyTo(finalRGB, innerMask);
      sharpened.delete();
    }
    innerMask.delete();

    // === RGBA output ===
    var dstRGBA = new cv.Mat();
    cv.cvtColor(finalRGB, dstRGBA, cv.COLOR_RGB2RGBA);
    srcRGB.delete(); dilated.delete(); finalRGB.delete();

    var out = new Uint8ClampedArray(dstRGBA.data.length);
    out.set(dstRGBA.data);
    dstRGBA.delete();

    postMessage({ type: 'result', data: out, width: width, height: height }, [out.buffer]);
  } catch (err) {
    postMessage({ type: 'error', message: String(err) });
  }
});

function doInpaint(srcRGB, mask, dst) {
  var tmp = new cv.Mat();
  cv.inpaint(srcRGB, mask, tmp, 3, cv.INPAINT_TELEA);
  tmp.copyTo(dst, mask);
  tmp.delete();
}
`;

function getWorker(): Promise<Worker> {
  if (_workerReadyPromise) return _workerReadyPromise;

  _workerReadyPromise = new Promise<Worker>((resolve, reject) => {
    const blob = new Blob([WORKER_SRC], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    const w = new Worker(blobUrl);

    // Prevent the onerror from bubbling to the global error handler
    w.onerror = (err) => {
      err.preventDefault();
      URL.revokeObjectURL(blobUrl);
      reject(new Error(`Worker error: ${err.message || 'unknown'}`));
    };

    w.addEventListener('message', function handler(e) {
      if (e.data.type === 'ready') {
        w.removeEventListener('message', handler);
        URL.revokeObjectURL(blobUrl); // free blob URL once worker is up
        resolve(w);
      }
    });

    w.postMessage({ type: 'ping' });
  });

  return _workerReadyPromise;
}

export default function WatermarkRemover() {
  const { toast } = useToast();
  const { useCredit, isAuthenticated, login } = useCredits();

  useEffect(() => { getWorker().catch(() => {}); }, []);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [brushSize, setBrushSize] = useState(18);
  const [tool, setTool] = useState<'brush' | 'eraser'>('brush');
  const [hasMask, setHasMask] = useState(false);
  const [zoom, setZoom] = useState(1);

  // Mutable refs — safe to access at any time without causing re-renders
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const maskHasPixels = useRef(false);
  // The decoded image waiting to be stamped onto the canvas
  const pendingImg = useRef<HTMLImageElement | null>(null);

  // ─── draw pending image ───────────────────────────────────────────────────
  // Called from ref-callbacks so it fires the moment BOTH canvases are in the DOM.
  const drawPending = useCallback(() => {
    const img = pendingImg.current;
    const ic = imageCanvasRef.current;
    const mc = maskCanvasRef.current;
    if (!img || !ic || !mc) return;           // wait until all three are ready
    pendingImg.current = null;

    ic.width  = img.naturalWidth;
    ic.height = img.naturalHeight;
    mc.width  = img.naturalWidth;
    mc.height = img.naturalHeight;

    ic.getContext('2d')!.drawImage(img, 0, 0);
    mc.getContext('2d')!.clearRect(0, 0, mc.width, mc.height);
    maskHasPixels.current = false;
    setHasMask(false);

    // Zoom is calculated after the editor section becomes visible (display:block)
    // so we defer it one animation frame. Safety-clamp to >= 0.2 in case the
    // element is still hidden and clientWidth is 0 or negative.
    requestAnimationFrame(() => {
      if (wrapperRef.current) {
        const maxW = wrapperRef.current.clientWidth - 32;
        setZoom(maxW > 0 ? Math.min(1, maxW / img.naturalWidth) : 1);
      } else {
        setZoom(1);
      }
    });
  }, []);

  // ─── ref callbacks ────────────────────────────────────────────────────────
  // These fire the instant React mounts / unmounts the element (even inside
  // AnimatePresence), unlike useEffect which fires too late.
  const imageCanvasCb = useCallback((el: HTMLCanvasElement | null) => {
    imageCanvasRef.current = el;
    if (el) drawPending();
  }, [drawPending]);

  const maskCanvasCb = useCallback((el: HTMLCanvasElement | null) => {
    maskCanvasRef.current = el;
    if (el) drawPending();
  }, [drawPending]);

  // ─── load image ───────────────────────────────────────────────────────────
  const loadImage = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      pendingImg.current = img;
      setImageFile(file);
      setResultUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
      URL.revokeObjectURL(url);
      // If canvases are already mounted (e.g. re-loading a second image), draw now
      drawPending();
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }, [drawPending]);

  // ─── helpers ──────────────────────────────────────────────────────────────
  function getXY(e: React.MouseEvent | React.TouchEvent) {
    const canvas = maskCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const src = 'touches' in e ? e.touches[0] : (e as React.MouseEvent);
    return { x: (src.clientX - rect.left) * sx, y: (src.clientY - rect.top) * sy };
  }

  const paint = useCallback((x: number, y: number) => {
    const mc = maskCanvasRef.current!;
    const ctx = mc.getContext('2d')!;
    const erase = tool === 'eraser';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = brushSize * 2;
    ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    ctx.strokeStyle = erase ? 'rgba(0,0,0,1)' : 'rgba(239,68,68,0.75)';
    ctx.fillStyle   = erase ? 'rgba(0,0,0,1)' : 'rgba(239,68,68,0.75)';
    ctx.beginPath();
    if (lastPosRef.current) {
      ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
      ctx.lineTo(x, y); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(x, y, brushSize, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    lastPosRef.current = { x, y };
    if (!erase) { maskHasPixels.current = true; setHasMask(true); }
  }, [tool, brushSize]);

  const onMouseDown = (e: React.MouseEvent) => { isDrawingRef.current = true; const p = getXY(e); lastPosRef.current = p; paint(p.x, p.y); };
  const onMouseMove = (e: React.MouseEvent) => { if (!isDrawingRef.current) return; paint(getXY(e).x, getXY(e).y); };
  const stopDraw   = () => { isDrawingRef.current = false; lastPosRef.current = null; };
  const onTouchStart = (e: React.TouchEvent) => { e.preventDefault(); isDrawingRef.current = true; const p = getXY(e); lastPosRef.current = p; paint(p.x, p.y); };
  const onTouchMove  = (e: React.TouchEvent) => { e.preventDefault(); if (!isDrawingRef.current) return; paint(getXY(e).x, getXY(e).y); };

  const clearMask = () => {
    const mc = maskCanvasRef.current!;
    mc.getContext('2d')!.clearRect(0, 0, mc.width, mc.height);
    maskHasPixels.current = false; setHasMask(false); setResultUrl(null);
  };

  const resetAll = () => {
    setImageFile(null); setResultUrl(null); setHasMask(false);
    maskHasPixels.current = false;
  };

  // ─── dropzone ─────────────────────────────────────────────────────────────
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => { if (files[0]) loadImage(files[0]); },
    accept: { 'image/jpeg': [], 'image/png': [], 'image/webp': [] },
    maxFiles: 1,
    noClick: !!imageFile,
    noDrag: !!imageFile,
  });

  // ─── inpainting (runs in Web Worker — never blocks the UI) ───────────────
  const processInpaint = async () => {
    if (!imageCanvasRef.current || !maskCanvasRef.current) return;
    if (!maskHasPixels.current) {
      toast({ variant: 'destructive', title: 'No area selected', description: 'Paint over the watermark first.' });
      return;
    }

    if (!isAuthenticated) {
      toast({ variant: 'destructive', title: 'Sign in required', description: 'Please log in to process images.' });
      login();
      return;
    }

    const creditResult = await useCredit('Watermark Removal');
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
    toast({ title: 'Loading engine\u2026', description: 'First time downloads OpenCV (~8 MB, then cached). UI stays responsive.' });

    try {
      const ic = imageCanvasRef.current;
      const mc = maskCanvasRef.current;
      const { width, height } = ic;

      // Grab pixel data on the main thread before handing off to worker
      const imageData = ic.getContext('2d')!.getImageData(0, 0, width, height).data;
      const maskData  = mc.getContext('2d')!.getImageData(0, 0, width, height).data;

      // Get (or lazily start) the worker, wait until OpenCV is initialised
      const worker = await getWorker();

      // Send data to worker and wait for result
      const result = await new Promise<{ data: Uint8ClampedArray; width: number; height: number }>((resolve, reject) => {
        const handler = (e: MessageEvent) => {
          if (e.data.type === 'result') {
            worker.removeEventListener('message', handler);
            resolve(e.data);
          } else if (e.data.type === 'error') {
            worker.removeEventListener('message', handler);
            reject(new Error(e.data.message));
          }
        };
        worker.addEventListener('message', handler);
        worker.postMessage(
          { type: 'inpaint', imageData, maskData, width, height },
          [imageData.buffer, maskData.buffer],   // transfer — zero copy
        );
      });

      // Draw result onto a canvas and convert to object URL
      const rc = document.createElement('canvas');
      rc.width = result.width; rc.height = result.height;
      rc.getContext('2d')!.putImageData(new ImageData(result.data, result.width, result.height), 0, 0);
      rc.toBlob((blob) => {
        if (blob) {
          setResultUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob!); });
          toast({ title: 'Done!', description: 'Watermark removed successfully.' });
        }
      }, 'image/png');
    } catch (err) {
      console.error(err);
      toast({ variant: 'destructive', title: 'Failed', description: err instanceof Error ? err.message : 'Processing error.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadResult = () => {
    if (!resultUrl || !imageFile) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = imageFile.name.replace(/\.[^/.]+$/, '') + '-no-watermark.png';
    a.click();
  };

  // ─── cursors ──────────────────────────────────────────────────────────────
  const r = brushSize;
  const brushCursor   = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${r*2+4}' height='${r*2+4}'%3E%3Ccircle cx='${r+2}' cy='${r+2}' r='${r}' fill='rgba(239%2C68%2C68%2C0.35)' stroke='rgba(239%2C68%2C68%2C0.9)' stroke-width='2'/%3E%3C/svg%3E") ${r+2} ${r+2}, crosshair`;
  const eraserCursor  = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${r*2+4}' height='${r*2+4}'%3E%3Ccircle cx='${r+2}' cy='${r+2}' r='${r}' fill='rgba(255%2C255%2C255%2C0.35)' stroke='rgba(100%2C100%2C100%2C0.9)' stroke-width='2' stroke-dasharray='4'/%3E%3C/svg%3E") ${r+2} ${r+2}, crosshair`;
  const cursorStyle   = tool === 'brush' ? brushCursor : eraserCursor;

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen pb-20">
      <header className="pt-16 pb-10 px-6 text-center max-w-3xl mx-auto">
        <motion.h1
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="text-4xl md:text-5xl font-extrabold mb-4 text-balance"
        >
          Remove <span className="text-gradient">Watermarks</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }} className="text-lg text-muted-foreground"
        >
          Paint over any watermark or logo, then let the AI fill it in &mdash; 100% in your browser, no API needed.
        </motion.p>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="glass-panel rounded-3xl p-4 md:p-8 space-y-4">

          {/* ── Drop zone (hidden once image is loaded) ── */}
          <div style={{ display: imageFile ? 'none' : 'block' }}>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-2xl p-16 transition-all duration-300 cursor-pointer flex flex-col items-center justify-center text-center min-h-[320px] ${isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/40'}`}
            >
              <input {...getInputProps()} />
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-5">
                <UploadCloud className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">
                {isDragActive ? 'Drop image here' : 'Upload your image'}
              </h3>
              <p className="text-muted-foreground max-w-sm">
                Drag &amp; drop or click to browse. Supports JPG, PNG, WebP.
              </p>
            </div>
          </div>

          {/* ── Editor (always in DOM so canvas refs are always valid) ── */}
          <div style={{ display: imageFile ? 'block' : 'none' }} className="space-y-4">

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl bg-muted/40 border border-border/50">
              <div className="flex rounded-xl overflow-hidden border border-border">
                <button onClick={() => setTool('brush')} className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${tool === 'brush' ? 'bg-destructive text-white' : 'bg-background text-muted-foreground hover:bg-muted'}`}>
                  <Paintbrush className="w-4 h-4" /> Paint
                </button>
                <button onClick={() => setTool('eraser')} className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${tool === 'eraser' ? 'bg-primary text-white' : 'bg-background text-muted-foreground hover:bg-muted'}`}>
                  <Eraser className="w-4 h-4" /> Erase
                </button>
              </div>

              <div className="flex items-center gap-2 flex-1 min-w-[160px] max-w-[220px]">
                <Label className="text-xs whitespace-nowrap text-muted-foreground">Size {brushSize}px</Label>
                <Slider min={4} max={60} step={1} value={[brushSize]} onValueChange={(v) => setBrushSize(v[0])} className="flex-1" />
              </div>

              <div className="flex items-center gap-1">
                <button onClick={() => setZoom(z => Math.max(0.2, +(z - 0.1).toFixed(1)))} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><ZoomOut className="w-4 h-4" /></button>
                <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(z => Math.min(3, +(z + 0.1).toFixed(1)))} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><ZoomIn className="w-4 h-4" /></button>
              </div>

              <div className="flex-1" />

              <button onClick={clearMask} className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl hover:bg-muted transition-colors text-muted-foreground">
                <Trash2 className="w-4 h-4" /> Clear
              </button>
              <button onClick={resetAll} className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl hover:bg-muted transition-colors text-muted-foreground">
                <RotateCcw className="w-4 h-4" /> New image
              </button>
            </div>

            {/* Canvas area */}
            <div
              ref={wrapperRef}
              className="relative rounded-2xl border border-border/50 overflow-auto select-none"
              style={{
                maxHeight: '60vh', minHeight: 200,
                backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Crect width='8' height='8' fill='%23e5e7eb'/%3E%3Crect x='8' y='8' width='8' height='8' fill='%23e5e7eb'/%3E%3C/svg%3E\")",
              }}
            >
              <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', display: 'inline-block', lineHeight: 0, position: 'relative' }}>
                <canvas ref={imageCanvasCb} className="block" style={{ pointerEvents: 'none' }} />
                <canvas
                  ref={maskCanvasCb}
                  className="absolute top-0 left-0"
                  style={{ cursor: cursorStyle }}
                  onMouseDown={onMouseDown} onMouseMove={onMouseMove}
                  onMouseUp={stopDraw} onMouseLeave={stopDraw}
                  onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={stopDraw}
                />
              </div>
            </div>

            <p className="text-sm text-muted-foreground text-center">
              Paint <span className="text-destructive font-medium">red</span> over the watermark, then click <strong>Remove Watermark</strong>.
            </p>

            <div className="flex flex-wrap justify-center gap-4">
              <Button
                onClick={processInpaint}
                disabled={isProcessing || !hasMask}
                className="h-12 px-8 rounded-xl font-semibold bg-gradient-to-r from-primary to-violet-600 hover:shadow-lg hover:shadow-primary/25 disabled:opacity-50"
              >
                {isProcessing
                  ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Removing&hellip;</>
                  : <>Remove Watermark</>}
              </Button>

              {resultUrl && (
                <Button variant="outline" onClick={downloadResult} className="h-12 px-8 rounded-xl font-semibold">
                  <Download className="w-4 h-4 mr-2" /> Download PNG
                </Button>
              )}
            </div>

            <AnimatePresence>
              {resultUrl && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="rounded-2xl border border-primary/20 overflow-hidden"
                >
                  <div className="flex items-center justify-between px-4 py-2 bg-primary/5 border-b border-primary/10">
                    <span className="text-sm font-semibold text-primary">Result</span>
                    <span className="text-xs text-muted-foreground">Watermark removed</span>
                  </div>
                  <img src={resultUrl} alt="Result" className="w-full object-contain max-h-[60vh]" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </main>
    </div>
  );
}
