import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import {loadJSON} from './helpers/helpers';
import {Station, Train, Railway} from './data-classes';
import configs from './configs';

/**
 * Load static data for a specific transport type
 */
async function loadTransportData(type, typeName) {
    try {
        const [routesData, stopsData, shapesData, stopIdMap, routeStops] = await Promise.all([
            loadJSON(`../data/${type}/routes.json`),
            loadJSON(`../data/${type}/stops.json`),
            loadJSON(`../data/${type}/shapes.json`),
            loadJSON(`../data/${type}/stop-id-map.json`),
            loadJSON(`../data/${type}/route-stops.json`)
        ]);

        return {
            routes: routesData,
            stops: stopsData,
            shapes: shapesData,
            stopIdMap: stopIdMap,
            routeStops: routeStops,
            type: type,
            typeName: typeName
        };
    } catch (error) {
        return null;
    }
}

/**
 * Load static GTFS data (all transport types)
 */
export async function loadStaticData() {
    
    try {
        // Load metro data (existing)
        const [metroStations, metroRoutes, metroShapes, metroTrips, metroStationIdMap, stationLines] = await Promise.all([
            loadJSON('../data/stations.json'),
            loadJSON('../data/routes.json'),
            loadJSON('../data/shapes.json'),
            loadJSON('../data/trips.json'),
            loadJSON('../data/station-id-map.json'),
            loadJSON('../data/stationLines.json')
        ]);

        // Load additional transport types
        const [vlineData, tramData, busData] = await Promise.all([
            loadTransportData('vline', 'V/Line'),
            loadTransportData('tram', 'Trams'),
            loadTransportData('bus', 'Buses')
        ]);

        // Create Station objects (metro + all other stops)
        const stations = metroStations.map(s => new Station({ ...s, transportType: 'metro' }));
        
        // Add all other stops as stations with appropriate transport types
        if (vlineData) stations.push(...vlineData.stops.map(s => new Station({ ...s, transportType: 'vline' })));
        if (tramData) stations.push(...tramData.stops.map(s => new Station({ ...s, transportType: 'tram' })));
        if (busData) stations.push(...busData.stops.map(s => new Station({ ...s, transportType: 'bus' })));
        
        // Create Railway objects
        const railways = [];
        const allRoutes = [...metroRoutes];
        const routeMap = {};
        
        // Build comprehensive route map
        metroRoutes.forEach(r => {
            routeMap[r.id] = { ...r, transportType: 'metro' };
        });
        
        if (vlineData) {
            vlineData.routes.forEach(r => {
                routeMap[r.id] = { ...r, transportType: 'vline' };
                allRoutes.push({ ...r, transportType: 'vline' });
            });
        }
        
        if (tramData) {
            tramData.routes.forEach(r => {
                routeMap[r.id] = { ...r, transportType: 'tram' };
                allRoutes.push({ ...r, transportType: 'tram' });
            });
        }
        
        if (busData) {
            busData.routes.forEach(r => {
                routeMap[r.id] = { ...r, transportType: 'bus' };
                allRoutes.push({ ...r, transportType: 'bus' });
            });
        }
        
        // Process all shapes (metro + vline + tram + bus)
        // Group by shortName to avoid duplicate lines with same color
        const allShapes = [
            ...metroShapes.features,
            ...(vlineData ? vlineData.shapes.features : []),
            ...(tramData ? tramData.shapes.features : []),
            ...(busData ? busData.shapes.features : [])
        ];
        
        // Group shapes by line name (shortName) to merge variations
        const shapesByLineName = new Map();
        
        allShapes.forEach(feature => {
            const routeId = feature.properties.routeId;
            const routeInfo = routeMap[routeId];
            
            if (routeInfo) {
                const key = routeInfo.shortName || routeId;
                
                if (!shapesByLineName.has(key)) {
                    shapesByLineName.set(key, {
                        routeInfo: routeInfo,
                        geometries: []
                    });
                }
                
                shapesByLineName.get(key).geometries.push(feature.geometry);
            }
        });
        
        // Create one Railway per unique line (merge all shape variations)
        let matchedCount = 0;
        for (const [lineName, data] of shapesByLineName.entries()) {
            // Find the shape that covers the FULL GEOGRAPHIC EXTENT (not just most points)
            // Express routes often have more points but skip the city loop
            
            // First, calculate the full extent across all shapes
            const allCoords = data.geometries.flatMap(g => g.coordinates || []);
            const allLons = allCoords.map(c => c[0]);
            const allLats = allCoords.map(c => c[1]);
            const fullExtent = {
                minLon: Math.min(...allLons),
                maxLon: Math.max(...allLons),
                minLat: Math.min(...allLats),
                maxLat: Math.max(...allLats)
            };
            
            // Find the shape that best covers the full extent
            const bestGeometry = data.geometries.reduce((best, current) => {
                const coords = current.coordinates || [];
                if (coords.length === 0) return best;
                
                const lons = coords.map(c => c[0]);
                const lats = coords.map(c => c[1]);
                const extent = {
                    minLon: Math.min(...lons),
                    maxLon: Math.max(...lons),
                    minLat: Math.min(...lats),
                    maxLat: Math.max(...lats)
                };
                
                // Calculate coverage score (how much of full extent this shape covers)
                const lonCoverage = (extent.maxLon - extent.minLon) / (fullExtent.maxLon - fullExtent.minLon);
                const latCoverage = (extent.maxLat - extent.minLat) / (fullExtent.maxLat - fullExtent.minLat);
                const coverageScore = lonCoverage + latCoverage;
                
                // Calculate best shape coverage
                const bestCoords = best.coordinates || [];
                const bestLons = bestCoords.map(c => c[0]);
                const bestLats = bestCoords.map(c => c[1]);
                const bestExtent = {
                    minLon: Math.min(...bestLons),
                    maxLon: Math.max(...bestLons),
                    minLat: Math.min(...bestLats),
                    maxLat: Math.max(...bestLats)
                };
                const bestLonCoverage = (bestExtent.maxLon - bestExtent.minLon) / (fullExtent.maxLon - fullExtent.minLon);
                const bestLatCoverage = (bestExtent.maxLat - bestExtent.minLat) / (fullExtent.maxLat - fullExtent.minLat);
                const bestCoverageScore = bestLonCoverage + bestLatCoverage;
                
                // Prefer shape with better coverage; if equal, prefer more points
                if (Math.abs(coverageScore - bestCoverageScore) < 0.1) {
                    // Similar coverage, use point count as tiebreaker
                    return coords.length > bestCoords.length ? current : best;
                }
                
                return coverageScore > bestCoverageScore ? current : best;
            }, data.geometries[0]);
            
            railways.push(new Railway({
                ...data.routeInfo,
                geometry: bestGeometry, // Use shape with best geographic coverage
                shapeVariations: data.geometries.length // Track how many variations exist
            }));
            matchedCount++;
        }
        
        const uniqueLines = shapesByLineName.size;
        const totalShapes = allShapes.length;

        // Merge all stop ID maps
        const combinedStopIdMap = {
            ...metroStationIdMap,
            ...(vlineData ? vlineData.stopIdMap : {}),
            ...(tramData ? tramData.stopIdMap : {}),
            ...(busData ? busData.stopIdMap : {})
        };
        
        // Merge all route-stops mappings by transport type
        const allRouteStops = {
            metro: stationLines,  // Use existing metro stationLines
            vline: vlineData ? vlineData.routeStops : {},
            tram: tramData ? tramData.routeStops : {},
            bus: busData ? busData.routeStops : {}
        };

        return {
            stations,
            routes: allRoutes,
            railways,
            trips: metroTrips,
            shapes: { type: 'FeatureCollection', features: allShapes },
            stationIdMap: combinedStopIdMap,
            stationLines,  // Keep for backward compatibility
            allRouteStops  // New comprehensive mapping
        };
    } catch (error) {
        throw error;
    }
}

