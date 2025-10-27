/**
 * Standalone script to analyze railway offsets
 * Run with: node scripts/analyze-railway-offsets.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load railway data (grouped by unique route name)
function loadRailways() {
    const dataPath = path.resolve(__dirname, '../data');
    const railwaysByName = new Map(); // Group by shortName
    
    // Load metro railways
    const metroShapesPath = path.join(dataPath, 'shapes.json');
    const metroRoutesPath = path.join(dataPath, 'routes.json');
    
    if (fs.existsSync(metroShapesPath) && fs.existsSync(metroRoutesPath)) {
        const shapes = JSON.parse(fs.readFileSync(metroShapesPath, 'utf-8'));
        const routes = JSON.parse(fs.readFileSync(metroRoutesPath, 'utf-8'));
        
        // Create a route lookup
        const routeMap = {};
        routes.forEach(r => {
            routeMap[r.id] = r;
        });
        
        // Process shapes into railways (merge all shapes for same route name)
        shapes.features.forEach(feature => {
            const routeId = feature.properties.routeId;
            const route = routeMap[routeId];
            
            if (route && feature.geometry) {
                const key = route.shortName || routeId;
                
                if (!railwaysByName.has(key)) {
                    railwaysByName.set(key, {
                        id: routeId,
                        shortName: route.shortName,
                        longName: route.longName,
                        color: route.color,
                        geometries: [],
                        transportType: 'metro'
                    });
                }
                
                railwaysByName.get(key).geometries.push(feature.geometry);
            }
        });
    }
    
    // Load tram railways
    const tramPath = path.join(dataPath, 'tram');
    if (fs.existsSync(tramPath)) {
        const tramShapesPath = path.join(tramPath, 'shapes.json');
        const tramRoutesPath = path.join(tramPath, 'routes.json');
        
        if (fs.existsSync(tramShapesPath) && fs.existsSync(tramRoutesPath)) {
            const shapes = JSON.parse(fs.readFileSync(tramShapesPath, 'utf-8'));
            const routes = JSON.parse(fs.readFileSync(tramRoutesPath, 'utf-8'));
            
            const routeMap = {};
            routes.forEach(r => {
                routeMap[r.id] = r;
            });
            
            shapes.features.forEach(feature => {
                const routeId = feature.properties.routeId;
                const route = routeMap[routeId];
                
                if (route && feature.geometry) {
                    const key = route.shortName || routeId;
                    
                    if (!railwaysByName.has(key)) {
                        railwaysByName.set(key, {
                            id: routeId,
                            shortName: route.shortName,
                            longName: route.longName,
                            color: route.color,
                            geometries: [],
                            transportType: 'tram'
                        });
                    }
                    
                    railwaysByName.get(key).geometries.push(feature.geometry);
                }
            });
        }
    }
    
    return Array.from(railwaysByName.values());
}

// Find shared track segments
function findSharedTrackSegments(railways) {
    const segmentMap = new Map();
    
    railways.forEach((railway, railwayIndex) => {
        if (!railway.geometries || railway.geometries.length === 0) return;
        
        // Process all geometries for this railway (all shape variations)
        railway.geometries.forEach(geometry => {
            if (!geometry || !geometry.coordinates) return;
            
            const coords = geometry.coordinates;
            
            for (let i = 0; i < coords.length - 1; i++) {
                const [lon1, lat1] = coords[i];
                const [lon2, lat2] = coords[i + 1];
                
                // Create normalized segment key (order-independent)
                const p1 = [lon1.toFixed(5), lat1.toFixed(5)].join(',');
                const p2 = [lon2.toFixed(5), lat2.toFixed(5)].join(',');
                const signature = p1 < p2 ? `${p1}_${p2}` : `${p2}_${p1}`;
                
                if (!segmentMap.has(signature)) {
                    segmentMap.set(signature, new Set());
                }
                
                // Track unique railway names (not individual shapes)
                segmentMap.get(signature).add(railway.shortName || railway.id);
            }
        });
    });
    
    const sharedSegments = new Map();
    for (const [signature, railwayNames] of segmentMap.entries()) {
        if (railwayNames.size > 1) {
            sharedSegments.set(signature, Array.from(railwayNames));
        }
    }
    
    return sharedSegments;
}

// Calculate offset for a line based on its index
function calculateLineOffset(lineIndex, totalLines, baseOffset = 8) {
    if (totalLines === 1) return 0;
    const center = (totalLines - 1) / 2;
    return (lineIndex - center) * baseOffset;
}

// Analyze offsets
function analyzeOffsets() {
    console.log('🔍 Loading railway data...\n');
    
    const railways = loadRailways();
    const metroCount = railways.filter(r => r.transportType === 'metro').length;
    const tramCount = railways.filter(r => r.transportType === 'tram').length;
    
    console.log(`Loaded ${railways.length} unique railway lines`);
    console.log(`  Metro: ${metroCount}`);
    console.log(`  Tram: ${tramCount}`);
    
    console.log('\n🔍 Analyzing shared track segments...\n');
    
    const sharedSegments = findSharedTrackSegments(railways);
    
    if (sharedSegments.size === 0) {
        console.log('❌ No shared track segments found');
        return;
    }
    
    console.log(`Found ${sharedSegments.size} unique shared track segments\n`);
    
    // Calculate offsets for each railway
    const railwayOffsets = new Map();
    
    // Count how many segments each line shares with others
    const lineSharedSegmentCounts = new Map();
    railways.forEach(r => {
        lineSharedSegmentCounts.set(r.shortName || r.id, 0);
    });
    
    for (const [signature, railwayNames] of sharedSegments.entries()) {
        const totalLines = railwayNames.length;
        const sortedNames = railwayNames.sort(); // Consistent ordering
        
        sortedNames.forEach((lineName, index) => {
            const offset = calculateLineOffset(index, totalLines, 8);
            
            // Increment segment count
            lineSharedSegmentCounts.set(lineName, lineSharedSegmentCounts.get(lineName) + 1);
            
            if (!railwayOffsets.has(lineName)) {
                railwayOffsets.set(lineName, {
                    offset: offset,
                    count: 1
                });
            } else {
                // Average the offsets if a line has multiple offset values
                const existing = railwayOffsets.get(lineName);
                existing.offset = (existing.offset * existing.count + offset) / (existing.count + 1);
                existing.count++;
            }
        });
    }
    
    // Report statistics
    console.log('📊 Railway Offset Statistics\n');
    console.log('═'.repeat(60));
    
    const withOffsets = [];
    const withoutOffsets = [];
    
    railways.forEach(railway => {
        const lineName = railway.shortName || railway.id;
        const offsetInfo = railwayOffsets.get(lineName);
        const sharedSegmentCount = lineSharedSegmentCounts.get(lineName);
        
        if (offsetInfo && Math.abs(offsetInfo.offset) >= 0.1) {
            withOffsets.push({
                name: lineName,
                type: railway.transportType,
                offset: offsetInfo.offset,
                sharedSegments: sharedSegmentCount,
                longName: railway.longName
            });
        } else {
            withoutOffsets.push({
                name: lineName,
                type: railway.transportType,
                longName: railway.longName
            });
        }
    });
    
    // Sort by absolute offset (largest first)
    withOffsets.sort((a, b) => Math.abs(b.offset) - Math.abs(a.offset));
    
    console.log(`\n📍 Lines WITH offsets (${withOffsets.length} lines):\n`);
    withOffsets.forEach(line => {
        const offsetStr = line.offset > 0 ? `+${line.offset.toFixed(1)}m` : `${line.offset.toFixed(1)}m`;
        const padding = ' '.repeat(Math.max(0, 20 - line.name.length));
        const typeLabel = line.type === 'metro' ? '🚆' : '🚋';
        console.log(`  ${typeLabel}  ${line.name}${padding} ${offsetStr.padStart(8)}  (${line.sharedSegments} shared segments)`);
    });
    
    console.log(`\n✓ Lines WITHOUT offsets (${withoutOffsets.length} lines):\n`);
    withoutOffsets.forEach(line => {
        const typeLabel = line.type === 'metro' ? '🚆' : '🚋';
        console.log(`  ${typeLabel}  ${line.name} - ${line.longName}`);
    });
    
    console.log('\n' + '═'.repeat(60));
    console.log('\n📈 Summary:');
    console.log(`  Total unique lines: ${railways.length}`);
    console.log(`  Lines with offsets: ${withOffsets.length}`);
    console.log(`  Lines without offsets: ${withoutOffsets.length}`);
    console.log(`  Shared track segments: ${sharedSegments.size}`);
    
    // Show which lines share tracks most
    console.log('\n🔗 Lines sharing the most track (top 10):\n');
    const sortedBySharedSegments = [...withOffsets].sort((a, b) => b.sharedSegments - a.sharedSegments);
    sortedBySharedSegments.slice(0, 10).forEach((line, i) => {
        const offsetStr = line.offset > 0 ? `+${line.offset.toFixed(1)}m` : `${line.offset.toFixed(1)}m`;
        console.log(`  ${i + 1}. ${line.name}: ${line.sharedSegments} segments (offset: ${offsetStr})`);
    });
}

// Run the analysis
try {
    analyzeOffsets();
} catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
}

