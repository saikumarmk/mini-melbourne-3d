/**
 * Railway class representing a train line/route
 */
export default class Railway {
    constructor(data) {
        this.id = data.id;
        this.shortName = data.shortName;
        this.longName = data.longName;
        this.type = data.type;
        this.color = data.color;
        this.textColor = data.textColor;
        this.geometry = data.geometry; // GeoJSON LineString
        this.transportType = data.transportType || 'metro'; // Transport type for filtering
    }

    /**
     * Get color as RGB array
     */
    getColorRGB() {
        // Convert hex to RGB
        const hex = this.color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return [r, g, b];
    }

    toGeoJSON() {
        return {
            type: 'Feature',
            properties: {
                id: this.id,
                shortName: this.shortName,
                longName: this.longName,
                color: this.color,
                textColor: this.textColor
            },
            geometry: this.geometry
        };
    }
}

