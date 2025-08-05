/**
 * Enhanced getProductDescription with Reverse Lookup for Picking Notes
 * This function handles both normal SKU lookup AND reverse description lookup
 */
async getProductDescription(sku, productDescription = '') {
    try {
        // First try normal SKU lookup (for non-picking note formats)
        if (this.productCatalogCache.size > 0 && Date.now() < this.catalogCacheExpiry) {
            const description = this.productCatalogCache.get(sku);
            if (description) {
                console.log(`✅ Direct SKU match ${sku}: ${description.substring(0, 50)}...`);
                return { sku: sku, description: description, matched: 'direct' };
            }
        }
        
        // Reload cache if expired or empty
        if (this.productCatalogCache.size === 0 || Date.now() >= this.catalogCacheExpiry) {
            console.log('🔄 Reloading product catalog cache...');
            await this.loadProductCatalog();
            const description = this.productCatalogCache.get(sku);
            if (description) {
                console.log(`✅ Direct SKU match after reload ${sku}: ${description.substring(0, 50)}...`);
                return { sku: sku, description: description, matched: 'direct' };
            }
        }
        
        // NEW: If direct lookup failed and we have a product description, try reverse lookup
        if (productDescription && productDescription.length > 2) {
            console.log(`🔍 Trying reverse lookup for: "${productDescription}"`);
            const reverseMatch = await this.findProductByDescription(productDescription);
            if (reverseMatch) {
                console.log(`✅ Reverse match found: ${reverseMatch.sku} - ${reverseMatch.description}`);
                return reverseMatch;
            }
        }
        
        console.log(`❌ No match found for ${sku} or "${productDescription}", using fallback`);
        
        // Fallback to old mapping system
        const baseCode = sku.replace(/[EKB]$/, '');
        if (this.productMappings.has(baseCode)) {
            return { sku: sku, description: this.productMappings.get(baseCode), matched: 'fallback' };
        }
        
        return { sku: sku, description: productDescription || sku, matched: 'none' };
        
    } catch (error) {
        console.error('❌ Error in getProductDescription:', error);
        return { sku: sku, description: productDescription || sku, matched: 'error' };
    }
}

/**
 * NEW: Find product by description (reverse lookup)
 * Searches catalog descriptions to find matching SKU
 */
async findProductByDescription(description) {
    try {
        // Ensure we have catalog data
        if (this.productCatalogCache.size === 0) {
            await this.loadProductCatalog();
        }
        
        const searchDesc = description.toLowerCase().trim();
        console.log(`🔍 Searching catalog for: "${searchDesc}"`);
        
        // Define search strategies with priority order
        const searchStrategies = [
            // Strategy 1: Exact matches (highest priority)
            {
                name: 'exact',
                test: (catalogDesc) => catalogDesc.toLowerCase().trim() === searchDesc
            },
            
            // Strategy 2: Simple product name matches
            {
                name: 'simple', 
                test: (catalogDesc) => {
                    const catalog = catalogDesc.toLowerCase();
                    // Handle specific mappings for your catalog
                    if (searchDesc.includes('kiwi')) return catalog === 'kiwi';
                    if (searchDesc.includes('mango')) return catalog === 'mango';
                    if (searchDesc.includes('easy peeler')) return catalog.includes('easy peeler');
                    if (searchDesc.includes('rosemary')) return catalog === 'rosemary dust' || catalog.includes('rosemary');
                    if (searchDesc.includes('thyme')) return catalog === 'thyme dust' || catalog.includes('thyme');
                    if (searchDesc.includes('dill')) return catalog.includes('dill');
                    return false;
                }
            },
            
            // Strategy 3: Keyword matching with scoring
            {
                name: 'keywords',
                test: (catalogDesc) => {
                    const catalog = catalogDesc.toLowerCase();
                    const keywords = searchDesc.split(/\s+/).filter(word => word.length > 2);
                    const matches = keywords.filter(keyword => catalog.includes(keyword));
                    
                    // Require at least 1 keyword match, prefer shorter descriptions
                    return matches.length > 0 && catalogDesc.length < 50;
                }
            },
            
            // Strategy 4: Partial matches (lowest priority)  
            {
                name: 'partial',
                test: (catalogDesc) => {
                    const catalog = catalogDesc.toLowerCase();
                    // Only for very specific cases
                    if (searchDesc.includes('watermelon') && catalog.includes('watermelon')) return true;
                    if (searchDesc.includes('honeydew') && catalog.includes('honeydew')) return true;
                    if (searchDesc.includes('cantaloupe') && catalog.includes('cantaloupe')) return true;
                    if (searchDesc.includes('galia') && catalog.includes('galia')) return true;
                    return false;
                }
            }
        ];
        
        // Try each strategy in priority order
        for (const strategy of searchStrategies) {
            console.log(`   Trying ${strategy.name} matching...`);
            
            const matches = [];
            for (const [sku, catalogDesc] of this.productCatalogCache.entries()) {
                if (strategy.test(catalogDesc)) {
                    matches.push({ sku, description: catalogDesc, strategy: strategy.name });
                }
            }
            
            if (matches.length > 0) {
                console.log(`   Found ${matches.length} ${strategy.name} matches`);
                
                // Prefer 'E' (Each) UOM, then 'B' (Box), then others
                const prioritizedMatch = matches.find(m => m.sku.endsWith('E')) || 
                                       matches.find(m => m.sku.endsWith('B')) || 
                                       matches[0];
                
                console.log(`   Selected: ${prioritizedMatch.sku} - ${prioritizedMatch.description}`);
                return {
                    sku: prioritizedMatch.sku,
                    description: prioritizedMatch.description,
                    matched: 'reverse-' + strategy.name,
                    originalSku: description // Keep track of original for debugging
                };
            }
        }
        
        console.log(`   No reverse matches found for "${description}"`);
        return null;
        
    } catch (error) {
        console.error('❌ Error in reverse lookup:', error);
        return null;
    }
}
