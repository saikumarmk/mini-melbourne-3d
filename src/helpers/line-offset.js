/**
 * Create a parallel offset line
 * Simplified version of Mini Tokyo 3D's lineOffset
 * Based on Turf.js lineOffset but optimized for our use case
 */

import lineOffset from '@turf/line-offset';
import {lineString} from '@turf/helpers';
import configs from '../configs';

/**
 * Clean geometry by removing duplicate consecutive points
 * @param {Array} coords - Array of [lon, lat] coordinates
 * @returns {Array} Cleaned coordinates
 */
function cleanGeometry(coords) {
    if (!coords || coords.length < 2) return coords;
    
    const cleaned = [coords[0]];
    const epsilon = 0.000001; // ~0.1 meter tolerance
    
    for (let i = 1; i < coords.length; i++) {
        const prev = coords[i - 1];
        const curr = coords[i];
        
        // Skip duplicate points
        const dx = Math.abs(curr[0] - prev[0]);
        const dy = Math.abs(curr[1] - prev[1]);
        
        if (dx > epsilon || dy > epsilon) {
            cleaned.push(curr);
        }
    }
    
    return cleaned.length >= 2 ? cleaned : coords;
}

/**
 * Validate coordinates are within valid geographic bounds
 * @param {Array} coords - Array of [lon, lat] coordinates
 * @returns {boolean} True if all coordinates are valid
 */
function isValidCoordinates(coords) {
    if (!coords || !Array.isArray(coords)) return false;
    
    for (const coord of coords) {
        if (!coord || coord.length < 2) return false;
        
        const [lon, lat] = coord;
        
        // Check for NaN or Infinity
        if (!isFinite(lon) || !isFinite(lat)) {
            return false;
        }
        
        // Check for valid geographic bounds
        // Melbourne is around [144.9, -37.8], so anything drastically different is wrong
        if (lon < 100 || lon > 180 || lat < -45 || lat > -30) {
            return false;
        }
    }
    
    return true;
}

/**
 * Offset a line by a perpendicular distance
 * @param {Object} line - GeoJSON LineString feature
 * @param {number} distance - Distance in meters (positive = right, negative = left)
 * @returns {Object} Offset LineString feature
 */
export function offsetLine(line, distance) {
    if (!line || !line.geometry || !line.geometry.coordinates || distance === 0) {
        return line;
    }
    
    // Clean geometry first (remove duplicate points)
    const cleanedCoords = cleanGeometry(line.geometry.coordinates);
    
    // Validate input coordinates
    if (!isValidCoordinates(cleanedCoords)) {
        return line;
    }
    
    // Need at least 2 points
    if (cleanedCoords.length < 2) {
        return line;
    }
    
    try {
        // Create cleaned line for offset
        const cleanedLine = {
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: cleanedCoords
            }
        };
        
        // Use Turf's lineOffset with proper options
        // Distance is in meters, convert to kilometers for Turf
        const offsetResult = lineOffset(cleanedLine, distance / 1000, { units: 'kilometers' });
        
        // Validate the offset result
        if (!offsetResult || !offsetResult.geometry || !offsetResult.geometry.coordinates) {
            return line;
        }
        
        // Check for degenerate geometry (too few points)
        if (offsetResult.geometry.coordinates.length < 2) {
            return line;
        }
        
        // CRITICAL: Validate output coordinates to prevent globe-wrapping lines
        if (!isValidCoordinates(offsetResult.geometry.coordinates)) {
            return line;
        }
        
        return offsetResult;
    } catch (error) {
        return line; // Return original if offset fails
    }
}

/**
 * Calculate offset distance based on line index
 * For multiple lines on same track: offset them by increasing distances
 * @param {number} lineIndex - Index of the line (0 = center, 1 = first offset, etc.)
 * @param {number} totalLines - Total number of lines sharing this track
 * @param {number} baseOffset - Base offset distance in meters (default: 8m)
 * @returns {number} Offset distance in meters
 */
export function calculateLineOffset(lineIndex, totalLines, baseOffset = 8) {
    // For single line, no offset
    if (totalLines === 1) return 0;
    
    // For even number of lines: [..., -8, 8, ...]
    // For odd number of lines: [..., -8, 0, 8, ...]
    const center = (totalLines - 1) / 2;
    return (lineIndex - center) * baseOffset;
}

/**
 * Find which railway lines share track segments
 * Returns a map of segment IDs to array of railway IDs
 * @param {Array} railways - Array of Railway objects
 * @returns {Map} Map of segment signatures to railway IDs
 */