/**
 * Load real-time vehicle positions from API
 * @param {string} apiUrl - Base API URL
 * @param {string} vehicleType - Type of vehicle: 'metro', 'vline', 'bus', 'tram'
 * @param {string} color - Default color for this vehicle type (RGB array as string)
 */
async function loadVehiclePositions(apiUrl, endpoint, vehicleType, defaultColor) {
    try {
        const url = `${apiUrl}${endpoint}`;
        console.log('[DEBUG] Fetching:', url);
        const response = await fetch(url);
        if (!response.ok) {
            console.error('[DEBUG] Failed:', url, 'Status:', response.status);
            return [];
        }

        const data = await response.json();
        console.log('[DEBUG] Got data for', endpoint, '- entities:', data?.entity?.length || 0);
        
        // Parse GTFS-Realtime feed
        if (data.feed && data.feed.entity) {
            const vehicles = [];
            
            data.feed.entity.forEach(entity => {
                if (entity.vehicle && entity.vehicle.position) {
                    const vehicle = entity.vehicle;
                    const position = vehicle.position;
                    
                    vehicles.push(new Train({
                        tripId: vehicle.trip?.tripId || entity.id,
                        vehicleId: vehicle.vehicle?.id || entity.id,
                        routeId: vehicle.trip?.routeId,
                        lat: position.latitude,
                        lon: position.longitude,
                        bearing: position.bearing,
                        speed: position.speed,
                        timestamp: vehicle.timestamp,
                        occupancy: vehicle.occupancyStatus,
                        vehicleType: vehicleType,
                        defaultColor: defaultColor
                    }));
                }
            });

            return vehicles;
        }

        return [];
    } catch (error) {
        return [];
    }
}

