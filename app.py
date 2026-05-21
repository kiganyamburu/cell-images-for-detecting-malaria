import os
import json
import joblib
import numpy as np
from PIL import Image
from flask import Flask, request, jsonify, render_template, send_from_directory

app = Flask(__name__, template_folder='templates', static_folder='static')

DATA_DIR = r"c:\Users\User\Desktop\Projects\cell-images-for-detecting-malaria\data\cell_images"
MODEL_PATH = r"c:\Users\User\Desktop\Projects\cell-images-for-detecting-malaria\model.joblib"
METRICS_PATH = r"c:\Users\User\Desktop\Projects\cell-images-for-detecting-malaria\static\model_metrics.json"

# Global model variable
model = None

def load_model():
    global model
    if os.path.exists(MODEL_PATH):
        try:
            model = joblib.load(MODEL_PATH)
            print("Successfully loaded model.joblib")
        except Exception as e:
            print(f"Error loading model: {e}")
    else:
        print("Model file model.joblib not found. Please train the model first.")

def extract_features(img):
    """
    Extracts the advanced features from a PIL Image.
    Must match the exact extraction logic in train_model.py.
    """
    img_rgb = img.convert('RGB')
    arr = np.array(img_rgb)
    
    # Convert to grayscale to find cell mask
    img_gray = img.convert('L')
    gray_arr = np.array(img_gray)
    
    # Threshold to find cell pixels (ignore background which is black)
    cell_mask = gray_arr > 15
    if not np.any(cell_mask):
        cell_mask = np.ones_like(gray_arr, dtype=bool) # fallback
        
    # Extract R, G, B values for cell pixels
    r_vals = arr[:, :, 0][cell_mask] / 255.0
    g_vals = arr[:, :, 1][cell_mask] / 255.0
    b_vals = arr[:, :, 2][cell_mask] / 255.0
    
    cell_size = np.sum(cell_mask)
    
    # Basic color stats
    r_mean, r_std, r_min, r_max = r_vals.mean(), r_vals.std(), r_vals.min(), r_vals.max()
    g_mean, g_std, g_min, g_max = g_vals.mean(), g_vals.std(), g_vals.min(), g_vals.max()
    b_mean, b_std, b_min, b_max = b_vals.mean(), b_vals.std(), b_vals.min(), b_vals.max()
    
    # Percentiles inside cell
    r_p5, r_p10, r_p25, r_p50 = np.percentile(r_vals, [5, 10, 25, 50])
    g_p5, g_p10, g_p25, g_p50 = np.percentile(g_vals, [5, 10, 25, 50])
    b_p5, b_p10, b_p25, b_p50 = np.percentile(b_vals, [5, 10, 25, 50])
    
    # Purple ratio
    purple_ratio = (r_vals + b_vals) / (2.0 * g_vals + 1e-5)
    pr_mean = purple_ratio.mean()
    pr_std = purple_ratio.std()
    pr_max = purple_ratio.max()
    pr_p95 = np.percentile(purple_ratio, 95)
    
    # Contrast
    r_contrast = r_mean - r_min
    g_contrast = g_mean - g_min
    b_contrast = b_mean - b_min
    
    # Crop bounding box of cell and resize to 16x16
    rows = np.any(cell_mask, axis=1)
    cols = np.any(cell_mask, axis=0)
    rmin, rmax = np.where(rows)[0][[0, -1]]
    cmin, cmax = np.where(cols)[0][[0, -1]]
    
    cropped = img_gray.crop((cmin, rmin, cmax + 1, rmax + 1))
    cropped_resized = cropped.resize((16, 16))
    cropped_arr = np.array(cropped_resized).flatten() / 255.0
    
    # Combine features
    features = np.array([
        cell_size / 20000.0,
        r_mean, r_std, r_min, r_max,
        g_mean, g_std, g_min, g_max,
        b_mean, b_std, b_min, b_max,
        r_p5, r_p10, r_p25, r_p50,
        g_p5, g_p10, g_p25, g_p50,
        b_p5, b_p10, b_p25, b_p50,
        pr_mean, pr_std, pr_max, pr_p95,
        r_contrast, g_contrast, b_contrast
    ])
    
    features = np.concatenate([features, cropped_arr])
    return features

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/stats')
def stats():
    if os.path.exists(METRICS_PATH):
        with open(METRICS_PATH, 'r') as f:
            data = json.load(f)
        return jsonify(data)
    else:
        return jsonify({"error": "Metrics file not found. Training might be in progress."}), 404

@app.route('/api/predict', methods=['POST'])
def predict():
    global model
    if model is None:
        load_model()
        if model is None:
            return jsonify({"error": "Model not loaded. Try training the model."}), 500
            
    if 'image' not in request.files:
        return jsonify({"error": "No image file provided in request."}), 400
        
    file = request.files['image']
    if file.filename == '':
        return jsonify({"error": "Empty filename."}), 400
        
    try:
        # Open and process the image
        img = Image.open(file.stream)
        features = extract_features(img).reshape(1, -1)
        
        # Run prediction
        pred = int(model.predict(features)[0])
        prob = model.predict_proba(features)[0]
        
        # Labels: 0 = Uninfected, 1 = Parasitized
        label_str = "Parasitized" if pred == 1 else "Uninfected"
        confidence = float(prob[pred])
        
        # Return analysis details
        # For rendering, we can also extract some visual properties to display
        return jsonify({
            "prediction": label_str,
            "confidence": confidence,
            "label": pred,
            "details": {
                "uninfected_prob": float(prob[0]),
                "parasitized_prob": float(prob[1])
            }
        })
    except Exception as e:
        return jsonify({"error": f"Failed to analyze image: {str(e)}"}), 500

@app.route('/static/cell_images/<folder>/<filename>')
def serve_cell_images(folder, filename):
    # Map to Parasitized/Uninfected folders safely
    safe_folder = "Parasitized" if folder.lower() == "parasitized" else "Uninfected"
    return send_from_directory(os.path.join(DATA_DIR, safe_folder), filename)

if __name__ == '__main__':
    load_model()
    # Serve locally on port 5000
    app.run(debug=True, host='0.0.0.0', port=5000)
