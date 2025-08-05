/**
 * UI Manager Module
 * Handles all DOM manipulation, PDF viewer, and user interface interactions
 */

class UIManager {
    constructor(conversionEngine) {
        console.log('🔍 TEST: UIManager constructor running');
        this.conversionEngine = conversionEngine;
        
        // State variables
        this.currentPDF = null;
        this.currentPage = 1;
        this.totalPages = 1;
        this.currentScale = 1.0;
        this.originalViewport = null;
        this.containerWidth = 0;
        this.isEditMode = false;
        this.hasUnsavedChanges = false;
        
        // File management
        this.pdfFiles = [];
        this.currentFileIndex = 0;
        this.fileQueue = [];
        
        // Initialize queue persistence
        this.queuePersistence = new QueuePersistence();
        
        this.initializeEventListeners();
        console.log('🔍 TEST: About to call initializeQueuePersistence');
        this.initializeQueuePersistence();
    }

    /**
     * Initialize queue persistence functionality
     */
    async initializeQueuePersistence() {
        console.log('🔍 TEST: initializeQueuePersistence method called');
        
        // Setup page refresh warning
        this.setupPageRefreshWarning();
        
        // Restore queue on page load
        await this.restoreQueueOnLoad();
    }

    /**
     * Setup page refresh warning for unsaved files
     */
    setupPageRefreshWarning() {
        let hasUnprocessedFiles = false;

        // Update warning status when files are added/removed
        const updateWarningStatus = () => {
            hasUnprocessedFiles = this.fileQueue && this.fileQueue.length > 0;
            this.updateWarningIndicator(hasUnprocessedFiles);
        };

        // Show warning indicator on page
        this.updateWarningIndicator = (show) => {
            let indicator = document.querySelector('.unsaved-changes-warning');
            
            if (show && !indicator) {
                indicator = document.createElement('div');
                indicator.className = 'unsaved-changes-warning';
                indicator.textContent = 'You have unprocessed files in queue';
                document.body.appendChild(indicator);
            } else if (!show && indicator) {
                indicator.remove();
            }
        };

        // Warn before page unload
        window.addEventListener('beforeunload', (e) => {
            if (hasUnprocessedFiles) {
                const message = 'You have unprocessed files in your queue. Are you sure you want to leave?';
                e.preventDefault();
                e.returnValue = message;
                return message;
            }
        });

        // Store the update function for use in other methods
        this.updateWarningStatus = updateWarningStatus;
    }

    /**
     * Restore queue on page load
     */
    async restoreQueueOnLoad() {
        console.log('🔍 RESTORE: Starting restoration check...');
        console.log('🔍 RESTORE: Has saved queue?', this.queuePersistence.hasSavedQueue());
        
        if (this.queuePersistence.hasSavedQueue()) {
            console.log('🔍 RESTORE: Calling restoreQueue()...');
            const restoredFiles = await this.queuePersistence.restoreQueue();
            console.log('🔍 RESTORE: Got files:', restoredFiles.length);
            
            if (restoredFiles.length > 0) {
                console.log('🔍 RESTORE: Adding to fileQueue. Current length:', this.fileQueue.length);
                
                // Add restored files to queue
                restoredFiles.forEach(file => {
                    const queueItem = {
                        id: Date.now() + Math.random(),
                        file: file,
                        addedAt: new Date()
                    };
                    this.fileQueue.push(queueItem);
                });
                
                console.log('🔍 RESTORE: New fileQueue length:', this.fileQueue.length);
                
                this.updateQueueDisplay();
                this.updateWarningStatus();
            }
        } else {
            console.log('🔍 RESTORE: No saved queue found');
        }
    }

    /**
     * Auto-save queue whenever files are added/removed
     */
    async autoSaveQueue() {
        if (this.fileQueue && this.fileQueue.length > 0) {
            const files = this.fileQueue.map(item => item.file);
            await this.queuePersistence.saveQueue(files);
        } else {
            this.queuePersistence.clearSavedQueue();
        }
        
        if (this.updateWarningStatus) {
            this.updateWarningStatus();
        }
    }

