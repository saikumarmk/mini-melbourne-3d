/**
 * Station class representing a train/tram/bus station
 */
export default class Station {
    constructor(data) {
        this.id = data.id;
        this.name = data.name;
        this.lat = data.lat;
        this.lon = data.lon;
        this.code = data.code;
        this.lines = data.lines || [];
        this.transportType = data.transportType || 'metro'; // 'metro', 'vline', 'tram', 'bus'
    }

    getCoordinates() {
        return [this.lon, this.lat];
    }

    toGeoJSON() {
        return {
            type: 'Feature',
            properties: {
                id: this.id,
                name: this.name,
                code: this.code,
                lines: this.lines,
                transportType: this.transportType
            },
            geometry: {
                type: 'Point',
                coordinates: [this.lon, this.lat]
            }
        };
    }
}