/**
 * Load all vehicle positions (metro, V/Line, buses, trams)
 */
export async function loadTrainPositions(apiUrl = configs.apiUrl) {
    try {
        console.log('[DEBUG] Loading positions from API:', apiUrl);
        
        // Fetch all vehicle types in parallel
        const [metro, vline, buses, trams] = await Promise.all([
            loadVehiclePositions(apiUrl, '/positions', 'metro', [0, 100, 200]),      // Blue
            loadVehiclePositions(apiUrl, '/vline/positions', 'vline', [147, 51, 234]), // Purple
            loadVehiclePositions(apiUrl, '/bus/positions', 'bus', [255, 140, 0]),      // Orange
            loadVehiclePositions(apiUrl, '/tram/positions', 'tram', [0, 200, 100])     // Green
        ]);

        console.log('[DEBUG] Loaded:', {
            metro: metro.length,
            vline: vline.length,
            buses: buses.length,
            trams: trams.length
        });

        // Combine all vehicles
        const allVehicles = [...metro, ...vline, ...buses, ...trams];
        
        return allVehicles;
    } catch (error) {
        console.error('[DEBUG] Error loading positions:', error);
        return [];
    }
}

/**
 * Load trip updates for a specific vehicle type
 */
async function loadTripUpdatesByType(apiUrl, endpoint) {
    try {
        const response = await fetch(`${apiUrl}${endpoint}`);
        if (!response.ok) {
            return {};
        }

        const data = await response.json();
        
        // Parse GTFS-Realtime feed
        if (data.feed && data.feed.entity) {
            const updates = {};
            
            data.feed.entity.forEach(entity => {
                if (entity.tripUpdate && entity.tripUpdate.trip) {
                    const tripId = entity.tripUpdate.trip.tripId;
                    const stopTimeUpdates = entity.tripUpdate.stopTimeUpdate || [];
                    
                    if (stopTimeUpdates.length > 0) {
                        // Get the next stop (first stop in the list)
                        const nextStop = stopTimeUpdates[0];
                        updates[tripId] = {
                            stopId: nextStop.stopId,
                            arrival: nextStop.arrival?.time,
                            delay: nextStop.arrival?.delay
                        };
                    }
                }
            });

            return updates;
        }

        return {};
    } catch (error) {
        return {};
    }
}

/**
 * Load trip updates (next stops, arrival times) for all vehicle types
 */
export async function loadTripUpdates(apiUrl = configs.apiUrl) {
    try {
        // Fetch trip updates for all vehicle types in parallel
        const [metroUpdates, vlineUpdates, busUpdates, tramUpdates] = await Promise.all([
            loadTripUpdatesByType(apiUrl, '/trips'),
            loadTripUpdatesByType(apiUrl, '/vline/trips'),
            loadTripUpdatesByType(apiUrl, '/bus/trips'),
            loadTripUpdatesByType(apiUrl, '/tram/trips')
        ]);

        // Merge all updates into one object
        return {
            ...metroUpdates,
            ...vlineUpdates,
            ...busUpdates,
            ...tramUpdates
        };
    } catch (error) {
        return {};
    }
}

/**
 * Merge train positions with trip updates
 */
export function mergeTrainData(trains, tripUpdates, stations, stationIdMap) {
    return trains.map(train => {
        const update = tripUpdates[train.tripId];
        
        if (update) {
            // Try to find station name using multiple methods:
            // 1. Direct lookup in stationIdMap (handles numeric IDs from GTFS-R)
            // 2. Find in stations array by ID
            // 3. Fall back to stopId
            train.nextStop = stationIdMap[update.stopId] || 
                            stations.find(s => s.id === update.stopId)?.name || 
                            update.stopId;
            train.nextStopArrival = update.arrival;
        }
        
        return train;
    });
}

