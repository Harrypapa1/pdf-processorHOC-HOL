/**
 * UPDATED: Enhanced product enhancement with reverse lookup capability
 * This function now handles both normal SKU lookup AND reverse description lookup
 */
async enhanceProductWithCatalog(product) {
    if (!this.firebaseConfig || !product.productCode) {
        return product;
    }

    try {
        console.log(`🔍 Enhancing product: ${product.productCode} - "${product.description}"`);
        
        // NEW: Pass both SKU and description to enable reverse lookup
        const result = await this.firebaseConfig.getProductDescription(
            product.productCode, 
            product.description  // NEW: Pass description for reverse lookup
        );
        
        if (result && result.matched !== 'none') {
            console.log(`✅ Enhancement result: ${result.matched} match`);
            
            // If we found a better SKU through reverse lookup, use it
            if (result.matched.startsWith('reverse-') && result.sku !== product.productCode) {
                console.log(`🔄 SKU changed: ${product.productCode} → ${result.sku}`);
                product.productCode = result.sku; // UPDATE: Change the SKU!
                product.originalProductCode = product.productCode; // Keep original for reference
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
        console.error('❌ Error enhancing product with catalog:', error);
        product.catalogLookup = false;
        product.matchType = 'error';
        return product;
    }
}
