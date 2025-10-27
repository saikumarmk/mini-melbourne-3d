import Panel from './Panel';

/**
 * Train Panel - shows train information and route stops
 * Adapted from Mini Tokyo 3D
 */
export default class TrainPanel extends Panel {
    constructor(options) {
        super({
            className: 'train-panel',
            ...options
        });
    }

    addTo(map) {
        const train = this._options.train;
        const stations = this._options.stations || [];
        
        // Build title with train info
        const color = train.color ? `rgb(${train.color.join(',')})` : 'rgb(128,128,128)';
        const lineName = train.line && train.line !== 'Unknown' ? train.line : 'Metro Train';
        const destination = train.nextStop || 'In Service';
        
        const titleHTML = `
            <div class="desc-header">
                <div style="background-color: ${color}; width: 8px; height: 40px; border-radius: 4px;"></div>
                <div style="margin-left: 12px;">
                    <div class="desc-first-row">${lineName}</div>
                    <div class="desc-second-row">
                        <span class="train-type-label">Metro</span>
                        ${destination !== 'In Service' ? `Next stop: ${destination}` : destination}
                    </div>
                </div>
            </div>
        `;
        
        // Build station list
        const stationHTML = this.buildStationList(train, stations);
        
        super.addTo(map)
            .setTitle(titleHTML)
            .setHTML(`
                <div id="train-info">
                    <div class="info-row">
                        <span class="info-label">Vehicle ID:</span>
                        <span class="info-value">${train.vehicleId || train.tripId || 'Unknown'}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Occupancy:</span>
                        <span class="info-value">${train.getOccupancyStatus ? train.getOccupancyStatus() : 'No data'}</span>
                    </div>
                    ${train.speed && train.speed > 0 ? `
                    <div class="info-row">
                        <span class="info-label">Speed:</span>
                        <span class="info-value">${Math.round(train.speed * 3.6)} km/h</span>
                    </div>
                    ` : ''}
                    ${train.bearing !== undefined && train.bearing !== null ? `
                    <div class="info-row">
                        <span class="info-label">Direction:</span>
                        <span class="info-value">${Math.round(train.bearing)}°</span>
                    </div>
                    ` : ''}
                    ${train.nextStopArrival ? `
                    <div class="info-row">
                        <span class="info-label">Next Stop ETA:</span>
                        <span class="info-value">${this.formatTime(train.nextStopArrival * 1000)}</span>
                    </div>
                    ` : ''}
                </div>
                <div class="divider"></div>
                <div id="timetable-section">
                    <h4>Route Information</h4>
                    <div id="timetable-content">
                        ${stationHTML}
                    </div>
                    <svg id="railway-mark"></svg>
                    <svg id="train-mark"></svg>
                </div>
            `);
        
        // Draw the visual route line
        this.drawRouteMarkers(train, stations);
        
        // Start animation for current position indicator
        this.startAnimation(train);
        
        return this;
    }