export function findSharedTrackSegments(railways) {
    const segmentMap = new Map();
    
    railways.forEach((railway, index) => {
        if (!railway.geometry || !railway.geometry.coordinates) return;
        
        const coords = railway.geometry.coordinates;
        
        // Check each segment of this railway
        for (let i = 0; i < coords.length - 1; i++) {
            const [lon1, lat1] = coords[i];
            const [lon2, lat2] = coords[i + 1];
            
            // Create a signature for this segment (rounded to avoid floating point issues)
            const signature = `${lon1.toFixed(5)},${lat1.toFixed(5)}_${lon2.toFixed(5)},${lat2.toFixed(5)}`;
            
            if (!segmentMap.has(signature)) {
                segmentMap.set(signature, []);
            }
            
            segmentMap.get(signature).push({
                railwayId: railway.id,
                railwayIndex: index,
                segmentIndex: i
            });
        }
    });
    
    // Filter to only segments with multiple lines
    const sharedSegments = new Map();
    for (const [signature, railways] of segmentMap.entries()) {
        if (railways.length > 1) {
            sharedSegments.set(signature, railways);
        }
    }
    
    return sharedSegments;
}

/**
 * Apply offsets to railways that share track segments
 * @param {Array} railways - Array of Railway objects
 * @returns {Array} Railways with offset geometry applied
 */
export function applyRailwayOffsets(railways) {
    // Validate input
    if (!railways || !Array.isArray(railways) || railways.length === 0) {
        return railways || [];
    }
    
    // Filter railways based on config (default: metro and tram only)
    const allowedTypes = configs.railwayOffsetTypes || ['metro', 'tram'];
    const validRailways = railways.filter(r => {
        if (!r || !r.geometry || !r.geometry.coordinates || r.geometry.coordinates.length < 2) {
            return false;
        }
        
        // Only apply offsets to configured transport types
        const transportType = r.transportType || 'metro';
        if (!allowedTypes.includes(transportType)) {
            return false; // Skip non-configured types
        }
        
        return true;
    });
    
    if (validRailways.length === 0) {
        return railways;
    }
    
    // Find shared segments
    const sharedSegments = findSharedTrackSegments(validRailways);
    
    if (sharedSegments.size === 0) {
        return railways;
    }
    
    // Calculate offset for each railway
    const railwayOffsets = new Map();
    
    // For each shared segment, assign offsets
    for (const [signature, railwayList] of sharedSegments.entries()) {
        const totalLines = railwayList.length;
        
        railwayList.forEach((railway, index) => {
            const offset = calculateLineOffset(index, totalLines, configs.railwayOffsetDistance);
            
            if (!railwayOffsets.has(railway.railwayId)) {
                railwayOffsets.set(railway.railwayId, {
                    offset: offset,
                    sharedSegments: 1
                });
            } else {
                // Average offset if railway appears in multiple shared segments
                const existing = railwayOffsets.get(railway.railwayId);
                existing.offset = (existing.offset * existing.sharedSegments + offset) / (existing.sharedSegments + 1);
                existing.sharedSegments++;
            }
        });
    }
    
    // Apply offsets to railways and track statistics
    const offsetStats = {
        total: railways.length,
        processed: 0,
        offsetApplied: 0,
        skipped: 0,
        failed: 0,
        byLine: {}
    };
    
    const result = railways.map(railway => {
        const offsetInfo = railwayOffsets.get(railway.id);
        
        // Track which lines were processed
        const lineName = railway.shortName || railway.id;
        const transportType = railway.transportType || 'metro';
        
        if (!allowedTypes.includes(transportType)) {
            offsetStats.skipped++;
            return railway; // Don't process non-allowed types
        }
        
        offsetStats.processed++;
        
        if (!offsetInfo || Math.abs(offsetInfo.offset) < 0.1) {
            // No offset needed
            offsetStats.byLine[lineName] = {
                offset: 0,
                sharedSegments: 0,
                transportType: transportType,
                status: 'no offset needed'
            };
            return railway;
        }
        
        try {
            // Create offset line
            const originalGeometry = railway.geometry;
            const offsetGeometry = offsetLine(
                {
                    type: 'Feature',
                    geometry: railway.geometry
                },
                offsetInfo.offset
            );
            
            // Check if offset actually succeeded (compare reference)
            const offsetSucceeded = offsetGeometry.geometry !== originalGeometry;
            
            if (offsetSucceeded) {
                // Update geometry in-place to preserve Railway class instance
                railway.originalGeometry = railway.geometry; // Keep original for reference
                railway.geometry = offsetGeometry.geometry;
                railway.offset = offsetInfo.offset;
                
                offsetStats.offsetApplied++;
                offsetStats.byLine[lineName] = {
                    offset: Math.round(offsetInfo.offset * 10) / 10, // Round to 1 decimal
                    sharedSegments: offsetInfo.sharedSegments,
                    transportType: transportType,
                    status: 'offset applied'
                };
            } else {
                // Offset failed (returned original geometry)
                offsetStats.failed++;
                offsetStats.byLine[lineName] = {
                    offset: 0,
                    sharedSegments: offsetInfo.sharedSegments,
                    transportType: transportType,
                    status: 'failed (invalid geometry)'
                };
            }
            
               return railway;
           } catch (error) {
               offsetStats.failed++;
            offsetStats.byLine[lineName] = {
                offset: 0,
                sharedSegments: offsetInfo.sharedSegments,
                transportType: transportType,
                status: 'failed (exception)'
            };
            return railway; // Return original on error
        }
       });
   
   return result;
}

