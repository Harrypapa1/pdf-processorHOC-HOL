/**
 * PDF Parser Module
 * Handles PDF processing for Standard, Consolidated, and Picking Note templates
 * Contains the IMPROVED picking note parser that extracts 10+ products
 * NOW ENHANCED with Product Catalog Integration for full product descriptions
 */

class PDFParser {
    constructor() {
        this.productConversionsCache = new Map();
        this.firebaseConfig = null; // NEW: Reference to FirebaseConfig for product catalog
    }

    /**
     * Set Firebase config instance for product catalog access
     */
    setFirebaseConfig(firebaseConfig) {
        this.firebaseConfig = firebaseConfig;
        console.log('🔗 PDFParser connected to FirebaseConfig for catalog access');
    }

    /**
     * Enhanced product enhancement with reverse lookup capability
     */
    async enhanceProductWithCatalog(product) {
        if (!this.firebaseConfig) {
            console.log(`❌ No Firebase config available for ${product.productCode}`);
            return product;
        }
        
        if (!product.productCode) {
            console.log(`❌ No product code for enhancement`);
            return product;
        }

        try {
            console.log(`🔍 Enhancing product: ${product.productCode} - "${product.description}"`);
            
            // Clean up description for better matching
            let cleanDescription = product.description;
            if (cleanDescription.startsWith('- ')) {
                cleanDescription = cleanDescription.substring(2);
            }
            
            // Call the enhanced getProductDescription with both SKU and description
            const result = await this.firebaseConfig.getProductDescription(
                product.productCode, 
                cleanDescription
            );
            
            if (result && result.matched !== 'none') {
                console.log(`✅ Enhancement result: ${result.matched} match`);
                
                // If we found a better SKU through reverse lookup, use it
                if (result.matched.startsWith('reverse-') && result.sku !== product.productCode) {
                    console.log(`🔄 SKU changed: ${product.productCode} → ${result.sku}`);
                    product.originalProductCode = product.productCode; // Keep original for reference
                    product.productCode = result.sku; // UPDATE: Change the SKU!
                }
                
                // Update description if we found a better one
                if (result.description && result.description.length > product.description.length) {
                    console.log(`📝 Description enhanced: "${product.description}" → "${result.description}"`);
                    product.description = result.description;
                }
                
                product.catalogLookup = true;
                product.matchType = result.matched;
            } else {
                console.log(`❌ No enhancement possible for ${product.productCode}`);
                product.catalogLookup = false;
                product.matchType = 'none';
            }
            
            return product;
            
        } catch (error) {
            console.error(`❌ Error enhancing product ${product.productCode}:`, error);
            product.catalogLookup = false;
            product.matchType = 'error';
            return product;
        }
    }

