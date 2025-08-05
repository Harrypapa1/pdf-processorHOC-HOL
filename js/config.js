/**
 * Firebase Configuration Module
 * Handles Firebase initialization, data loading, and mappings
 */

class FirebaseConfig {
    constructor() {
        this.db = null;
        this.emailMappingsCache = new Map();
        this.productConversionsCache = new Map();
        this.productCatalogCache = new Map();  // NEW: Product catalog cache
        this.processedPONumbers = new Set();
        this.lastCacheUpdate = 0;
        this.catalogCacheExpiry = 0;  // NEW: Separate expiry for catalog
        this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
        
        // Initialize mappings
        this.customerMappings = new Map();
        this.productMappings = new Map();
        this.vendorMappings = new Map();
        
        this.initializeFirebase();
        this.initializeKnownMappings();
    }

    /**
     * Initialize Firebase configuration
     */
    initializeFirebase() {
        const firebaseConfig = {
            apiKey: "AIzaSyDeNUflDD7eEiZS9ZE5Z1WwiAMP8Nx4krY",
            authDomain: "email-order-system.firebaseapp.com",
            projectId: "email-order-system",
            storageBucket: "email-order-system.firebasestorage.app",
            messagingSenderId: "148310260005",
            appId: "1:148310260005:web:65014f7b35ebd7e46ec2cc"
        };

        firebase.initializeApp(firebaseConfig);
        this.db = firebase.firestore();
        console.log('Firebase initialized successfully');
    }

    /**
     * Initialize known mappings (fallback data)
     */
    initializeKnownMappings() {
        // Customer mappings
        this.customerMappings.set('07BELLA', 'BELLA_KITCHEN');
        this.customerMappings.set('13RREST', 'RIVER_KITCHEN');
        this.customerMappings.set('92TABLE', 'TABLE_KITCHEN');
        this.customerMappings.set('76RICH', 'RICHMOND_HOUSE');
        
        // Product mappings
        this.productMappings.set('AVO', 'AVOCADO_PEAR');
        this.productMappings.set('KI', 'KIWI_FRUIT');
        this.productMappings.set('PINL', 'PINEAPPLE_LARGE');
        this.productMappings.set('CAU', 'CAULIFLOWER');
        this.productMappings.set('PLUR', 'PLUMS');
        this.productMappings.set('SAT', 'SATSUMAS');
        this.productMappings.set('STR', 'STRAWBERRIES');
        this.productMappings.set('CEL', 'CELERY');
        this.productMappings.set('GRBS', 'GRAPES_BLACK'); 
        this.productMappings.set('GRWS', 'GRAPES_WHITE');
        this.productMappings.set('POSW', 'POTATO_SWEET');

        // Vendor mappings - Frozen products = CoolFoodGroupMaster
        this.vendorMappings.set('YRASB', 'CoolFoodGroupMaster'); // Frozen Raspberries
        this.vendorMappings.set('YBLUB', 'CoolFoodGroupMaster'); // Frozen Blueberries  
        this.vendorMappings.set('YSFB', 'CoolFoodGroupMaster');  // Frozen Summer Fruits
        this.vendorMappings.set('YCHERB', 'CoolFoodGroupMaster'); // Frozen Cherries
        
        console.log('Known mappings initialized');
    }

    /**
     * Load customer emails from Firestore
     */
    async loadCustomerEmailsFromFirestore() {
        try {
            console.log('Loading customer emails from Firestore...');
            
            const snapshot = await this.db.collection('customerEmails').get();
            
            this.emailMappingsCache.clear();
            snapshot.forEach(doc => {
                const data = doc.data();
                // Store both original and uppercase versions for case-insensitive lookup
                this.emailMappingsCache.set(data.customerCode, data.email);
                this.emailMappingsCache.set(data.customerCode.toUpperCase(), data.email);
                if (data.customerName) {
                    this.emailMappingsCache.set(data.customerName, data.email);
                    this.emailMappingsCache.set(data.customerName.toUpperCase(), data.email);
                }
            });
            
            this.lastCacheUpdate = Date.now();
            console.log(`Loaded ${this.emailMappingsCache.size} customer email mappings`);
            
            return this.emailMappingsCache;
        } catch (error) {
            console.error('Error loading customer emails:', error);
            return this.emailMappingsCache;
        }
    }