    buildStationList(train, stations) {
        if (!stations || stations.length === 0) {
            // Show basic info if no station list is available
            if (train.nextStop) {
                return `
                    <div class="station-row next-stop">
                        <div class="station-title-box">
                            ${train.nextStop}
                            <span class="next-indicator">← Next Stop</span>
                        </div>
                        ${train.nextStopArrival ? `
                        <div class="station-time-box">
                            ${this.formatTime(train.nextStopArrival * 1000)}
                        </div>
                        ` : ''}
                    </div>
                `;
            }
            return '<div class="station-row">Full route information not available</div>';
        }
        
        return stations.map((station, index) => {
            const isNext = station.isNext || station.name === train.nextStop;
            const classes = ['station-row'];
            if (isNext) classes.push('next-stop');
            
            return `
                <div class="${classes.join(' ')}" data-index="${index}">
                    <div class="station-title-box">
                        ${station.name}
                        ${isNext ? '<span class="next-indicator">← Next Stop</span>' : ''}
                    </div>
                    ${station.arrival ? `
                    <div class="station-time-box">
                        ${this.formatTime(station.arrival)}
                    </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    formatTime(timestamp) {
        if (!timestamp) return '';
        
        // Convert to seconds if in milliseconds
        const timestampSec = timestamp > 10000000000 ? timestamp / 1000 : timestamp;
        const now = Date.now() / 1000;
        const diff = timestampSec - now;
        
        // Show relative time for near-future arrivals
        if (diff < -300) {
            // More than 5 minutes ago - show absolute time
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
            // More than 1 hour away - show absolute time
            const date = new Date(timestamp);
            return date.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
        }
    }

    drawRouteMarkers(train, stations) {
        if (!this._container || !stations || stations.length === 0) return;
        
        const container = this._container;
        const timetableSection = container.querySelector('#timetable-section');
        const timetableContent = container.querySelector('#timetable-content');
        if (!timetableContent || !timetableSection) return;
        
        const stationRows = timetableContent.querySelectorAll('.station-row');
        const offsets = [];
        
        // Calculate the offset of timetable-content within timetable-section
        const contentOffsetTop = timetableContent.offsetTop;
        
        stationRows.forEach(row => {
            const rect = row.getBoundingClientRect();
            // Add contentOffsetTop to account for the h4 element above timetable-content
            offsets.push(contentOffsetTop + row.offsetTop + rect.height / 2);
        });
        
        if (offsets.length === 0) return;
        
        // Store offsets and train for animation
        this._routeOffsets = offsets;
        this._train = train;
        this._stations = stations;
        
        // Draw railway line (static part)
        const railwayMark = container.querySelector('#railway-mark');
        if (railwayMark && offsets.length > 1) {
            const color = train.color ? `rgb(${train.color.join(',')})` : '#808080';
            railwayMark.innerHTML = `
                <line stroke="${color}" stroke-width="10" 
                      x1="12" y1="${offsets[0]}" 
                      x2="12" y2="${offsets[offsets.length - 1]}" 
                      stroke-linecap="round" />
                ${offsets.map(offset => 
                    `<circle cx="12" cy="${offset}" r="3" fill="#ffffff" />`
                ).join('')}
            `;
        }
        
        // Start animating the train position marker
        this.animateTrainPosition();
    }

    animateTrainPosition() {
        if (!this._container || !this._routeOffsets || !this._train) return;
        
        const container = this._container;
        const railwayMark = container.querySelector('#railway-mark');
        
        if (!railwayMark) return;
        
        const animate = () => {
            if (!this._container || !this._routeOffsets) return; // Stop if panel is removed
            
            const train = this._train;
            const offsets = this._routeOffsets;
            const stations = this._stations;
            
            // Find the next stop index by checking both name and isNext flag
            let nextStopIndex = -1;
            if (stations) {
                // First try to find by isNext flag (most reliable)
                nextStopIndex = stations.findIndex(s => s.isNext === true);
                
                // Fallback: try to match by name
                if (nextStopIndex === -1 && train.nextStop) {
                    nextStopIndex = stations.findIndex(s => {
                        if (!s.name) return false;
                        // Normalize both names for comparison
                        const stationName = s.name.toLowerCase().trim();
                        const nextStopName = train.nextStop.toLowerCase().trim();
                        return stationName === nextStopName || stationName.includes(nextStopName) || nextStopName.includes(stationName);
                    });
                }
            }
            
            // Calculate train position between stations
            let trainY;
            if (nextStopIndex > 0 && train.nextStopArrival) {
                // Interpolate between previous and next station
                const now = Date.now() / 1000;
                const arrivalTime = train.nextStopArrival;
                
                // Estimate travel time based on distance between stations
                // Average Melbourne metro: 2-3 minutes between stations
                const travelTime = 150; // seconds (2.5 minutes average)
                const departureTime = arrivalTime - travelTime;
                
                // Calculate progress (0 to 1)
                let progress = (now - departureTime) / travelTime;
                progress = Math.max(0, Math.min(1, progress)); // Clamp to 0-1
                
                // Smooth easing function for more natural movement
                const eased = progress < 0.5 
                    ? 2 * progress * progress 
                    : 1 - Math.pow(-2 * progress + 2, 2) / 2;
                
                // Interpolate position
                const prevY = offsets[nextStopIndex - 1];
                const nextY = offsets[nextStopIndex];
                trainY = prevY + (nextY - prevY) * eased;
            } else if (nextStopIndex >= 0) {
                // Train is at or approaching the next stop
                trainY = offsets[nextStopIndex];
            } else {
                // Can't determine position - use middle of route as fallback
                trainY = offsets[Math.floor(offsets.length / 2)];
            }
            
            // Get existing railway line content
            const color = train.color ? `rgb(${train.color.join(',')})` : '#808080';
            const existingContent = `
                <line stroke="${color}" stroke-width="10" 
                      x1="12" y1="${offsets[0]}" 
                      x2="12" y2="${offsets[offsets.length - 1]}" 
                      stroke-linecap="round" />
                ${offsets.map(offset => 
                    `<circle cx="12" cy="${offset}" r="3" fill="#ffffff" />`
                ).join('')}
            `;
            
            // Add pulsing train marker
            const p = (performance.now() % 1500) / 1500; // Pulse cycle
            const pulseRadius = 6 + p * 8; // Pulse from 6 to 14
            const pulseOpacity = 0.8 - p * 0.6; // Fade from 0.8 to 0.2
            
            railwayMark.innerHTML = existingContent + `
                <circle cx="12" cy="${trainY}" r="${pulseRadius}" 
                        fill="${color}" opacity="${pulseOpacity}" />
                <circle cx="12" cy="${trainY}" r="6" fill="${color}" />
                <circle cx="12" cy="${trainY}" r="4" fill="#ffffff" />
            `;
            
            requestAnimationFrame(animate);
        };
        
        animate();
    }

    startAnimation(train) {
        if (!this._container) return;
        
        const container = this._container;
        const timetableSection = container.querySelector('#timetable-section');
        const timetableContent = container.querySelector('#timetable-content');
        const trainMark = container.querySelector('#train-mark');
        
        if (!trainMark || !timetableContent || !timetableSection) return;
        
        // Calculate the offset once
        const contentOffsetTop = timetableContent.offsetTop;
        
        const animate = () => {
            if (!this._container) return; // Stop if panel is removed
            
            const stationRows = timetableContent.querySelectorAll('.station-row');
            const nextStopRow = timetableContent.querySelector('.next-stop');
            
            if (nextStopRow) {
                const rect = nextStopRow.getBoundingClientRect();
                const containerRect = timetableContent.getBoundingClientRect();
                const y = contentOffsetTop + nextStopRow.offsetTop + rect.height / 2;
                
                // Animated pulsing circle
                const p = (performance.now() % 1500) / 1500;
                trainMark.innerHTML = `
                    <circle cx="22" cy="${y}" r="${7 + p * 15}" 
                            fill="#ffffff" opacity="${1 - p}" />
                    <circle cx="22" cy="${y}" r="7" fill="#ffffff" />
                `;
                
                // Auto-scroll to keep next stop visible
                const panelBody = container.querySelector('#panel-body');
                if (panelBody && this._scrollTop === undefined) {
                    this._scrollTop = panelBody.scrollTop = Math.round(y - panelBody.clientHeight / 2 + 4);
                }
            }
            
            requestAnimationFrame(animate);
        };
        
        animate();
    }

    remove() {
        delete this._scrollTop;
        delete this._routeOffsets;
        delete this._train;
        delete this._stations;
        return super.remove();
    }
}

