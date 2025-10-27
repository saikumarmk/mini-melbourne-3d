import Panel from './Panel';

/**
 * Station Panel - shows station information and approaching trains
 * Similar to TrainPanel, adapted from Mini Tokyo 3D
 */
export default class StationPanel extends Panel {
    constructor(options) {
        super({
            className: 'station-panel',
            ...options
        });
    }

    addTo(map) {
        const station = this._options.station;
        const servingLines = this._options.servingLines || [];
        const approachingTrains = this._options.approachingTrains || [];
        
        // Determine transport type and appropriate colors/labels
        const transportType = station.transportType || 'metro';
        const typeConfig = this.getTypeConfig(transportType);
        
        // Build title with station name and lines
        const titleHTML = `
            <div class="desc-header">
                <div style="background-color: ${typeConfig.color}; width: 8px; height: 40px; border-radius: 4px;"></div>
                <div style="margin-left: 12px;">
                    <div class="desc-first-row">${station.name}</div>
                    <div class="desc-second-row">
                        <span class="train-type-label">${typeConfig.stationLabel}</span>
                        ${servingLines.length > 0 ? `${servingLines.length} ${servingLines.length === 1 ? 'line' : 'lines'}` : ''}
                    </div>
                </div>
            </div>
        `;
        
        // Build content HTML
        const contentHTML = `
            <div id="station-info">
                ${servingLines.length > 0 ? `
                    <div class="section">
                        <h4>Lines</h4>
                        <div class="line-badges">
                            ${servingLines.map(line => `
                                <span class="line-badge" style="background-color: ${line.color}; color: ${this.getContrastColor(line.color)};">
                                    ${line.name}
                                </span>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                ${servingLines.length > 0 ? '<div class="divider"></div>' : ''}
                
                <div class="section">
                    <h4>Approaching ${typeConfig.vehicleLabel}</h4>
                    ${approachingTrains.length > 0 ? `
                        <div class="approaching-trains-list">
                            ${approachingTrains.map(train => this.buildTrainRow(train)).join('')}
                        </div>
                    ` : `
                        <p class="no-data">No ${typeConfig.vehicleLabel.toLowerCase()} approaching</p>
                    `}
                </div>
            </div>
        `;
        
        super.addTo(map)
            .setTitle(titleHTML)
            .setHTML(contentHTML);
        
        return this;
    }
    
    /**
     * Get configuration for different transport types
     */
    getTypeConfig(transportType) {
        const configs = {
            metro: {
                color: '#0066cc',
                stationLabel: 'Metro Station',
                vehicleLabel: 'Trains'
            },
            vline: {
                color: '#9333ea',
                stationLabel: 'V/Line Station',
                vehicleLabel: 'Trains'
            },
            tram: {
                color: '#10b981',
                stationLabel: 'Tram Stop',
                vehicleLabel: 'Trams'
            },
            bus: {
                color: '#f97316',
                stationLabel: 'Bus Stop',
                vehicleLabel: 'Buses'
            }
        };
        return configs[transportType] || configs.metro;
    }
    
    buildTrainRow(train) {
        const color = train.color ? `rgb(${train.color.join(',')})` : 'rgb(128,128,128)';
        const lineName = train.line || 'Metro';
        const eta = train.nextStopArrival ? this.formatETA(train.nextStopArrival) : 'Due';
        
        return `
            <div class="train-row" style="border-left: 4px solid ${color};">
                <div class="train-row-content">
                    <div class="train-row-line">
                        <span class="train-line-name">${lineName}</span>
                        ${train.destination ? `
                            <span class="train-destination">to ${train.destination}</span>
                        ` : ''}
                    </div>
                    <div class="train-row-eta">${eta}</div>
                </div>
            </div>
        `;
    }
    
    /**
     * Format ETA timestamp to human-readable string
     */
    formatETA(timestamp) {
        const now = Date.now() / 1000;
        const diff = timestamp - now;
        
        // More detailed timing
        if (diff < -300) {
            return 'Departed';
        } else if (diff < -60) {
            const minutesAgo = Math.abs(Math.floor(diff / 60));
            return `${minutesAgo} min ago`;
        } else if (diff < 0) {
            return 'Arriving now';
        } else if (diff < 30) {
            const seconds = Math.floor(diff);
            return `${seconds} sec`;
        } else if (diff < 60) {
            return '< 1 min';
        } else if (diff < 3600) {
            const minutes = Math.floor(diff / 60);
            return `${minutes} min`;
        } else {
            const hours = Math.floor(diff / 3600);
            const mins = Math.floor((diff % 3600) / 60);
            return `${hours}h ${mins}m`;
        }
    }
    
    /**
     * Get contrasting text color for a background
     */
    getContrastColor(hexColor) {
        // Remove # if present
        const hex = hexColor.replace('#', '');
        
        // Convert to RGB
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        
        // Calculate luminance
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        
        // Return black for light colors, white for dark colors
        return luminance > 0.5 ? '#000000' : '#ffffff';
    }
}

