/**
 * Export Manager Module
 * Handles Excel export functionality for Freshware format
 */

class ExportManager {
    constructor(firebaseConfig, conversionEngine) {
        this.firebaseConfig = firebaseConfig;
        this.conversionEngine = conversionEngine;
    }

    /**
     * Main export function - Export approved orders to Excel in Freshware format
     */
    async exportToExcel(approvedOrders) {
        if (approvedOrders.length === 0) {
            throw new Error('No orders approved for export!\n\nPlease approve at least one order before exporting.');
        }
        
        // Validate customer email mappings
        const missingEmails = await this.validateCustomerEmails(approvedOrders);
        if (missingEmails.length > 0) {
            throw new Error(this.formatMissingEmailsError(missingEmails));
        }
        
        // Check for conversion warnings
        const warnings = this.conversionEngine.getConversionWarnings(approvedOrders);
        if (warnings.length > 0) {
            const shouldContinue = await this.showConversionWarnings(warnings);
            if (!shouldContinue) {
                throw new Error('Export cancelled by user');
            }
        }
        
        // Generate Excel file
        const workbook = await this.generateWorkbook(approvedOrders);
        
        // Generate filename with current date
        const today = new Date().toISOString().split('T')[0];
        const filename = `freshware_orders_${today}.xlsx`;
        
        // Save file
        XLSX.writeFile(workbook, filename);
        
        // Save order history to Firebase
        await this.firebaseConfig.saveOrderHistory(approvedOrders);
        
        // Update processed PO numbers for future duplicate detection
        approvedOrders.forEach(order => {
            this.firebaseConfig.addProcessedPO(order.poNumber);
        });
        
        // Return success summary
        return {
            filename,
            orderCount: approvedOrders.length,
            productCount: approvedOrders.reduce((sum, order) => sum + order.products.length, 0),
            conversionSummary: this.conversionEngine.getConversionSummary(approvedOrders)
        };
    }

    /**
     * Validate that all customers have email mappings
     */
    async validateCustomerEmails(orders) {
        const missingEmails = [];
        
        for (const order of orders) {
            const customerEmail = await this.firebaseConfig.getCustomerEmail(order.customerCode, order.customerName);
            if (!customerEmail || customerEmail.trim() === '') {
                missingEmails.push({
                    customerCode: order.customerCode,
                    customerName: order.customerName,
                    filename: order.filename
                });
            }
        }
        
        return missingEmails;
    }

    /**
     * Format missing emails error message
     */
    formatMissingEmailsError(missingEmails) {
        let message = '❌ Cannot export! Missing customer email mappings:\n\n';
        
        missingEmails.forEach(missing => {
            message += `• ${missing.customerCode} (${missing.customerName}) - from ${missing.filename}\n`;
        });
        
        message += '\n🔧 Please add these email mappings first:\n';
        message += '1. Click "Manage Settings" in the top right\n';
        message += '2. Add the missing customer emails\n';
        message += '3. Return here and export again\n\n';
        message += 'Export cancelled - no file was created.';
        
        return message;
    }

    /**
     * Show conversion warnings and get user confirmation
     */
    async showConversionWarnings(warnings) {
        let warningMessage = `⚠️ Warning: ${warnings.length} product(s) have decimal quantities that may cause rounding issues in Freshware:\n\n`;
        
        warnings.slice(0, 5).forEach(warning => {
            warningMessage += `• ${warning.productCode} (${warning.quantity}kg) in ${warning.filename}\n`;
        });
        
        if (warnings.length > 5) {
            warningMessage += `• ... and ${warnings.length - 5} more\n`;
        }
        
        warningMessage += '\n💡 To fix these issues:\n';
        warningMessage += '1. Go to "Manage Settings" → "Product Conversions"\n';
        warningMessage += '2. Add conversion settings for these products\n';
        warningMessage += '3. Re-upload the PDFs to apply conversions\n\n';
        warningMessage += 'Continue with export anyway?';
        
        return confirm(warningMessage);
    }

