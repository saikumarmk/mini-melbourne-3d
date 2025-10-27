/**
 * Search control for finding stations
 */
export default class SearchControl {
    constructor(stations, map) {
        this.stations = stations;
        this.map = map;
        this.container = null;
        this.input = null;
        this.results = null;
    }

    onAdd(map) {
        this.map = map;
        
        // Create container
        this.container = document.createElement('div');
        this.container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group search-control';
        
        // Create input
        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.placeholder = 'Search stations...';
        this.input.className = 'search-input';
        
        // Create results container
        this.results = document.createElement('div');
        this.results.className = 'search-results';
        this.results.style.display = 'none';
        
        // Add event listeners
        this.input.addEventListener('input', () => this.handleInput());
        this.input.addEventListener('focus', () => this.handleInput());
        this.input.addEventListener('blur', () => {
            // Delay to allow click on results
            setTimeout(() => this.hideResults(), 200);
        });
        
        // Assemble
        this.container.appendChild(this.input);
        this.container.appendChild(this.results);
        
        return this.container;
    }

    onRemove() {
        this.container.parentNode.removeChild(this.container);
        this.map = undefined;
    }

    handleInput() {
        const query = this.input.value.trim().toLowerCase();
        
        if (query.length === 0) {
            this.hideResults();
            return;
        }
        
        // Simple fuzzy search
        const matches = this.stations
            .filter(station => 
                station.name.toLowerCase().includes(query)
            )
            .slice(0, 5);
        
        if (matches.length === 0) {
            this.hideResults();
            return;
        }
        
        this.showResults(matches);
    }

    showResults(stations) {
        this.results.innerHTML = '';
        
        stations.forEach(station => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.textContent = station.name;
            
            item.addEventListener('click', () => {
                this.selectStation(station);
            });
            
            this.results.appendChild(item);
        });
        
        this.results.style.display = 'block';
    }

    hideResults() {
        this.results.style.display = 'none';
    }

    selectStation(station) {
        // Fly to station
        this.map.flyTo({
            center: station.getCoordinates(),
            zoom: 15,
            duration: 1500
        });
        
        // Clear input and hide results
        this.input.value = '';
        this.hideResults();
        
        // Show popup for station
        const popup = new mapboxgl.Popup()
            .setLngLat(station.getCoordinates())
            .setHTML(`
                <div class="station-popup">
                    <h3>${station.name}</h3>
                    <p>Station ID: ${station.id}</p>
                </div>
            `)
            .addTo(this.map);
    }
}

