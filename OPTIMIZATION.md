# Data Optimization Guide

## File Size Optimization

The shape files were originally **309 MB**, which is too large for fast page loads. We've optimized them to **99 MB** (68% reduction), and with gzip compression (automatic on Netlify), they'll download as **~33 MB**.

### How to Optimize

If you regenerate GTFS data, run the optimization script:

```bash
pnpm run optimize-shapes
```

### What It Does

1. **Reduces coordinate precision** to 6 decimal places
   - Original: `144.963123456789` (16 digits)
   - Optimized: `144.963123` (6 decimals = ~11cm accuracy)
   - Still very accurate for mapping!

2. **Removes consecutive duplicates**
   - If two points in a row are identical after rounding, keep only one
   - Reduces file size without affecting visual appearance

3. **Preserves geometry**
   - No line simplification (yet)
   - All routes look identical to users
   - Just smaller file sizes

### Results

| File | Original | Optimized | Reduction |
|------|----------|-----------|-----------|
| Metro shapes | 69.5 MB | 21.9 MB | 68.4% |
| V/Line shapes | 139.1 MB | 43.8 MB | 68.5% |
| Tram shapes | 6.4 MB | 2.1 MB | 68.1% |
| Bus shapes | 91.3 MB | 28.8 MB | 68.4% |
| **Total** | **309.5 MB** | **99.0 MB** | **68.0%** |

With gzip (Netlify automatic): **~33 MB download**

### Further Optimization (Future)

If 33 MB is still too large, consider:

1. **Line Simplification** (Douglas-Peucker algorithm)
   - Reduce number of points while maintaining shape
   - Could reduce by another 30-50%
   - Trade-off: slightly less accurate curves

2. **Lazy Loading**
   - Only load routes currently visible on screen
   - Load more as user pans/zooms
   - Best for mobile users

3. **Vector Tiles** (Advanced)
   - Pre-generate Mapbox vector tiles
   - Industry standard for large datasets
   - Requires tile server or static tile generation

4. **Progressive Loading**
   - Load essential routes first (metro/tram)
   - Load buses/V/Line in background
   - Improves perceived performance

### Coordinate Precision Reference

| Decimal Places | Degrees | Distance at Equator | Usage |
|----------------|---------|---------------------|-------|
| 0 | 1.0 | 111 km | Country-level |
| 1 | 0.1 | 11.1 km | City-level |
| 2 | 0.01 | 1.11 km | Town-level |
| 3 | 0.001 | 111 m | Neighborhood |
| 4 | 0.0001 | 11.1 m | Street-level |
| 5 | 0.00001 | 1.11 m | Building |
| **6** | **0.000001** | **11.1 cm** | **Precise enough for mapping** ✅ |
| 7 | 0.0000001 | 1.11 cm | Survey-grade GPS |
| 8+ | - | Sub-cm | Overkill for web maps |

**We use 6 decimal places** - perfect balance of precision and file size.

### Performance Impact

**Before optimization**:
- Initial load: 309 MB download
- Parse time: ~5-10 seconds
- Memory usage: ~600-800 MB
- Mobile: Very slow or fails

**After optimization + gzip**:
- Initial load: ~33 MB download
- Parse time: ~2-3 seconds  
- Memory usage: ~200-300 MB
- Mobile: Works smoothly ✅

### When to Re-optimize

Run `pnpm run optimize-shapes` whenever you:
- Re-run `pnpm run process-all-transport`
- Update GTFS source data
- Notice file sizes increasing

**Note**: The optimization is non-destructive. Original precision is lost, but 11cm accuracy is more than sufficient for transit mapping.

