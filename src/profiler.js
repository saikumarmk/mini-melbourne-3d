/**
 * Performance profiler for identifying bottlenecks
 * Tracks execution time of critical functions
 */
class Profiler {
    constructor() {
        this.timings = {};
        this.enabled = true;
    }

    /**
     * Start timing a function
     * @param {string} name - Function name to profile
     */
    start(name) {
        if (!this.enabled) return;
        
        if (!this.timings[name]) {
            this.timings[name] = {
                count: 0,
                total: 0,
                min: Infinity,
                max: 0,
                avg: 0,
                recent: []
            };
        }
        
        this.timings[name]._start = performance.now();
    }

    /**
     * End timing a function
     * @param {string} name - Function name to profile
     */
    end(name) {
        if (!this.enabled || !this.timings[name]) return;
        
        const duration = performance.now() - this.timings[name]._start;
        const timing = this.timings[name];
        
        timing.count++;
        timing.total += duration;
        timing.min = Math.min(timing.min, duration);
        timing.max = Math.max(timing.max, duration);
        timing.avg = timing.total / timing.count;
        
        // Keep last 100 samples for trend analysis
        timing.recent.push(duration);
        if (timing.recent.length > 100) {
            timing.recent.shift();
        }
        
        delete timing._start;
    }

    /**
     * Get statistics for all profiled functions
     * @returns {Object} Statistics object
     */
    getStats() {
        const stats = {};
        
        for (const name in this.timings) {
            const timing = this.timings[name];
            stats[name] = {
                count: timing.count,
                total: timing.total,
                min: timing.min,
                max: timing.max,
                avg: timing.avg,
                recentAvg: timing.recent.length > 0 
                    ? timing.recent.reduce((a, b) => a + b, 0) / timing.recent.length 
                    : 0
            };
        }
        
        return stats;
    }

    /**
     * Log statistics to console
     * @param {number} minAvg - Minimum average time to log (default: 0)
     */
    log(minAvg = 0) {
        console.group('🔍 Performance Profile');
        
        const stats = this.getStats();
        const sorted = Object.entries(stats)
            .filter(([_, s]) => s.avg >= minAvg)
            .sort((a, b) => b[1].avg - a[1].avg);
        
        for (const [name, stat] of sorted) {
            console.group(`📊 ${name}`);
            console.log(`Calls: ${stat.count}`);
            console.log(`Avg: ${stat.avg.toFixed(2)}ms`);
            console.log(`Recent Avg: ${stat.recentAvg.toFixed(2)}ms`);
            console.log(`Min: ${stat.min.toFixed(2)}ms`);
            console.log(`Max: ${stat.max.toFixed(2)}ms`);
            console.log(`Total: ${stat.total.toFixed(2)}ms`);
            console.groupEnd();
        }
        
        console.groupEnd();
    }

    /**
     * Reset all statistics
     */
    reset() {
        this.timings = {};
    }

    /**
     * Enable/disable profiling
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
        this.enabled = enabled;
    }
}

export default Profiler;

