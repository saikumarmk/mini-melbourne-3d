import mapboxgl from 'mapbox-gl';
import configs from './configs';
import animation from './animation';
import Profiler from './profiler';
import {loadStaticData, loadTrainPositions, loadTripUpdates, mergeTrainData} from './loader';
import {SearchControl} from './controls';
import {TrainPanel, StationPanel} from './panels';
import {hexToRgb, getLineFromTripId} from './helpers/helpers';
import {applyRailwayOffsets} from './helpers/line-offset';

/**
 * Main Map class for Melbourne 3D Train Map
 */
export default class MelbourneMap {
    constructor(options = {}) {
        // Merge options with defaults
        this.options = {
            container: options.container || 'map',
            accessToken: options.accessToken || configs.accessToken,
            center: options.center || configs.defaultCenter,
            zoom: options.zoom || configs.defaultZoom,
            pitch: options.pitch || configs.defaultPitch,
            bearing: options.bearing || configs.defaultBearing,
            style: options.style || configs.mapStyle,
            apiUrl: options.apiUrl || configs.apiUrl
        };

        if (!this.options.accessToken) {
            throw new Error('Mapbox access token is required');
        }

        // Set Mapbox access token
        mapboxgl.accessToken = this.options.accessToken;
        
        // Store container DOM element for panels
        this.container = typeof this.options.container === 'string' 
            ? document.getElementById(this.options.container)
            : this.options.container;

        // Data storage
        this.stations = [];
        this.routes = [];
        this.railways = [];
        this.trains = [];
        this.trips = [];
        
        // State
        this.isInitialized = false;
        this.updateIntervalId = null;
        this.activePanel = null;
        
        // Performance profiler
        this.profiler = new Profiler();
        
        // Track animation IDs for per-object frame rate control
        this.trainAnimations = new Map(); // Map<tripId, animationId>
        
        // Configurable zoom thresholds for LOD filtering
        this.busZoomThreshold = 13;
        this.tramZoomThreshold = 11;
        this.vlineZoomThreshold = 10;

        // Initialize
        this.init();
    }

    async init() {
        try {
            // Create Mapbox map
            this.map = new mapboxgl.Map({
                container: this.options.container,
                style: this.options.style,
                center: this.options.center,
                zoom: this.options.zoom,
                pitch: this.options.pitch,
                bearing: this.options.bearing,
                antialias: true
            });

            // Add navigation controls
            this.map.addControl(new mapboxgl.NavigationControl(), 'top-right');
            
            // Add fullscreen control
            this.map.addControl(new mapboxgl.FullscreenControl(), 'top-right');
            
            // Add search control (will be initialized after loading stations)
            this.searchControl = null;

            // Wait for map to load
            await new Promise(resolve => this.map.on('load', resolve));

            // Load static data
            const staticData = await loadStaticData();
            
            if (!staticData || !staticData.stations) {
                throw new Error('Failed to load static data - stations missing');
            }
            
            this.stations = staticData.stations;
            this.routes = staticData.routes; // Store routes for color lookup
            this.trips = staticData.trips;
            this.stationIdMap = staticData.stationIdMap; // Map numeric stop IDs to names
            this.stationLines = staticData.stationLines; // Map line names to station lists (metro only)
            this.allRouteStops = staticData.allRouteStops; // All transport types route-stops mappings
            
            // Apply offsets to railways that share tracks (Mini Tokyo 3D feature)
            if (configs.enableRailwayOffsets) {
                try {
                    this.railways = applyRailwayOffsets(staticData.railways);
                } catch (error) {
                    this.railways = staticData.railways;
                }
            } else {
                this.railways = staticData.railways;
            }
            
            // Visibility settings
            this.visibility = {
                stations: {
                    metro: true,
                    vline: false,
                    tram: false,
                    bus: false
                },
                routes: {
                    metro: true,
                    vline: true,
                    tram: true,
                    bus: true
                }
            };

            // Render static elements
            this.add3DBuildings();
            this.renderRailways();
            this.renderStations();
            
            // Add search control now that stations are loaded
            this.searchControl = new SearchControl(this.stations, this.map);
            this.map.addControl(this.searchControl, 'top-left');

            // Initialize train markers (fallback/2D view)
            this.trainMarkers = new Map();
            this.showTrainMarkers = false; // Hidden by default to see 3D boxes

            // We'll use Mapbox native 3D (fill-extrusion) for trains - simpler and more reliable
            this.threeLayer = null;
            
            // Performance optimization: differential update tracking
           this.updateCounters = {
               metro: 0,
               vline: 0,
               tram: 0,
               bus: 0
           };
           
           // Visible area for frustum culling (recalculated on camera change)
           this.visibleArea = null;
           this.updateVisibleArea();
            
            // Add empty GeoJSON source for 3D trains
            this.map.addSource('trains-3d', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: []
                }
            });
            
