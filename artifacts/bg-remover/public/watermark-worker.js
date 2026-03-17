/* eslint-disable */
// Runs entirely off the main thread — no UI freezing

importScripts('https://docs.opencv.org/4.9.0/opencv.js');

let cvReady = false;

function notifyReady() {
  cvReady = true;
  postMessage({ type: 'ready' });
}

// OpenCV WASM may already be loaded (cached) or will fire this callback
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
    if (!cvReady) {
      postMessage({ type: 'error', message: 'OpenCV not ready yet' });
      return;
    }

    var imageData = e.data.imageData;   // Uint8ClampedArray RGBA
    var maskData  = e.data.maskData;    // Uint8ClampedArray RGBA (alpha = painted area)
    var width     = e.data.width;
    var height    = e.data.height;

    try {
      // Build RGBA source Mat directly from raw pixel data
      var src = new cv.Mat(height, width, cv.CV_8UC4);
      src.data.set(imageData);

      // Build binary mask from alpha channel of the painted mask canvas
      var maskMat = new cv.Mat(height, width, cv.CV_8UC1);
      for (var i = 0; i < maskData.length; i += 4) {
        maskMat.data[i / 4] = maskData[i + 3] > 10 ? 255 : 0;
      }

      // Dilate mask slightly so edges are fully covered
      var kernel  = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
      var dilated = new cv.Mat();
      cv.dilate(maskMat, dilated, kernel);

      // Run Telea inpainting
      var dst = new cv.Mat();
      cv.inpaint(src, dilated, dst, 5, cv.INPAINT_TELEA);

      // Copy pixel data out (transfer the buffer so the main thread gets it without clone)
      var result = new Uint8ClampedArray(dst.data.length);
      result.set(dst.data);

      src.delete();
      maskMat.delete();
      dilated.delete();
      kernel.delete();
      dst.delete();

      postMessage({ type: 'result', data: result, width: width, height: height }, [result.buffer]);
    } catch (err) {
      postMessage({ type: 'error', message: String(err) });
    }
  }
});
