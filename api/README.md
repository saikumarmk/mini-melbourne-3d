# API Server - Local Development

This Express server proxies Transport Victoria GTFS-Realtime data for local development. In production (Netlify), serverless functions handle this instead.

## Setup

1. **Install dependencies**:
```bash
cd api
pnpm install
```

2. **Configure environment variables**:
Create `api/.env`:
```env
DTP_API_KEY=your_transport_vic_api_key
PORT=3000
```

Get your API key from: https://discover.data.vic.gov.au/organization/ptv

3. **Start server**:
```bash
node server.js
```

Server will run on: `http://localhost:3000`

## Endpoints

### Metro Trains
- `GET /positions` - Real-time vehicle positions
- `GET /trips` - Trip updates (arrival/departure times)

### V/Line
- `GET /vline/positions` - Real-time V/Line positions
- `GET /vline/trips` - V/Line trip updates

### Buses
- `GET /bus/positions` - Real-time bus positions
- `GET /bus/trips` - Bus trip updates

### Trams
- `GET /tram/positions` - Real-time tram positions
- `GET /tram/trips` - Tram trip updates

## Features

- **CORS enabled** - Allows requests from `http://localhost:8080`
- **In-memory caching** - Reduces API calls to Transport Victoria
  - Position data: 30 second cache
  - Trip updates: 60 second cache
- **Error handling** - Graceful failures with error messages
- **Logging** - Request logging and cache statistics

## Architecture

```
Browser (localhost:8080)
    ↓
API Server (localhost:3000)
    ↓ (with caching)
Transport Victoria API
```

**Why a local API server?**
- Hides your API key from client-side code
- Enables caching to reduce API calls
- Handles CORS properly
- Matches production architecture (Netlify Functions)

## Cache Stats

The server logs cache statistics every 60 seconds:
```
[Cache Stats] Hits: 45, Misses: 3, Hit Rate: 93.8%
```

- **Hit**: Served from cache (fast, no API call)
- **Miss**: Fetched from Transport Victoria API
- **Hit Rate**: Percentage of requests served from cache

## Production vs Development

| Aspect | Development (This Server) | Production (Netlify) |
|--------|--------------------------|----------------------|
| **Technology** | Express.js | Netlify Functions |
| **API Key Storage** | `.env` file | Netlify Dashboard |
| **Caching** | In-memory | HTTP headers + Edge CDN |
| **URL** | `localhost:3000` | `/api/*` (same domain) |
| **Scaling** | Single process | Auto-scales globally |

## Troubleshooting

### Port Already in Use
```bash
# Find process using port 3000
netstat -ano | findstr :3000

# Kill it (replace PID with actual number)
taskkill /PID <PID> /F
```

### API Key Invalid
- Verify your key at: https://discover.data.vic.gov.au/
- Check it's not expired
- Ensure no extra spaces in `.env` file

### No Data Returned
- Check Transport Victoria API status
- Verify your API key has correct permissions
- Check server console for error messages

### CORS Errors
- Ensure you're accessing from `http://localhost:8080`
- Check CORS configuration in `server.js`

## Development

To modify endpoints or caching:

1. Edit `server.js`
2. Restart server: `node server.js`
3. Test with: `curl http://localhost:3000/positions`

## Related Files

- `../netlify/functions/` - Production serverless functions
- `../src/configs.js` - Runtime API URL detection
- `../.env.example` - Environment variable template

## Notes

- This server is **only for local development**
- Don't deploy this to production - use Netlify Functions instead
- The API key in `.env` is git-ignored for security
- Cache reduces API calls from ~12/min to ~2/min

## Transport Victoria API

- **Documentation**: https://discover.data.vic.gov.au/
- **Rate Limits**: Check their documentation
- **Data Format**: GTFS-Realtime (Protocol Buffers)
- **Update Frequency**: Real-time (varies by feed)

## Quick Commands

```bash
# Start API server
cd api && node server.js

# Test endpoint
curl http://localhost:3000/positions

# Check logs
# (logs appear in console where server is running)
```