    /**
     * Main PDF processing function
     * @param {File} file - PDF file to process
     * @returns {Object} Parsed order data
     */
    async processPDF(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
            const page = await pdf.getPage(1);
            const textContent = await page.getTextContent();
            
            // Extract text from PDF
            const text = textContent.items.map(item => item.str).join(' ');
            
            // Determine template type and parse
            const isConsolidated = text.includes('Consolidated Purchase Order');
            const isPickingNote = text.includes('Picking Note');
            
            if (isPickingNote) {
                return await this.parsePickingNote(text, file.name);
            } else if (isConsolidated) {
                return await this.parseConsolidatedOrder(text, file.name);
            } else {
                return await this.parseStandardOrder(text, file.name);
            }
        } catch (error) {
            console.error('Error processing PDF:', error);
            throw error;
        }
    }

    /**
     * COMPLETE FIXED parsePickingNote function with catalog enhancement
     */
    async parsePickingNote(text, filename) { 
        const order = {
            filename: filename,
            type: 'Picking Note',
            customerCode: '',
            customerName: '',
            poNumber: '', 
            orderDate: '',
            deliveryDate: '',
            products: [],
            total: 0 
        };
        
        // Extract Basket ID (use as PO Number)
        const basketIdMatch = text.match(/Basket ID\s+(\d+)/);
        if (basketIdMatch) {
            order.poNumber = basketIdMatch[1];
        }
        
        // Extract dates (convert from "30-Jul-2025" to "30/07/2025" format)
        const orderDateMatch = text.match(/Order date\s+(\d{1,2}-[A-Za-z]{3}-\d{4})/);
        if (orderDateMatch) {
            order.orderDate = this.convertPickingDate(orderDateMatch[1]);
        }
        
        const deliveryDateMatch = text.match(/Delivery date\s+(\d{1,2}-[A-Za-z]{3}-\d{4})/);
        if (deliveryDateMatch) {
            order.deliveryDate = this.convertPickingDate(deliveryDateMatch[1]);
        }
        
        // Extract Customer Reference (use as customer code)
        const customerRefMatch = text.match(/Customer ref\s+(\S+)/);
        if (customerRefMatch) {
            order.customerCode = customerRefMatch[1];
        }
        
        // Extract Customer Name from Delivery Address section
        const deliveryAddressPatterns = [
            /Delivery Address[^M]*?([A-Za-z][^M]*(?:Ltd|Hospital|Kitchen|Restaurant)[^M]*)/i,
            /Delivery Address[^U]*?(University College Hospital[^M]*)/i,
            /Delivery Address[^M]*?Mitie[^M]*?([A-Za-z][^M]*)/i
        ];
        
        for (const pattern of deliveryAddressPatterns) {
            const match = text.match(pattern);
            if (match) {
                order.customerName = match[1].trim();
                break;
            }
        }
        
        // If no customer name found, try alternative approach
        if (!order.customerName) {
            const deliverySection = text.split('Delivery Address')[1];
            if (deliverySection) {
                const lines = deliverySection.split(/[\n\r]+/);
                for (const line of lines) {
                    if (line.includes('Hospital') || line.includes('Kitchen') || line.includes('Restaurant') || line.includes('Ltd')) {
                        order.customerName = line.trim();
                        break;
                    }
                }
            }
        }
        
        // IMPROVED PRODUCT EXTRACTION
        console.log('Full text for debugging:', text);
        
        // Split text into lines and look for product table section
        const lines = text.split(/[\n\r]+/);
        let inProductSection = false;
        let productLines = [];
        
        // Find the start and end of the product table
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Start of product table
            if (line.includes('Description') && line.includes('Quantity') || 
                line.match(/^\d+[A-Z]+\/?\-?\s/) ||
                line.match(/^\d+[A-Z]{2,}/)) {
                inProductSection = true;
            }
            
            // End of product table
            if (inProductSection && (
                line.includes('Total') || 
                line.includes('Delivery') ||
                line.includes('Comments') ||
                line.length === 0)) {
                if (!line.match(/^\d+[A-Z]/)) {
                    break;
                }
            }
            
            if (inProductSection && line.length > 0) {
                productLines.push(line);
            }
        }
        
        console.log('Product lines found:', productLines);
        
        // Multiple patterns to catch different product line formats
        const productPatterns = [
            /^(\d+[A-Z]+)\/?\-?\s+(.+?)\s+(1x\w+|\d+\.\d+\s*Kg|£\s*per\s*Kg)\s+(\d+(?:\.\d+)?)\s*(?:Kg\s*)?_*$/,
            /^(\d+[A-Z]+)\s+(.+?)\s+(1x\w+|\d+\.\d+\s*Kg|£\s*per\s*Kg)\s+(\d+(?:\.\d+)?)\s*(?:Kg\s*)?_*$/,
            /^(\d+[A-Z]+)\/?\-?\s+(.{5,}?)\s+(1x\w+|\d+\.\d+\s*Kg|£\s*per\s*Kg|\w+)\s+(\d+(?:\.\d+)?)\s*_*$/,
            /^(\d+[A-Z]+)\/?\-?\s+(.{3,}?)\s+(\d+(?:\.\d+)?)\s*(?:Kg\s*)?_*$/
        ];
        
        const tempProducts = []; // Store products before catalog enhancement
        
        productLines.forEach(line => {
            console.log('Processing line:', line);
            
            // Skip header lines
            if (line.toLowerCase().includes('description') || 
                line.toLowerCase().includes('product') ||
                line.toLowerCase().includes('quantity') ||
                line.toLowerCase().includes('pack size')) {
                return;
            }
            
            let productFound = false;
            
            // Try each pattern
            for (let i = 0; i < productPatterns.length && !productFound; i++) {
                const match = line.match(productPatterns[i]);
                
                if (match) {
                    console.log(`Pattern ${i + 1} matched:`, match);
                    
                    let productCode, description, caseSize, quantity;
                    
                    if (match.length === 5) {
                        [, productCode, description, caseSize, quantity] = match;
                    } else if (match.length === 4) {
                        [, productCode, description, quantity] = match;
                        caseSize = 'Each';
                    }
                    
                    // Clean up the data
                    productCode = productCode.replace(/\/?\-?$/, '');
                    description = description.trim();
                    quantity = parseFloat(quantity);
                    
                    // Validate the product
                    if (productCode && productCode.length >= 3 && 
                        description && description.length >= 3 && 
                        quantity > 0 && quantity < 10000) {
                        
                        const product = {
                            quantity: quantity,
                            description: description,
                            productCode: productCode,
                            caseSize: caseSize || 'Each',
                            unitPrice: 0,
                            netPrice: 0
                        };
                        
                        console.log('Product extracted:', product);
                        tempProducts.push(product);
                        productFound = true;
                    }
                }
            }
            
            if (!productFound) {
                console.log('No pattern matched for line:', line);
            }
        });
        
        // Additional fallback: look for any line with product code pattern
        if (tempProducts.length < 5) {
            console.log('Using fallback extraction...');
            
            const fallbackPattern = /(\d{4,6}[A-Z]{1,5})\s*[\/\-]?\s*(.{10,80}?)\s+(\d+(?:\.\d+)?)/g;
            let match;
            
            while ((match = fallbackPattern.exec(text)) !== null) {
                const [, productCode, description, quantity] = match;
                
                // Check if we already have this product
                const exists = tempProducts.find(p => p.productCode === productCode);
                if (!exists && parseFloat(quantity) > 0 && parseFloat(quantity) < 1000) {
                    const product = {
                        quantity: parseFloat(quantity),
                        description: description.trim(),
                        productCode: productCode,
                        caseSize: 'Each',
                        unitPrice: 0,
                        netPrice: 0
                    };
                    
                    console.log('Fallback product extracted:', product);
                    tempProducts.push(product);
                }
            }
        }
        
        // 🚨 CRITICAL: Enhanced catalog lookup section
        console.log(`🔍 Enhancing ${tempProducts.length} products with catalog descriptions...`);
        
        for (const product of tempProducts) {
            console.log(`🔍 Processing product: ${product.productCode} - "${product.description}"`);
            
            try {
                const enhancedProduct = await this.enhanceProductWithCatalog(product);
                order.products.push(enhancedProduct);
                console.log(`✅ Enhanced product added: ${enhancedProduct.productCode} - "${enhancedProduct.description}"`);
            } catch (error) {
                console.error(`❌ Error enhancing product ${product.productCode}:`, error);
                // Add original product if enhancement fails
                order.products.push(product);
            }
        }
        
        console.log(`✅ Final product count after enhancement: ${order.products.length}`);
        order.total = 0; // No pricing in picking notes
        
        return order;
    }

    /**
     * Helper function to convert picking note dates
     * Convert "30-Jul-2025" to "30/07/2025"
     */
    convertPickingDate(dateStr) {
        const months = {
            'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
            'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
            'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
        };
        
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = months[parts[1]] || '01';
            const year = parts[2];
            return `${day}/${month}/${year}`;
        }
        
        return dateStr; // Return original if parsing fails
    }

    /**
     * Parse consolidated order template
     * NOW ENHANCED with Product Catalog Integration
     */
    async parseConsolidatedOrder(text, filename) {
        const order = {
            filename: filename,
            type: 'Consolidated',
            customerCode: '',
            customerName: '',
            poNumber: '',
            orderDate: '',
            deliveryDate: '',
            products: [],
            total: 0
        };
        
        // Extract PO Number
        const poPatterns = [
            /PO Number:\s*([A-Z0-9]+)/i,
            /Purchase Order[^:]*:\s*([A-Z0-9]+)/i,
            /PO[:\s]+([A-Z0-9]+)/i
        ];
        
        for (const pattern of poPatterns) {
            const match = text.match(pattern);
            if (match) {
                order.poNumber = match[1];
                break;
            }
        }
        
        // Extract dates
        const orderDatePatterns = [
            /Order Date:\s*(\d{2}\/\d{2}\/\d{4})/,
            /Date:\s*(\d{2}\/\d{2}\/\d{4})/
        ];
        
        for (const pattern of orderDatePatterns) {
            const match = text.match(pattern);
            if (match) {
                order.orderDate = match[1];
                break;
            }
        }
        
        const deliveryDatePatterns = [
            /Delivery Date:\s*(\d{2}\/\d{2}\/\d{4})/,
            /Deliver[^:]*:\s*(\d{2}\/\d{2}\/\d{4})/
        ];
        
        for (const pattern of deliveryDatePatterns) {
            const match = text.match(pattern);
            if (match) {
                order.deliveryDate = match[1];
                break;
            }
        }
        
        // Extract customer info
        const customerPatterns = [
            /following outlets[^:]*:\s*([^(]+)\s*\(([^)]+)\)/i,
            /outlets[^:]*:\s*([^(]+)\s*\(([^)]+)\)/i,
            /The\s+([^(]+)\s*\(([^)]+)\)/i
        ];
        
        for (const pattern of customerPatterns) {
            const match = text.match(pattern);
            if (match) {
                order.customerName = match[1].trim();
                order.customerCode = match[2].trim();
                break;
            }
        }
        
        // Extract products
        const productPatterns = [
            /(\d+\.?\d*)\s+([A-Z\s]+?)\s+([A-Z]+)\s+(1x[A-Za-z]+)\s+(\d+\.?\d*)\s+(\d+\.?\d*)/g,
            /(\d+\.?\d*)\s+([A-Z][A-Z\s]+?)\s+([A-Z]{2,5})\s+([^\d]+)\s+(\d+\.?\d*)\s+(\d+\.?\d*)/g
        ];
        
        for (const pattern of productPatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const product = {
                    quantity: parseFloat(match[1]),
                    description: match[2].trim(),
                    productCode: match[3].trim(),
                    caseSize: match[4].trim(),
                    unitPrice: parseFloat(match[5]),
                    netPrice: parseFloat(match[6])
                };
                
                if (product.quantity > 0 && product.productCode && product.unitPrice > 0) {
                    // Enhanced with catalog description
                    const enhancedProduct = await this.enhanceProductWithCatalog(product);
                    order.products.push(enhancedProduct);
                    order.total += enhancedProduct.netPrice;
                }
            }
            
            if (order.products.length > 0) break;
        }
        
        // Extract total if products parsing failed
        if (order.total === 0) {
            const totalPatterns = [
                /Net Total[:\s]+(\d+\.?\d*)/i,
                /Total[:\s]+(\d+\.?\d*)/i
            ];
            
            for (const pattern of totalPatterns) {
                const match = text.match(pattern);
                if (match) {
                    order.total = parseFloat(match[1]);
                    break;
                }
            }
        }
        
        return order;
    }

    /**
     * Parse standard order template
     * NOW ENHANCED with Product Catalog Integration
     */
    async parseStandardOrder(text, filename) {
        const order = {
            filename: filename,
            type: 'Standard',
            customerCode: '',
            customerName: '',
            poNumber: '',
            orderDate: '',
            deliveryDate: '',
            products: [],
            total: 0
        };
        
        // Extract PO Number
        const poMatch = text.match(/PO Number:\s*([A-Z0-9]+)/);
        if (poMatch) order.poNumber = poMatch[1];
        
        // Extract dates
        const orderDateMatch = text.match(/Order Date:\s*(\d{2}\/\d{2}\/\d{4})/);
        if (orderDateMatch) order.orderDate = orderDateMatch[1];
        
        const deliveryDateMatch = text.match(/Delivery Date:\s*(\d{2}\/\d{2}\/\d{4})/);
        if (deliveryDateMatch) order.deliveryDate = deliveryDateMatch[1];
        
        // Extract customer code from Account No
        const accountMatch = text.match(/Account No:\s*([A-Z0-9]+)/);
        if (accountMatch) order.customerCode = accountMatch[1];
        
        // Extract customer name from Deliver To section
        const deliverMatch = text.match(/Deliver To\s+([^\n]+)/);
        if (deliverMatch) order.customerName = deliverMatch[1].trim();
        
        // Extract products table
        const tablePattern = /(\d+\.?\d*)\s+([A-Z\s]+?)\s+([A-Z]+)\s+(1x\w+)\s+(\d+\.?\d*)\s+(\d+\.?\d*)/g;
        let match;
        
        while ((match = tablePattern.exec(text)) !== null) {
            const product = {
                quantity: parseFloat(match[1]),
                description: match[2].trim(),
                productCode: match[3].trim(),
                caseSize: match[4].trim(),
                unitPrice: parseFloat(match[5]),
                netPrice: parseFloat(match[6])
            };
            
            // Enhanced with catalog description
            const enhancedProduct = await this.enhanceProductWithCatalog(product);
            order.products.push(enhancedProduct);
            order.total += enhancedProduct.netPrice;
        }
        
        return order;
    }

    /**
     * Set product conversions cache for decimal quantity conversion
     */
    setProductConversionsCache(cache) {
        this.productConversionsCache = cache;
    }
}

// Export for use in other modules
window.PDFParser = PDFParser;
