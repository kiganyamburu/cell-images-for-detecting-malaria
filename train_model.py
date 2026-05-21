import os
import json
import joblib
import numpy as np
from PIL import Image
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, accuracy_score, confusion_matrix, precision_recall_fscore_support

# Paths
DATA_DIR = r"c:\Users\User\Desktop\Projects\cell-images-for-detecting-malaria\data\cell_images"
STATIC_DIR = r"c:\Users\User\Desktop\Projects\cell-images-for-detecting-malaria\static"
os.makedirs(STATIC_DIR, exist_ok=True)

def extract_features(img_path):
    try:
        with Image.open(img_path) as img:
            img_rgb = img.convert('RGB')
            arr = np.array(img_rgb)
            
            # Convert to grayscale to find cell mask
            img_gray = img.convert('L')
            gray_arr = np.array(img_gray)
            
            # Threshold to find cell pixels (ignore black background)
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
            
            # Percentiles inside cell (to capture dark parasite spots)
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
            
            # Combine all features
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
    except Exception as e:
        print(f"Error reading image {img_path}: {e}")
        return None

def main():
    print("Preparing training data...")
    X = []
    y = []
    
    # Track original filenames for selection of gallery sample images
    parasitized_files = []
    uninfected_files = []
    
    limit_per_class = 5000
    
    # 0 = Uninfected, 1 = Parasitized
    for label, folder in enumerate(["Uninfected", "Parasitized"]):
        folder_path = os.path.join(DATA_DIR, folder)
        all_files = [f for f in os.listdir(folder_path) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
        
        # Shuffle files deterministically
        np.random.seed(42)
        shuffled_files = np.random.permutation(all_files)
        selected_files = shuffled_files[:limit_per_class]
        
        if folder == "Parasitized":
            parasitized_files = list(shuffled_files[limit_per_class:limit_per_class + 12]) # set aside for gallery
        else:
            uninfected_files = list(shuffled_files[limit_per_class:limit_per_class + 12])
            
        print(f"Extracting features for {folder}...")
        count = 0
        for f in selected_files:
            feats = extract_features(os.path.join(folder_path, f))
            if feats is not None:
                X.append(feats)
                y.append(label)
                count += 1
        print(f"Loaded {count} images from {folder}")

    X = np.array(X)
    y = np.array(y)
    
    print(f"Total dataset shape: {X.shape}")
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    
    print("Training Random Forest Classifier (120 estimators)...")
    clf = RandomForestClassifier(n_estimators=120, random_state=42, n_jobs=-1)
    clf.fit(X_train, y_train)
    
    # Evaluate
    train_preds = clf.predict(X_train)
    test_preds = clf.predict(X_test)
    
    train_acc = accuracy_score(y_train, train_preds)
    test_acc = accuracy_score(y_test, test_preds)
    
    print(f"Train Accuracy: {train_acc:.4f}")
    print(f"Validation Accuracy: {test_acc:.4f}")
    
    # Metrics
    cm = confusion_matrix(y_test, test_preds)
    # cm layout: [[TN, FP], [FN, TP]]
    tn, fp, fn, tp = cm.ravel()
    
    precision, recall, f1, _ = precision_recall_fscore_support(y_test, test_preds, average='binary')
    
    print("\nConfusion Matrix:")
    print(cm)
    print(f"Precision: {precision:.4f}")
    print(f"Recall: {recall:.4f}")
    print(f"F1-Score: {f1:.4f}")
    
    # Save model
    model_path = os.path.join(r"c:\Users\User\Desktop\Projects\cell-images-for-detecting-malaria", "model.joblib")
    joblib.dump(clf, model_path)
    print(f"Model saved to {model_path}")
    
    # Prepare metrics JSON
    metrics = {
        "train_accuracy": float(train_acc),
        "val_accuracy": float(test_acc),
        "precision": float(precision),
        "recall": float(recall),
        "f1_score": float(f1),
        "confusion_matrix": {
            "tn": int(tn),
            "fp": int(fp),
            "fn": int(fn),
            "tp": int(tp)
        },
        "gallery_samples": {
            "parasitized": parasitized_files,
            "uninfected": uninfected_files
        }
    }
    
    metrics_path = os.path.join(STATIC_DIR, "model_metrics.json")
    with open(metrics_path, "w") as f:
        json.dump(metrics, f, indent=4)
    print(f"Metrics saved to {metrics_path}")

if __name__ == "__main__":
    main()