    /**
     * Generate Excel workbook in Freshware format
     */
    async generateWorkbook(orders) {
        const wb = XLSX.utils.book_new();
        const wsData = [];
        
        // Add header row (Freshware format)
        const headers = [
            "Name", "Email", "Financial Status", "Paid at", "Fulfillment Status", "Fulfilled at",
            "Accepts Marketing", "Currency", "Subtotal", "Shipping", "Taxes", "Total", 
            "Discount Code", "Discount Amount", "Shipping Method", "Created at", 
            "Lineitem quantity", "Lineitem name", "Lineitem price", "Lineitem compare at price",
            "Lineitem sku", "Lineitem requires shipping", "Lineitem taxable", "Lineitem fulfillment status",
            "Billing Name", "Billing Street", "Billing Address1", "Billing Address2", "Billing Company",
            "Billing City", "Billing Zip", "Billing Province", "Billing Country", "Billing Phone",
            "Shipping Name", "Shipping Street", "Shipping Address1", "Shipping Address2", "Shipping Company",
            "Shipping City", "Shipping Zip", "Shipping Province", "Shipping Country", "Shipping Phone",
            "Notes", "Note Attributes", "Cancelled at", "Payment Method", "Payment Reference",
            "Refunded Amount", "Vendor", "Outstanding Balance", "Employee", "Location", "Device ID",
            "Id", "Tags", "Risk Level", "Source", "Lineitem discount", "Tax 1 Name", "Tax 1 Value",
            "Tax 2 Name", "Tax 2 Value", "Tax 3 Name", "Tax 3 Value", "Tax 4 Name", "Tax 4 Value",
            "Tax 5 Name", "Tax 5 Value", "Phone", "Receipt Number", "Duties", "Billing Province Name",
            "Shipping Province Name", "Payment ID", "Payment Terms Name", "Next Payment Due At", "Payment References"
        ];
        wsData.push(headers);
        
        // Add data rows
        for (const order of orders) {
            const customerEmail = await this.firebaseConfig.getCustomerEmail(order.customerCode, order.customerName);
            
            for (let productIndex = 0; productIndex < order.products.length; productIndex++) {
                const product = order.products[productIndex];
                const row = await this.createProductRow(order, product, productIndex, customerEmail);
                wsData.push(row);
            }
        }
        
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, "Orders");
        
