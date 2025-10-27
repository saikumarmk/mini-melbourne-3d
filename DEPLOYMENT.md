# Deployment Guide - Mini Melbourne 3D

Complete guide for deploying to Netlify with serverless functions and edge caching.

## Prerequisites

Before deploying, you need:

1. **Transport Victoria API Key**
   - Sign up at: https://discover.data.vic.gov.au/organization/ptv
   - Create API key under "API Keys" section

2. **Mapbox Access Token**
   - Free account at: https://account.mapbox.com/
   - Get token from: https://account.mapbox.com/access-tokens/
   - Already in `public/index.html` (public tokens are safe to expose)

3. **GitHub Account**
   - For repository hosting and Netlify integration

## Step 1: Push to GitHub

```bash
cd mini-melbourne-3d

# Initialize git
git init
git add .
git commit -m "Initial commit - Mini Melbourne 3D"

# Create repo at: https://github.com/new
# Then push:
git remote add origin https://github.com/YOUR_USERNAME/mini-melbourne-3d.git
git branch -M main
git push -u origin main
```

## Step 2: Deploy to Netlify

### Option A: Web UI (Recommended)

1. **Sign in to Netlify**: https://app.netlify.com/
   - Use GitHub login for easy integration

2. **Import Project**:
   - Click **"Add new site"** → **"Import an existing project"**
   - Choose **"GitHub"**
   - Authorize Netlify
   - Select `mini-melbourne-3d` repository

3. **Build Settings** (auto-detected from `netlify.toml`):
   - Build command: `pnpm run build:local`
   - Publish directory: `public`
   - Functions directory: `netlify/functions`

4. **Environment Variables**:
   - Click **"Add environment variables"**
   - Add:
     ```
     TRANSPORTVIC_API_KEY = your_api_key_here
     ```

5. **Deploy**:
   - Click **"Deploy site"**
   - Wait 2-3 minutes
   - Get URL: `https://your-site-name.netlify.app`

### Option B: Netlify CLI

```bash
# Install CLI
npm install -g netlify-cli

# Login and initialize
netlify login
netlify init

# Set environment variable
netlify env:set TRANSPORTVIC_API_KEY "your_api_key_here"

# Deploy
netlify deploy --prod
```

## Step 3: Verify Deployment

1. **Visit your Netlify URL**
2. **Open DevTools (F12)** → **Network tab**
3. **Check API calls**:
   - `/api/positions` → Status **200** ✅
   - `/api/trips` → Status **200** ✅
   - `/api/vline/positions`, `/api/bus/positions`, `/api/tram/positions` → **200** ✅
4. **Test features**:
   - Map loads with Melbourne centered
   - Vehicles appear and move
   - Click stations to see approaching vehicles
   - Click vehicles to see route details
   - Toggle transport layers on/off

## Architecture

### How It Works

```
https://your-app.netlify.app/
├── /                          → Static site (index.html)
├── /dist/...                  → JavaScript bundles
├── /data/...                  → GTFS static data
└── /api/*                     → Serverless functions (via redirect)
```

When you call `/api/positions`:
1. Netlify redirects to `/.netlify/functions/positions` (invisible to user)
2. Serverless function fetches from Transport Victoria API
3. Returns data with HTTP caching headers (30s)
4. Netlify edge network caches globally
5. Next request served from cache (fast!)

**No subdomains needed** - everything on same domain!

### Environment Detection

The app automatically detects whether it's running locally or on Netlify:

```javascript
// In src/configs.js
get apiUrl() {
  if (window.location.hostname === 'localhost' || 
      window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3000';  // Local dev
  }
  return '/api';  // Netlify production
}
```

Same build works everywhere!

## Performance & Caching

### Serverless Functions (HTTP Caching)

- **Position data**: 30-second cache
- **Trip updates**: 60-second cache
- **Result**: API calls reduced by 83-92%

### Netlify Free Tier Capacity

- ✅ 100 GB bandwidth/month
- ✅ 125,000 function invocations/month
- ✅ 300 build minutes/month

**Estimated capacity**: Hundreds of concurrent users, ~30,000 sessions/month