    /**
     * Load product conversions from Firestore
     */
    async loadProductConversionsFromFirestore() {
        try {
            console.log('Loading product conversions from Firestore...');
            
            const snapshot = await this.db.collection('productConversions').get();
            
            this.productConversionsCache.clear();
            snapshot.forEach(doc => {
                const data = doc.data();
                this.productConversionsCache.set(data.productCode, {
                    name: data.productName || '',
                    eachWeight: data.eachWeight
                });
            });
            
            console.log(`Loaded ${this.productConversionsCache.size} product conversions`);
            return this.productConversionsCache;
        } catch (error) {
            console.error('Error loading product conversions:', error);
            return this.productConversionsCache;
        }
    }

    /**
     * NEW: Load product catalog from Firebase with caching
     */
    async loadProductCatalog() {
        try {
            console.log('Loading product catalog from Firebase...');
            
            const snapshot = await this.db.collection('productCatalog').get();
            const catalog = new Map();
            
            snapshot.forEach(doc => {
                const data = doc.data();
                catalog.set(data.sku, data.description);
            });
            
            this.productCatalogCache = catalog;
            this.catalogCacheExpiry = Date.now() + this.CACHE_DURATION;
            
            console.log(`Loaded ${catalog.size} products from catalog`);
            return catalog;
        } catch (error) {
            console.error('Error loading product catalog:', error);
            return new Map();
        }
    }

    /**
     * NEW: Get product description by SKU (with caching)
     */
    async getProductDescription(sku) {
        try {
            // Check cache first
            if (this.productCatalogCache.size > 0 && Date.now() < this.catalogCacheExpiry) {
                const description = this.productCatalogCache.get(sku);
                if (description) {
                    console.log(`Found ${sku} in catalog: ${description.substring(0, 50)}...`);
                    return description;
                }
            }
            
            // Reload cache if expired or empty
            if (this.productCatalogCache.size === 0 || Date.now() >= this.catalogCacheExpiry) {
                console.log('Reloading product catalog cache...');
                await this.loadProductCatalog();
                const description = this.productCatalogCache.get(sku);
                if (description) {
                    console.log(`Found ${sku} after cache reload: ${description.substring(0, 50)}...`);
                    return description;
                }
            }
            
            console.log(`Product ${sku} not found in catalog, using fallback`);
            
            // Fallback to old mapping system
            const baseCode = sku.replace(/[EKB]$/, ''); // Remove E/K/B suffix
            if (this.productMappings.has(baseCode)) {
                return this.productMappings.get(baseCode);
            }
            
            return sku; // Final fallback to SKU itself
            
        } catch (error) {
            console.error('Error fetching product description:', error);
            
            // Fallback to old mapping system
            const baseCode = sku.replace(/[EKB]$/, ''); // Remove E/K/B suffix
            if (this.productMappings.has(baseCode)) {
                return this.productMappings.get(baseCode);
            }
            
            return sku; // Final fallback
        }
    }

