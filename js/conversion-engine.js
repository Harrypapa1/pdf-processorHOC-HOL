/**
 * Conversion Engine Module
 * Handles decimal quantity conversions using product conversion settings
 * CRITICAL: This is the core conversion logic that must be preserved
 */

class ConversionEngine {
    constructor() {
        this.productConversionsCache = new Map();
        this.conversionStats = {
            converted: 0,
            warnings: 0,
            whole: 0
        };
    }

    /**
     * Set product conversions cache
     */
    setProductConversionsCache(cache) {
        this.productConversionsCache = cache;
    }

    /**
     * Check if quantity is decimal
     */
    isDecimalQuantity(quantity) {
        return quantity % 1 !== 0;
    }

    /**
     * CRITICAL FUNCTION: Convert decimal quantities to whole numbers using product conversions
     * This is the core conversion logic that prevents rounding issues in Freshware
     */
    convertDecimalQuantity(product) {
        const originalQty = product.originalQuantity || product.quantity;
        const productCode = product.productCode;
        
        // Debug logging
        console.log(`Converting product: ${productCode}, qty: ${originalQty}kg`);
        console.log(`Available conversions:`, Array.from(this.productConversionsCache.keys()));
        
        // Reset conversion data
        product.conversionApplied = false;
        product.conversionNote = '';
        product.hasWarning = false;
        
        // If quantity is whole number, no conversion needed
        if (!this.isDecimalQuantity(originalQty)) {
            product.quantity = originalQty;
            product.conversionNote = '';
            console.log(`${productCode}: Whole number, no conversion needed`);
            return product;
        }
        
        // Check if product has conversion settings
        const conversion = this.productConversionsCache.get(productCode);
        console.log(`${productCode} conversion found:`, conversion);
        
        if (!conversion) {
            // No conversion available - flag as warning
            product.quantity = originalQty;
            product.hasWarning = true;
            product.conversionNote = `⚠️ ${originalQty}kg may round incorrectly in Freshware`;
            console.log(`${productCode}: No conversion available`);
            return product;
        }
        
        // Calculate conversion: kg to "each" units
        const kgToGrams = originalQty * 1000;
        const eachUnits = kgToGrams / conversion.eachWeight;
        
        // Round to avoid floating point precision issues
        const roundedEachUnits = Math.round(eachUnits * 100) / 100;
        
        console.log(`${productCode}: ${originalQty}kg = ${kgToGrams}g ÷ ${conversion.eachWeight}g = ${eachUnits} units (rounded: ${roundedEachUnits})`);
        
        // Check if conversion results in whole number (or very close to it)
        if (Math.abs(roundedEachUnits - Math.round(roundedEachUnits)) > 0.001) {
            // Still decimal after conversion - flag as warning
            product.quantity = originalQty;
            product.hasWarning = true;
            product.conversionNote = `⚠️ ${originalQty}kg → ${roundedEachUnits.toFixed(1)} ${productCode}E (still decimal)`;
            console.log(`${productCode}: Still decimal after conversion`);
            return product;
        }
        
        // Successful conversion to whole number
        const wholeEachUnits = Math.round(roundedEachUnits);
        
        // Calculate the correct net price FIRST (based on original quantity and original unit price)
        const correctNetPrice = originalQty * product.unitPrice;
        
        // Now calculate the new unit price per "each"
        const newUnitPrice = correctNetPrice / wholeEachUnits;
        
        // Update product with converted values
        product.quantity = wholeEachUnits;
        product.unitPrice = newUnitPrice;
        product.netPrice = correctNetPrice; // This stays the same as original calculation
        product.conversionApplied = true;
        product.conversionNote = `✅ ${originalQty}kg → ${wholeEachUnits} ${productCode}E (${conversion.eachWeight}g each)`;
        
        console.log(`${productCode}: Successfully converted to ${wholeEachUnits} units at £${newUnitPrice.toFixed(2)} each`);
        return product;
    }

    /**
     * Helper function to determine case size type from existing values
     */
    getCaseSizeType(caseSize) {
        if (!caseSize) return 'Each';
        
        const caseLower = caseSize.toLowerCase();
        
        if (caseLower.includes('kg') || caseLower.includes('kilo')) {
            return 'Kilo';
        } else if (caseLower.includes('box') || caseLower.includes('bx')) {
            return 'Box';
        } else {
            return 'Each';
        }
    }

