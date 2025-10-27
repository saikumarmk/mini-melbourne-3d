/**
 * Helper utility functions
 */

/**
 * Returns the value if defined, otherwise returns the default value
 */
export function valueOrDefault(value, defaultValue) {
    return value !== undefined ? value : defaultValue;
}

/**
 * Load JSON from URL with cache busting
 */
export async function loadJSON(url) {
    // Add timestamp to prevent browser caching stale data
    const cacheBuster = `?v=${Date.now()}`;
    const response = await fetch(url + cacheBuster);
    if (!response.ok) {
        throw new Error(`Failed to load ${url}: ${response.statusText}`);
    }
    return response.json();
}

/**
 * Calculate distance between two coordinates in meters
 */
export function calculateDistance(coord1, coord2) {
    const [lon1, lat1] = coord1;
    const [lon2, lat2] = coord2;
    
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
}

/**
 * Linear interpolation
 */
export function lerp(start, end, t) {
    return start + (end - start) * t;
}

/**
 * Interpolate between two coordinates
 */
export function lerpCoordinates(coord1, coord2, t) {
    return [
        lerp(coord1[0], coord2[0], t),
        lerp(coord1[1], coord2[1], t)
    ];
}

/**
 * Convert hex color to RGB array
 */
export function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
    ] : [0, 0, 0];
}

/**
 * Debounce function
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Get line name from trip ID
 * Extracts the line name from GTFS trip ID
 */
export function getLineFromTripId(tripId) {
    // Melbourne Metro trip IDs often contain the line name
    // This is a simplified extraction - adjust based on actual trip ID format
    const patterns = [
        'Alamein', 'Belgrave', 'Craigieburn', 'Cranbourne', 'Frankston',
        'Glen Waverley', 'Hurstbridge', 'Lilydale', 'Mernda', 'Pakenham',
        'Sandringham', 'Stony Point', 'Sunbury', 'Upfield', 'Werribee', 'Williamstown'
    ];
    
    for (const pattern of patterns) {
        if (tripId.includes(pattern)) {
            return pattern;
        }
    }
    
    return 'Unknown';
}

