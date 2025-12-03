function parseSupplierItem(rawName, cartonPrice) {
  const name = rawName.trim().toUpperCase();

  // Pattern 1: TRIPLE LAYER / MULTI-NESTED (e.g., 20 BOXES X 20 PACKS X 100 PCS)
  // Catches: "20BOXES X 20BOXES X 100PCS" or "10 CARTONS X 12 TRAYS X 50 SACHETS"
  const tripleRegex = /(\d+)\s*([A-Z]+)\s*[xX×]\s*(\d+)\s*([A-Z]+)\s*[xX×]\s*(\d+)\s*([A-Z]+)/i;
  const tripleMatch = name.match(tripleRegex);

  if (tripleMatch) {
    const outerQty = parseInt(tripleMatch[1]);      // 20
    const outerUnit = tripleMatch[2];               // BOXES (Level 1)
    const midQty = parseInt(tripleMatch[3]);        // 20
    const midUnit = tripleMatch[4];                 // BOXES (Level 2)
    const innerQty = parseInt(tripleMatch[5]);      // 100
    const innerUnit = tripleMatch[6];               // PCS (Level 3)

    const totalPieces = outerQty * midQty * innerQty; // 20 * 20 * 100 = 40,000
    const pricePerPiece = (cartonPrice / totalPieces).toFixed(2);
    
    // Calculate price for the middle unit (e.g., price per Box)
    const pricePerMidUnit = (cartonPrice / outerQty).toFixed(2);

    const cleanName = rawName
      .replace(tripleRegex, '')
      .replace(/\(.*\)/, '') // Remove stuff like (CARS)
      .trim()
      .replace(/\s+/g, ' ');

    return {
      productName: cleanName || rawName,
      supplierUnit: "CTN",
      supplierUnitQuantity: totalPieces,
      unitBreakdown: `${outerQty} ${outerUnit} × ${midQty} ${midUnit} × ${innerQty} ${innerUnit}`,
      packagingStructure: {
        layers: 3,
        outer: { quantity: outerQty, unit: outerUnit }, // Master Carton
        middle: { quantity: midQty, unit: midUnit },    // Inner Box
        inner: { quantity: innerQty, unit: innerUnit }  // Piece
      },
      buyingPricePerUnit: cartonPrice,
      calculatedPricePerPiece: parseFloat(pricePerPiece),
      calculatedPricePerSubUnit: parseFloat(pricePerMidUnit),
      totalSellableUnits: totalPieces,
      packagingType: "triple"
    };
  }
  
  // Pattern 2: STANDARD NESTED (20 BOXES × 100 PCS)
  const nestedRegex = /(\d+)\s*(BOXES?|TRAYS?|JARS?|BALES?|PKTS?|PACKS?|OUTERS?)\s*[xX×]\s*(\d+)\s*(PCS?|PIECES?|POUCHES?|SACHETS?|PACKETS?)/i;
  const nestedMatch = name.match(nestedRegex);
  
  if (nestedMatch) {
    const outerQty = parseInt(nestedMatch[1]);
    const outerUnit = nestedMatch[2];
    const innerQty = parseInt(nestedMatch[3]);
    const innerUnit = nestedMatch[4];
    
    const totalPieces = outerQty * innerQty;
    const pricePerPiece = (cartonPrice / totalPieces).toFixed(2);
    const pricePerSubUnit = (cartonPrice / outerQty).toFixed(2);
    
    const cleanName = rawName
      .replace(nestedRegex, '')
      .replace(/\(.*\)/, '')
      .trim()
      .replace(/\s+/g, ' ');
    
    return {
      productName: cleanName || rawName,
      supplierUnit: "CTN",
      supplierUnitQuantity: totalPieces,
      unitBreakdown: `${outerQty} ${outerUnit} × ${innerQty} ${innerUnit}`,
      packagingStructure: {
        layers: 2,
        outer: { quantity: outerQty, unit: outerUnit },
        inner: { quantity: innerQty, unit: innerUnit }
      },
      buyingPricePerUnit: cartonPrice,
      calculatedPricePerPiece: parseFloat(pricePerPiece),
      calculatedPricePerSubUnit: parseFloat(pricePerSubUnit),
      totalSellableUnits: totalPieces,
      packagingType: "nested"
    };
  }
  
  // Pattern 3: SIMPLE CARTON (24 X 200GM)
  const simpleCartonRegex = /(\d+)\s*(?:PKTS?|X)\s*[xX×]?\s*(\d+(?:\.\d+)?)\s*(GM|GMS|KG|KGS|ML|L|LTR|PCS?|PIECES?)/i;
  const simpleMatch = name.match(simpleCartonRegex);
  
  if (simpleMatch) {
    const quantity = parseInt(simpleMatch[1]);
    const size = parseFloat(simpleMatch[2]);
    const unit = simpleMatch[3];
    
    const pricePerPiece = (cartonPrice / quantity).toFixed(2);
    
    const cleanName = rawName.replace(simpleCartonRegex, '').replace(/\(.*\)/, '').trim();
    
    return {
      productName: cleanName || rawName,
      supplierUnit: "CTN",
      supplierUnitQuantity: quantity,
      unitBreakdown: `${quantity} × ${size}${unit}`,
      packagingStructure: {
        layers: 2,
        outer: { quantity: quantity, unit: "pieces" },
        inner: { quantity: size, unit: unit }
      },
      buyingPricePerUnit: cartonPrice,
      calculatedPricePerPiece: parseFloat(pricePerPiece),
      totalSellableUnits: quantity,
      packagingType: "simple"
    };
  }
  
  // Pattern 4: SINGLE UNIT (1 X 10KG BAG)
  const singleRegex = /1\s*[xX×*]\s*(\d+(?:\.\d+)?)\s*(KG|KGS|GM|GMS|ML|L|LTR)\s*(BAG|BKT|BUCKET|CONTAINER)?/i;
  const singleMatch = name.match(singleRegex);
  
  if (singleMatch) {
    const size = parseFloat(singleMatch[1]);
    const unit = singleMatch[2];
    const container = singleMatch[3] || "UNIT";
    
    const cleanName = rawName.replace(singleRegex, '').replace(/\(.*\)/, '').trim();
    
    return {
      productName: cleanName || rawName,
      supplierUnit: "UNIT",
      supplierUnitQuantity: `${size}${unit}`,
      unitBreakdown: `${size}${unit} ${container}`,
      packagingStructure: {
        layers: 1,
        outer: { quantity: 1, unit: container },
        inner: { quantity: size, unit: unit }
      },
      buyingPricePerUnit: cartonPrice,
      calculatedPricePerPiece: cartonPrice,
      totalSellableUnits: 1,
      packagingType: "single"
    };
  }
  
  // Pattern 5: BALE (12 BALE X 2KG)
  const baleRegex = /(\d+)\s*BALE\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(KG|KGS)/i;
  const baleMatch = name.match(baleRegex);
  
  if (baleMatch) {
    const quantity = parseInt(baleMatch[1]);
    const sizePerBale = parseFloat(baleMatch[2]);
    const unit = baleMatch[3];
    
    const pricePerBale = (cartonPrice / quantity).toFixed(2);
    const cleanName = rawName.replace(baleRegex, '').replace(/\(.*\)/, '').trim();
    
    return {
      productName: cleanName || rawName,
      supplierUnit: "BALE",
      supplierUnitQuantity: quantity,
      unitBreakdown: `${quantity} × ${sizePerBale}${unit}`,
      packagingStructure: {
        layers: 2,
        outer: { quantity: quantity, unit: "BALE" },
        inner: { quantity: sizePerBale, unit: unit }
      },
      buyingPricePerUnit: cartonPrice,
      calculatedPricePerPiece: parseFloat(pricePerBale),
      totalSellableUnits: quantity,
      packagingType: "bale"
    };
  }
  
  // Fallback
  return {
    productName: rawName.trim(),
    supplierUnit: "CTN",
    supplierUnitQuantity: 1,
    unitBreakdown: "Unknown packaging",
    packagingStructure: { layers: 1 },
    buyingPricePerUnit: cartonPrice,
    calculatedPricePerPiece: cartonPrice,
    totalSellableUnits: 1,
    packagingType: "unknown"
  };
}

