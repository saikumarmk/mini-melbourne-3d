/**
 * Melbourne 3D Train Map Configuration
 */

export default {
    // Map center (Melbourne CBD)
    defaultCenter: [144.9631, -37.8136],
    
    // Default zoom level
    defaultZoom: 12,
    
    // Default bearing (rotation)
    defaultBearing: 0,
    
    // Default pitch (tilt)
    defaultPitch: 50,
    
    // API endpoints
    // Use relative URLs in production (Netlify), localhost in development
    // Runtime detection: if we're on localhost, use port 3000, otherwise use /api
    get apiUrl() {
        if (typeof window !== 'undefined') {
            return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
                ? 'http://localhost:3000'
                : '/api';
        }
        return '/api';
    },
    
    // Update intervals (milliseconds)
    trainRefreshInterval: 5000, // Update train positions every 5 seconds
    
    // Animation settings
    trainAnimationDuration: 5000, // Smooth animation over 5 seconds
    
    // Visual settings
    trainModelScale: 40,
    trainModelHeight: 5, // meters
    stationMarkerSize: 8,
    
    // Train rotation alignment
    // Using GTFS Realtime bearing directly (route-based calculation disabled due to shape deduplication)
    // GTFS-R bearing: 0° = North, 90° = East, 180° = South, 270° = West
    // Adjust this offset if trains appear misaligned with tracks
    // Try: 0, 45, 90, -45, -90 (refresh page after changing)
    bearingOffset: 0, // Degrees to add to GTFS bearing (0 = use as-is)
    
    // Railway line separation (Mini Tokyo 3D feature)
    // Offset lines that share the same track to display them side by side
    enableRailwayOffsets: false, // DISABLED: Complex geometry causes artifacts with Turf.js offset
    railwayOffsetDistance: 5, // Base offset distance in meters between parallel tracks
    railwayOffsetTypes: ['metro', 'tram'], // Only apply offsets to these transport types (excludes buses/V-Line)
    
    // Railway line rendering
    lineOpacity: 0.75, // Transparency for overlapping lines (0.0 = invisible, 1.0 = solid)
    
    // Railway line colors (Melbourne Metro lines)
    lineColors: {
        'Alamein': '#152c6b',
        'Belgrave': '#152c6b',
        'Craigieburn': '#ffdd00',
        'Cranbourne': '#00bfe3',
        'Frankston': '#028430',
        'Glen Waverley': '#152c6b',
        'Hurstbridge': '#d11f2c',
        'Lilydale': '#152c6b',
        'Mernda': '#d11f2c',
        'Pakenham': '#00bfe3',
        'Sandringham': '#f37021',
        'Stony Point': '#028430',
        'Sunbury': '#ffdd00',
        'Upfield': '#ffdd00',
        'Werribee': '#028430',
        'Williamstown': '#028430'
    },
    
    // Map style
    mapStyle: 'mapbox://styles/mapbox/dark-v11',
    
    // Mapbox access token (will be set at initialization)
    accessToken: null
};

