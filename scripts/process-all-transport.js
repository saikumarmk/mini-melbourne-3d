import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Transport type configurations
const TRANSPORT_TYPES = {
    'vline': {
        id: 1,
        name: 'V/Line Regional Trains',
        dataPath: 'D:/Programming/Python/property/data/raw/gtfs/1/extracted',
        color: '#9333EA' // Purple
    },
    'tram': {
        id: 3,
        name: 'Trams',
        dataPath: 'D:/Programming/Python/property/data/raw/gtfs/3/extracted',
        color: '#00C864' // Green
    },
    'bus': {
        id: 4,
        name: 'Buses',
        dataPath: 'D:/Programming/Python/property/data/raw/gtfs/4/extracted',
        color: '#FF8C00' // Orange
    }
};

// Output directory
const OUTPUT_BASE = path.resolve(__dirname, '../data');

/**
 * Parse CSV file into array of objects (handles quoted values)
 */
function parseCSV(content) {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];
    
    // Parse a CSV line handling quotes
    function parseLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());
        return values;
    }
    
    const headers = parseLine(lines[0]);
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
        const values = parseLine(lines[i]);
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        data.push(row);
    }
    
    return data;
}

/**
 * Read GTFS file
 */
function readGTFSFile(basePath, filename) {
    const filePath = path.join(basePath, filename);
    console.log(`Reading ${filePath}...`);
    
    if (!fs.existsSync(filePath)) {
        console.warn(`File not found: ${filePath}`);
        return [];
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseCSV(content);
}

/**
 * Process routes for a transport type
 */
function processRoutes(basePath, transportType) {
    console.log(`\n=== Processing ${transportType.name} Routes ===`);
    
    const routes = readGTFSFile(basePath, 'routes.txt');
    const processedRoutes = [];
    
    routes.forEach(route => {
        processedRoutes.push({
            id: route.route_id,
            shortName: route.route_short_name || route.route_long_name,
            longName: route.route_long_name,
            type: route.route_type,
            color: route.route_color ? `#${route.route_color}` : transportType.color,
            textColor: route.route_text_color ? `#${route.route_text_color}` : '#FFFFFF'
        });
    });
    
    console.log(`✅ Processed ${processedRoutes.length} routes`);
    return processedRoutes;
}

/**
 * Process stops for a transport type
 */
function processStops(basePath, transportType) {
    console.log(`\n=== Processing ${transportType.name} Stops ===`);
    
    const stops = readGTFSFile(basePath, 'stops.txt');
    const stopList = [];
    const stopMap = {};
    
    stops.forEach(stop => {
        const isStation = stop.location_type === '1';
        const isStop = stop.location_type === '0' || stop.location_type === '';
        const hasParentStation = stop.parent_station && stop.parent_station.trim() !== '';
        
        // For trams and buses, include all stops
        // For V/Line, only include stations
        if (transportType.id === 1) {
            // V/Line: only stations
            if (isStation || (isStop && !hasParentStation)) {
                const station = {
                    id: stop.stop_id,
                    name: stop.stop_name,
                    lat: parseFloat(stop.stop_lat),
                    lon: parseFloat(stop.stop_lon),
                    code: stop.stop_code || stop.stop_id
                };
                stopList.push(station);
                stopMap[stop.stop_id] = stop.stop_name;
            } else if (isStop && hasParentStation) {
                stopMap[stop.stop_id] = stop.stop_name;
            }
        } else {
            // Trams and buses: include all stops (but maybe we want to filter to only parent stops)
            if (isStation || (isStop && !hasParentStation)) {
                const station = {
                    id: stop.stop_id,
                    name: stop.stop_name,
                    lat: parseFloat(stop.stop_lat),
                    lon: parseFloat(stop.stop_lon),
                    code: stop.stop_code || stop.stop_id
                };
                stopList.push(station);
                stopMap[stop.stop_id] = stop.stop_name;
            } else if (isStop && hasParentStation) {
                stopMap[stop.stop_id] = stop.stop_name;
            }
        }
    });
    
    console.log(`✅ Processed ${stopList.length} stops and ${Object.keys(stopMap).length} stop mappings`);
    return { stopList, stopMap };
}

/**
 * Process shapes for a transport type
 */
function processShapes(basePath, transportType, routes) {
    console.log(`\n=== Processing ${transportType.name} Shapes ===`);
    
    const shapesData = readGTFSFile(basePath, 'shapes.txt');
    const trips = readGTFSFile(basePath, 'trips.txt');
    
    // Build shape to route mapping from trips
    const shapeToRoute = {};
    trips.forEach(trip => {
        if (trip.shape_id && trip.route_id) {
            shapeToRoute[trip.shape_id] = trip.route_id;
        }
    });
    
    // Group shapes by shape_id
    const shapeGroups = {};
    shapesData.forEach(point => {
        if (!shapeGroups[point.shape_id]) {
            shapeGroups[point.shape_id] = [];
        }
        shapeGroups[point.shape_id].push({
            lat: parseFloat(point.shape_pt_lat),
            lon: parseFloat(point.shape_pt_lon),
            sequence: parseInt(point.shape_pt_sequence)
        });
    });
    
    const shapes = [];
    let routeMatches = 0;
    
    Object.keys(shapeGroups).forEach(shapeId => {
        const points = shapeGroups[shapeId].sort((a, b) => a.sequence - b.sequence);
        const routeId = shapeToRoute[shapeId];
        
        if (routeId) {
            routeMatches++;
        }
        
        shapes.push({
            type: 'Feature',
            properties: {
                shapeId: shapeId,
                routeId: routeId || 'unknown',
                transportType: transportType.name
            },
            geometry: {
                type: 'LineString',
                coordinates: points.map(p => [p.lon, p.lat])
            }
        });
    });
    
    const geojson = {
        type: 'FeatureCollection',
        features: shapes
    };
    
    console.log(`✅ Processed ${shapes.length} shapes (${routeMatches} matched to routes)`);
    return geojson;
}

/**
 * Process route-stops mapping (ordered list of stops for each route)
 */
function processRouteStops(basePath, transportType, routes, stopMap) {
    console.log(`\n=== Processing ${transportType.name} Route-Stops Mapping ===`);
    
    const trips = readGTFSFile(basePath, 'trips.txt');
    const stopTimes = readGTFSFile(basePath, 'stop_times.txt');
    
    // Build route to trips mapping
    const routeTrips = {};
    trips.forEach(trip => {
        if (!routeTrips[trip.route_id]) {
            routeTrips[trip.route_id] = [];
        }
        routeTrips[trip.route_id].push(trip.trip_id);
    });
    
    // Build trip to stops mapping
    const tripStops = {};
    stopTimes.forEach(st => {
        if (!tripStops[st.trip_id]) {
            tripStops[st.trip_id] = [];
        }
        tripStops[st.trip_id].push({
            stopId: st.stop_id,
            sequence: parseInt(st.stop_sequence) || 0
        });
    });
    
    // Sort stops by sequence
    Object.keys(tripStops).forEach(tripId => {
        tripStops[tripId].sort((a, b) => a.sequence - b.sequence);
    });
    
    // Build route to stops mapping (use first trip as representative)
    const routeStops = {};
    
    routes.forEach(route => {
        const tripIds = routeTrips[route.id] || [];
        if (tripIds.length === 0) return;
        
        // Use first trip to get stop sequence
        const firstTripId = tripIds[0];
        const stops = tripStops[firstTripId] || [];
        
        // Map stop IDs to names
        const stopNames = stops
            .map(s => stopMap[s.stopId])
            .filter(name => name); // Remove undefined
        
        if (stopNames.length > 0) {
            routeStops[route.shortName || route.id] = stopNames;
        }
    });
    
    console.log(`✅ Processed ${Object.keys(routeStops).length} route-stops mappings`);
    return routeStops;
}

/**
 * Process all transport types
 */
function processAllTransport() {
    console.log('🚀 Starting GTFS data processing for all transport types...\n');
    
    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_BASE)) {
        fs.mkdirSync(OUTPUT_BASE, { recursive: true });
    }
    
    for (const [key, transportType] of Object.entries(TRANSPORT_TYPES)) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Processing: ${transportType.name}`);
        console.log('='.repeat(60));
        
        if (!fs.existsSync(transportType.dataPath)) {
            console.error(`❌ Data path not found: ${transportType.dataPath}`);
            continue;
        }
        
        try {
            // Create subdirectory for this transport type
            const outputDir = path.join(OUTPUT_BASE, key);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            
            // Process routes
            const routes = processRoutes(transportType.dataPath, transportType);
            fs.writeFileSync(
                path.join(outputDir, 'routes.json'),
                JSON.stringify(routes, null, 2)
            );
            
            // Process stops
            const { stopList, stopMap } = processStops(transportType.dataPath, transportType);
            fs.writeFileSync(
                path.join(outputDir, 'stops.json'),
                JSON.stringify(stopList, null, 2)
            );
            fs.writeFileSync(
                path.join(outputDir, 'stop-id-map.json'),
                JSON.stringify(stopMap, null, 2)
            );
            
            // Process shapes
            const shapes = processShapes(transportType.dataPath, transportType, routes);
            fs.writeFileSync(
                path.join(outputDir, 'shapes.json'),
                JSON.stringify(shapes, null, 2)
            );
            
            // Process route-stops mapping
            const routeStops = processRouteStops(transportType.dataPath, transportType, routes, stopMap);
            fs.writeFileSync(
                path.join(outputDir, 'route-stops.json'),
                JSON.stringify(routeStops, null, 2)
            );
            
            console.log(`\n✅ ${transportType.name} processing complete!`);
            console.log(`   Output directory: ${outputDir}`);
            
        } catch (error) {
            console.error(`❌ Error processing ${transportType.name}:`, error.message);
        }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 All transport types processed successfully!');
    console.log('='.repeat(60));
}

// Run the processor
processAllTransport();

