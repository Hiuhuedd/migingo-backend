/**
 * Centralized Calculations Module
 * 
 * This module contains all system calculation logic for:
 * - Pricing calculations
 * - Unit conversions
 * - Stock validations
 * - Breakdown calculations
 */

/**
 * Extract selling prices for issued layers from inventory packaging structure
 * @param {Object} inventoryData - The inventory item data
 * @param {Array} layers - Array of layer objects with {layerIndex, quantity}
 * @returns {Array} Layers with added selling price information
 */
function calculateSellingPricesForLayers(inventoryData, layers) {
    const packagingStructure = inventoryData.packagingStructure || [];

    return layers.map(layer => {
        const { layerIndex, quantity } = layer;
        const packagingLayer = packagingStructure[layerIndex];

        if (!packagingLayer) {
            console.warn(`Layer index ${layerIndex} not found in packaging structure for ${inventoryData.productName}`);
            return {
                ...layer,
                sellingPrice: 0
            };
        }

        return {
            ...layer,
            unit: packagingLayer.unit,
            sellingPrice: packagingLayer.sellingPrice || 0
        };
    });
}

/**
 * Calculate conversion ratio between two packaging layers
 * @param {Array} packagingStructure - The product's packaging structure
 * @param {Number} sourceLayerIndex - Index of source (larger) unit
 * @param {Number} targetLayerIndex - Index of target (smaller) unit
 * @returns {Number} Conversion ratio (how many target units per source unit)
 */
function calculateUnitConversion(packagingStructure, sourceLayerIndex, targetLayerIndex) {
    if (!packagingStructure || packagingStructure.length === 0) {
        throw new Error('Invalid packaging structure');
    }

    if (sourceLayerIndex >= targetLayerIndex) {
        throw new Error('Source layer must be larger than target layer (smaller index = larger unit)');
    }

    let conversionRatio = 1;

    // Multiply the qty of each intermediate layer
    for (let i = sourceLayerIndex + 1; i <= targetLayerIndex; i++) {
        const layer = packagingStructure[i];
        if (!layer || !layer.qty) {
            throw new Error(`Invalid layer at index ${i}`);
        }
        conversionRatio *= layer.qty;
    }

    return conversionRatio;
}

/**
 * Validate if sufficient stock is available for requested layers
 * @param {Array} packagingStructure - The product's packaging structure
 * @param {Array} requestedLayers - Array of {layerIndex, quantity}
 * @returns {Object} {valid: boolean, errors: Array}
 */
function validateStockAvailability(packagingStructure, requestedLayers) {
    const errors = [];

    for (const layer of requestedLayers) {
        const { layerIndex, quantity } = layer;
        const packagingLayer = packagingStructure[layerIndex];

        if (!packagingLayer) {
            errors.push({
                layerIndex,
                error: `Invalid layer index ${layerIndex}`
            });
            continue;
        }

        const currentStock = packagingLayer.stock || 0;

        if (currentStock < quantity) {
            errors.push({
                layerIndex,
                unit: packagingLayer.unit,
                error: `Insufficient stock`,
                available: currentStock,
                requested: quantity
            });
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Calculate total value for a list of items
 * @param {Array} items - Array of items
 * @param {String} priceField - Field name to use for price (e.g., 'sellingPrice', 'buyingPrice')
 * @returns {Number} Total value
 */
function calculateTotalValue(items, priceField = 'sellingPrice') {
    if (!Array.isArray(items)) {
        return 0;
    }

    return items.reduce((total, item) => {
        const price = item[priceField] || 0;
        const quantity = item.quantity || 0;
        return total + (price * quantity);
    }, 0);
}

/**
 * Calculate total value for items with layers
 * @param {Array} items - Array of items with layers
 * @returns {Object} {totalBuyingValue, totalSellingValue}
 */
function calculateIssuanceValue(items) {
    let totalBuyingValue = 0;
    let totalSellingValue = 0;

    if (!Array.isArray(items)) {
        return { totalBuyingValue: 0, totalSellingValue: 0 };
    }

    for (const item of items) {
        const buyingPrice = item.buyingPrice || 0;

        if (Array.isArray(item.layers)) {
            for (const layer of item.layers) {
                const quantity = layer.quantity || 0;
                const sellingPrice = layer.sellingPrice || 0;

                totalSellingValue += sellingPrice * quantity;
            }

            // For buying value, approximate based on total layers quantity
            const totalLayerQty = item.layers.reduce((sum, l) => sum + (l.quantity || 0), 0);
            totalBuyingValue += buyingPrice * totalLayerQty;
        }
    }

    return {
        totalBuyingValue: parseFloat(totalBuyingValue.toFixed(2)),
        totalSellingValue: parseFloat(totalSellingValue.toFixed(2))
    };
}

/**
 * Distribute a total price across packaging layers proportionally
 * @param {Number} totalPrice - Total price to distribute
 * @param {Array} packagingStructure - The product's packaging structure
 * @returns {Array} Packaging structure with calculated prices per unit
 */
function distributePriceAcrossLayers(totalPrice, packagingStructure) {
    if (!packagingStructure || packagingStructure.length === 0) {
        return [];
    }

    // Calculate total units at the smallest layer
    const smallestLayerIndex = packagingStructure.length - 1;
    let totalSmallestUnits = 1;

    for (let i = 1; i <= smallestLayerIndex; i++) {
        totalSmallestUnits *= (packagingStructure[i].qty || 1);
    }

    const pricePerSmallestUnit = totalPrice / totalSmallestUnits;

    // Calculate price for each layer
    return packagingStructure.map((layer, index) => {
        if (index === 0) {
            // Top layer = total price
            return {
                ...layer,
                calculatedPrice: parseFloat(totalPrice.toFixed(2))
            };
        }

        // Calculate how many smallest units this layer represents
        let unitsInThisLayer = 1;
        for (let i = index + 1; i <= smallestLayerIndex; i++) {
            unitsInThisLayer *= (packagingStructure[i].qty || 1);
        }

        return {
            ...layer,
            calculatedPrice: parseFloat((pricePerSmallestUnit * unitsInThisLayer).toFixed(2))
        };
    });
}

/**
 * Find layer index by unit name
 * @param {Array} packagingStructure - The product's packaging structure
 * @param {String} unitName - Unit name to search for
 * @returns {Number} Layer index or -1 if not found
 */
function findLayerIndexByUnit(packagingStructure, unitName) {
    if (!Array.isArray(packagingStructure) || !unitName) {
        return -1;
    }

    return packagingStructure.findIndex(
        layer => layer.unit && layer.unit.toUpperCase() === unitName.toUpperCase()
    );
}

/**
 * Calculate expected units when breaking down from source to target layer
 * @param {Array} packagingStructure - The product's packaging structure
 * @param {Number} sourceLayerIndex - Index of source unit
 * @param {Number} targetLayerIndex - Index of target unit
 * @param {Number} quantity - Quantity of source units to break
 * @returns {Number} Expected quantity of target units
 */
function calculateBreakdownUnits(packagingStructure, sourceLayerIndex, targetLayerIndex, quantity) {
    const conversionRatio = calculateUnitConversion(packagingStructure, sourceLayerIndex, targetLayerIndex);
    return quantity * conversionRatio;
}

module.exports = {
    calculateSellingPricesForLayers,
    calculateUnitConversion,
    validateStockAvailability,
    calculateTotalValue,
    calculateIssuanceValue,
    distributePriceAcrossLayers,
    findLayerIndexByUnit,
    calculateBreakdownUnits
};