    /**
     * Load processed PO numbers for duplicate detection
     */
    async loadProcessedPONumbers() {
        try {
            console.log('Loading processed PO numbers from order history...');
            
            const snapshot = await this.db.collection('orderHistory')
                .orderBy('exportedAt', 'desc')
                .limit(1000) // Load last 1000 orders to check for duplicates
                .get();
            
            this.processedPONumbers.clear();
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.purchaseOrderNumber) {
                    this.processedPONumbers.add(data.purchaseOrderNumber);
                }
            });
            
            console.log(`Loaded ${this.processedPONumbers.size} processed PO numbers for duplicate detection`);
            
        } catch (error) {
            console.error('Error loading processed PO numbers:', error);
            // Don't throw error - duplicate detection will still work for current session
        }
    }

    /**
     * Get customer email with cache refresh logic
     */
    async getCustomerEmail(customerCode, customerName) {
        if (Date.now() - this.lastCacheUpdate > this.CACHE_DURATION) {
            await this.loadCustomerEmailsFromFirestore();
            await this.loadProductConversionsFromFirestore();
        }
        
        // Try exact match first, then uppercase versions
        return this.emailMappingsCache.get(customerCode) || 
               this.emailMappingsCache.get(customerCode.toUpperCase()) ||
               this.emailMappingsCache.get(customerName) || 
               this.emailMappingsCache.get(customerName.toUpperCase()) ||
               '';
    }

    /**
     * Get vendor for product (based on product type)
     */
    getVendorForProduct(productCode) {
        return this.vendorMappings.get(productCode) || 'Osolocal2U';
    }

    /**
     * Save order history to Firebase
     */
    async saveOrderHistory(orders) {
        try {
            console.log('Saving order history to Firebase...');
            
            const batch = this.db.batch();
            const now = new Date();
            
            for (const order of orders) {
                const historyData = {
                    // Order identification
                    customerCode: order.customerCode || '',
                    customerName: order.customerName || '',
                    purchaseOrderNumber: order.poNumber || '',
                    
                    // Dates
                    orderDate: order.orderDate || '',
                    deliveryDate: order.deliveryDate || '',
                    exportedAt: now,
                    
                    // Order summary
                    orderType: order.type || '',
                    totalProducts: order.products.length,
                    totalQuantity: order.products.reduce((sum, product) => sum + product.quantity, 0),
                    totalValue: order.total,
                    
                    // File reference
                    originalFileName: order.filename || '',
                    
                    // Products summary (for reference)
                    productCodes: order.products.map(p => p.productCode).join(', '),
                    
                    // Conversion statistics
                    conversionsApplied: order.products.filter(p => p.conversionApplied).length,
                    warningsGenerated: order.products.filter(p => p.hasWarning).length
                };
                
                // Create document with auto-generated ID
                const docRef = this.db.collection('orderHistory').doc();
                batch.set(docRef, historyData);
            }
            
            await batch.commit();
            console.log(`Successfully saved ${orders.length} orders to history`);
            
        } catch (error) {
            console.error('Error saving order history:', error);
            // Don't block the export if history saving fails
        }
    }

    /**
     * Initialize all data on app startup - UPDATED to include product catalog
     */
    async initializeAllData() {
        await Promise.all([
            this.loadCustomerEmailsFromFirestore(),
            this.loadProductConversionsFromFirestore(),
            this.loadProductCatalog(),  // NEW: Load product catalog
            this.loadProcessedPONumbers()
        ]);
        console.log('All Firebase data loaded successfully');
    }

    /**
     * NEW: Initialize product catalog on app start
     */
    async initializeProductCatalog() {
        try {
            console.log('Initializing product catalog...');
            await this.loadProductCatalog();
            console.log('Product catalog ready');
        } catch (error) {
            console.error('Failed to initialize product catalog:', error);
        }
    }

    /**
     * Check if PO number is already processed
     */
    isPOProcessed(poNumber) {
        return this.processedPONumbers.has(poNumber);
    }

    /**
     * Add PO number to processed set
     */
    addProcessedPO(poNumber) {
        if (poNumber) {
            this.processedPONumbers.add(poNumber);
        }
    }

    /**
     * Get all caches for other modules - UPDATED to include product catalog
     */
    getCaches() {
        return {
            emailMappingsCache: this.emailMappingsCache,
            productConversionsCache: this.productConversionsCache,
            productCatalogCache: this.productCatalogCache,  // NEW
            processedPONumbers: this.processedPONumbers,
            customerMappings: this.customerMappings,
            productMappings: this.productMappings,
            vendorMappings: this.vendorMappings
        };
    }
}

// Export for use in other modules
window.FirebaseConfig = FirebaseConfig;
