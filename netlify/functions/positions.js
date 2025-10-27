const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');

const API_KEY = process.env.TRANSPORTVIC_API_KEY;

const CACHE_TTL = 30;

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`,
    'CDN-Cache-Control': `public, max-age=${CACHE_TTL}`,
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const response = await fetch('https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/metro/vehicle-positions', {
      headers: { 'KeyId': API_KEY },
    });

    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(buffer)
    );

    return { statusCode: 200, headers, body: JSON.stringify(feed) };
  } catch (error) {
    console.error('Error fetching positions:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch position data' }),
    };
  }
};
