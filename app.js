/**
 * DocuCompress - 100% Client-Side PDF Compressor
 * Privacy Guarantee: All computations run strictly in browser RAM.
 */

// Configure PDF.js Worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Application State
const state = {
    files: [], // Array of { id, file, originalSize, compressedBlob, compressedSize, progress, status, origPdfDoc, compPdfDoc, numPages }
    preset: 'balanced', // 'extreme', 'balanced', 'quality', 'custom'
    customSettings: {
        quality: 0.65,
        scale: 1.2,
        colorMode: 'color'
    },
    modal: {
        fileId: null,
        currentPage: 1,
        maxPages: 1
    }
};

// DOM Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const selectBtn = document.getElementById('selectBtn');
const queueList = document.getElementById('queueList');
const summarySection = document.getElementById('summarySection');
const clearAllBtn = document.getElementById('clearAllBtn');
const downloadZipBtn = document.getElementById('downloadZipBtn');

// Preset DOM Elements
const presetCards = document.querySelectorAll('.preset-card');
const presetIndicator = document.getElementById('presetIndicator');
const customPanel = document.getElementById('customPanel');
const qualityRange = document.getElementById('qualityRange');
const qualityValue = document.getElementById('qualityValue');
const scaleRange = document.getElementById('scaleRange');
const scaleValue = document.getElementById('scaleValue');
const colorModeRadios = document.querySelectorAll('input[name="colorMode"]');

// Summary DOM Elements
const totalCount = document.getElementById('totalCount');
const totalOriginalSize = document.getElementById('totalOriginalSize');
const totalCompressedSize = document.getElementById('totalCompressedSize');
const totalSavingsBadge = document.getElementById('totalSavingsBadge');

