/**
 * Train class representing a moving train
 */
export default class Train {
    constructor(data) {
        this.tripId = data.tripId;
        this.vehicleId = data.vehicleId;
        this.routeId = data.routeId;
        this.lat = data.lat;
        this.lon = data.lon;
        this.bearing = data.bearing || 0;
        this.speed = data.speed || 0;
        this.timestamp = data.timestamp;
        this.nextStop = data.nextStop;
        this.nextStopArrival = data.nextStopArrival;
        this.occupancy = data.occupancy;
        this.line = data.line;
        this.color = data.color || [0, 0, 0];
        this.vehicleType = data.vehicleType || 'metro'; // 'metro', 'vline', 'bus', 'tram'
        this.defaultColor = data.defaultColor || [0, 100, 200]; // Fallback color for vehicle type
        
        // Animation properties
        this.targetLat = this.lat;
        this.targetLon = this.lon;
        this.animationProgress = 1;
    }

    getCoordinates() {
        return [this.lon, this.lat];
    }

    /**
     * Update train position with new data
     */
    updatePosition(data) {
        // Store current position as start of animation
        this.startLat = this.lat;
        this.startLon = this.lon;
        
        // Set target position
        this.targetLat = data.lat;
        this.targetLon = data.lon;
        
        // Reset animation
        this.animationProgress = 0;
        
        // Update bearing - if not provided or 0, calculate from movement
        if (data.bearing && data.bearing !== 0) {
            this.bearing = data.bearing;
        } else if (this.startLat !== undefined && this.startLon !== undefined) {
            // Calculate bearing from movement direction
            const dLon = this.targetLon - this.startLon;
            const dLat = this.targetLat - this.startLat;
            if (dLon !== 0 || dLat !== 0) {
                // Calculate compass bearing from coordinate changes
                // atan2(dLon, dLat) gives mathematical angle, convert to compass
                const radians = Math.atan2(dLon, dLat);
                this.bearing = (radians * 180 / Math.PI + 360) % 360;
            }
        }
        
        this.speed = data.speed || this.speed;
        this.timestamp = data.timestamp;
        this.nextStop = data.nextStop;
        this.nextStopArrival = data.nextStopArrival;
        this.occupancy = data.occupancy;
    }

    /**
     * Animate train position
     * @param {number} progress - Animation progress 0 to 1
     */
    animate(progress) {
        this.animationProgress = Math.min(progress, 1);
        
        // Interpolate position
        const t = this.easeInOutQuad(this.animationProgress);
        this.lat = this.startLat + (this.targetLat - this.startLat) * t;
        this.lon = this.startLon + (this.targetLon - this.startLon) * t;
    }

    /**
     * Easing function for smooth animation
     */
    easeInOutQuad(t) {
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }

    /**
     * Get occupancy status as text
     */
    getOccupancyStatus() {
        const statuses = [
            'Empty',
            'Many seats available',
            'Few seats available',
            'Standing room only',
            'Crushed standing room only',
            'Full',
            'Not accepting passengers',
            'No data',
            'Not boardable'
        ];
        
        if (this.occupancy === null || this.occupancy === undefined) {
            return 'No data';
        }
        
        return statuses[this.occupancy] || 'No data';
    }

    toGeoJSON() {
        return {
            type: 'Feature',
            properties: {
                tripId: this.tripId,
                vehicleId: this.vehicleId,
                routeId: this.routeId,
                line: this.line,
                bearing: this.bearing,
                speed: this.speed,
                nextStop: this.nextStop,
                nextStopArrival: this.nextStopArrival,
                occupancy: this.getOccupancyStatus()
            },
            geometry: {
                type: 'Point',
                coordinates: [this.lon, this.lat]
            }
        };
    }
}

