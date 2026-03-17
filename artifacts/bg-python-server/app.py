import os
import io
import numpy as np
import cv2
from PIL import Image
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

MAX_IMAGE_SIZE = 20 * 1024 * 1024  # 20MB
ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'webp', 'bmp'}


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def remove_background_grabcut(img_array, threshold=15, iterations=5):
    """
    Remove background using GrabCut algorithm with edge detection.
    This is a high-quality non-AI approach that works well for most images.
    """
    h, w = img_array.shape[:2]

    # Convert to RGB if needed
    if img_array.shape[2] == 4:
        img_rgb = cv2.cvtColor(img_array, cv2.COLOR_BGRA2BGR)
    else:
        img_rgb = img_array.copy()

    # ── Step 1: Pre-process with CLAHE for better contrast ──────────────────
    lab = cv2.cvtColor(img_rgb, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    enhanced = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)

    # ── Step 2: Multi-scale edge detection ──────────────────────────────────
    gray = cv2.cvtColor(enhanced, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Canny edge detection at multiple scales
    edges1 = cv2.Canny(blurred, threshold, threshold * 3)
    edges2 = cv2.Canny(cv2.GaussianBlur(gray, (9, 9), 0), threshold // 2, threshold * 2)
    edges = cv2.bitwise_or(edges1, edges2)

    # Dilate edges to close gaps
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    edges = cv2.dilate(edges, kernel, iterations=2)

    # ── Step 3: Saliency-based foreground hint ──────────────────────────────
    # Create a rough saliency map using color statistics
    hsv = cv2.cvtColor(img_rgb, cv2.COLOR_BGR2HSV)

    # Estimate background color from image borders (8% margin)
    margin = max(5, int(min(h, w) * 0.08))
    border_pixels = np.concatenate([
        hsv[:margin, :].reshape(-1, 3),
        hsv[-margin:, :].reshape(-1, 3),
        hsv[:, :margin].reshape(-1, 3),
        hsv[:, -margin:].reshape(-1, 3)
    ])

    bg_mean = np.mean(border_pixels, axis=0)
    bg_std = np.std(border_pixels, axis=0) + 1.0

    # Compute per-pixel distance from background color
    diff = np.abs(hsv.astype(np.float32) - bg_mean)
    # Handle hue wraparound
    diff[:, :, 0] = np.minimum(diff[:, :, 0], 180 - diff[:, :, 0])
    dist = np.sum(diff / bg_std, axis=2)
    dist_norm = cv2.normalize(dist, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)

    # ── Step 4: Build GrabCut seed mask ─────────────────────────────────────
    mask = np.zeros((h, w), dtype=np.uint8)

    # Definite background: border region
    mask[:margin, :] = cv2.GC_BGD
    mask[-margin:, :] = cv2.GC_BGD
    mask[:, :margin] = cv2.GC_BGD
    mask[:, -margin:] = cv2.GC_BGD

    # Probable foreground: high saliency areas away from borders
    fg_thresh = max(30, np.percentile(dist_norm[margin:-margin, margin:-margin], 40))
    interior = np.zeros_like(mask)
    interior[margin:-margin, margin:-margin] = (
        dist_norm[margin:-margin, margin:-margin] > fg_thresh
    ).astype(np.uint8) * cv2.GC_PR_FGD

    # Definite foreground: strong edges AND high saliency center
    center_y, center_x = h // 2, w // 2
    center_r = int(min(h, w) * 0.18)
    center_mask = np.zeros((h, w), dtype=np.uint8)
    cv2.ellipse(center_mask, (center_x, center_y), (center_r, center_r), 0, 0, 360, 1, -1)
    strong_fg = (dist_norm > np.percentile(dist_norm, 70)) & (center_mask == 1)

    mask = np.where(interior > 0, interior, mask)
    mask[strong_fg] = cv2.GC_FGD
    # Make sure borders stay as background
    mask[:margin, :] = cv2.GC_BGD
    mask[-margin:, :] = cv2.GC_BGD
    mask[:, :margin] = cv2.GC_BGD
    mask[:, -margin:] = cv2.GC_BGD

    # ── Step 5: Run GrabCut ─────────────────────────────────────────────────
    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)

    try:
        cv2.grabCut(img_rgb, mask, None, bgd_model, fgd_model,
                    iterations, cv2.GC_INIT_WITH_MASK)
    except cv2.error:
        # Fallback: simple rect-based grabcut
        rect = (margin, margin, w - 2 * margin, h - 2 * margin)
        mask2 = np.zeros((h, w), dtype=np.uint8)
        cv2.grabCut(img_rgb, mask2, rect, bgd_model, fgd_model,
                    iterations, cv2.GC_INIT_WITH_RECT)
        mask = mask2

    # ── Step 6: Post-process mask ────────────────────────────────────────────
    fg_mask = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)

    # Fill holes in foreground
    fg_closed = cv2.morphologyEx(fg_mask, cv2.MORPH_CLOSE,
                                 cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))

    # Remove small noise blobs
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(fg_closed, connectivity=8)
    if num_labels > 1:
        areas = stats[1:, cv2.CC_STAT_AREA]
        if len(areas) > 0:
            min_area = max(areas) * 0.05  # Remove blobs < 5% of largest
            cleaned_mask = np.zeros_like(fg_closed)
            for i, area in enumerate(areas, start=1):
                if area >= min_area:
                    cleaned_mask[labels == i] = 255
            fg_mask = cleaned_mask
        else:
            fg_mask = fg_closed
    else:
        fg_mask = fg_closed

    # ── Step 7: Soft alpha matting at edges ──────────────────────────────────
    # Erode to get definite foreground
    kernel_erode = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    eroded = cv2.erode(fg_mask, kernel_erode, iterations=2)

    # Create soft transition zone
    dist_transform = cv2.distanceTransform(fg_mask, cv2.DIST_L2, 5)
    dist_inv = cv2.distanceTransform(cv2.bitwise_not(fg_mask), cv2.DIST_L2, 5)
    
    # Feather width: 3px
    feather = 3.0
    alpha = np.clip((dist_transform - 0) / (feather), 0.0, 1.0)
    alpha_uint8 = (alpha * 255).astype(np.uint8)

    # Apply Gaussian blur to the alpha for smoother edges
    alpha_smooth = cv2.GaussianBlur(alpha_uint8, (7, 7), 2.0)

    # ── Step 8: Compose RGBA output ──────────────────────────────────────────
    # Convert BGR to RGB
    img_out = cv2.cvtColor(img_rgb, cv2.COLOR_BGR2RGB)
    rgba = np.dstack([img_out, alpha_smooth])

    return rgba


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})


