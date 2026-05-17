# Hemoscan AI: Malaria Cell Diagnostics Portal

Hemoscan AI is an automated stained blood smear microscopy analysis portal that classifies red blood cell micrographs as either **Parasitized (Infected)** or **Uninfected (Healthy)**. It uses a machine learning classifier trained on the official NIH malaria dataset, wrapped in a premium, glassmorphic web dashboard for clinicians and researchers.

---

## 📊 Model Performance Metrics

The classifier was trained using a Random Forest model on 10,000 balanced images (5,000 parasitized, 5,000 uninfected) from the NIH Malaria Dataset:

* **Validation Accuracy**: `95.25%`
* **Precision**: `96.03%`
* **Recall (Sensitivity)**: `94.40%`
* **F1-Score**: `95.21%`

### Confusion Matrix
* **True Negatives (TN - Healthy cells correctly detected)**: `961`
* **True Positives (TP - Infected cells correctly detected)**: `944`
* **False Negatives (FN - Infected cells missed)**: `56`
* **False Positives (FP - Healthy cells flagged)**: `39`

---

## ⚙️ Advanced Feature Extraction Methodology

Instead of utilizing a heavy, black-box neural network, Hemoscan AI extracts targeted biological features from blood smears:
1. **Cell Mask Segmentation**: Isolates the red blood cell body from the dark slide background using grayscale intensity thresholding.
2. **Giemsa Stain Purple Ratio**: Computes `(Red + Blue) / (2 * Green + 1e-5)` across cell pixels to isolate the characteristic purple chromatin stained by Giemsa dye.
3. **Chromatin Contrast Statistics**: Computes channel-specific color percentiles to identify focal, high-contrast dark spots inside the cytoplasm.
4. **Cropped Structural Features**: Crops the bounding box of the cell and downsamples it to a 16x16 pixel grayscale feature map to recognize morphological shape changes (e.g. crescent gametocytes).

---

## 🚀 Getting Started

### Prerequisites

You need a Python environment with the following dependencies:
```bash
pip install flask numpy pillow scikit-learn joblib
```

### 1. Train the Classifier
To train the model and generate performance metrics:
```bash
python train_model.py
```
This script will:
- Parse cell images in `data/cell_images/`.
- Extract advanced features.
- Train a `RandomForestClassifier` on 10,000 samples.
- Save the classifier to `model.joblib`.
- Export training metrics to `static/model_metrics.json`.

### 2. Start the Web Portal
Start the Flask server:
```bash
python app.py
```
Navigate to `http://localhost:5000` in your web browser.

---

## 🎨 Web Portal Features

* **Overview Dashboard**: Live statistics showing AI engine status, accuracy, sensitivity, and dataset metrics.
* **Active Scanner**: Drag-and-drop file uploader with a laser-sweep scan animation and real-time classification results. Includes a floating view toggle to swap between the **Original Smear** and the **AI Segmented Spot** highlighting the precise coordinates of the parasite.
* **Quick-Load Sample Gallery**: Instantly load and classify sample micrographs from the NIH dataset.
* **Performance Analytics**: Interactive confusion matrix and multi-tab charts powered by Chart.js. Clinicians can toggle between the model overview bar chart, the validation **ROC Curve**, and the **Precision-Recall Curve**.
* **Educational Hub**: Academic resources detailing malaria pathology, smear diagnosis methods, and parasite stages.