    /**
     * Initialize event listeners
     */
    initializeEventListeners() {
        // File upload events
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        
        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.handleFiles(e));
        }
        
        if (uploadArea) {
            // Drag and drop
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                uploadArea.classList.add('dragover');
            });
            
            uploadArea.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                uploadArea.classList.remove('dragover');
            });
            
            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                uploadArea.classList.remove('dragover');
                
                const files = Array.from(e.dataTransfer.files);
                this.addFilesToQueue(files);
            });
            
            uploadArea.addEventListener('click', (e) => {
                if (!e.target.closest('button')) {
                    fileInput.click();
                }
            });
        }

        // PDF Controls
        this.setupPDFControls();

        // Window resize handler for PDF container
        window.addEventListener('resize', () => {
            if (this.currentPDF) {
                setTimeout(() => {
                    this.renderPage(this.currentPage);
                }, 100);
            }
        });

        // Global functions for template access
        this.setupGlobalFunctions();
    }

    /**
     * Setup PDF viewer controls
     */
    setupPDFControls() {
        const prevBtn = document.getElementById('prevPageBtn');
        const nextBtn = document.getElementById('nextPageBtn');
        const fitWidthBtn = document.getElementById('fitWidthBtn');

        if (prevBtn) prevBtn.addEventListener('click', () => this.prevPage());
        if (nextBtn) nextBtn.addEventListener('click', () => this.nextPage());
        if (fitWidthBtn) fitWidthBtn.addEventListener('click', () => this.fitToWidth());
    }

    /**
     * Setup global functions that the HTML template expects
     */
    setupGlobalFunctions() {
        // File queue management
        window.removeFromQueue = (id) => {
            this.fileQueue = this.fileQueue.filter(item => item.id !== id);
            this.updateQueueDisplay();
            this.autoSaveQueue(); // Auto-save after removing files
        };

        window.clearQueue = () => {
            if (this.fileQueue.length === 0) return;
            
            const confirmClear = confirm(`Are you sure you want to remove all ${this.fileQueue.length} file(s) from the queue?`);
            if (confirmClear) {
                this.fileQueue = [];
                this.updateQueueDisplay();
                this.autoSaveQueue(); // Auto-save after clearing queue
            }
        };

        // Edit mode functions
        window.toggleEditMode = () => this.toggleEditMode();
        window.saveChanges = () => this.saveChanges();
        window.markAsChanged = () => this.markAsChanged();
        window.updateProductField = (index, field, value) => this.updateProductField(index, field, value);

        // PDF controls
        window.zoomIn = () => this.zoomIn();
        window.zoomOut = () => this.zoomOut();
    }

    /**
     * Handle file selection
     */
    handleFiles(event) {
        const files = Array.from(event.target.files);
        if (files.length > 0) {
            this.addFilesToQueue(files);
        }
    }

    /**
     * Add files to processing queue
     */
    addFilesToQueue(files) {
        const pdfFiles = files.filter(f => 
            f.type === 'application/pdf' || 
            f.name.toLowerCase().endsWith('.pdf')
        );
        
        if (pdfFiles.length === 0) {
            alert('Please select PDF files only.');
            return;
        }
        
        // Add files to queue with unique IDs
        pdfFiles.forEach(file => {
            const queueItem = {
                id: Date.now() + Math.random(),
                file: file,
                addedAt: new Date()
            };
            this.fileQueue.push(queueItem);
        });
        
        this.updateQueueDisplay();
        this.autoSaveQueue(); // Auto-save after adding files
        
        // Clear the file input
        const fileInput = document.getElementById('fileInput');
        if (fileInput) fileInput.value = '';
    }

    /**
     * Update queue display
     */
    updateQueueDisplay() {
        const queueSection = document.getElementById('queueSection');
        const queueList = document.getElementById('queueList');
        const queueCount = document.getElementById('queueCount');
        const processAllBtn = document.getElementById('processAllBtn');
        
        if (!queueSection) return;
        
        if (this.fileQueue.length === 0) {
            queueSection.style.display = 'none';
            return;
        }
        
        queueSection.style.display = 'block';
        if (queueCount) {
            queueCount.textContent = `${this.fileQueue.length} file${this.fileQueue.length !== 1 ? 's' : ''}`;
        }
        
        // Update queue list
        if (queueList) {
            queueList.innerHTML = '';
            this.fileQueue.forEach(queueItem => {
                const queueItemDiv = document.createElement('div');
                queueItemDiv.className = 'queue-item';
                queueItemDiv.innerHTML = `
                    <div class="queue-item-info">
                        <div class="queue-item-name">📄 ${queueItem.file.name}</div>
                        <div class="queue-item-details">
                            ${this.formatFileSize(queueItem.file.size)} • Added ${this.formatTimeAgo(queueItem.addedAt)}
                        </div>
                    </div>
                    <div class="queue-item-actions">
                        <button class="btn-remove" onclick="removeFromQueue('${queueItem.id}')">
                            Remove
                        </button>
                    </div>
                `;
                queueList.appendChild(queueItemDiv);
            });
        }
        
        // Enable/disable process button
        if (processAllBtn) {
            processAllBtn.disabled = this.fileQueue.length === 0;
        }
    }

    /**
     * Show/hide processing section with progress
     */
    showProcessingSection(show = true) {
        const processingSection = document.getElementById('processingSection');
        if (processingSection) {
            processingSection.style.display = show ? 'block' : 'none';
        }
    }

    /**
     * Update progress bar
     */
    updateProgress(percent, status) {
        const progressFill = document.getElementById('progressFill');
        const processingStatus = document.getElementById('processingStatus');
        
        if (progressFill) progressFill.style.width = percent + '%';
        if (processingStatus) processingStatus.textContent = status;
    }

    /**
     * Display PDF viewer section
     */
    async displayPDFViewer(processedFiles) {
        this.pdfFiles = processedFiles;
        
        if (this.pdfFiles.length === 0) return;
        
        const pdfViewerSection = document.getElementById('pdfViewerSection');
        if (pdfViewerSection) {
            pdfViewerSection.style.display = 'block';
        }
        
        // Create file tabs
        this.refreshFileTabsAfterApproval();
        
        // Load first PDF
        this.currentFileIndex = 0;
        await this.loadPDFForViewing(0);
        
        // Update approval UI
        this.updateApprovalUI();
    }

    /**
     * Create file tabs for multiple files
     */
    refreshFileTabsAfterApproval() {
        const tabsContainer = document.getElementById('fileTabsContainer');
        if (!tabsContainer) return;
        
        tabsContainer.innerHTML = '';
        
        if (this.pdfFiles.length === 0) {
            tabsContainer.innerHTML = '<p style="color: #7f8c8d; text-align: center; padding: 20px;">All orders approved! ✅</p>';
            return;
        }
        
        this.pdfFiles.forEach((pdfFile, index) => {
            const tab = document.createElement('button');
            tab.className = `file-tab ${index === this.currentFileIndex ? 'active' : ''}`;
            tab.textContent = pdfFile.file.name;
            tab.onclick = () => this.switchToFile(index);
            tabsContainer.appendChild(tab);
        });
    }

    /**
     * Switch to different file
     */
    async switchToFile(index) {
        // Check for unsaved changes
        if (this.hasUnsavedChanges) {
            const confirmSwitch = confirm('You have unsaved changes. Do you want to save them before switching files?\n\nClick OK to save, or Cancel to discard changes.');
            if (confirmSwitch) {
                this.saveChanges();
            } else {
                this.hasUnsavedChanges = false;
                this.updateEditModeUI();
            }
        }
        
        // Update active tab
        document.querySelectorAll('.file-tab').forEach((tab, i) => {
            tab.classList.toggle('active', i === index);
        });
        
        this.currentFileIndex = index;
        await this.loadPDFForViewing(index);
    }

    /**
     * Load PDF for viewing
     */
    async loadPDFForViewing(index) {
        const pdfFile = this.pdfFiles[index];
        if (!pdfFile) return;
        
        try {
            if (!pdfFile.pdf) {
                const arrayBuffer = await pdfFile.file.arrayBuffer();
                pdfFile.pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
            }
            
            this.currentPDF = pdfFile.pdf;
            this.totalPages = this.currentPDF.numPages;
            this.currentPage = 1;
            
            // Update filename display
            const currentFileName = document.getElementById('currentFileName');
            if (currentFileName) {
                currentFileName.textContent = pdfFile.file.name;
            }
            
            // Get container dimensions for smart scaling
            const container = document.querySelector('.pdf-canvas-container');
            if (container) {
                this.containerWidth = container.clientWidth - 40; // Account for padding
            }
            
            // Calculate smart initial scale
            await this.calculateSmartScale();
            
            // Render first page
            await this.renderPage(1);
            
            // Update extracted data display
            this.updateExtractedDataDisplay(pdfFile.order);
            
            // Reset edit mode for new file
            this.isEditMode = false;
            this.hasUnsavedChanges = false;
            this.updateEditModeUI();
            
            // Update approval UI for this file
            this.updateApprovalUI();
            
        } catch (error) {
            console.error('Error loading PDF for viewing:', error);
        }
    }

    /**
     * Calculate smart initial scale for PDF
     */
    async calculateSmartScale() {
        if (!this.currentPDF) return;
        
        try {
            const page = await this.currentPDF.getPage(1);
            this.originalViewport = page.getViewport({ scale: 1.0 });
            
            // Calculate scale to fit width of container
            const widthScale = this.containerWidth / this.originalViewport.width;
            
            // Don't make it too small or too large
            const minScale = 0.5;
            const maxScale = 2.0;
            const smartScale = Math.max(minScale, Math.min(maxScale, widthScale * 0.9));
            
            this.currentScale = smartScale;
            console.log(`Smart scale calculated: ${this.currentScale.toFixed(2)}`);
            
        } catch (error) {
            console.error('Error calculating smart scale:', error);
            this.currentScale = 1.2; // Fallback scale
        }
    }

    /**
     * Render PDF page
     */
    async renderPage(pageNum) {
        if (!this.currentPDF) return;
        
        try {
            const page = await this.currentPDF.getPage(pageNum);
            const canvas = document.getElementById('pdfCanvas');
            const ctx = canvas.getContext('2d');
            
            const viewport = page.getViewport({ scale: this.currentScale });
            
            // Set canvas dimensions
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            // Clear canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            const renderContext = {
                canvasContext: ctx,
                viewport: viewport
            };
            
            await page.render(renderContext).promise;
            
            // Update page info
            const pageInfo = document.getElementById('pageInfo');
            if (pageInfo) {
                pageInfo.textContent = `Page ${pageNum} of ${this.totalPages}`;
            }
            
            // Update zoom info
            const zoomInfo = document.getElementById('zoomInfo');
            if (zoomInfo) {
                const zoomPercent = Math.round(this.currentScale * 100);
                zoomInfo.textContent = `${zoomPercent}%`;
            }
            
            // Update button states
            const prevBtn = document.getElementById('prevPageBtn');
            const nextBtn = document.getElementById('nextPageBtn');
            if (prevBtn) prevBtn.disabled = pageNum <= 1;
            if (nextBtn) nextBtn.disabled = pageNum >= this.totalPages;
            
            // Update fit width button state
            const fitWidthBtn = document.getElementById('fitWidthBtn');
            if (fitWidthBtn) {
                const isAtFitWidth = Math.abs(this.currentScale - this.calculateFitWidthScale()) < 0.01;
                fitWidthBtn.classList.toggle('active', isAtFitWidth);
            }
            
        } catch (error) {
            console.error('Error rendering page:', error);
        }
    }

    /**
     * PDF Navigation methods
     */
    prevPage() {
        if (this.currentPage <= 1) return;
        this.currentPage--;
        this.renderPage(this.currentPage);
    }

    nextPage() {
        if (this.currentPage >= this.totalPages) return;
        this.currentPage++;
        this.renderPage(this.currentPage);
    }

    zoomIn() {
        this.currentScale = Math.min(this.currentScale * 1.25, 3.0);
        this.renderPage(this.currentPage);
    }

    zoomOut() {
        this.currentScale = Math.max(this.currentScale / 1.25, 0.3);
        this.renderPage(this.currentPage);
    }

    calculateFitWidthScale() {
        if (!this.originalViewport || !this.containerWidth) return 1.0;
        return (this.containerWidth * 0.9) / this.originalViewport.width;
    }

    async fitToWidth() {
        if (!this.originalViewport) return;
        
        const newScale = this.calculateFitWidthScale();
        this.currentScale = newScale;
        await this.renderPage(this.currentPage);
    }

    /**
     * Update extracted data display
     */
    updateExtractedDataDisplay(order) {
        // Update order summary
        const elements = {
            orderType: document.getElementById('orderType'),
            orderPO: document.getElementById('orderPO'),
            orderCustomer: document.getElementById('orderCustomer'),
            orderDate: document.getElementById('orderDate'),
            deliveryDate: document.getElementById('deliveryDate'),
            orderTotal: document.getElementById('orderTotal')
        };

        if (elements.orderType) elements.orderType.textContent = order.type;
        if (elements.orderPO) elements.orderPO.value = order.poNumber || '';
        if (elements.orderCustomer) elements.orderCustomer.textContent = `${order.customerName} (${order.customerCode})`;
        if (elements.orderDate) elements.orderDate.value = this.convertDateForInput(order.orderDate);
        if (elements.deliveryDate) elements.deliveryDate.value = this.convertDateForInput(order.deliveryDate);
        if (elements.orderTotal) elements.orderTotal.textContent = `£${order.total.toFixed(2)}`;
        
        // Update products table
        this.updateProductsTable(order.products);
        
        // Update conversion statistics
        this.updateConversionStatsDisplay(order.products);
        
        // Reset edit mode
        this.isEditMode = false;
        this.hasUnsavedChanges = false;
        this.updateEditModeUI();
    }

    /**
     * Update products table
     */
    updateProductsTable(products) {
        const tbody = document.getElementById('productsTableBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (products.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; color: #7f8c8d; padding: 40px;">
                        No products found in this order
                    </td>
                </tr>
            `;
            return;
        }
        
        products.forEach((product, index) => {
            const skuWithSuffix = product.productCode + this.conversionEngine.getSKUSuffix(product);
            const row = document.createElement('tr');
            
            // Add styling based on conversion status
            if (product.hasWarning) {
                row.classList.add('decimal-warning');
            } else if (product.conversionApplied) {
                row.classList.add('conversion-success');
            }
            
            row.innerHTML = `
                <td class="editable-cell">
                    <input type="number" step="0.1" value="${product.quantity}" 
                           onchange="updateProductField(${index}, 'quantity', this.value)" />
                    ${product.conversionNote ? `<div class="conversion-note ${product.conversionApplied ? 'converted' : 'warning'}">${product.conversionNote}</div>` : ''}
                </td>
                <td>${product.description}</td>
                <td class="editable-cell">
                    <input type="text" value="${product.productCode}" 
                           onchange="updateProductField(${index}, 'productCode', this.value)" 
                           style="text-transform: uppercase;" />
                </td>
                <td class="editable-cell">
                    <select onchange="updateProductField(${index}, 'caseSize', this.value)">
                        <option value="Each" ${this.conversionEngine.getCaseSizeType(product.caseSize) === 'Each' ? 'selected' : ''}>Each</option>
                        <option value="Kilo" ${this.conversionEngine.getCaseSizeType(product.caseSize) === 'Kilo' ? 'selected' : ''}>Kilo</option>
                        <option value="Box" ${this.conversionEngine.getCaseSizeType(product.caseSize) === 'Box' ? 'selected' : ''}>Box</option>
                    </select>
                </td>
                <td>£${product.unitPrice.toFixed(2)}</td>
                <td>£${product.netPrice.toFixed(2)}</td>
            `;
            tbody.appendChild(row);
        });
    }

    /**
     * Update conversion statistics display
     */
    updateConversionStatsDisplay(products) {
        const stats = this.conversionEngine.updateConversionStats(products);
        
        const elements = {
            convertedCount: document.getElementById('convertedCount'),
            warningCount: document.getElementById('warningCount'),
            wholeCount: document.getElementById('wholeCount'),
            conversionStatus: document.getElementById('conversionStatus')
        };
        
        if (elements.convertedCount) elements.convertedCount.textContent = stats.converted;
        if (elements.warningCount) elements.warningCount.textContent = stats.warnings;
        if (elements.wholeCount) elements.wholeCount.textContent = stats.whole;
        
        // Show/hide conversion status section
        const hasDecimals = stats.converted > 0 || stats.warnings > 0;
        if (elements.conversionStatus) {
            elements.conversionStatus.style.display = hasDecimals ? 'block' : 'none';
        }
    }

    /**
     * Edit mode functions
     */
    toggleEditMode() {
        this.isEditMode = !this.isEditMode;
        this.updateEditModeUI();
    }

    updateEditModeUI() {
        const editBtn = document.getElementById('editToggleBtn');
        const saveBtn = document.getElementById('saveChangesBtn');
        const changesIndicator = document.getElementById('changesIndicator');
        const editableFields = document.querySelectorAll('.editable-field');
        const editableCells = document.querySelectorAll('.editable-cell');
        
        if (editBtn) {
            if (this.isEditMode) {
                editBtn.textContent = '👁️ View Mode';
                editBtn.classList.add('editing');
            } else {
                editBtn.textContent = '✏️ Edit Data';
                editBtn.classList.remove('editing');
            }
        }
        
        if (saveBtn) {
            saveBtn.style.display = this.hasUnsavedChanges ? 'inline-block' : 'none';
        }
        
        // Enable/disable editing
        editableFields.forEach(field => {
            field.classList.toggle('editing', this.isEditMode);
            field.disabled = !this.isEditMode;
        });
        
        editableCells.forEach(cell => {
            cell.classList.toggle('editing', this.isEditMode);
            const input = cell.querySelector('input');
            const select = cell.querySelector('select');
            if (input) input.disabled = !this.isEditMode;
            if (select) select.disabled = !this.isEditMode;
        });
        
        // Show/hide changes indicator
        if (changesIndicator) {
            changesIndicator.style.display = this.hasUnsavedChanges ? 'inline' : 'none';
        }
    }

    markAsChanged() {
        this.hasUnsavedChanges = true;
        this.updateEditModeUI();
    }

    /**
     * Update product field
     */
    updateProductField(productIndex, field, value) {
        if (this.currentFileIndex >= 0 && this.currentFileIndex < this.pdfFiles.length) {
            const order = this.pdfFiles[this.currentFileIndex].order;
            if (productIndex >= 0 && productIndex < order.products.length) {
                const product = order.products[productIndex];
                
                if (field === 'quantity') {
                    const newQuantity = parseFloat(value) || 0;
                    
                    // Store the original unit price before conversion
                    const originalUnitPrice = product.originalUnitPrice || product.unitPrice;
                    
                    // Update the quantity and reapply conversion logic
                    product.originalQuantity = newQuantity;
                    product.originalUnitPrice = originalUnitPrice;
                    
                    const convertedProduct = this.conversionEngine.convertDecimalQuantity(product);
                    
                    // Update the product in the order
                    order.products[productIndex] = convertedProduct;
                    
                    // Recalculate order total
                    order.total = order.products.reduce((sum, product) => sum + product.netPrice, 0);
                    const orderTotal = document.getElementById('orderTotal');
                    if (orderTotal) orderTotal.textContent = `£${order.total.toFixed(2)}`;
                    
                    // Refresh the display to show new conversion status
                    this.updateExtractedDataDisplay(order);
                    
                } else if (field === 'productCode') {
                    product.productCode = value.toUpperCase();
                    
                    // Reapply conversion logic with new product code
                    const convertedProduct = this.conversionEngine.convertDecimalQuantity(product);
                    order.products[productIndex] = convertedProduct;
                    
                    // Update conversion statistics
                    this.updateConversionStatsDisplay(order.products);
                } else if (field === 'caseSize') {
                    product.caseSize = value;
                }
                
                this.markAsChanged();
            }
        }
    }

    /**
     * Save changes
     */
    saveChanges() {
        if (this.currentFileIndex >= 0 && this.currentFileIndex < this.pdfFiles.length) {
            const order = this.pdfFiles[this.currentFileIndex].order;
            
            // Update order data from form fields
            const orderPO = document.getElementById('orderPO');
            const orderDate = document.getElementById('orderDate');
            const deliveryDate = document.getElementById('deliveryDate');
            
            if (orderPO) order.poNumber = orderPO.value;
            if (orderDate) order.orderDate = this.convertDateFromInput(orderDate.value);
            if (deliveryDate) order.deliveryDate = this.convertDateFromInput(deliveryDate.value);
            
            // Update display with new data
            this.updateExtractedDataDisplay(order);
            
            this.hasUnsavedChanges = false;
            this.updateEditModeUI();
            
            alert('✅ Changes saved successfully!');
        }
    }

    /**
     * Update approval UI
     */
    updateApprovalUI() {
        const approveBtn = document.getElementById('approveOrderBtn');
        
        if (approveBtn) {
            // Show button if we have files to review
            if (this.pdfFiles.length > 0) {
                approveBtn.style.display = 'inline-block';
                approveBtn.textContent = '✅ Approve Current Order';
                approveBtn.classList.remove('approved');
                approveBtn.disabled = false;
            } else {
                approveBtn.style.display = 'none';
            }
        }
    }

    /**
     * Date conversion utilities
     */
    convertDateForInput(dateStr) {
        if (!dateStr || dateStr === '') return '';
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
        return dateStr;
    }

    convertDateFromInput(dateStr) {
        if (!dateStr || dateStr === '') return '';
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return dateStr;
    }

    /**
     * Utility functions
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        
        if (diffMins < 1) return 'just now';
        if (diffMins === 1) return '1 minute ago';
        if (diffMins < 60) return `${diffMins} minutes ago`;
        
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours === 1) return '1 hour ago';
        if (diffHours < 24) return `${diffHours} hours ago`;
        
        return date.toLocaleDateString();
    }

    /**
     * Get current file queue for processing
     */
    getFileQueue() {
        return this.fileQueue.map(item => item.file);
    }

    /**
     * Clear file queue after processing
     */
    clearFileQueue() {
        this.fileQueue = [];
        this.updateQueueDisplay();
        this.autoSaveQueue(); // Auto-save after clearing queue
    }

    /**
     * Remove approved file from display
     */
    removeApprovedFile(filename) {
        this.pdfFiles = this.pdfFiles.filter(pdfFile => pdfFile.order.filename !== filename);
        
        // Handle file switching after removal
        if (this.pdfFiles.length === 0) {
            // No more files to review
            const pdfViewerSection = document.getElementById('pdfViewerSection');
            if (pdfViewerSection) pdfViewerSection.style.display = 'none';
            this.updateApprovalUI();
            return true; // All files processed
        } else {
            // Switch to next available file
            if (this.currentFileIndex >= this.pdfFiles.length) {
                this.currentFileIndex = this.pdfFiles.length - 1;
            }
            
            // Refresh file tabs and load new current file
            this.refreshFileTabsAfterApproval();
            this.loadPDFForViewing(this.currentFileIndex);
            return false; // More files remaining
        }
    }

    /**
     * Show/hide results section
     */
    showResultsSection(show = true) {
        const resultsSection = document.getElementById('resultsSection');
        if (resultsSection) {
            resultsSection.style.display = show ? 'block' : 'none';
        }
    }
}

/**
 * Queue Persistence Class
 * Handles saving/restoring file queue using browser storage
 */
class QueuePersistence {
    constructor() {
        this.STORAGE_KEY = 'hoc_order_queue';
        this.DB_NAME = 'EmailOrderProcessing';
        this.DB_VERSION = 1;
        this.STORE_NAME = 'fileQueue';
        this.db = null;
    }

    // Initialize IndexedDB for file storage
    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
                }
            };
        });
    }

    // Save file queue to browser storage
    async saveQueue(fileQueue) {
        try {
            if (!this.db) await this.initDB();
            
            const fileData = [];
            const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(this.STORE_NAME);
            
            // Clear existing files
            await store.clear();
            
            // Save each file
            for (const file of fileQueue) {
                const fileRecord = {
                    id: file.name + '_' + file.lastModified,
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    lastModified: file.lastModified,
                    arrayBuffer: await file.arrayBuffer()
                };
                
                await store.put(fileRecord);
                
                // Save metadata for localStorage
                fileData.push({
                    id: fileRecord.id,
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    lastModified: file.lastModified,
                    savedAt: Date.now()
                });
            }
            
            // Save metadata to localStorage
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
                files: fileData,
                savedAt: Date.now(),
                count: fileData.length
            }));
            
            console.log(`✅ Saved ${fileData.length} files to browser storage`);
            this.showSaveNotification(fileData.length);
            
        } catch (error) {
            console.error('❌ Failed to save queue:', error);
        }
    }

    // Restore file queue from browser storage
    async restoreQueue() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (!saved) return [];
            
            const queueData = JSON.parse(saved);
            const files = [];
            
            if (!this.db) await this.initDB();
            
            const transaction = this.db.transaction([this.STORE_NAME], 'readonly');
            const store = transaction.objectStore(this.STORE_NAME);
            
            for (const fileInfo of queueData.files) {
                const request = store.get(fileInfo.id);
                const result = await new Promise((resolve) => {
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => resolve(null);
                });
                
                if (result && result.arrayBuffer) {
                    // Recreate File object
                    const file = new File([result.arrayBuffer], result.name, {
                        type: result.type,
                        lastModified: result.lastModified
                    });
                    files.push(file);
                }
            }
            
            if (files.length > 0) {
                console.log(`✅ Restored ${files.length} files from browser storage`);
                this.showRestoreNotification(files.length, queueData.savedAt);
            }
            
            return files;
            
        } catch (error) {
            console.error('❌ Failed to restore queue:', error);
            return [];
        }
    }

    // Clear saved queue
    clearSavedQueue() {
        localStorage.removeItem(this.STORAGE_KEY);
        if (this.db) {
            const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
            transaction.objectStore(this.STORE_NAME).clear();
        }
        console.log('🗑️ Cleared saved queue');
    }

    // Check if there's a saved queue
    hasSavedQueue() {
        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (!saved) return false;
        
        try {
            const data = JSON.parse(saved);
            return data.files && data.files.length > 0;
        } catch {
            return false;
        }
    }

    // Show notification that files were saved
    showSaveNotification(count) {
        const notification = document.createElement('div');
        notification.className = 'queue-notification save-notification';
        notification.innerHTML = `
            <div class="notification-content">
                💾 Auto-saved ${count} file${count !== 1 ? 's' : ''} to browser storage
            </div>
        `;
        document.body.appendChild(notification);
        
        setTimeout(() => notification.remove(), 3000);
    }

    // Show notification that files were restored
    showRestoreNotification(count, savedAt) {
        const timeAgo = this.getTimeAgo(savedAt);
        const notification = document.createElement('div');
        notification.className = 'queue-notification restore-notification';
        notification.innerHTML = `
            <div class="notification-content">
                🔄 Restored ${count} file${count !== 1 ? 's' : ''} from ${timeAgo}
                <button onclick="this.parentElement.parentElement.remove()" style="margin-left: 10px;">✕</button>
            </div>
        `;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentElement) notification.remove();
        }, 8000);
    }

    // Helper function to show time ago
    getTimeAgo(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
        return `${Math.floor(seconds / 86400)} days ago`;
    }
}

// Export for use in other modules
window.UIManager = UIManager;