module.exports = { parseSupplierItem };

// function parseSupplierItem(rawName, cartonPrice) {
//   const name = rawName.trim().toUpperCase();

//   // Pattern 1: TRIPLE LAYER / MULTI-NESTED (e.g., 20 BOXES X 20 PACKS X 100 PCS)
//   const tripleRegex = /(\d+)\s*([A-Z]+)\s*[xX×]\s*(\d+)\s*([A-Z]+)\s*[xX×]\s*(\d+)\s*([A-Z]+)/i;
//   const tripleMatch = name.match(tripleRegex);

//   if (tripleMatch) {
//     const outerQty = parseInt(tripleMatch[1]);
//     const outerUnit = tripleMatch[2];
//     const midQty = parseInt(tripleMatch[3]);
//     const midUnit = tripleMatch[4];
//     const innerQty = parseInt(tripleMatch[5]);
//     const innerUnit = tripleMatch[6];

//     const totalPieces = outerQty * midQty * innerQty;
//     const pricePerPiece = (cartonPrice / totalPieces).toFixed(2);
//     const pricePerMidUnit = (cartonPrice / outerQty).toFixed(2);

//     const cleanName = rawName
//       .replace(tripleRegex, '')
//       .replace(/\(.*\)/, '')
//       .trim()
//       .replace(/\s+/g, ' ');

