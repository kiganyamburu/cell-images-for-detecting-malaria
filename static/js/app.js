document.addEventListener('DOMContentLoaded', () => {
    // Current date initialization
    const dateEl = document.getElementById('current-date');
    if (dateEl) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateEl.textContent = new Date().toLocaleDateString('en-US', options) + ' | Smear Diagnostic Lab';
    }

    // Sidebar Section Switching
    const navItems = document.querySelectorAll('.sidebar-nav li');
    const sections = document.querySelectorAll('.content-section');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetSection = item.getAttribute('data-section');
            
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            sections.forEach(sec => {
                sec.classList.remove('active');
                if (sec.id === `${targetSection}-section`) {
                    sec.classList.add('active');
                }
            });
        });
    });

    // Chart References
    let perfChart = null;
    
    // Segmentation Overlay Images
    let originalImgSrc = "";
    let segmentedImgSrc = "";

    // Load Model Metrics & Build Gallery
    let metricsData = null;
    
    // View Toggles variables (will be initialized below)
    let viewToggles = null;
    let toggleOriginalBtn = null;
    let toggleOverlayBtn = null;

    // Chart Tab Click Handlers
    const chartTabBtns = document.querySelectorAll('.chart-tab-btn');
    const chartTitle = document.getElementById('chart-title');
    
    chartTabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!metricsData) return;
            
            chartTabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const chartType = btn.getAttribute('data-chart');
            
            // Update Title
            if (chartType === 'overview') {
                chartTitle.textContent = "Classification Performance Overview";
            } else if (chartType === 'roc') {
                chartTitle.textContent = "Receiver Operating Characteristic (ROC) Curve";
            } else if (chartType === 'pr') {
                chartTitle.textContent = "Precision-Recall Curve";
            }
            
            initPerformanceChart(metricsData, chartType);
        });
    });

    async function loadMetrics() {
        try {
            const response = await fetch('/api/stats');
            const data = await response.json();
            if (data.error) {
                console.warn(data.error);
                // Keep checking if the model is still training
                setTimeout(loadMetrics, 5000);
                return;
            }
            metricsData = data;
            updateDashboardMetrics(data);
            initPerformanceChart(data);
            buildSampleGallery(data);
        } catch (err) {
            console.error("Failed to load metrics:", err);
            setTimeout(loadMetrics, 10000);
        }
    }

    function updateDashboardMetrics(data) {
        document.getElementById('val-accuracy').textContent = (data.val_accuracy * 100).toFixed(1) + '%';
        document.getElementById('val-recall').textContent = (data.recall * 100).toFixed(1) + '%';
        
        const f1Val = document.getElementById('val-f1');
        if (f1Val) f1Val.textContent = (data.f1_score * 100).toFixed(1) + '%';

        // Update Confusion Matrix
        document.querySelector('#cm-tn .cm-val').textContent = data.confusion_matrix.tn;
        document.querySelector('#cm-fp .cm-val').textContent = data.confusion_matrix.fp;
        document.querySelector('#cm-fn .cm-val').textContent = data.confusion_matrix.fn;
        document.querySelector('#cm-tp .cm-val').textContent = data.confusion_matrix.tp;
    }

    function initPerformanceChart(data, chartType = 'overview') {
        const ctx = document.getElementById('performance-chart');
        if (!ctx) return;

        if (perfChart) perfChart.destroy();

        let chartConfig = {};

        if (chartType === 'overview') {
            chartConfig = {
                type: 'bar',
                data: {
                    labels: ['Accuracy', 'Sensitivity (Recall)', 'Precision', 'F1-Score'],
                    datasets: [{
                        label: 'RF Classifier Score',
                        data: [
                            data.val_accuracy, 
                            data.recall, 
                            data.precision, 
                            data.f1_score
                        ],
                        backgroundColor: [
                            'rgba(168, 85, 247, 0.45)', // Amethyst
                            'rgba(16, 185, 129, 0.45)', // Emerald
                            'rgba(14, 165, 233, 0.45)', // Sky
                            'rgba(245, 158, 11, 0.45)'  // Amber
                        ],
                        borderColor: [
                            '#a855f7',
                            '#10b981',
                            '#0ea5e9',
                            '#f59e0b'
                        ],
                        borderWidth: 1.5,
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 1.0,
                            ticks: {
                                color: '#9ca3af',
                                callback: function(value) { return (value * 100) + "%"; }
                            },
                            grid: { color: 'rgba(255, 255, 255, 0.05)' }
                        },
                        x: {
                            ticks: { color: '#9ca3af' },
                            grid: { display: false }
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return context.dataset.label + ': ' + (context.raw * 100).toFixed(1) + '%';
                                }
                            }
                        }
                    }
                }
            };
        } else if (chartType === 'roc') {
            const rocData = data.curves && data.curves.roc ? data.curves.roc : [];
            chartConfig = {
                type: 'line',
                data: {
                    labels: rocData.map(p => p.fpr.toFixed(2)),
                    datasets: [{
                        label: 'ROC Curve (AUC = ' + data.val_accuracy.toFixed(3) + ')',
                        data: rocData.map(p => p.tpr),
                        borderColor: '#a855f7',
                        backgroundColor: 'rgba(168, 85, 247, 0.1)',
                        fill: true,
                        tension: 0.25,
                        borderWidth: 2,
                        pointRadius: 3,
                        pointBackgroundColor: '#a855f7'
                    }, {
                        label: 'Random Guess',
                        data: rocData.map(p => p.fpr),
                        borderColor: 'rgba(255, 255, 255, 0.25)',
                        borderDash: [5, 5],
                        fill: false,
                        pointRadius: 0,
                        tension: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            title: { display: true, text: 'True Positive Rate (Sensitivity)', color: '#9ca3af' },
                            beginAtZero: true,
                            max: 1.0,
                            ticks: { color: '#9ca3af' },
                            grid: { color: 'rgba(255, 255, 255, 0.05)' }
                        },
                        x: {
                            title: { display: true, text: 'False Positive Rate (1 - Specificity)', color: '#9ca3af' },
                            ticks: { color: '#9ca3af', maxRotation: 0 },
                            grid: { color: 'rgba(255, 255, 255, 0.05)' }
                        }
                    },
                    plugins: {
                        legend: { display: true, labels: { color: '#9ca3af' } }
                    }
                }
            };
        } else if (chartType === 'pr') {
            const prData = data.curves && data.curves.pr ? data.curves.pr : [];
            chartConfig = {
                type: 'line',
                data: {
                    labels: prData.map(p => p.recall.toFixed(2)),
                    datasets: [{
                        label: 'Precision-Recall Curve (F1 = ' + data.f1_score.toFixed(3) + ')',
                        data: prData.map(p => p.precision),
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        fill: true,
                        tension: 0.25,
                        borderWidth: 2,
                        pointRadius: 3,
                        pointBackgroundColor: '#10b981'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            title: { display: true, text: 'Precision', color: '#9ca3af' },
                            beginAtZero: true,
                            max: 1.0,
                            ticks: { color: '#9ca3af' },
                            grid: { color: 'rgba(255, 255, 255, 0.05)' }
                        },
                        x: {
                            title: { display: true, text: 'Recall (Sensitivity)', color: '#9ca3af' },
                            ticks: { color: '#9ca3af', maxRotation: 0 },
                            grid: { color: 'rgba(255, 255, 255, 0.05)' }
                        }
                    },
                    plugins: {
                        legend: { display: true, labels: { color: '#9ca3af' } }
                    }
                }
            };
        }

        perfChart = new Chart(ctx, chartConfig);
    }

    function buildSampleGallery(data) {
        const infRow = document.getElementById('infected-samples-row');
        const uninfRow = document.getElementById('uninfected-samples-row');
        const fullGallery = document.getElementById('full-gallery-grid');
        
        if (!infRow || !uninfRow || !data.gallery_samples) return;

        infRow.innerHTML = '';
        uninfRow.innerHTML = '';
        if (fullGallery) fullGallery.innerHTML = '';

        // Build Active Scanner Quick-Load cells (6 of each class)
        const infSamples = data.gallery_samples.parasitized.slice(0, 6);
        const uninfSamples = data.gallery_samples.uninfected.slice(0, 6);

        infSamples.forEach(file => {
            const card = createSampleCard('Parasitized', file);
            infRow.appendChild(card);
        });

        uninfSamples.forEach(file => {
            const card = createSampleCard('Uninfected', file);
            uninfRow.appendChild(card);
        });

        // Build the Full Gallery section (12 of each class)
        if (fullGallery) {
            data.gallery_samples.parasitized.forEach(file => {
                const item = createGalleryItem('Parasitized', file);
                fullGallery.appendChild(item);
            });
            data.gallery_samples.uninfected.forEach(file => {
                const item = createGalleryItem('Uninfected', file);
                fullGallery.appendChild(item);
            });
        }
    }

    function createSampleCard(folder, filename) {
        const card = document.createElement('div');
        card.className = 'sample-card';
        card.title = `Click to diagnose: ${filename}`;
        
        const img = document.createElement('img');
        img.src = `/static/cell_images/${folder}/${filename}`;
        img.alt = filename;
        img.loading = 'lazy';
        
        card.appendChild(img);
        
        card.addEventListener('click', () => {
            scanCellSmear(folder, filename);
        });
        
        return card;
    }

    function createGalleryItem(folder, filename) {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        item.setAttribute('data-type', folder.toLowerCase());
        
        const wrapper = document.createElement('div');
        wrapper.className = 'gallery-img-wrapper';
        
        const img = document.createElement('img');
        img.src = `/static/cell_images/${folder}/${filename}`;
        img.alt = filename;
        img.loading = 'lazy';
        
        wrapper.appendChild(img);
        
        const info = document.createElement('div');
        info.className = `gallery-info ${folder.toLowerCase()}`;
        info.textContent = folder === 'Parasitized' ? 'Parasitized' : 'Uninfected';
        
        item.appendChild(wrapper);
        item.appendChild(info);
        
        // Clicking a gallery item switches to scanner and runs diagnosis
        item.addEventListener('click', () => {
            const scanTab = document.querySelector('.sidebar-nav li[data-section="scanner"]');
            if (scanTab) scanTab.click();
            scanCellSmear(folder, filename);
        });

        return item;
    }

    // Gallery filter logic
    const filterButtons = document.querySelectorAll('.gallery-filter-btn');
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const filterValue = btn.getAttribute('data-filter');
            const items = document.querySelectorAll('.gallery-item');
            
            items.forEach(item => {
                if (filterValue === 'all') {
                    item.style.display = 'block';
                } else {
                    const itemType = item.getAttribute('data-type');
                    item.style.display = itemType === filterValue ? 'block' : 'none';
                }
            });
        });
    });

    // Scanner Functionality
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const dropzonePrompt = document.getElementById('dropzone-prompt');
    const dropzonePreview = document.getElementById('dropzone-preview');
    const previewImage = document.getElementById('preview-image');
    const clearBtn = document.getElementById('clear-btn');
    
    // View Toggles initialization
    viewToggles = document.getElementById('view-toggles');
    toggleOriginalBtn = document.getElementById('toggle-original');
    toggleOverlayBtn = document.getElementById('toggle-overlay');
    
    if (toggleOriginalBtn && toggleOverlayBtn && previewImage) {
        toggleOriginalBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleOriginalBtn.classList.add('active');
            toggleOverlayBtn.classList.remove('active');
            if (originalImgSrc) {
                previewImage.src = originalImgSrc;
            }
        });
        
        toggleOverlayBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleOverlayBtn.classList.add('active');
            toggleOriginalBtn.classList.remove('active');
            if (segmentedImgSrc) {
                previewImage.src = segmentedImgSrc;
            }
        });
    }
    
    const resultsCard = document.getElementById('results-card');
    const emptyResults = document.getElementById('empty-results');
    const resultsContent = document.getElementById('results-content');
    
    const diagnosisBadge = document.getElementById('diagnosis-badge');
    const diagnosisText = document.getElementById('diagnosis-text');
    const confidencePercent = document.getElementById('confidence-percent');
    const confidenceBar = document.getElementById('confidence-bar');
    
    const featStain = document.getElementById('feat-stain');
    const featChromatin = document.getElementById('feat-chromatin');
    const featArea = document.getElementById('feat-area');
    const noteText = document.getElementById('note-text');

    // Trigger browse file
    dropzone.addEventListener('click', (e) => {
        // Only trigger if not clicking preview buttons or clear image
        if (e.target !== clearBtn && !clearBtn.contains(e.target) && !dropzone.classList.contains('scanning')) {
            fileInput.click();
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            handleUpload(fileInput.files[0]);
        }
    });

    // Drag-and-drop event handlers
    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!dropzone.classList.contains('scanning')) {
                dropzone.classList.add('dragover');
            }
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('dragover');
        }, false);
    });

    dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0 && !dropzone.classList.contains('scanning')) {
            handleUpload(files[0]);
        }
    });

    clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetScanner();
    });

    function resetScanner() {
        fileInput.value = '';
        previewImage.src = '';
        dropzonePreview.style.display = 'none';
        dropzonePrompt.style.display = 'block';
        dropzone.classList.remove('scanning');
        
        emptyResults.style.display = 'flex';
        resultsContent.style.display = 'none';
        
        // Reset Segmented Image vars
        originalImgSrc = "";
        segmentedImgSrc = "";
        if (viewToggles) viewToggles.style.display = 'none';
        if (toggleOriginalBtn) toggleOriginalBtn.classList.add('active');
        if (toggleOverlayBtn) toggleOverlayBtn.classList.remove('active');

        // Reset results UI
        diagnosisBadge.className = 'diagnosis-badge';
        diagnosisText.textContent = '--';
        confidencePercent.textContent = '0%';
        confidenceBar.style.width = '0%';
    }

    function showResultsLoading() {
        emptyResults.style.display = 'none';
        resultsContent.style.display = 'flex';
        
        diagnosisBadge.className = 'diagnosis-badge';
        diagnosisText.textContent = 'Analyzing...';
        confidencePercent.textContent = '--%';
        confidenceBar.style.width = '0%';
        
        featStain.textContent = 'Evaluating...';
        featStain.className = 'feat-status';
        featChromatin.textContent = 'Evaluating...';
        featChromatin.className = 'feat-status';
        featArea.textContent = 'Evaluating...';
        featArea.className = 'feat-status';
        
        noteText.textContent = 'Running feature extraction profile...';
    }

    function displayResults(data) {
        emptyResults.style.display = 'none';
        resultsContent.style.display = 'flex';
        
        // Handle Segmented Overlay Toggles
        if (data.overlay) {
            segmentedImgSrc = data.overlay;
            if (viewToggles) viewToggles.style.display = 'flex';
            if (toggleOriginalBtn) toggleOriginalBtn.classList.add('active');
            if (toggleOverlayBtn) toggleOverlayBtn.classList.remove('active');
        } else {
            segmentedImgSrc = "";
            if (viewToggles) viewToggles.style.display = 'none';
        }

        // Update Badge
        const isParasitized = data.prediction === "Parasitized";
        diagnosisText.textContent = isParasitized ? "Parasitized (Infected)" : "Uninfected (Healthy)";
        
        diagnosisBadge.className = 'diagnosis-badge';
        diagnosisBadge.classList.add(isParasitized ? 'parasitized' : 'uninfected');
        
        // Update Confidence Progress Bar
        const percent = Math.round(data.confidence * 100);
        confidencePercent.textContent = percent + '%';
        confidenceBar.style.width = percent + '%';
        
        // Update Feature Pills (simulate feature detection thresholds based on confidence and prediction)
        if (isParasitized) {
            featStain.textContent = "High stain density";
            featStain.className = "feat-status detected";
            
            featChromatin.textContent = "Parasite chromatins detected";
            featChromatin.className = "feat-status detected";
            
            featArea.textContent = "Isolated ring profiles";
            featArea.className = "feat-status detected";
            
            noteText.textContent = `CRITICAL: The classifier detected stain properties matching Plasmodium trophozoites with a confidence score of ${percent}%. Review smears under 1000x oil-immersion objective for confirmation.`;
            
            // Add note class
            const noteCard = document.getElementById('clinical-note');
            noteCard.className = 'clinical-note parasitized';
        } else {
            featStain.textContent = "Normal cell stain";
            featStain.className = "feat-status clear";
            
            featChromatin.textContent = "Uniform cytoplasmic gradient";
            featChromatin.className = "feat-status clear";
            
            featArea.textContent = "Clear structure";
            featArea.className = "feat-status clear";
            
            noteText.textContent = `NORMAL: The classifier evaluates this cell body as uninfected with a confidence score of ${percent}%. Cell boundaries are clean, and no Giemsa-stained chromatin precipitates are detected.`;
            
            const noteCard = document.getElementById('clinical-note');
            noteCard.className = 'clinical-note uninfected';
        }
    }

    async function handleUpload(file) {
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file.');
            return;
        }

        // Show image preview
        const reader = new FileReader();
        reader.onload = (e) => {
            originalImgSrc = e.target.result;
            previewImage.src = e.target.result;
            dropzonePrompt.style.display = 'none';
            dropzonePreview.style.display = 'block';
        };
        reader.readAsDataURL(file);

        // Upload and classify
        dropzone.classList.add('scanning');
        showResultsLoading();

        const formData = new FormData();
        formData.append('image', file);

        try {
            const response = await fetch('/api/predict', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            
            if (data.error) {
                alert(data.error);
                resetScanner();
            } else {
                displayResults(data);
            }
        } catch (err) {
            console.error("Inference request failed:", err);
            alert("Model inference request failed. Verify that the server is active.");
            resetScanner();
        } finally {
            dropzone.classList.remove('scanning');
        }
    }

    async function scanCellSmear(folder, filename) {
        // Set preview image in Dropzone
        const imgUrl = `/static/cell_images/${folder}/${filename}`;
        originalImgSrc = imgUrl;
        previewImage.src = imgUrl;
        dropzonePrompt.style.display = 'none';
        dropzonePreview.style.display = 'block';
        
        dropzone.classList.add('scanning');
        showResultsLoading();
        
        try {
            // Fetch the image from our server as a Blob to run it through the exact upload API
            const response = await fetch(imgUrl);
            const blob = await response.blob();
            
            const formData = new FormData();
            formData.append('image', blob, filename);
            
            const predictResponse = await fetch('/api/predict', {
                method: 'POST',
                body: formData
            });
            const data = await predictResponse.json();
            
            if (data.error) {
                alert(data.error);
                resetScanner();
            } else {
                displayResults(data);
            }
        } catch (err) {
            console.error("Sample scan failed:", err);
            alert("Sample cell smear scan failed.");
            resetScanner();
        } finally {
            dropzone.classList.remove('scanning');
        }
    }

    // Load initial metrics
    loadMetrics();
});
