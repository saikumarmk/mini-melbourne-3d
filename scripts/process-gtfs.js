import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const METROMINDER_DATA_PATH = path.resolve(__dirname, '../../metrominder/data/gtfsschedule');
const OUTPUT_PATH = path.resolve(__dirname, '../data');

// Parse CSV to JSON
function parseCSV(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim());
    
    return lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const obj = {};
        headers.forEach((header, i) => {
            obj[header] = values[i] || '';
        });
        return obj;
    });
}

// Read and parse GTFS file
function readGTFSFile(filename) {
    const filePath = path.join(METROMINDER_DATA_PATH, filename);
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseCSV(content);
}

// Process stations
function processStations() {
    console.log('Processing stations...');
    const stops = readGTFSFile('stops.txt');
    
    // Create a map of both numeric stop IDs and parent station IDs to names
    const stationMap = {};
    const stationList = [];
    
    stops.forEach(stop => {
        const isStation = stop.location_type === '1';
        const isTrainPlatform = (stop.location_type === '0' || stop.location_type === '') && !stop.stop_name.includes('Replacement');
        const hasParentStation = stop.parent_station && stop.parent_station.trim() !== '';
        
        if (isStation || (isTrainPlatform && !hasParentStation)) {
            const station = {
                id: stop.stop_id,
                name: stop.stop_name,
                lat: parseFloat(stop.stop_lat),
                lon: parseFloat(stop.stop_lon),
                code: stop.stop_code || stop.stop_id
            };
            stationList.push(station);
            stationMap[stop.stop_id] = stop.stop_name;
        } else if (isTrainPlatform && hasParentStation) {
            // Map platform/child stop IDs to their name (for GTFS-R lookups)
            // Use the stop's own name first, or look up parent
            stationMap[stop.stop_id] = stop.stop_name;
        }
    });
    
    // Save both the station list and the ID-to-name map
    fs.writeFileSync(
        path.join(OUTPUT_PATH, 'stations.json'),
        JSON.stringify(stationList, null, 2)
    );
    fs.writeFileSync(
        path.join(OUTPUT_PATH, 'station-id-map.json'),
        JSON.stringify(stationMap, null, 2)
    );
    
    console.log(`Processed ${stationList.length} stations and ${Object.keys(stationMap).length} stop ID mappings`);
    return stationList;
}

// Process routes
function processRoutes() {
    console.log('Processing routes...');
    const routes = readGTFSFile('routes.txt');
    
    const processedRoutes = routes.map(route => ({
        id: route.route_id,
        shortName: route.route_short_name,
        longName: route.route_long_name,
        type: route.route_type,
        color: route.route_color ? `#${route.route_color}` : '#000000',
        textColor: route.route_text_color ? `#${route.route_text_color}` : '#FFFFFF'
    }));
    
    fs.writeFileSync(
        path.join(OUTPUT_PATH, 'routes.json'),
        JSON.stringify(processedRoutes, null, 2)
    );
    console.log(`Processed ${processedRoutes.length} routes`);
    return processedRoutes;
}

