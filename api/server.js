import express from 'express';
import cors from 'cors';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import 'dotenv/config';

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.DTP_API_KEY;

if (!API_KEY) {
    console.error('Error: DTP_API_KEY environment variable is required');
    console.error('Get your API key from https://opendata.transport.vic.gov.au');
    process.exit(1);
}

/**
 * Fetch GTFS-Realtime feed from Transport Victoria API
 */
async function fetchGTFSFeed(endpoint) {
    const response = await fetch(endpoint, {
        headers: {
            'KeyId': API_KEY
        }
    });

    if (!response.ok) {
        throw new Error(`${response.url}: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
        new Uint8Array(buffer)
    );

    return feed;
}

// Cache for reducing API calls
let positionCache = { timestamp: 0, feed: null };
let tripCache = { timestamp: 0, feed: null };
let vlinePositionCache = { timestamp: 0, feed: null };
let vlineTripCache = { timestamp: 0, feed: null };
let busPositionCache = { timestamp: 0, feed: null };
let busTripCache = { timestamp: 0, feed: null };
let tramPositionCache = { timestamp: 0, feed: null };
let tramTripCache = { timestamp: 0, feed: null };

const CACHE_DURATION = 4000; // 4 seconds

const app = express();

// Enable CORS for all routes
app.use(cors());

/**
 * Vehicle positions endpoint
 * Returns real-time train positions
 */
app.get('/positions', async (req, res) => {
    try {
        // Check if cache is still valid
        if (Date.now() - positionCache.timestamp > CACHE_DURATION) {
            console.log('Fetching new vehicle positions...');
            const feed = await fetchGTFSFeed(
                'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/metro/vehicle-positions'
            );
            
            positionCache = {
                timestamp: Date.now(),
                feed: feed
            };
        }

        res.json(positionCache);
    } catch (error) {
        console.error('Error fetching positions:', error);
        res.status(500).json({ error: 'Failed to fetch vehicle positions' });
    }
});

/**
 * Trip updates endpoint
 * Returns real-time trip updates (next stops, delays, etc.)
 */
app.get('/trips', async (req, res) => {
    try {
        // Check if cache is still valid
        if (Date.now() - tripCache.timestamp > CACHE_DURATION) {
            console.log('Fetching new trip updates...');
            const feed = await fetchGTFSFeed(
                'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/metro/trip-updates'
            );
            
            tripCache = {
                timestamp: Date.now(),
                feed: feed
            };
        }

        res.json(tripCache);
    } catch (error) {
        console.error('Error fetching trip updates:', error);
        res.status(500).json({ error: 'Failed to fetch trip updates' });
    }
});

/**
 * V/Line (regional trains) positions endpoint
 */
app.get('/vline/positions', async (req, res) => {
    try {
        if (Date.now() - vlinePositionCache.timestamp > CACHE_DURATION) {
            console.log('Fetching V/Line positions...');
            const feed = await fetchGTFSFeed(
                'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/vline/vehicle-positions'
            );
            
            vlinePositionCache = {
                timestamp: Date.now(),
                feed: feed
            };
        }

        res.json(vlinePositionCache);
    } catch (error) {
        console.error('Error fetching V/Line positions:', error);
        res.status(500).json({ error: 'Failed to fetch V/Line positions' });
    }
});

/**
 * Bus positions endpoint
 */
app.get('/bus/positions', async (req, res) => {
    try {
        if (Date.now() - busPositionCache.timestamp > CACHE_DURATION) {
            console.log('Fetching bus positions...');
            const feed = await fetchGTFSFeed(
                'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/bus/vehicle-positions'
            );
            
            busPositionCache = {
                timestamp: Date.now(),
                feed: feed
            };
        }

        res.json(busPositionCache);
    } catch (error) {
        console.error('Error fetching bus positions:', error);
        res.status(500).json({ error: 'Failed to fetch bus positions' });
    }
});

/**
 * Tram positions endpoint
 */
app.get('/tram/positions', async (req, res) => {
    try {
        if (Date.now() - tramPositionCache.timestamp > CACHE_DURATION) {
            console.log('Fetching tram positions...');
            const feed = await fetchGTFSFeed(
                'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/tram/vehicle-positions'
            );
            
            tramPositionCache = {
                timestamp: Date.now(),
                feed: feed
            };
        }

        res.json(tramPositionCache);
    } catch (error) {
        console.error('Error fetching tram positions:', error);
        res.status(500).json({ error: 'Failed to fetch tram positions' });
    }
});

/**
 * V/Line trip updates endpoint
 */
app.get('/vline/trips', async (req, res) => {
    try {
        if (Date.now() - vlineTripCache.timestamp > CACHE_DURATION) {
            console.log('Fetching V/Line trip updates...');
            const feed = await fetchGTFSFeed(
                'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/vline/trip-updates'
            );
            
            vlineTripCache = {
                timestamp: Date.now(),
                feed: feed
            };
        }

        res.json(vlineTripCache);
    } catch (error) {
        console.error('Error fetching V/Line trip updates:', error);
        res.status(500).json({ error: 'Failed to fetch V/Line trip updates' });
    }
});

/**
 * Bus trip updates endpoint
 */
app.get('/bus/trips', async (req, res) => {
    try {
        if (Date.now() - busTripCache.timestamp > CACHE_DURATION) {
            console.log('Fetching bus trip updates...');
            const feed = await fetchGTFSFeed(
                'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/bus/trip-updates'
            );
            
            busTripCache = {
                timestamp: Date.now(),
                feed: feed
            };
        }

        res.json(busTripCache);
    } catch (error) {
        console.error('Error fetching bus trip updates:', error);
        res.status(500).json({ error: 'Failed to fetch bus trip updates' });
    }
});

/**
 * Tram trip updates endpoint
 */
app.get('/tram/trips', async (req, res) => {
    try {
        if (Date.now() - tramTripCache.timestamp > CACHE_DURATION) {
            console.log('Fetching tram trip updates...');
            const feed = await fetchGTFSFeed(
                'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/tram/trip-updates'
            );
            
            tramTripCache = {
                timestamp: Date.now(),
                feed: feed
            };
        }

        res.json(tramTripCache);
    } catch (error) {
        console.error('Error fetching tram trip updates:', error);
        res.status(500).json({ error: 'Failed to fetch tram trip updates' });
    }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Melbourne 3D Transport Map API server running on port ${PORT}`);
    console.log(`Endpoints:`);
    console.log(`  Metro:`);
    console.log(`    - GET http://localhost:${PORT}/positions`);
    console.log(`    - GET http://localhost:${PORT}/trips`);
    console.log(`  V/Line:`);
    console.log(`    - GET http://localhost:${PORT}/vline/positions`);
    console.log(`    - GET http://localhost:${PORT}/vline/trips`);
    console.log(`  Buses:`);
    console.log(`    - GET http://localhost:${PORT}/bus/positions`);
    console.log(`    - GET http://localhost:${PORT}/bus/trips`);
    console.log(`  Trams:`);
    console.log(`    - GET http://localhost:${PORT}/tram/positions`);
    console.log(`    - GET http://localhost:${PORT}/tram/trips`);
    console.log(`  Health:`);
    console.log(`    - GET http://localhost:${PORT}/health`);
});

