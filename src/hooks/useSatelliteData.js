import { useState, useEffect } from 'react';
import * as satellite from 'satellite.js';

const CACHE_KEY = 'st-model-sat-data-v7';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

export const useSatelliteData = () => {
    const [satellites, setSatellites] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [status, setStatus] = useState('SYNCING...');

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const CACHE_KEYS = [CACHE_KEY, 'st-model-sat-data-v6', 'st-model-sat-data-v5'];
                let cachedData = null;
                let cacheTimestamp = null;
                let usedKey = null;

                // Check localStorage cache first
                for (const key of CACHE_KEYS) {
                    const raw = localStorage.getItem(key);
                    if (raw) {
                        try {
                            const parsed = JSON.parse(raw);
                            if (parsed.data?.length > 0) {
                                const age = Date.now() - (parsed.timestamp || 0);
                                if (age < CACHE_EXPIRY) {
                                    cachedData = parsed.data;
                                    cacheTimestamp = parsed.timestamp;
                                    usedKey = key;
                                    break;
                                } else {
                                    console.log(`[SYNC] Local cache expired (${Math.round(age / 3600000)}h old).`);
                                }
                            }
                        } catch (e) { }
                    }
                }

                if (usedKey && usedKey !== CACHE_KEY) {
                    console.log(`[SYNC] Legacy cache found (${usedKey}). Using as failover backup.`);
                }

                // If valid localStorage cache exists, use it immediately
                if (cachedData && cacheTimestamp) {
                    console.log(`[SYNC] Using local cached data (${cachedData.length} satellites, age: ${Math.round((Date.now() - cacheTimestamp) / 3600000)}h)`);
                    const restored = cachedData.map(s => {
                        const sat = Array.isArray(s) ? { name: s[0], tle1: s[1], tle2: s[2], category: s[3], id: s[4] } : s;
                        return { ...sat, satrec: satellite.twoline2satrec(sat.tle1, sat.tle2) };
                    });
                    setSatellites(restored);
                    setStatus('SYSTEM: ACTIVE (CACHED)');
                    setLoading(false);
                    return;
                }

                // Fetch from serverless API
                setStatus('SYNCING...');
                console.log('[SYNC] Fetching from serverless API...');

                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 60000); // 60 second timeout

                try {
                    const response = await fetch('/api/satellites', {
                        signal: controller.signal
                    });
                    clearTimeout(timeout);

                    if (!response.ok) {
                        throw new Error(`API returned ${response.status}`);
                    }

                    const result = await response.json();

                    if (result.satellites && result.satellites.length > 0) {
                        const satelliteData = result.satellites;
                        console.log(`[SYNC] Received ${satelliteData.length} satellites from API (${result.cached ? 'server-cached' : 'fresh'})`);

                        // Add satrec to each satellite
                        const processedSatellites = satelliteData.map(sat => ({
                            ...sat,
                            isVisible: true,
                            satrec: satellite.twoline2satrec(sat.tle1, sat.tle2)
                        }));

                        setSatellites(processedSatellites);

                        // Save to localStorage
                        try {
                            const cachePayload = satelliteData.map(({ satrec, ...rest }) => rest);
                            localStorage.setItem(CACHE_KEY, JSON.stringify({
                                data: cachePayload,
                                timestamp: Date.now()
                            }));
                            console.log(`[SYNC] Cached ${satelliteData.length} satellites to localStorage`);
                        } catch (e) {
                            console.warn('[SYNC] Failed to write localStorage cache:', e);
                        }

                        setStatus('SYSTEM: ACTIVE');
                        setLoading(false);
                    } else {
                        throw new Error('No satellite data received from API');
                    }
                } catch (fetchError) {
                    clearTimeout(timeout);
                    console.error('[SYNC] API fetch failed:', fetchError);

                    // Fallback to stale localStorage cache if available
                    if (cachedData) {
                        console.warn('[SYNC] Using stale local cache as fallback');
                        const restored = cachedData.map(s => {
                            const sat = Array.isArray(s) ? { name: s[0], tle1: s[1], tle2: s[2], category: s[3], id: s[4] } : s;
                            return { ...sat, satrec: satellite.twoline2satrec(sat.tle1, sat.tle2) };
                        });
                        setSatellites(restored);
                        setStatus('SYSTEM: OFFLINE (CACHED)');
                        setLoading(false);
                    } else {
                        setError('Failed to load satellite data');
                        setStatus('SYSTEM: ERROR');
                        setLoading(false);
                    }
                }
            } catch (err) {
                console.error("Data Error:", err);
                setError(err.message);
                setStatus('SYSTEM: ERROR');
                setLoading(false);
            }
        };

        fetchAll();
    }, []);

    return { satellites, loading, error, status };
};