### Transport Victoria API

- Free tier available with rate limits
- Our caching keeps requests minimal (~2-4 calls/min vs 12 without cache)

## Troubleshooting

### Build Fails

**Symptoms**: Deployment fails during build

**Solutions**:
1. Check deploy logs in Netlify dashboard
2. Verify all files committed to GitHub
3. Ensure `package.json` and `netlify.toml` are correct
4. Check that pnpm is available (specified in `netlify.toml`)

### Functions Return 404

**Symptoms**: Map loads but no vehicles, `/api/*` returns 404

**Solutions**:
1. Verify environment variable `TRANSPORTVIC_API_KEY` is set
2. Check **Functions** tab - should see 8 functions deployed
3. Verify `netlify.toml` redirects are correct
4. Redeploy the site

### Functions Return 500

**Symptoms**: API calls fail with server error

**Solutions**:
1. Check function logs: Dashboard → Functions → Select function → Logs
2. Verify API key is valid and not expired
3. Test API key manually:
   ```bash
   curl -H "Ocp-Apim-Subscription-Key: YOUR_KEY" \
     https://data-exchange-api.vicroads.vic.gov.au/opendata/v1/gtfsr/vehicle-position
   ```
4. Check for rate limiting on your API key

### Map Loads But No Vehicles

**Symptoms**: Map appears, but no trains/trams/buses

**Solutions**:
1. Check browser console for errors
2. Verify API calls in Network tab
3. Check function logs for errors
4. Verify Transport Victoria API is responding
5. Check that real-time data is available

### Runtime Detection Not Working

**Symptoms**: Local dev calls wrong API URL

**Solutions**:
1. Hard refresh browser (Ctrl+Shift+R)
2. Clear browser cache completely
3. Open in incognito/private window
4. Check DevTools console for actual API URL being called

## Custom Domain (Optional)

After successful deployment:

1. **Netlify Dashboard** → **Site settings** → **Domain management**
2. Click **"Add custom domain"**
3. Follow DNS configuration instructions
4. HTTPS enabled automatically (Let's Encrypt)

Your app will work at: `https://your-custom-domain.com`
API still at: `https://your-custom-domain.com/api/*`

## Monitoring

### Function Logs
- **Netlify Dashboard** → **Functions** → Select function → **Logs**
- See invocations, errors, execution time

### Deploy Logs
- **Deploys** → Click on a deploy → **View logs**
- Build output, errors, warnings

### Analytics (Paid Plans)
- Bandwidth usage
- Function invocations
- Error rates

## Updating the App

```bash
# 1. Make changes locally
# 2. Commit
git add .
git commit -m "Description of changes"

# 3. Push to GitHub
git push origin main

# 4. Netlify automatically deploys!
# Watch progress in Netlify dashboard
```

## Cost Estimates

### Free Tier (Sufficient for Most)
- Everything included in free tier
- Supports hundreds of concurrent users
- Unlimited deploys

### When to Upgrade ($19/month)
- Exceed bandwidth limits (100 GB/month)
- Need faster function cold starts
- Want custom domain features
- Need priority support

## Security Best Practices

1. ✅ **Mapbox public token** - Safe in HTML (add URL restrictions)
2. ✅ **Transport Victoria API key** - In environment variables only
3. ✅ **No secrets in code** - Use Netlify environment variables
4. ✅ **HTTPS enforced** - Automatic with Netlify
5. ✅ **Rate limiting** - Via HTTP caching headers

## Additional Resources

- [Netlify Documentation](https://docs.netlify.com/)
- [Netlify Functions Guide](https://docs.netlify.com/functions/overview/)
- [Transport Victoria API Docs](https://discover.data.vic.gov.au/)
- [Mapbox GL JS Docs](https://docs.mapbox.com/mapbox-gl-js/)

## Support

- **Netlify Support**: https://answers.netlify.com/
- **Project Issues**: GitHub Issues
- **Transport Victoria API**: Contact via their portal

---

**Ready to deploy?** Start with Step 1 (push to GitHub) and you'll be live in ~5 minutes! 🚀
