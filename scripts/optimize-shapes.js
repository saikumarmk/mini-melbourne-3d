/**
 * Optimize shape files by reducing coordinate precision
 * 
 * This script:
 * 1. Rounds coordinates to 6 decimal places (~11cm precision)
 * 2. Removes redundant consecutive duplicate points
 * 3. Can significantly reduce file sizes (typically 40-60%)
 */

const fs = require('fs');
const path = require('path');

/**
 * Round number to specified decimal places
 */
function roundCoord(num, decimals = 6) {
    return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

/**
 * Optimize a single coordinate array
 */
function optimizeCoordinates(coords, decimals = 6) {
    if (!Array.isArray(coords) || coords.length === 0) return coords;
    
    // Handle different coordinate structures
    if (typeof coords[0] === 'number') {
        // Single coordinate pair [lng, lat]
        return [roundCoord(coords[0], decimals), roundCoord(coords[1], decimals)];
    } else {
        // Array of coordinates
        const optimized = [];
        let lastCoord = null;
        
        for (const coord of coords) {
            const rounded = [
                roundCoord(coord[0], decimals),
                roundCoord(coord[1], decimals)
            ];
            
            // Skip consecutive duplicates
            if (!lastCoord || 
                rounded[0] !== lastCoord[0] || 
                rounded[1] !== lastCoord[1]) {
                optimized.push(rounded);
                lastCoord = rounded;
            }
        }
        
        return optimized;
    }
}

/**
 * Optimize a GeoJSON feature
 */
function optimizeFeature(feature, decimals = 6) {
    if (!feature.geometry) return feature;
    
    const optimized = { ...feature };
    
    if (feature.geometry.type === 'LineString') {
        optimized.geometry = {
            ...feature.geometry,
            coordinates: optimizeCoordinates(feature.geometry.coordinates, decimals)
        };
    } else if (feature.geometry.type === 'MultiLineString') {
        optimized.geometry = {
            ...feature.geometry,
            coordinates: feature.geometry.coordinates.map(line => 
                optimizeCoordinates(line, decimals)
            )
        };
    } else if (feature.geometry.type === 'Point') {
        optimized.geometry = {
            ...feature.geometry,
            coordinates: optimizeCoordinates(feature.geometry.coordinates, decimals)
        };
    }
    
    return optimized;
}

/**
 * Optimize a shapes.json file
 */
function optimizeShapesFile(inputPath, outputPath, decimals = 6) {
    console.log(`\nOptimizing: ${inputPath}`);
    
    // Get original size
    const originalSize = fs.statSync(inputPath).size;
    console.log(`  Original size: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);
    
    // Read and parse
    const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    
    // Optimize features
    if (data.features && Array.isArray(data.features)) {
        data.features = data.features.map(feature => 
            optimizeFeature(feature, decimals)
        );
    }
    
    // Write optimized file
    fs.writeFileSync(outputPath, JSON.stringify(data), 'utf8');
    
    // Get new size
    const newSize = fs.statSync(outputPath).size;
    const reduction = ((originalSize - newSize) / originalSize * 100).toFixed(1);
    
    console.log(`  Optimized size: ${(newSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Reduction: ${reduction}%`);
    
    return {
        originalSize,
        newSize,
        reduction: parseFloat(reduction)
    };
}

/**
 * Optimize stops.json file (less aggressive)
 */
function optimizeStopsFile(inputPath, outputPath, decimals = 6) {
    console.log(`\nOptimizing: ${inputPath}`);
    
    const originalSize = fs.statSync(inputPath).size;
    console.log(`  Original size: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);
    
    const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    
    // Optimize each stop's coordinates
    if (Array.isArray(data)) {
        data.forEach(stop => {
            if (stop.coordinates) {
                stop.coordinates = optimizeCoordinates(stop.coordinates, decimals);
            }
        });
    }
    
    fs.writeFileSync(outputPath, JSON.stringify(data), 'utf8');
    
    const newSize = fs.statSync(outputPath).size;
    const reduction = ((originalSize - newSize) / originalSize * 100).toFixed(1);
    
    console.log(`  Optimized size: ${(newSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Reduction: ${reduction}%`);
    
    return {
        originalSize,
        newSize,
        reduction: parseFloat(reduction)
    };
}

// Main execution
const dataDir = path.join(__dirname, '../data');
const types = ['metro', 'vline', 'tram', 'bus'];

console.log('=== Optimizing Shape Files ===');
console.log('Coordinate precision: 6 decimal places (~11cm accuracy)');
console.log('Removing consecutive duplicate points');

let totalOriginal = 0;
let totalNew = 0;

// Optimize metro shapes (root level)
const metroShapesPath = path.join(dataDir, 'shapes.json');
if (fs.existsSync(metroShapesPath)) {
    const result = optimizeShapesFile(metroShapesPath, metroShapesPath, 6);
    totalOriginal += result.originalSize;
    totalNew += result.newSize;
}

// Optimize each transport type
for (const type of types) {
    const typeDir = path.join(dataDir, type);
    if (!fs.existsSync(typeDir)) continue;
    
    console.log(`\n--- ${type.toUpperCase()} ---`);
    
    // Optimize shapes
    const shapesPath = path.join(typeDir, 'shapes.json');
    if (fs.existsSync(shapesPath)) {
        const result = optimizeShapesFile(shapesPath, shapesPath, 6);
        totalOriginal += result.originalSize;
        totalNew += result.newSize;
    }
    
    // Optimize stops
    const stopsPath = path.join(typeDir, 'stops.json');
    if (fs.existsSync(stopsPath)) {
        const result = optimizeStopsFile(stopsPath, stopsPath, 6);
        totalOriginal += result.originalSize;
        totalNew += result.newSize;
    }
}

// Summary
console.log('\n=== SUMMARY ===');
console.log(`Total original size: ${(totalOriginal / 1024 / 1024).toFixed(2)} MB`);
console.log(`Total optimized size: ${(totalNew / 1024 / 1024).toFixed(2)} MB`);
console.log(`Total reduction: ${((totalOriginal - totalNew) / totalOriginal * 100).toFixed(1)}%`);
console.log(`\n✅ Optimization complete!`);
console.log(`\nWith gzip compression (Netlify does this automatically):`);
console.log(`  Estimated download size: ${(totalNew / 1024 / 1024 / 3).toFixed(2)} MB`);