        return wb;
    }

    /**
     * Create a single product row for the Excel export
     */
    async createProductRow(order, product, productIndex, customerEmail) {
        const row = new Array(79).fill("");
        
        // Column A (Name) = Purchase Order Number from PDF
        row[0] = order.poNumber || `PO-${order.customerCode}-${order.orderDate}`;
        row[1] = customerEmail; // Email from Firebase
        
        // Order-level data ONLY on first line item
        if (productIndex === 0) {
            row[2] = "pending"; // Financial Status
            row[4] = "fulfilled"; // Fulfillment Status
            row[5] = `${order.deliveryDate.split('/').reverse().join('-')} 21:21:42 +0100`; // Fulfilled at
            row[6] = "yes"; // Accepts Marketing
            row[7] = "GBP"; // Currency
            row[8] = order.total; // Subtotal
            row[9] = 0; // Shipping
            row[10] = 0; // Taxes
            row[11] = order.total; // Total
            row[14] = "FREE DELIVERY"; // Shipping Method
            row[47] = "custom"; // Payment Method
            row[49] = "0"; // Refunded Amount
            row[51] = order.total; // Outstanding Balance
            
            // Billing/Shipping info - first row only
            const customerName = this.firebaseConfig.customerMappings.get(order.customerCode) || order.customerName;
            row[24] = `${customerName} (${order.customerCode})`; // Billing Name
            row[25] = "Address Line 1"; // Billing Street
            row[26] = "Address Line 1"; // Billing Address1
            row[29] = "London"; // Billing City
            row[30] = "SW1A 0AA"; // Billing Zip
            row[31] = "ENG"; // Billing Province
            row[32] = "GB"; // Billing Country
            
            // Shipping same as billing
            row[34] = row[24]; // Shipping Name
            row[35] = row[25]; // Shipping Street
            row[36] = row[26]; // Shipping Address1
            row[39] = row[29]; // Shipping City
            row[40] = row[30]; // Shipping Zip
            row[41] = "ENG"; // Shipping Province
            row[42] = "GB"; // Shipping Country
            
            // Delivery date in Note Attributes ONLY on first row
            row[45] = `mw-delivery-date: ${order.deliveryDate.split('/').reverse().join('-')}`;
        } else {
            // Leave order-level fields BLANK for additional line items
            row[44] = ""; // Notes
            row[45] = ""; // Note Attributes - BLANK on additional rows
        }
        
        // Line item data - appears on ALL rows
        row[15] = `${order.orderDate.split('/').reverse().join('-')} 20:29:32 +0100`; // Created at
        row[16] = product.quantity; // Lineitem quantity (converted if applicable)
        row[17] = product.description; // Lineitem name
        row[18] = product.unitPrice; // Lineitem price
        row[20] = product.productCode + this.conversionEngine.getSKUSuffix(product); // Lineitem SKU with suffix
        row[21] = "TRUE"; // Lineitem requires shipping
        row[22] = "FALSE"; // Lineitem taxable
        row[23] = "fulfilled"; // Lineitem fulfillment status
        
        row[50] = this.firebaseConfig.getVendorForProduct(product.productCode); // Vendor
        row[53] = "Unit 2 Horner House"; // Location
        row[55] = `1.207${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}E+13`; // Id
        row[56] = "checkout-by-draft"; // Tags
        row[57] = "Low"; // Risk Level
        row[58] = "shopify_draft_order"; // Source
        
        // Province names
        row[73] = "England"; // Billing Province Name
        row[74] = "England"; // Shipping Province Name
        
        return row;
    }

    /**
     * Format export success message
     */
    formatSuccessMessage(result) {
        let message = `✅ Export successful!\n\nFile: ${result.filename}\nApproved Orders: ${result.orderCount}\nTotal Products: ${result.productCount}`;
        
        const summary = result.conversionSummary;
        if (summary.totalConverted > 0) {
            message += `\n\nDecimal Conversions Applied: ${summary.totalConverted}`;
        }
        
        if (summary.totalWarnings > 0) {
            message += `\nWarnings: ${summary.totalWarnings} (may need attention)`;
        }
        
        message += '\n\nReady for Freshware import!';
        
        return message;
    }

    /**
     * Export customer emails to CSV (utility function)
     */
    exportCustomerEmailsCSV(emailMappings) {
        const timestamp = new Date().toISOString().split('T')[0];
        const csvContent = [
            'CustomerCode,CustomerName,Email,CreatedAt',
            ...emailMappings.map(mapping => 
                `${mapping.customerCode},"${mapping.customerName || ''}",${mapping.email},${mapping.createdAt ? new Date(mapping.createdAt.seconds * 1000).toISOString() : ''}`
            )
        ].join('\n');
        
        this.downloadFile(csvContent, `customer-emails-${timestamp}.csv`, 'text/csv');
    }

    /**
     * Export product conversions to CSV (utility function)
     */
    exportProductConversionsCSV(productConversions) {
        const timestamp = new Date().toISOString().split('T')[0];
        const csvContent = [
            'ProductCode,ProductName,EachWeightGrams,CreatedAt',
            ...productConversions.map(product => 
                `${product.productCode},"${product.productName || ''}",${product.eachWeight},${product.createdAt ? new Date(product.createdAt.seconds * 1000).toISOString() : ''}`
            )
        ].join('\n');
        
        this.downloadFile(csvContent, `product-conversions-${timestamp}.csv`, 'text/csv');
    }

    /**
     * Utility function to download files
     */
    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }
}

// Export for use in other modules
window.ExportManager = ExportManager;