// Process shapes into GeoJSON railway lines
function processShapes() {
    console.log('Processing shapes...');
    
        const shapes = [];
        
        try {
            // Load from property GTFS data (most complete and up-to-date)
            const propertyPath = 'D:/Programming/Python/property/data/raw/gtfs/2/extracted/shapes.txt';
            const backendPath = path.resolve(__dirname, '../../MiniMelbourne-Backend/data/shapes.txt');
            let shapesData;
            
            if (fs.existsSync(propertyPath)) {
                console.log('Loading property GTFS shapes.txt (64MB - this may take a moment)...');
                const content = fs.readFileSync(propertyPath, 'utf-8');
                shapesData = parseCSV(content);
                console.log(`Loaded ${shapesData.length} shape points`);
            } else if (fs.existsSync(backendPath)) {
                console.log('Loading backend shapes.txt (fallback)...');
                const content = fs.readFileSync(backendPath, 'utf-8');
                shapesData = parseCSV(content);
            } else {
                throw new Error('No shapes file found');
            }
        
        // Create mapping from shape prefixes to route IDs
        // Backend shapes use different codes than routes
        // Manual mapping based on line names
        const routes = readGTFSFile('routes.txt');
        const routesByName = {};
        routes.forEach(route => {
            if (!route.route_short_name.includes('Replacement')) {
                routesByName[route.route_short_name.toLowerCase()] = route.route_id;
            }
        });
        
        // Map shape codes to route names
        // Backend uses mixed case codes - need to handle both
        const shapeCodeToRouteName = {
            // Lowercase codes
            'alm': 'alamein',
            'ain': 'alamein',
            'beg': 'belgrave',
            'bel': 'belgrave',
            'cbe': 'cranbourne',
            'crb': 'cranbourne',
            'cgb': 'craigieburn',
            'fkn': 'frankston',
            'gwy': 'glen waverley',
            'glw': 'glen waverley',
            'hbe': 'hurstbridge',
            'hbg': 'hurstbridge',  // RED LINE
            'lil': 'lilydale',
            'mdd': 'mernda',
            'mer': 'mernda',       // RED LINE
            'pkm': 'pakenham',
            'shm': 'sandringham',
            'sdm': 'sandringham',  // PINK LINE
            'sty': 'stony point',
            'spt': 'stony point',
            'suy': 'sunbury',
            'sym': 'sunbury',
            'ufd': 'upfield',
            'wer': 'werribee',
            'wbe': 'werribee',
            'wil': 'williamstown',
            'wmn': 'williamstown',
            'rce': 'flemington racecourse',
            'ccl': 'city circle',
            // Bus routes (will be skipped anyway)
            'b31': null
        };
        
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
        
        // Convert to GeoJSON with proper route IDs
        let unmappedShapes = new Set();
        
        Object.keys(shapeGroups).forEach(shapeId => {
            const points = shapeGroups[shapeId].sort((a, b) => a.sequence - b.sequence);
            
            // Extract route code from shape ID (e.g., "2-ain-B-mjp-1.1.H" -> "ain" or "2-HBG-..." -> "hbg")
            const shapeParts = shapeId.split('-');
            const shapeCode = shapeParts.length > 1 ? shapeParts[1].toLowerCase() : 'unknown';
            
            // Map shape code to route name, then to route ID
            const routeName = shapeCodeToRouteName[shapeCode];
            
            // Skip null mappings (bus routes)
            if (routeName === null) {
                return;
            }
            
            const routeId = routeName ? routesByName[routeName] : 'unknown';
            
            if (!routeId || routeId === 'unknown') {
                unmappedShapes.add(shapeCode);
            }
            
            shapes.push({
                type: 'Feature',
                properties: {
                    shapeId: shapeId,
                    routeId: routeId || 'unknown'  // Map to actual route ID
                },
                geometry: {
                    type: 'LineString',
                    coordinates: points.map(p => [p.lon, p.lat])
                }
            });
        });
        
        if (unmappedShapes.size > 0) {
            console.log(`Warning: Unmapped shape codes: ${[...unmappedShapes].join(', ')}`);
        }
        
        console.log(`Processed ${shapes.length} shape lines`);
    } catch (error) {
        console.log('Error processing shapes:', error.message);
        console.log('No shapes data available - lines will not be rendered');
    }
    
    const geojson = {
        type: 'FeatureCollection',
        features: shapes
    };
    
    fs.writeFileSync(
        path.join(OUTPUT_PATH, 'shapes.json'),
        JSON.stringify(geojson, null, 2)
    );
    console.log(`Processed ${shapes.length} shapes`);
    return geojson;
}

// Process trips
function processTrips() {
    console.log('Processing trips...');
    const trips = readGTFSFile('trips.txt');
    
    const processedTrips = trips.map(trip => ({
        tripId: trip.trip_id,
        routeId: trip.route_id,
        serviceId: trip.service_id,
        shapeId: trip.shape_id,
        headsign: trip.trip_headsign,
        directionId: trip.direction_id
    }));
    
    fs.writeFileSync(
        path.join(OUTPUT_PATH, 'trips.json'),
        JSON.stringify(processedTrips, null, 2)
    );
    console.log(`Processed ${processedTrips.length} trips`);
    return processedTrips;
}

// Process station lines mapping
function processStationLines() {
    console.log('Processing station lines...');
    
    try {
        const stationLinesPath = path.resolve(__dirname, '../../metrominder/data/stationLines.json');
        const stationLines = JSON.parse(fs.readFileSync(stationLinesPath, 'utf-8'));
        
        fs.writeFileSync(
            path.join(OUTPUT_PATH, 'station-lines.json'),
            JSON.stringify(stationLines, null, 2)
        );
        console.log('Processed station lines mapping');
        return stationLines;
    } catch (error) {
        console.log('Note: stationLines.json not found, skipping');
        return {};
    }
}

// Main processing
function main() {
    console.log('Starting GTFS data processing...\n');
    
    // Create output directory if it doesn't exist
    if (!fs.existsSync(OUTPUT_PATH)) {
        fs.mkdirSync(OUTPUT_PATH, { recursive: true });
    }
    
    try {
        processStations();
        processRoutes();
        processShapes();
        processTrips();
        processStationLines();
        
        console.log('\n✅ GTFS data processing complete!');
    } catch (error) {
        console.error('❌ Error processing GTFS data:', error);
        process.exit(1);
    }
}

main();