//     return {
//       productName: cleanName || rawName,
//       supplierUnit: "CTN",
//       supplierUnitQuantity: totalPieces,
//       unitBreakdown: `${outerQty} ${outerUnit} × ${midQty} ${midUnit} × ${innerQty} ${innerUnit}`,
//       packagingStructure: {
//         layers: 3,
//         outer: { quantity: outerQty, unit: outerUnit },
//         middle: { quantity: midQty, unit: midUnit },
//         inner: { quantity: innerQty, unit: innerUnit }
//       },
//       buyingPricePerUnit: cartonPrice,
//       calculatedPricePerPiece: parseFloat(pricePerPiece),
//       calculatedPricePerSubUnit: parseFloat(pricePerMidUnit),
//       totalSellableUnits: totalPieces,
//       packagingType: "triple"
//     };
//   }

//   // Pattern 2: STANDARD NESTED (20 BOXES × 100 PCS)
//   const nestedRegex = /(\d+)\s*(BOXES?|TRAYS?|JARS?|BALES?|PKTS?|PACKS?|OUTERS?)\s*[xX×]\s*(\d+)\s*(PCS?|PIECES?|POUCHES?|SACHETS?|PACKETS?)/i;
//   const nestedMatch = name.match(nestedRegex);

//   if (nestedMatch) {
//     const outerQty = parseInt(nestedMatch[1]);
//     const outerUnit = nestedMatch[2];
//     const innerQty = parseInt(nestedMatch[3]);
//     const innerUnit = nestedMatch[4];

//     const totalPieces = outerQty * innerQty;
//     const pricePerPiece = (cartonPrice / totalPieces).toFixed(2);
//     const pricePerSubUnit = (cartonPrice / outerQty).toFixed(2);

//     const cleanName = rawName
//       .replace(nestedRegex, '')
//       .replace(/\(.*\)/, '')
//       .trim()
//       .replace(/\s+/g, ' ');

//     return {
//       productName: cleanName || rawName,
//       supplierUnit: "CTN",
//       supplierUnitQuantity: totalPieces,
//       unitBreakdown: `${outerQty} ${outerUnit} × ${innerQty} ${innerUnit}`,
//       packagingStructure: {
//         layers: 2,
//         outer: { quantity: outerQty, unit: outerUnit },
//         inner: { quantity: innerQty, unit: innerUnit }
//       },
//       buyingPricePerUnit: cartonPrice,
//       calculatedPricePerPiece: parseFloat(pricePerPiece),
//       calculatedPricePerSubUnit: parseFloat(pricePerSubUnit),
//       totalSellableUnits: totalPieces,
//       packagingType: "nested"
//     };
//   }