    /**
     * Get SKU suffix with conversion logic
     */
    getSKUSuffix(product) {
        const caseSize = product.caseSize;
        const productCode = product.productCode;
        
        // If conversion was applied, always use E suffix
        if (product.conversionApplied) {
            return 'E';
        }
        
        if (!caseSize) return 'E'; // Default to EACH if no case size
        
        // Handle the simplified dropdown values
        if (caseSize === 'Kilo') {
            // Check if this product should avoid K suffix due to decimals
            const hasConversion = this.productConversionsCache.has(productCode);
            const isDecimal = this.isDecimalQuantity(product.originalQuantity || product.quantity);
            
            if (hasConversion && isDecimal) {
                // This should have been converted, but if we're here something went wrong
                return 'E';
            }
            return 'K';
        } else if (caseSize === 'Box') {
            return 'B';
        } else {
            return 'E'; // Default to EACH for "Each" and everything else
        }
    }

    /**
     * Process all products in an order and apply conversions
     */
    processOrderProducts(order) {
        // Apply decimal conversions to all products
        order.products = order.products.map(product => {
            // Store original quantity before conversion
            if (!product.originalQuantity) {
                product.originalQuantity = product.quantity;
            }
            
            // Store original unit price before conversion
            if (!product.originalUnitPrice) {
                product.originalUnitPrice = product.unitPrice;
            }
            
            return this.convertDecimalQuantity(product);
        });
        
        // Recalculate order total after conversions
        order.total = order.products.reduce((sum, product) => sum + product.netPrice, 0);
        
        return order;
    }

    /**
     * Update conversion statistics for UI display
     */
    updateConversionStats(products) {
        this.conversionStats = { converted: 0, warnings: 0, whole: 0 };
        
        products.forEach(product => {
            const originalQty = product.originalQuantity || product.quantity;
            
            if (!this.isDecimalQuantity(originalQty)) {
                this.conversionStats.whole++;
            } else if (product.conversionApplied) {
                this.conversionStats.converted++;
            } else {
                this.conversionStats.warnings++;
            }
        });
        
        return this.conversionStats;
    }

    /**
     * Get current conversion statistics
     */
    getConversionStats() {
        return this.conversionStats;
    }

    /**
     * Validate conversion settings for a product
     */
    validateConversion(productCode, eachWeight) {
        if (!productCode || !eachWeight || eachWeight <= 0) {
            return { valid: false, error: 'Product code and positive weight required' };
        }
        
        if (eachWeight > 10000) {
            return { valid: false, error: 'Weight seems too large (max 10kg each)' };
        }
        
        if (eachWeight < 1) {
            return { valid: false, error: 'Weight too small (min 1g each)' };
        }
        
        return { valid: true };
    }

    /**
     * Calculate example conversion for UI display
     */
    calculateExampleConversion(productCode, eachWeight, exampleKg = 0.5) {
        const grams = exampleKg * 1000;
        const eachUnits = Math.round((grams / eachWeight) * 10) / 10;
        return `${exampleKg}kg ${productCode} → ${eachUnits} ${productCode}E`;
    }

    /**
     * Get conversion warnings summary for export validation
     */
    getConversionWarnings(orders) {
        const warnings = [];
        
        orders.forEach(order => {
            order.products.forEach(product => {
                if (product.hasWarning) {
                    warnings.push({
                        productCode: product.productCode,
                        quantity: product.originalQuantity || product.quantity,
                        filename: order.filename,
                        warning: product.conversionNote
                    });
                }
            });
        });
        
        return warnings;
    }

    /**
     * Get conversion summary for export success message
     */
    getConversionSummary(orders) {
        let totalConverted = 0;
        let totalWarnings = 0;
        
        orders.forEach(order => {
            totalConverted += order.products.filter(p => p.conversionApplied).length;
            totalWarnings += order.products.filter(p => p.hasWarning).length;
        });
        
        return {
            totalConverted,
            totalWarnings,
            totalProducts: orders.reduce((sum, order) => sum + order.products.length, 0)
        };
    }
}

// Export for use in other modules
window.ConversionEngine = ConversionEngine;