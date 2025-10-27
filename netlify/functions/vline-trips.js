const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const API_KEY = process.env.TRANSPORTVIC_API_KEY;
const API_BASE = 'https://data-exchange-api.vicroads.vic.gov.au/opendata/v1/gtfsr';

const CACHE_TTL = 60;

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
    const response = await fetch(`${API_BASE}/vline-trip-updates`, {
      headers: { 'Ocp-Apim-Subscription-Key': API_KEY },
    });

    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }

    const data = await response.json();
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (error) {
    console.error('Error fetching V/Line trip updates:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch V/Line trip update data' }),
    };
  }
};