            // Add 3D extrusion layer for trains (flat like Mini Tokyo 3D)
            this.map.addLayer({
                id: 'trains-3d-layer',
                type: 'fill-extrusion',
                source: 'trains-3d',
                minzoom: 8, // Show at all reasonable zoom levels
                maxzoom: 22,
                paint: {
                    'fill-extrusion-color': ['get', 'color'],
                    // Slightly taller boxes for better visibility
                    'fill-extrusion-height': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        10, 25,  // At zoom 10: 25m tall (more visible)
                        14, 12,  // At zoom 14: 12m tall
                        18, 6    // At zoom 18: 6m tall (still flat when close)
                    ],
                    'fill-extrusion-base': 0,
                    'fill-extrusion-opacity': 0.95
                }
            });
            
            // Initialize animation system
            animation.init();
            
            // Start continuous render loop for smooth animation
            this.startRenderLoop();
            
            // Re-render trains on zoom to maintain proper size scaling
            this.map.on('zoom', () => {
                this.updateVisibleArea();
            });
            
            // Update visible area on pitch/bearing changes for frustum culling
            this.map.on('pitch', () => this.updateVisibleArea());
            this.map.on('move', () => this.updateVisibleArea());

            // Start real-time updates
            this.startRealTimeUpdates();

            this.isInitialized = true;

        } catch (error) {
            throw error;
        }
    }

    /**
     * Add 3D buildings to the map
     */
    add3DBuildings() {
        // Insert the layer beneath any symbol layer (like labels)
        const layers = this.map.getStyle().layers;
        const labelLayerId = layers.find(
            (layer) => layer.type === 'symbol' && layer.layout['text-field']
        )?.id;

        // Add 3D building extrusions (minzoom 15 to prevent lag)
        this.map.addLayer(
            {
                id: '3d-buildings',
                source: 'composite',
                'source-layer': 'building',
                filter: ['==', 'extrude', 'true'],
                type: 'fill-extrusion',
                minzoom: 15,  // Increased from 14 to reduce performance impact
                paint: {
                    'fill-extrusion-color': '#aaa',
                    'fill-extrusion-height': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        15, 0,
                        15.05, ['get', 'height']
                    ],
                    'fill-extrusion-base': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        15, 0,
                        15.05, ['get', 'min_height']
                    ],
                    'fill-extrusion-opacity': 0.6
                }
            },
            labelLayerId
        );
    }

    /**
     * Render railway lines on the map (with filtering)
     */
    renderRailways() {
        // Filter railways based on visibility settings
        const railwayFeatures = this.railways
            .filter(r => {
                if (!r.geometry) return false;
                const type = r.transportType || 'metro';
                return this.visibility.routes[type];
            })
            .map(r => r.toGeoJSON());

        this.map.addSource('railways', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: railwayFeatures
            }
        });

        // Add railway lines layer with proper coloring
        this.map.addLayer({
            id: 'railway-lines',
            type: 'line',
            source: 'railways',
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': ['get', 'color'],
                'line-width': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    8, 2,
                    12, 3,
                    16, 5
                ],
                'line-opacity': configs.lineOpacity
            }
        });
    }
    
    /**
     * Update railway layer based on visibility settings
     */
    updateRailwayVisibility() {
        const railwayFeatures = this.railways
            .filter(r => {
                if (!r.geometry) return false;
                const type = r.transportType || 'metro';
                return this.visibility.routes[type];
            })
            .map(r => r.toGeoJSON());
            
        this.map.getSource('railways').setData({
            type: 'FeatureCollection',
            features: railwayFeatures
        });
    }

    /**
     * Render station markers on the map (with filtering for performance)
     */
    renderStations() {
        // Filter stations based on visibility settings
        const stationFeatures = this.stations
            .filter(s => {
                const type = s.transportType || 'metro';
                return this.visibility.stations[type];
            })
            .map(s => s.toGeoJSON());

        this.map.addSource('stations', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: stationFeatures
            }
        });

        // Add station circles with zoom-based filtering for performance
        this.map.addLayer({
            id: 'station-circles',
            type: 'circle',
            source: 'stations',
            filter: [
                'any',
                ['==', ['get', 'transportType'], 'metro'],
                ['==', ['get', 'transportType'], 'vline'],
                ['all',
                    ['==', ['get', 'transportType'], 'tram'],
                    ['>=', ['zoom'], 12]  // Show tram stops only at zoom 12+
                ],
                ['all',
                    ['==', ['get', 'transportType'], 'bus'],
                    ['>=', ['zoom'], 14]  // Show bus stops only at zoom 14+
                ]
            ],
            paint: {
                'circle-radius': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    10, 2,
                    14, 4,
                    16, 6
                ],
                'circle-color': [
                    'match',
                    ['get', 'transportType'],
                    'metro', '#0064C8',
                    'vline', '#9333EA',
                    'tram', '#00C864',
                    'bus', '#FF8C00',
                    '#ffffff'
                ],
                'circle-stroke-width': 1,
                'circle-stroke-color': '#ffffff',
                'circle-opacity': 0.9
            }
        });

        // Add station labels with zoom-based filtering
        this.map.addLayer({
            id: 'station-labels',
            type: 'symbol',
            source: 'stations',
            filter: [
                'any',
                ['==', ['get', 'transportType'], 'metro'],
                ['==', ['get', 'transportType'], 'vline'],
                ['all',
                    ['==', ['get', 'transportType'], 'tram'],
                    ['>=', ['zoom'], 14]
                ],
                ['all',
                    ['==', ['get', 'transportType'], 'bus'],
                    ['>=', ['zoom'], 16]
                ]
            ],
            layout: {
                'text-field': ['get', 'name'],
                'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                'text-size': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    10, 8,
                    14, 10,
                    16, 12
                ],
                'text-offset': [0, 1.5],
                'text-anchor': 'top'
            },
            paint: {
                'text-color': '#ffffff',
                'text-halo-color': '#000000',
                'text-halo-width': 1
            },
            minzoom: 12
        });

        // Add click handler for stations
        this.map.on('click', 'station-circles', (e) => {
            const feature = e.features[0];
            this.showStationPopup(feature, e.lngLat);
        });
        
        // Add click handler for 3D trains
        this.map.on('click', 'trains-3d-layer', (e) => {
            const feature = e.features[0];
            const train = this.trains.find(t => t.tripId === feature.properties.tripId);
            if (train) {
                this.showTrainPopup(train);
            }
        });
        
        // Change cursor to pointer on hover
        this.map.on('mouseenter', 'trains-3d-layer', () => {
            this.map.getCanvas().style.cursor = 'pointer';
        });
        this.map.on('mouseleave', 'trains-3d-layer', () => {
            this.map.getCanvas().style.cursor = '';
        });

        // Change cursor on hover
        this.map.on('mouseenter', 'station-circles', () => {
            this.map.getCanvas().style.cursor = 'pointer';
        });

        this.map.on('mouseleave', 'station-circles', () => {
            this.map.getCanvas().style.cursor = '';
        });

        // Stations rendered
    }

    /**
     * Render train markers on the map (2D circles)
     */
    renderTrainMarkers() {
        // Remove all markers if disabled
        if (!this.showTrainMarkers) {
            for (const [tripId, marker] of this.trainMarkers) {
                marker.remove();
            }
            this.trainMarkers.clear();
            return;
        }
        
        // Remove old markers that no longer exist
        const activeTripIds = new Set(this.trains.map(t => t.tripId));
        for (const [tripId, marker] of this.trainMarkers) {
            if (!activeTripIds.has(tripId)) {
                marker.remove();
                this.trainMarkers.delete(tripId);
            }
        }

        // Add or update markers for each train
        this.trains.forEach(train => {
            let marker = this.trainMarkers.get(train.tripId);
            
            if (!marker) {
                // Create new marker with bright color
                const el = document.createElement('div');
                el.className = 'train-marker';
                el.style.backgroundColor = `rgb(${train.color.join(',')})`;
                el.style.width = '30px';
                el.style.height = '30px';
                el.style.borderRadius = '50%';
                el.style.border = '3px solid white';
                el.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
                el.style.cursor = 'pointer';
                el.title = `Train ${train.tripId}`;
                
                marker = new mapboxgl.Marker(el)
                    .setLngLat([train.lon, train.lat])
                    .addTo(this.map);
                
                // Add click handler
                el.addEventListener('click', () => {
                    this.showTrainPopup(train);
                });

                this.trainMarkers.set(train.tripId, marker);
            } else {
                // Update existing marker position
                marker.setLngLat([train.lon, train.lat]);
            }
        });
    }

    /**
     * Render trains as 3D extrusions (with viewport culling and LOD)
     */
    render3DTrains() {
        this.profiler.start('render3DTrains');
        
        // Get current zoom level for size scaling
        const zoom = this.map.getZoom();
        
        // Get viewport bounds for frustum culling (MAJOR PERFORMANCE BOOST)
        const bounds = this.map.getBounds();
        const west = bounds.getWest();
        const east = bounds.getEast();
        const north = bounds.getNorth();
        const south = bounds.getSouth();
        
        // More aggressive scaling for better visibility when zoomed out
        const minZoom = 9;
        const maxZoom = 18;
        const zoomFactor = Math.max(0, Math.min(1, (zoom - minZoom) / (maxZoom - minZoom)));
        
        // At zoom 9: 6x size, At zoom 13: 2x size, At zoom 18: 1x size
        const zoomScale = 6.0 - (zoomFactor * 5.0);
        
        const baseLength = 0.0004; // ~40m base
        const baseWidth = 0.00016; // ~16m base
        
        const length = baseLength * zoomScale;
        const width = baseWidth * zoomScale;
        
        // Count vehicles by type before filtering (for debugging)
        const vehicleCounts = {
            total: this.trains.length,
            metro: this.trains.filter(t => (t.vehicleType || 'metro') === 'metro').length,
            vline: this.trains.filter(t => t.vehicleType === 'vline').length,
            tram: this.trains.filter(t => t.vehicleType === 'tram').length,
            bus: this.trains.filter(t => t.vehicleType === 'bus').length
        };
        
        // Filter vehicles based on viewport and zoom level (LOD system)
        const processedTrains = this.trains
            .filter(train => {
                // Viewport culling - only render vehicles currently visible on screen
                if (train.lon < west || train.lon > east || train.lat < south || train.lat > north) {
                    return false;
                }
                
                // Configurable zoom-based LOD filtering by vehicle type
                const type = train.vehicleType || 'metro';
                if (type === 'bus' && zoom < this.busZoomThreshold) return false;
                if (type === 'tram' && zoom < this.tramZoomThreshold) return false;
                if (type === 'vline' && zoom < this.vlineZoomThreshold) return false;
                // Metro: always render (highest priority)
                
                return true;
            })
            .map(train => {
            const [lon, lat] = train.getCoordinates();
            
            // Calculate bearing from route geometry (nearest point + vector method)
            // This provides accurate alignment with actual track/route lines
            let bearing = this.calculateTrainBearingFromRoute(train);
            
            // Fallback to GTFS-R bearing if route-based calculation fails
            if (bearing === null || bearing === undefined) {
                bearing = train.bearing || 0;
            }
            
            // Apply configured offset to align with tracks (adjust in configs.js if needed)
            const adjustedBearing = bearing + configs.bearingOffset;
            
            // CRITICAL: Convert compass bearing to mathematical angle
            // Compass: 0° = North, 90° = East, 180° = South, 270° = West
            // Math: 0° = East, 90° = North, 180° = West, 270° = South
            // Conversion: mathAngle = 90° - compassBearing
            const mathAngle = 90 - adjustedBearing;
            
            // Convert to radians for trigonometry
            const bearingRad = (mathAngle * Math.PI) / 180;
            const cos = Math.cos(bearingRad);
            const sin = Math.sin(bearingRad);
            
            return { lon, lat, adjustedBearing, cos, sin, train };
        });
        
        // Now create geometry from the calculated data
        const features = processedTrains.map(data => {
            const { lon, lat, adjustedBearing, cos, sin, train } = data;
            
            // Create rectangle corners in local coordinates
            // Length is the long dimension (direction of travel)
            // Width is the short dimension (perpendicular to travel)
            const halfLength = length / 2;
            const halfWidth = width / 2;
            
            // Define corners: front-left, front-right, back-right, back-left
            const corners = [
                [-halfLength, -halfWidth],  // Front-left
                [halfLength, -halfWidth],   // Front-right
                [halfLength, halfWidth],    // Back-right
                [-halfLength, halfWidth],   // Back-left
                [-halfLength, -halfWidth]   // Close the polygon
            ].map(([x, y]) => {
                // Apply 2D rotation matrix to align with bearing
                const rotX = x * cos - y * sin;
                const rotY = x * sin + y * cos;
                return [lon + rotX, lat + rotY];
            });
            
            return {
                type: 'Feature',
                properties: {
                    tripId: train.tripId,
                    color: `rgb(${train.color.join(',')})`,
                    line: train.line || 'Unknown',
                    bearing: train.bearing || 0,  // Store original for debugging
                    adjustedBearing: adjustedBearing  // Store adjusted value
                },
                geometry: {
                    type: 'Polygon',
                    coordinates: [corners]
                }
            };
        });
        
        // Update the GeoJSON source
        this.map.getSource('trains-3d').setData({
            type: 'FeatureCollection',
            features
        });
        
        // Track rendered count for performance monitoring
        this.lastRenderedCount = features.length;
        
        // (Rendering diagnostics removed)
        
        this.profiler.end('render3DTrains');
    }

    /**
     * Show train information panel (with full route info for all transport types)
     */
    showTrainPopup(train) {
        // Close existing panel if any
        if (this.activePanel && this.activePanel.isOpen()) {
            this.activePanel.remove();
        }
        
        // Get full route from appropriate route-stops mapping based on vehicle type
        let stops = [];
        const vehicleType = train.vehicleType || 'metro';
        
        // Get route stops from the appropriate mapping
        let routeStops = null;
        if (train.line && this.allRouteStops && this.allRouteStops[vehicleType]) {
            routeStops = this.allRouteStops[vehicleType][train.line];
        }
        
        if (routeStops && Array.isArray(routeStops)) {
            // Map station names to objects with arrival times
            stops = routeStops.map(stationName => ({
                name: stationName,
                arrival: null  // Would need trip schedule data for full times
            }));
            
            // Mark the next stop if we know it
            if (train.nextStop) {
                const nextStopIndex = stops.findIndex(s => s.name === train.nextStop);
                if (nextStopIndex >= 0) {
                    stops[nextStopIndex].arrival = train.nextStopArrival;
                    stops[nextStopIndex].isNext = true;
                }
            }
        } else if (train.nextStop) {
            // Fallback: show only next stop
            stops = [{
                name: train.nextStop,
                arrival: train.nextStopArrival,
                isNext: true
            }];
        }
        
        // Create and show panel
        this.activePanel = new TrainPanel({
            train,
            stations: stops,
            mapContainer: this.container
        });
        this.activePanel.addTo(this);
    }

    /**
     * Show interactive panel for station
     */
    showStationPopup(feature, lngLat) {
        const props = feature.properties;
        const stationName = props.name;
        
        // Close any existing panel
        if (this.activePanel) {
            this.activePanel.remove();
            this.activePanel = null;
        }
        
        // Find station object
        const station = this.stations.find(s => s.id === props.id || s.name === stationName);
        if (!station) {
            return;
        }
        
        // Determine station transport type
        const stationType = station.transportType || 'metro';
        
        // Find which lines serve this station based on transport type
        const servingLines = [];
        
        if (stationType === 'metro' && this.stationLines) {
            // Use metro stationLines for backwards compatibility
            for (const [lineName, stations] of Object.entries(this.stationLines)) {
                if (stations.includes(stationName)) {
                    const route = this.routes.find(r => r.shortName === lineName);
                    if (route) {
                        servingLines.push({
                            name: lineName,
                            color: route.color
                        });
                    }
                }
            }
        } else if (this.allRouteStops && this.allRouteStops[stationType]) {
            // Use allRouteStops for other transport types
            const typeRouteStops = this.allRouteStops[stationType];
            for (const [routeId, stops] of Object.entries(typeRouteStops)) {
                if (stops.some(stop => stop.name === stationName)) {
                    const route = this.routes.find(r => r.id === routeId);
                    if (route) {
                        servingLines.push({
                            name: route.shortName || route.longName,
                            color: route.color
                        });
                    }
                }
            }
        }
        
        // Find vehicles heading to this station (filter by matching transport type)
        const normalizeStationName = (name) => {
            if (!name) return '';
            // Handle "Stop ID: 12345" format
            if (name.startsWith('Stop ID:')) {
                return ''; // Can't match numeric IDs
            }
            return name
                .replace(/ Railway Station$/i, '') // Remove longer suffix FIRST
                .replace(/ Station$/i, '')         // Then shorter suffix
                .toLowerCase()
                .trim();
        };
        const normalizedStationName = normalizeStationName(stationName);
        
        const approachingTrains = this.trains.filter(train => {
            // Filter by matching transport type
            const vehicleType = train.vehicleType || 'metro';
            if (vehicleType !== stationType) return false;
            
            if (!train.nextStop) return false;
            const normalizedNextStop = normalizeStationName(train.nextStop);
            return normalizedNextStop === normalizedStationName;
        });
        
        // Create and show panel
        this.activePanel = new StationPanel({
            station: station,
            servingLines: servingLines,
            approachingTrains: approachingTrains,
            mapContainer: this.container
        });
        this.activePanel.addTo(this);
    }
    
    /**
     * Format ETA timestamp
     */
    formatETA(timestamp) {
        if (!timestamp) return 'Unknown';
        const now = Date.now() / 1000;
        const diff = timestamp - now;
        
        if (diff < 60) return 'Arriving';
        if (diff < 3600) return `${Math.round(diff / 60)} min`;
        
        const date = new Date(timestamp * 1000);
        return date.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
    }

    /**
     * Start continuous render loop (60 FPS target)
     * Single render loop instead of per-animation renders
     */
    startRenderLoop() {
        let lastFrameTime = performance.now();
        
        const renderFrame = (currentTime) => {
            this.renderLoopId = requestAnimationFrame(renderFrame);
            
            // Calculate time since last frame
            const deltaTime = currentTime - lastFrameTime;
            
            // Target 60 FPS (16.67ms per frame)
            // Only render if enough time has passed
            if (deltaTime >= 16) {
                lastFrameTime = currentTime - (deltaTime % 16);
                
                // Render trains and markers
                if (this.trains && this.trains.length > 0) {
                    this.render3DTrains();
                    if (this.showTrainMarkers) {
                        this.renderTrainMarkers();
                    }
                }
            }
        };
        
        this.renderLoopId = requestAnimationFrame(renderFrame);
    }
    
    /**
     * Stop render loop
     */
    stopRenderLoop() {
        if (this.renderLoopId) {
            cancelAnimationFrame(this.renderLoopId);
            this.renderLoopId = null;
        }
    }
    
    /**
     * Start real-time train updates
     */
    startRealTimeUpdates() {
        // Initial update
        this.updateTrains();

        // Set up periodic updates
        this.updateIntervalId = setInterval(() => {
            this.updateTrains();
        }, configs.trainRefreshInterval);
    }

    /**
     * Stop real-time updates
     */
    stopRealTimeUpdates() {
        if (this.updateIntervalId) {
            clearInterval(this.updateIntervalId);
            this.updateIntervalId = null;
        }
    }

    /**
     * Update train positions (with differential update frequency)
     */
    async updateTrains() {
        this.profiler.start('updateTrains');
        
        try {
            // Increment update counters
            this.updateCounters.metro++;
            this.updateCounters.vline++;
            this.updateCounters.tram++;
            this.updateCounters.bus++;
            
            // Fetch real-time data
            const [trainPositions, tripUpdates] = await Promise.all([
                loadTrainPositions(this.options.apiUrl),
                loadTripUpdates(this.options.apiUrl)
            ]);

            // Merge data
            const updatedTrains = mergeTrainData(trainPositions, tripUpdates, this.stations, this.stationIdMap);

            // Add line and color information from routes data
            updatedTrains.forEach(train => {
                // Use routeId from GTFS-R data to match routes
                const route = this.routes.find(r => r.id === train.routeId);
                
                if (route) {
                    train.line = route.shortName;
                    train.color = hexToRgb(route.color);
                } else {
                    // Fallback: use default color based on vehicle type
                    train.line = train.vehicleType || 'Unknown';
                    train.color = train.defaultColor || [128, 128, 128]; // Use type-specific color
                }
            });

            // PERFORMANCE OPTIMIZATION: Differential update frequency
            // Only update certain vehicle types on certain cycles
            const shouldUpdateVehicle = (type) => {
                if (type === 'metro') return true;  // Always update trains (highest priority)
                if (type === 'vline') return true;  // Always update V/Line
                if (type === 'tram') return this.updateCounters.tram % 2 === 0;  // Update trams every 2nd cycle
                if (type === 'bus') return this.updateCounters.bus % 3 === 0;    // Update buses every 3rd cycle
                return true;
            };

            // Update or create trains with animation (filtered by update frequency)
            updatedTrains
                .filter(newTrain => shouldUpdateVehicle(newTrain.vehicleType))
                .forEach(newTrain => {
                const existingTrain = this.trains.find(t => t.tripId === newTrain.tripId);
                
                if (existingTrain) {
                    // Stop old animation if exists
                    if (this.trainAnimations.has(existingTrain.tripId)) {
                        animation.stop(this.trainAnimations.get(existingTrain.tripId));
                    }
                    
                    // Update existing train position with animation
                    existingTrain.updatePosition({
                        lat: newTrain.lat,
                        lon: newTrain.lon,
                        bearing: newTrain.bearing,
                        speed: newTrain.speed,
                        timestamp: newTrain.timestamp,
                        nextStop: newTrain.nextStop,
                        nextStopArrival: newTrain.nextStopArrival,
                        occupancy: newTrain.occupancy
                    });

                    // Start new animation and track it
                    const animId = animation.start({
                        duration: configs.trainAnimationDuration,
                        callback: (elapsed, duration) => {
                            const progress = elapsed / duration;
                            existingTrain.animate(progress);
                        },
                        complete: () => {
                            this.trainAnimations.delete(existingTrain.tripId);
                        }
                    });
                    
                    this.trainAnimations.set(existingTrain.tripId, animId);
                } else {
                    // Add new train
                    this.trains.push(newTrain);
                }
            });

            // Remove trains that are no longer in the feed
            const activeTripIds = new Set(updatedTrains.map(t => t.tripId));
            this.trains = this.trains.filter(t => activeTripIds.has(t.tripId));

            // Render loop handles visualization continuously - no need to call here
            
            this.profiler.end('updateTrains');

        } catch (error) {
            this.profiler.end('updateTrains');
        }
    }

    /**
     * Fly to a specific station
     */
    flyToStation(stationId) {
        const station = this.stations.find(s => s.id === stationId);
        
        if (station) {
            this.map.flyTo({
                center: station.getCoordinates(),
                zoom: 15,
                duration: 2000
            });
        }
    }

    /**
     * Toggle 2D train markers on/off
     */
    toggleTrainMarkers() {
        this.showTrainMarkers = !this.showTrainMarkers;
        this.renderTrainMarkers();
        return this.showTrainMarkers;
    }
    
    /**
     * Calculate train bearing from route geometry
     * Now optimized with proper caching for single render loop
     */
    calculateTrainBearingFromRoute(train) {
        try {
            // Cache bearing for performance (update every 10 frames = ~6 times/sec)
            if (!train._bearingCache) {
                train._bearingCache = { bearing: null, frameCount: 0, lastPosition: null };
            }
            
            train._bearingCache.frameCount++;
            
            // Use cached value if:
            // 1. We have a cached bearing
            // 2. Haven't exceeded frame count threshold (10 frames)
            // 3. Train position hasn't changed significantly
            const [currentLon, currentLat] = train.getCoordinates();
            const positionChanged = train._bearingCache.lastPosition && (
                Math.abs(currentLon - train._bearingCache.lastPosition[0]) > 0.0001 ||
                Math.abs(currentLat - train._bearingCache.lastPosition[1]) > 0.0001
            );
            
            if (train._bearingCache.bearing !== null && 
                train._bearingCache.frameCount < 10 && 
                !positionChanged) {
                return train._bearingCache.bearing;
            }
            
            train._bearingCache.frameCount = 0;
            train._bearingCache.lastPosition = [currentLon, currentLat];
            
            const [trainLon, trainLat] = train.getCoordinates();
            
            // Find railways that match this train's route
            const matchingRailways = this.railways.filter(r => {
                return r.id === train.routeId || r.shortName === train.line;
            });
            
            if (matchingRailways.length === 0) {
                return null; // No matching route found
            }
            
            let closestSegment = null;
            let minDistance = Infinity;
            
            // Check each matching railway
            for (const railway of matchingRailways) {
                if (!railway.geometry || !railway.geometry.coordinates) continue;
                
                const coords = railway.geometry.coordinates;
                
                // Check each line segment
                for (let i = 0; i < coords.length - 1; i++) {
                    const [x1, y1] = coords[i];
                    const [x2, y2] = coords[i + 1];
                    
                    // Quick distance check using simple formula (faster than Turf.js)
                    const dx = trainLon - x1;
                    const dy = trainLat - y1;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestSegment = { x1, y1, x2, y2 };
                    }
                }
            }
            
            if (!closestSegment) {
                return null;
            }
            
            // Calculate bearing from the closest segment
            const { x1, y1, x2, y2 } = closestSegment;
            const dx = x2 - x1;
            const dy = y2 - y1;
            
            // Calculate angle in degrees (0 = East, 90 = North)
            let bearing = Math.atan2(dy, dx) * (180 / Math.PI);
            
            // Convert to compass bearing (0 = North, 90 = East)
            bearing = 90 - bearing;
            
            // Normalize to 0-360
            if (bearing < 0) bearing += 360;
            if (bearing >= 360) bearing -= 360;
            
            // Cache the result
            train._bearingCache.bearing = bearing;
            
            return bearing;
            
        } catch (error) {
            return null;
        }
    }
    
    /**
     * Update station visibility based on settings
     */
    updateStationVisibility() {
        const stationFeatures = this.stations
            .filter(s => {
                const type = s.transportType || 'metro';
                return this.visibility.stations[type];
            })
            .map(s => s.toGeoJSON());
            
        this.map.getSource('stations').setData({
            type: 'FeatureCollection',
            features: stationFeatures
        });
    }
    
    /**
     * Toggle station visibility for a specific transport type
     */
    toggleStations(transportType) {
        this.visibility.stations[transportType] = !this.visibility.stations[transportType];
        this.updateStationVisibility();
        return this.visibility.stations[transportType];
    }
    
    /**
     * Set station visibility for a specific transport type to a specific value
     */
    setStationVisibility(transportType, visible) {
        this.visibility.stations[transportType] = visible;
        this.updateStationVisibility();
    }
    
    /**
     * Toggle route visibility for a specific transport type
     */
    toggleRoutes(transportType) {
        this.visibility.routes[transportType] = !this.visibility.routes[transportType];
        this.updateRailwayVisibility();
        return this.visibility.routes[transportType];
    }
    
    /**
     * Set route visibility for a specific transport type to a specific value
     */
    setRouteVisibility(transportType, visible) {
        this.visibility.routes[transportType] = visible;
        this.updateRailwayVisibility();
    }
    
    /**
     * Update visible area trapezoid for frustum culling
     * Inspired by Mini Tokyo 3D's visible area optimization
     */
    updateVisibleArea() {
        const map = this.map;
        const canvas = map.getCanvas();
        const width = canvas.width;
        const height = canvas.height;
        const pitch = map.getPitch();
        
        // Calculate trapezoid based on pitch
        // At 0 pitch: rectangle [0,0] to [width,height]
        // At high pitch: trapezoid narrower at top (horizon)
        const horizonFactor = Math.max(0, 1 - pitch / 85); // At 85° pitch, horizon is very narrow
        const topWidth = width * horizonFactor;
        const topOffset = (width - topWidth) / 2;
        
        // Add padding to avoid popping at edges
        const padding = width * 0.1;
        
        this.visibleArea = [
            [-padding, -padding],                          // Top-left
            [width + padding, -padding],                   // Top-right
            [width + padding, height + padding],           // Bottom-right
            [-padding, height + padding]                   // Bottom-left
        ];
    }
    
    /**
     * Check if a point is inside the visible trapezoid
     * @param {Array} point - [x, y] screen coordinates
     * @returns {boolean}
     */
    pointInVisibleArea(point) {
        if (!this.visibleArea) return true;
        
        const [x, y] = point;
        const trap = this.visibleArea;
        
        // Simple bounding box check (fast)
        const minX = Math.min(...trap.map(p => p[0]));
        const maxX = Math.max(...trap.map(p => p[0]));
        const minY = Math.min(...trap.map(p => p[1]));
        const maxY = Math.max(...trap.map(p => p[1]));
        
        return x >= minX && x <= maxX && y >= minY && y <= maxY;
    }
    
    /**
     * Get Mapbox map instance
     */
    getMap() {
        return this.map;
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.stopRealTimeUpdates();
        this.stopRenderLoop();
        
        // Stop all train animations
        for (const animId of this.trainAnimations.values()) {
            animation.stop(animId);
        }
        this.trainAnimations.clear();
        
        if (this.map) {
            this.map.remove();
        }
    }
}

