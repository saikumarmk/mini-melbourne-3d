# Mini Melbourne 3D 🚆

A real-time 3D visualization of Melbourne's public transport system, featuring trains, trams, buses, and V/Line services with live tracking and station information.

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)

## Features

- 🗺️ **3D Interactive Map** - Powered by Mapbox GL JS
- 🚉 **Multi-Modal Transport** - Trains, trams, buses, and V/Line services
- ⏱️ **Real-time Tracking** - Live vehicle positions from Transport Victoria GTFS-RT
- 📍 **Station Information** - Click stations to see approaching vehicles and ETAs
- 🚂 **Vehicle Details** - Click vehicles to see route information and timetables
- 🎚️ **Layer Controls** - Toggle visibility of different transport types
- ⚡ **Performance Optimized** - Viewport culling, LOD rendering, and edge caching

## Quick Start

### Local Development

**Requirements**: Node.js 18+, pnpm

```bash
# 1. Clone and install
git clone https://github.com/YOUR_USERNAME/mini-melbourne-3d.git
cd mini-melbourne-3d
pnpm install

# 2. Start API server (Terminal 1)
cd api
pnpm install
node server.js

# 3. Build and serve (Terminal 2)
cd ..
pnpm run build:local
npx http-server public -p 8080 --cors -c-1
```

Open http://localhost:8080 and hard refresh (Ctrl+Shift+R)

### Environment Setup

**API Server** (`api/.env`):
```env
DTP_API_KEY=your_transport_vic_api_key
PORT=3000
```

Get your API key from: https://discover.data.vic.gov.au/organization/ptv

### Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for Netlify deployment instructions.

## Project Structure

```
mini-melbourne-3d/
├── api/                    # Express API server (local dev only)
├── data/                   # Processed GTFS static data
│   ├── metro/
│   ├── vline/
│   ├── tram/
│   └── bus/
├── netlify/
│   └── functions/          # Serverless functions (production)
├── public/
│   └── index.html          # Main HTML file
├── scripts/                # Data processing scripts
├── src/                    # Application source code
│   ├── configs.js
│   ├── data-classes/
│   ├── helpers/
│   ├── panels/
│   ├── loader.js
│   └── map.js
├── netlify.toml            # Netlify configuration
└── package.json
```

## Data Processing

To regenerate GTFS data from source:

```bash
# Process all transport types
pnpm run process-all-transport
```

**Note**: Requires GTFS data files in appropriate directories.

## Configuration

Edit `src/configs.js` to customize:
- Map settings (center, zoom, bearing, pitch)
- Update intervals (real-time data refresh rate)
- Visual settings (vehicle sizes, colors, opacity)
- Performance (LOD thresholds, animation settings)

## Security Notes

### Mapbox Token
The Mapbox public token (`pk.*`) in `public/index.html` is **safe to expose** - it's designed for client-side use. For extra security, add URL restrictions in your Mapbox dashboard:

1. Go to: https://account.mapbox.com/access-tokens/
2. Click your token
3. Add allowed URLs: `http://localhost:*`, `https://*.netlify.app`

### Transport Victoria API Key
The Transport Victoria API key is **never exposed** to the client. It's:
- Stored in environment variables (local: `api/.env`, Netlify: dashboard)
- Proxied through serverless functions in production
- Protected with rate limiting via HTTP caching

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Requires WebGL support

## Performance

Optimized for smooth 60 FPS rendering:
- **Viewport Culling**: Only renders vehicles in view
- **Level of Detail (LOD)**: Filters objects by zoom level
- **Single Render Loop**: Prevents redundant rendering
- **Edge Caching**: 30s cache for positions, 60s for trips
- **Smart Updates**: Differential position updates every 5s

## Known Issues

- CORS warnings from `events.mapbox.com` (harmless, telemetry only)
- WebGL deprecation warnings (informational, doesn't affect performance)

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push and open a Pull Request

## License

MIT License - see LICENSE file for details

## Acknowledgments

- [Mini Tokyo 3D](https://github.com/nagix/mini-tokyo-3d) - Inspiration for features and design
- [Transport Victoria](https://discover.data.vic.gov.au/) - Open GTFS data
- [Mapbox](https://www.mapbox.com/) - Map rendering
- [GTFS Realtime](https://gtfs.org/realtime/) - Real-time transit protocol

## Support

- **Issues**: [GitHub Issues](https://github.com/YOUR_USERNAME/mini-melbourne-3d/issues)
- **Documentation**: See [DEPLOYMENT.md](./DEPLOYMENT.md)

---

Made with ❤️ for Melbourne's public transport enthusiasts
