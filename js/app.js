/**
 * Main Application Module
 * Coordinates all modules and manages application state
 */

class OrderProcessingApp {
    constructor() {
        console.log('🔍 APP: OrderProcessingApp constructor starting...');
        
        try {
            // Initialize all modules
            console.log('🔍 APP: Creating FirebaseConfig...');
            this.firebaseConfig = new FirebaseConfig();
            
            console.log('🔍 APP: Creating ConversionEngine...');
            this.conversionEngine = new ConversionEngine();
            
            console.log('🔍 APP: Creating UIManager...');
            this.uiManager = new UIManager(this.conversionEngine);
            
            console.log('🔍 APP: Creating ExportManager...');
            this.exportManager = new ExportManager(this.firebaseConfig, this.conversionEngine);
            
            console.log('🔍 APP: Creating PDFParser...');
            this.pdfParser = new PDFParser();
            
            // Application state
            this.processedOrders = [];
            this.approvedOrders = [];
            
            console.log('🔍 APP: All modules created, calling init()...');
            // Initialize the application
            this.init();
            
        } catch (error) {
            console.error('🚨 APP: Error in constructor:', error);
            alert('Error starting application: ' + error.message);
        }
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            console.log('Initializing Order Processing Application...');
            
            // Load all Firebase data (now includes product catalog)
            await this.firebaseConfig.initializeAllData();
            
            // Set caches in other modules
            const caches = this.firebaseConfig.getCaches();
            this.conversionEngine.setProductConversionsCache(caches.productConversionsCache);
            this.pdfParser.setProductConversionsCache(caches.productConversionsCache);
            
            // NEW: Connect PDFParser to FirebaseConfig for product catalog access
            this.pdfParser.setFirebaseConfig(this.firebaseConfig);
            
            // Setup global functions for HTML template
            this.setupGlobalFunctions();
            
            console.log('Application initialized successfully');
            
        } catch (error) {
            console.error('Error initializing application:', error);
            alert('Error initializing application. Please refresh the page.');
        }
    }

    /**
     * Setup global functions that the HTML template expects
     */
    setupGlobalFunctions() {
        // Main processing function
        window.processAllQueuedFiles = async () => {
            const files = this.uiManager.getFileQueue();
            if (files.length === 0) {
                alert('No files in queue to process.');
                return;
            }
            
            // Clear the queue as we're processing them
            this.uiManager.clearFileQueue();
            
            // Process all files
            await this.processFiles(files);
        };

        // Approval function
        window.approveCurrentOrder = () => {
            this.approveCurrentOrder();
        };

        // Export function
        window.exportToExcel = async () => {
            await this.exportToExcel();
        };

        // Duplicate handling
        window.handleDuplicateChoice = (shouldProcess) => {
            this.handleDuplicateChoice(shouldProcess);
        };
    }

    /**
     * Process PDF files with duplicate detection
     */
    async processFiles(files) {
        this.uiManager.showProcessingSection(true);
        this.uiManager.showResultsSection(false);
        
        // Reset state for new batch
        this.processedOrders = [];
        this.approvedOrders = [];
        
        const processedFiles = [];
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            this.uiManager.updateProgress((i / files.length) * 100, `Processing ${file.name}...`);
            
            try {
                const order = await this.pdfParser.processPDF(file);
                if (order) {
                    // Check for duplicate PO number
                    const poNumber = order.poNumber || '';
                    if (poNumber && this.firebaseConfig.isPOProcessed(poNumber)) {
                        // Show duplicate warning and wait for user decision
                        const shouldProcess = await this.showDuplicateWarning(order, file.name);
                        if (!shouldProcess) {
                            continue; // Skip this order
                        }
                    }
                    
                    // Process order with conversions
                    const processedOrder = this.conversionEngine.processOrderProducts(order);
                    
                    this.processedOrders.push(processedOrder);
                    processedFiles.push({
                        file: file,
                        order: processedOrder,
                        pdf: null // Will be loaded when viewed
                    });
                    
                    // Add PO number to processed set
                    this.firebaseConfig.addProcessedPO(poNumber);
                }
            } catch (error) {
                console.error(`Error processing ${file.name}:`, error);
                alert(`Error processing ${file.name}: ${error.message}`);
            }
        }
        
        this.uiManager.updateProgress(100, 'Processing complete!');
        setTimeout(async () => {
            this.uiManager.showProcessingSection(false);
            await this.uiManager.displayPDFViewer(processedFiles);
            this.updateExportSection();
            this.uiManager.showResultsSection(true);
        }, 1000);
    }

    /**
     * Show duplicate PO warning
     */
    showDuplicateWarning(order, filename) {
        return new Promise((resolve) => {
            // Hide processing section temporarily
            this.uiManager.showProcessingSection(false);
            
            // Create duplicate warning section
            const duplicateSection = document.createElement('div');
            duplicateSection.id = 'duplicateWarningSection';
            duplicateSection.innerHTML = `
                <div class="duplicate-warning">
                    <h3>⚠️ Duplicate Purchase Order Detected</h3>
                    <p>The purchase order number <span class="po-highlight">${order.poNumber || 'Unknown'}</span> has already been processed.</p>
                    <p><strong>File:</strong> ${filename}</p>
                    <p><strong>Customer:</strong> ${order.customerName} (${order.customerCode})</p>
                    <p><strong>Order Date:</strong> ${order.orderDate}</p>
                    <p>Processing this order again may create duplicate entries in your system.</p>
                    
                    <div class="duplicate-actions">
                        <button class="btn-skip" onclick="handleDuplicateChoice(false)">
                            🚫 Skip This Order
                        </button>
                        <button class="btn-process-anyway" onclick="handleDuplicateChoice(true)">
                            ⚠️ Process Anyway
                        </button>
                    </div>
                </div>
            `;
            
            // Insert after processing section
            const processingSection = document.getElementById('processingSection');
            if (processingSection) {
                processingSection.parentNode.insertBefore(duplicateSection, processingSection.nextSibling);
            }
            
            // Store the resolve function globally
            this.currentDuplicateResolve = resolve;
        });
    }

    /**
     * Handle user choice for duplicate order
     */
    handleDuplicateChoice(shouldProcess) {
        // Remove the duplicate warning section
        const duplicateSection = document.getElementById('duplicateWarningSection');
        if (duplicateSection) {
            duplicateSection.remove();
        }
        
        // Show processing section again
        this.uiManager.showProcessingSection(true);
        
        // Resolve the promise with user's choice
        if (this.currentDuplicateResolve) {
            this.currentDuplicateResolve(shouldProcess);
            this.currentDuplicateResolve = null;
        }
    }

    /**
     * Approve current order
     */
    approveCurrentOrder() {
        const currentFileIndex = this.uiManager.currentFileIndex;
        const pdfFiles = this.uiManager.pdfFiles;
        
        if (currentFileIndex >= 0 && currentFileIndex < pdfFiles.length) {
            const order = pdfFiles[currentFileIndex].order;
            const filename = order.filename;
            
            // Check if already approved
            if (this.approvedOrders.find(o => o.filename === filename)) {
                alert('This order is already approved!');
                return;
            }
            
            // Add to approved orders
            this.approvedOrders.push(order);
            
            // Remove from UI and get status
            const allProcessed = this.uiManager.removeApprovedFile(filename);
            
            // Update export section
            this.updateApprovedOrdersList();
            this.updateExportSection();
            
            if (allProcessed) {
                alert(`✅ Order ${order.poNumber || order.filename} approved!\n\nAll orders have been processed and are ready for export.`);
            } else {
                alert(`✅ Order ${order.poNumber || order.filename} approved and moved to export list!\n\n${pdfFiles.length - 1} order${pdfFiles.length - 1 !== 1 ? 's' : ''} remaining to review.`);
            }
        }
    }

    /**
     * Update export section
     */
    updateExportSection() {
        const exportSummary = document.getElementById('exportSummary');
        const exportBtn = document.getElementById('exportBtn');
        
        if (!exportSummary || !exportBtn) return;
        
        const approvedCount = this.approvedOrders.length;
        const totalValue = this.approvedOrders.reduce((sum, order) => sum + order.total, 0);
        const totalProducts = this.approvedOrders.reduce((sum, order) => sum + order.products.length, 0);
        const remainingCount = this.uiManager.pdfFiles.length;
        
        if (approvedCount === 0) {
            exportSummary.textContent = 'No orders approved for export yet - approve orders one by one to include them in export';
            exportBtn.style.display = 'none';
        } else {
            let summaryText = `<strong>${approvedCount}</strong> order${approvedCount !== 1 ? 's' : ''} approved<br>`;
            summaryText += `<strong>${totalProducts}</strong> products • <strong>£${totalValue.toFixed(2)}</strong> total value<br>`;
            
            if (remainingCount > 0) {
                summaryText += `<em>${remainingCount} order${remainingCount !== 1 ? 's' : ''} still pending approval</em><br>`;
            }
            
            summaryText += 'Ready for Freshware import';
            exportSummary.innerHTML = summaryText;
            exportBtn.style.display = 'inline-block';
        }
    }

    /**
     * Update approved orders list
     */
    updateApprovedOrdersList() {
        const approvedOrdersList = document.getElementById('approvedOrdersList');
        const approvedOrdersContainer = document.getElementById('approvedOrdersContainer');
        
        if (!approvedOrdersList || !approvedOrdersContainer) return;
        
        if (this.approvedOrders.length === 0) {
            approvedOrdersList.style.display = 'none';
            return;
        }
        
        approvedOrdersList.style.display = 'block';
        approvedOrdersContainer.innerHTML = '';
        
        this.approvedOrders.forEach(order => {
            const orderItem = document.createElement('div');
            orderItem.className = 'approved-order-item';
            orderItem.innerHTML = `
                <div>
                    <div class="order-item-title">📄 ${order.filename}</div>
                    <div class="order-item-details">
                        <strong>PO:</strong> ${order.poNumber || 'Not specified'} • 
                        <strong>Customer:</strong> ${order.customerName} (${order.customerCode}) • 
                        <strong>Products:</strong> ${order.products.length} • 
                        <strong>Total:</strong> £${order.total.toFixed(2)}
                    </div>
                </div>
            `;
            approvedOrdersContainer.appendChild(orderItem);
        });
    }

    /**
     * Export to Excel
     */
    async exportToExcel() {
        try {
            const result = await this.exportManager.exportToExcel(this.approvedOrders);
            const successMessage = this.exportManager.formatSuccessMessage(result);
            alert(successMessage);
        } catch (error) {
            console.error('Export error:', error);
            if (error.message === 'Export cancelled by user') {
                return; // User cancelled, don't show error
            }
            alert(error.message);
        }
    }

    /**
     * Get application state for debugging
     */
    getState() {
        return {
            processedOrders: this.processedOrders,
            approvedOrders: this.approvedOrders,
            conversionStats: this.conversionEngine.getConversionStats(),
            caches: this.firebaseConfig.getCaches()
        };
    }

    /**
     * Refresh all data from Firebase - UPDATED
     */
    async refreshData() {
        try {
            await this.firebaseConfig.initializeAllData();
            
            // Update caches in other modules
            const caches = this.firebaseConfig.getCaches();
            this.conversionEngine.setProductConversionsCache(caches.productConversionsCache);
            this.pdfParser.setProductConversionsCache(caches.productConversionsCache);
            
            // NEW: Reconnect PDFParser to FirebaseConfig after refresh
            this.pdfParser.setFirebaseConfig(this.firebaseConfig);
            
            console.log('Data refreshed successfully');
            return true;
        } catch (error) {
            console.error('Error refreshing data:', error);
            return false;
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔍 APP: DOM loaded, initializing Order Processing App...');
    try {
        window.orderProcessingApp = new OrderProcessingApp();
        console.log('🔍 APP: OrderProcessingApp created successfully');
    } catch (error) {
        console.error('🚨 APP: Error creating OrderProcessingApp:', error);
    }
});

// Export for global access
window.OrderProcessingApp = OrderProcessingApp;
