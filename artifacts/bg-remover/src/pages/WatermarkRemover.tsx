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
import { motion, AnimatePresence } from 'framer-motion';

// ─── Worker singleton (blob URL avoids MIME-type issues with Replit proxy) ─
let _workerReadyPromise: Promise<Worker> | null = null;

const WORKER_SRC = /* javascript */ `
importScripts('https://docs.opencv.org/4.9.0/opencv.js');

var cvReady = false;

function notifyReady() {
  cvReady = true;
  postMessage({ type: 'ready' });
}

if (typeof cv !== 'undefined' && cv.Mat) {
  notifyReady();
} else if (typeof cv !== 'undefined') {
  cv['onRuntimeInitialized'] = notifyReady;
}

self.addEventListener('message', function (e) {
  var type = e.data.type;

  if (type === 'ping') {
    postMessage({ type: cvReady ? 'ready' : 'loading' });
    return;
  }

  if (type === 'inpaint') {
    if (!cvReady) { postMessage({ type: 'error', message: 'OpenCV not ready' }); return; }
    var imageData = e.data.imageData;
    var maskData  = e.data.maskData;
    var width     = e.data.width;
    var height    = e.data.height;
    try {
      // Build RGBA source mat
      var srcRGBA = new cv.Mat(height, width, cv.CV_8UC4);
      srcRGBA.data.set(imageData);

      // cv.inpaint only accepts 1- or 3-channel images — convert RGBA → RGB
      var srcRGB = new cv.Mat();
      cv.cvtColor(srcRGBA, srcRGB, cv.COLOR_RGBA2RGB);

      // Build binary mask from the painted layer's alpha channel
      var maskMat = new cv.Mat(height, width, cv.CV_8UC1);
      for (var i = 0; i < maskData.length; i += 4)
        maskMat.data[i / 4] = maskData[i + 3] > 10 ? 255 : 0;

      // Dilate mask slightly so edges are fully covered
      var kernel  = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
      var dilated = new cv.Mat();
      cv.dilate(maskMat, dilated, kernel);

      // Run Telea inpainting on the 3-channel image
      var dstRGB = new cv.Mat();
      cv.inpaint(srcRGB, dilated, dstRGB, 5, cv.INPAINT_TELEA);

      // Convert result back to RGBA so it matches canvas pixel format
      var dstRGBA = new cv.Mat();
      cv.cvtColor(dstRGB, dstRGBA, cv.COLOR_RGB2RGBA);

      var result = new Uint8ClampedArray(dstRGBA.data.length);
      result.set(dstRGBA.data);

      srcRGBA.delete(); srcRGB.delete(); maskMat.delete();
      dilated.delete(); kernel.delete(); dstRGB.delete(); dstRGBA.delete();

      postMessage({ type: 'result', data: result, width: width, height: height }, [result.buffer]);
    } catch (err) {
      postMessage({ type: 'error', message: String(err) });
    }
  }
});
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

  // Kick off worker + OpenCV download in background immediately on page load
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