//   // Pattern 3: SIMPLE CARTON (24 X 200GM)
//   const simpleCartonRegex = /(\d+)\s*(?:PKTS?|X)\s*[xX×]?\s*(\d+(?:\.\d+)?)\s*(GM|GMS|KG|KGS|ML|L|LTR|PCS?|PIECES?)/i;
//   const simpleMatch = name.match(simpleCartonRegex);

//   if (simpleMatch) {
//     const quantity = parseInt(simpleMatch[1]);
//     const size = parseFloat(simpleMatch[2]);
//     const unit = simpleMatch[3];

//     const pricePerPiece = (cartonPrice / quantity).toFixed(2);

//     const cleanName = rawName.replace(simpleCartonRegex, '').replace(/\(.*\)/, '').trim();

//     return {
//       productName: cleanName || rawName,
//       supplierUnit: "CTN",
//       supplierUnitQuantity: quantity,
//       unitBreakdown: `${quantity} × ${size}${unit}`,
//       packagingStructure: {
//         layers: 2,
//         outer: { quantity: quantity, unit: "pieces" },
//         inner: { quantity: size, unit: unit }
//       },
//       buyingPricePerUnit: cartonPrice,
//       calculatedPricePerPiece: parseFloat(pricePerPiece),
//       totalSellableUnits: quantity,
//       packagingType: "simple"
//     };
//   }

//   // Pattern 4: SINGLE UNIT (1 X 10KG BAG)
//   const singleRegex = /1\s*[xX×*]\s*(\d+(?:\.\d+)?)\s*(KG|KGS|GM|GMS|ML|L|LTR)\s*(BAG|BKT|BUCKET|CONTAINER)?/i;
//   const singleMatch = name.match(singleRegex);

//   if (singleMatch) {
//     const size = parseFloat(singleMatch[1]);
//     const unit = singleMatch[2];
//     const container = singleMatch[3] || "UNIT";

//     const cleanName = rawName.replace(singleRegex, '').replace(/\(.*\)/, '').trim();

//     return {
//       productName: cleanName || rawName,
//       supplierUnit: "UNIT",
//       supplierUnitQuantity: `${size}${unit}`,
//       unitBreakdown: `${size}${unit} ${container}`,
//       packagingStructure: {
//         layers: 1,
//         outer: { quantity: 1, unit: container },
//         inner: { quantity: size, unit: unit }
//       },
//       buyingPricePerUnit: cartonPrice,
//       calculatedPricePerPiece: cartonPrice,
//       totalSellableUnits: 1,
//       packagingType: "single"
//     };
//   }

//   // Pattern 5: BALE (12 BALE X 2KG)
//   const baleRegex = /(\d+)\s*BALE\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(KG|KGS)/i;
//   const baleMatch = name.match(baleRegex);

//   if (baleMatch) {
//     const quantity = parseInt(baleMatch[1]);
//     const sizePerBale = parseFloat(baleMatch[2]);
//     const unit = baleMatch[3];

//     const pricePerBale = (cartonPrice / quantity).toFixed(2);
//     const cleanName = rawName.replace(baleRegex, '').replace(/\(.*\)/, '').trim();

//     return {
//       productName: cleanName || rawName,
//       supplierUnit: "BALE",
//       supplierUnitQuantity: quantity,
//       unitBreakdown: `${quantity} × ${sizePerBale}${unit}`,
//       packagingStructure: {
//         layers: 2,
//         outer: { quantity: quantity, unit: "BALE" },
//         inner: { quantity: sizePerBale, unit: unit }
//       },
//       buyingPricePerUnit: cartonPrice,
//       calculatedPricePerPiece: parseFloat(pricePerBale),
//       totalSellableUnits: quantity,
//       packagingType: "bale"
//     };
//   }

//   // Fallback
//   return {
//     productName: rawName.trim(),
//     supplierUnit: "CTN",
//     supplierUnitQuantity: 1,
//     unitBreakdown: "Unknown packaging",
//     packagingStructure: { layers: 1 },
//     buyingPricePerUnit: cartonPrice,
//     calculatedPricePerPiece: cartonPrice,
//     totalSellableUnits: 1,
//     packagingType: "unknown"
//   };
// }

// module.exports = { parseSupplierItem };