@app.route('/process', methods=['POST'])
def process():
    if 'image' not in request.files:
        return jsonify({'error': 'No image file provided'}), 400

    file = request.files['image']

    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if not allowed_file(file.filename):
        return jsonify({'error': f'File type not allowed. Use: {", ".join(ALLOWED_EXTENSIONS)}'}), 400

    file_bytes = file.read()
    if len(file_bytes) > MAX_IMAGE_SIZE:
        return jsonify({'error': 'File too large. Maximum size is 20MB'}), 400

    try:
        threshold = int(request.form.get('threshold', 15))
        threshold = max(1, min(100, threshold))
    except (ValueError, TypeError):
        threshold = 15

    try:
        iterations = int(request.form.get('iterations', 5))
        iterations = max(1, min(20, iterations))
    except (ValueError, TypeError):
        iterations = 5

    try:
        # Load image with PIL first (handles more formats)
        pil_img = Image.open(io.BytesIO(file_bytes))
        pil_img = pil_img.convert('RGB')

        # Cap resolution for performance (max 2048 on longest side)
        max_dim = 2048
        if max(pil_img.size) > max_dim:
            ratio = max_dim / max(pil_img.size)
            new_size = (int(pil_img.width * ratio), int(pil_img.height * ratio))
            pil_img = pil_img.resize(new_size, Image.LANCZOS)

        img_array = np.array(pil_img)
        # Convert RGB to BGR for OpenCV
        img_bgr = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)

        rgba = remove_background_grabcut(img_bgr, threshold=threshold, iterations=iterations)

        # Convert result to PIL and save as PNG
        result_img = Image.fromarray(rgba, 'RGBA')
        output_buffer = io.BytesIO()
        result_img.save(output_buffer, format='PNG', optimize=False)
        output_buffer.seek(0)

        return send_file(
            output_buffer,
            mimetype='image/png',
            as_attachment=False,
            download_name='background-removed.png'
        )

    except Exception as e:
        print(f"Processing error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Image processing failed', 'details': str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PYTHON_PORT', 5001))
    print(f"Python BG removal server starting on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