// Modal DOM Elements
const previewModal = document.getElementById('previewModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalFileName = document.getElementById('modalFileName');
const modalOrigMeta = document.getElementById('modalOrigMeta');
const modalCompMeta = document.getElementById('modalCompMeta');
const modalOrigCanvas = document.getElementById('modalOrigCanvas');
const modalCompCanvas = document.getElementById('modalCompCanvas');
const modalPrevPage = document.getElementById('modalPrevPage');
const modalNextPage = document.getElementById('modalNextPage');
const modalPageIndicator = document.getElementById('modalPageIndicator');
const modalDownloadBtn = document.getElementById('modalDownloadBtn');

// Preset Configuration Definitions
const PRESETS = {
    extreme: { scale: 0.8, quality: 0.35, colorMode: 'color', label: '고강도 압축 적용됨' },
    balanced: { scale: 1.2, quality: 0.65, colorMode: 'color', label: '권장 옵션 적용됨' },
    quality: { scale: 1.6, quality: 0.85, colorMode: 'color', label: '최소 압축 적용됨' }
};

/* ==========================================================================
   Initialization & Event Listeners
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    initDropzone();
    initPresets();
    initModalEvents();
    initSummaryActions();
});

// Dropzone Drag & Drop Setup
function initDropzone() {
    selectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    dropzone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFilesSelected(Array.from(e.target.files));
            fileInput.value = ''; // Reset
        }
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('dragover');
        });
    });

    dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = Array.from(dt.files).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
        if (files.length > 0) {
            handleFilesSelected(files);
        } else {
            alert('PDF 파일만 선택이 가능합니다.');
        }
    });
}

// Compression Preset Selection Setup
function initPresets() {
    presetCards.forEach(card => {
        card.addEventListener('click', () => {
            presetCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');

            const presetKey = card.getAttribute('data-preset');
            state.preset = presetKey;

            if (presetKey === 'custom') {
                customPanel.classList.remove('hidden');
                presetIndicator.textContent = '사용자 지정 설정 적용 중';
                presetIndicator.style.color = 'var(--accent-cyan)';
            } else {
                customPanel.classList.add('hidden');
                presetIndicator.textContent = PRESETS[presetKey].label;
                presetIndicator.style.color = 'var(--accent-emerald)';
            }
        });
    });

    // Custom Controls Listener
    qualityRange.addEventListener('input', (e) => {
        const val = e.target.value;
        qualityValue.textContent = `${val}%`;
        state.customSettings.quality = val / 100;
    });

    scaleRange.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        let dpiText = '약 100 DPI';
        if (val >= 1.5) dpiText = '약 200 DPI';
        else if (val >= 1.2) dpiText = '약 150 DPI';
        else if (val <= 0.8) dpiText = '약 72 DPI';
        
        scaleValue.textContent = `${val}x (${dpiText})`;
        state.customSettings.scale = val;
    });

    colorModeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.customSettings.colorMode = e.target.value;
        });
    });
}

// Summary Action Controls
function initSummaryActions() {
    clearAllBtn.addEventListener('click', () => {
        state.files = [];
        renderQueue();
        updateSummary();
    });

    downloadZipBtn.addEventListener('click', async () => {
        const completedFiles = state.files.filter(f => f.status === 'complete' && f.compressedBlob);
        if (completedFiles.length === 0) return;

        downloadZipBtn.disabled = true;
        downloadZipBtn.innerText = 'ZIP 파일 생성 중...';

        try {
            const zip = new JSZip();
            completedFiles.forEach((item, index) => {
                const nameWithoutExt = item.file.name.replace(/\.pdf$/i, '');
                const zipFileName = `${nameWithoutExt}_compressed.pdf`;
                zip.file(zipFileName, item.compressedBlob);
            });

            const content = await zip.generateAsync({ type: 'blob' });
            saveBlob(content, 'DocuCompress_PDF_Files.zip');
        } catch (err) {
            console.error('ZIP generation error:', err);
            alert('ZIP 파일 생성 중 오류가 발생했습니다.');
        } finally {
            downloadZipBtn.disabled = false;
            downloadZipBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                전체 다운로드 (ZIP)
            `;
        }
    });
}

/* ==========================================================================
   File Queue & Processing Logic
   ========================================================================== */

function handleFilesSelected(newFiles) {
    newFiles.forEach(file => {
        const item = {
            id: 'file_' + Math.random().toString(36).substr(2, 9),
            file: file,
            originalSize: file.size,
            compressedBlob: null,
            compressedSize: 0,
            progress: 0,
            status: 'queued', // 'queued', 'processing', 'complete', 'error'
            origPdfDoc: null,
            compPdfDoc: null,
            numPages: 0,
            errorMsg: ''
        };
        state.files.push(item);
    });

    renderQueue();
    updateSummary();
    processQueue();
}

async function processQueue() {
    const queuedItems = state.files.filter(f => f.status === 'queued');
    for (const item of queuedItems) {
        await compressFile(item);
    }
}

async function compressFile(item) {
    item.status = 'processing';
    item.progress = 5;
    updateFileCard(item);

    try {
        // Read file to ArrayBuffer
        const arrayBuffer = await item.file.arrayBuffer();
        
        // Load original document via PDF.js
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdfDoc = await loadingTask.promise;
        item.origPdfDoc = pdfDoc;
        item.numPages = pdfDoc.numPages;

        // Get compression options
        const settings = state.preset === 'custom' ? state.customSettings : PRESETS[state.preset];

        // Create target pdf-lib document
        const newPdfDoc = await PDFLib.PDFDocument.create();

        // Process page by page
        for (let i = 1; i <= pdfDoc.numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const viewport = page.getViewport({ scale: settings.scale });

            // Offscreen Canvas
            const canvas = document.createElement('canvas');
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            const ctx = canvas.getContext('2d');

            // Render PDF page to Canvas
            await page.render({ canvasContext: ctx, viewport: viewport }).promise;

            // Apply Grayscale filter if selected
            if (settings.colorMode === 'grayscale') {
                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const d = imgData.data;
                for (let p = 0; p < d.length; p += 4) {
                    const gray = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
                    d[p] = gray;
                    d[p + 1] = gray;
                    d[p + 2] = gray;
                }
                ctx.putImageData(imgData, 0, 0);
            }

            // Export to JPEG base64 data url
            const jpegDataUrl = canvas.toDataURL('image/jpeg', settings.quality);
            const jpegBytes = dataURLToUint8Array(jpegDataUrl);

            // Embed into pdf-lib
            const embeddedImg = await newPdfDoc.embedJpg(jpegBytes);
            
            // Match original page dimensions (unscaled)
            const origViewport = page.getViewport({ scale: 1.0 });
            const newPage = newPdfDoc.addPage([origViewport.width, origViewport.height]);
            newPage.drawImage(embeddedImg, {
                x: 0,
                y: 0,
                width: origViewport.width,
                height: origViewport.height
            });

            // Update Progress
            item.progress = Math.round((i / pdfDoc.numPages) * 90);
            updateFileCard(item);
        }

        // Save PDF
        const pdfBytes = await newPdfDoc.save();
        const compressedBlob = new Blob([pdfBytes], { type: 'application/pdf' });

        item.compressedBlob = compressedBlob;
        item.compressedSize = compressedBlob.size;
        item.status = 'complete';
        item.progress = 100;

        // Load compressed doc into PDF.js for visual preview modal
        const compArrayBuffer = await compressedBlob.arrayBuffer();
        item.compPdfDoc = await pdfjsLib.getDocument({ data: compArrayBuffer }).promise;

    } catch (err) {
        console.error('Compression error for', item.file.name, err);
        item.status = 'error';
        item.errorMsg = err.message || '압축 오류가 발생했습니다.';
    }

    updateFileCard(item);
    updateSummary();
}

/* ==========================================================================
   UI Render & Dynamic Component Creation
   ========================================================================== */

function renderQueue() {
    queueList.innerHTML = '';

    if (state.files.length === 0) {
        summarySection.classList.add('hidden');
        return;
    }

    summarySection.classList.remove('hidden');

    state.files.forEach(item => {
        const card = createFileCardDOM(item);
        queueList.appendChild(card);
    });
}

function createFileCardDOM(item) {
    const card = document.createElement('div');
    card.className = 'file-card card-glass';
    card.id = item.id;

    const formattedOrig = formatBytes(item.originalSize);
    const formattedComp = item.compressedSize ? formatBytes(item.compressedSize) : '-';
    const savings = item.compressedSize ? Math.max(0, Math.round((1 - item.compressedSize / item.originalSize) * 100)) : 0;

    card.innerHTML = `
        <div class="file-card-info">
            <div class="file-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            </div>
            <div class="file-details">
                <div class="file-name" title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</div>
                <div class="file-sizes">
                    <span>${formattedOrig}</span>
                    ${item.status === 'complete' ? `<span class="size-arrow">→</span><span style="color:#6ee7b7; font-weight:700;">${formattedComp}</span>` : ''}
                </div>
            </div>
        </div>

        <div class="file-card-status">
            ${item.status === 'processing' ? `
                <div class="progress-wrap">
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" style="width: ${item.progress}%"></div>
                    </div>
                    <span class="progress-text">처리 중... ${item.progress}%</span>
                </div>
            ` : ''}

            ${item.status === 'complete' ? `
                <div class="savings-pill">-${savings}% 절감</div>
            ` : ''}

            ${item.status === 'error' ? `
                <span style="color:#f87171; font-size:0.8rem; font-weight:600;">오류 발생</span>
            ` : ''}
        </div>

        <div class="file-card-actions">
            ${item.status === 'complete' ? `
                <button class="icon-btn preview-btn" title="비교 미리보기" onclick="openPreviewModal('${item.id}')">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                </button>
                <button class="icon-btn download-btn" title="다운로드" onclick="downloadSingleFile('${item.id}')">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                </button>
            ` : ''}
            <button class="icon-btn remove-btn" title="삭제" onclick="removeFile('${item.id}')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>
    `;

    return card;
}

function updateFileCard(item) {
    const existingCard = document.getElementById(item.id);
    if (!existingCard) return;

    const newCard = createFileCardDOM(item);
    existingCard.replaceWith(newCard);
}

function updateSummary() {
    const totalFilesCount = state.files.length;
    totalCount.textContent = `${totalFilesCount}개`;

    const totalOrigBytes = state.files.reduce((acc, f) => acc + f.originalSize, 0);
    totalOriginalSize.textContent = formatBytes(totalOrigBytes);

    const completedFiles = state.files.filter(f => f.status === 'complete');
    const totalCompBytes = completedFiles.reduce((acc, f) => acc + f.compressedSize, 0);

    if (completedFiles.length > 0) {
        totalCompressedSize.textContent = formatBytes(totalCompBytes);
        const overallSavings = Math.max(0, Math.round((1 - totalCompBytes / totalOrigBytes) * 100));
        totalSavingsBadge.textContent = `-${overallSavings}%`;
        downloadZipBtn.disabled = false;
    } else {
        totalCompressedSize.textContent = '-';
        totalSavingsBadge.textContent = '0%';
        downloadZipBtn.disabled = true;
    }
}

function removeFile(fileId) {
    state.files = state.files.filter(f => f.id !== fileId);
    renderQueue();
    updateSummary();
}

function downloadSingleFile(fileId) {
    const item = state.files.find(f => f.id === fileId);
    if (!item || !item.compressedBlob) return;

    const nameWithoutExt = item.file.name.replace(/\.pdf$/i, '');
    const downloadName = `${nameWithoutExt}_compressed.pdf`;
    saveBlob(item.compressedBlob, downloadName);
}

/* ==========================================================================
   Visual Side-by-Side Comparison Modal
   ========================================================================== */

function initModalEvents() {
    closeModalBtn.addEventListener('click', closePreviewModal);
    previewModal.addEventListener('click', (e) => {
        if (e.target === previewModal) closePreviewModal();
    });

    modalPrevPage.addEventListener('click', () => {
        if (state.modal.currentPage > 1) {
            state.modal.currentPage--;
            renderModalPages();
        }
    });

    modalNextPage.addEventListener('click', () => {
        if (state.modal.currentPage < state.modal.maxPages) {
            state.modal.currentPage++;
            renderModalPages();
        }
    });

    modalDownloadBtn.addEventListener('click', () => {
        if (state.modal.fileId) {
            downloadSingleFile(state.modal.fileId);
        }
    });
}

async function openPreviewModal(fileId) {
    const item = state.files.find(f => f.id === fileId);
    if (!item || !item.origPdfDoc || !item.compPdfDoc) return;

    state.modal.fileId = fileId;
    state.modal.currentPage = 1;
    state.modal.maxPages = item.numPages;

    modalFileName.textContent = item.file.name;
    modalOrigMeta.textContent = formatBytes(item.originalSize);
    modalCompMeta.textContent = formatBytes(item.compressedSize);

    previewModal.classList.remove('hidden');
    await renderModalPages();
}

function closePreviewModal() {
    previewModal.classList.add('hidden');
    state.modal.fileId = null;
}

async function renderModalPages() {
    const item = state.files.find(f => f.id === state.modal.fileId);
    if (!item) return;

    const pageNum = state.modal.currentPage;
    modalPageIndicator.textContent = `Page ${pageNum} of ${state.modal.maxPages}`;
    modalPrevPage.disabled = pageNum <= 1;
    modalNextPage.disabled = pageNum >= state.modal.maxPages;

    // Render Original Page
    await renderCanvasPage(item.origPdfDoc, pageNum, modalOrigCanvas);
    // Render Compressed Page
    await renderCanvasPage(item.compPdfDoc, pageNum, modalCompCanvas);
}

async function renderCanvasPage(pdfDoc, pageNum, canvas) {
    try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.0 });

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');

        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    } catch (e) {
        console.error('Modal page render error:', e);
    }
}

/* ==========================================================================
   Utility Helper Functions
   ========================================================================== */

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function dataURLToUint8Array(dataURL) {
    const base64 = dataURL.split(',')[1];
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
