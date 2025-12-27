import { useState, useEffect } from 'react';
import * as satellite from 'satellite.js';

const CACHE_KEY = 'st-model-sat-data-v7';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
const FETCH_TIMEOUT = 5000;

const GROUP_MAP = [
    { key: 'stations', label: 'STATION' },
    { key: 'starlink', label: 'PAYLOAD' },
    { key: 'oneweb', label: 'PAYLOAD' },
    { key: 'iridium-NEXT', label: 'PAYLOAD' },
    { key: 'gps-ops', label: 'PAYLOAD' },
    { key: 'glo-ops', label: 'PAYLOAD' },
    { key: 'beidou', label: 'PAYLOAD' },
    { key: 'galileo', label: 'PAYLOAD' },
    { key: 'planet', label: 'PAYLOAD' },
    { key: 'spire', label: 'PAYLOAD' },
    { key: 'weather', label: 'PAYLOAD' },
    { key: 'noaa', label: 'PAYLOAD' },
    { key: 'goes', label: 'PAYLOAD' },
    { key: 'resource', label: 'PAYLOAD' },
    { key: 'science', label: 'PAYLOAD' },
    { key: 'active', label: 'PAYLOAD' },
    { key: 'cosmos-1408-debris', label: 'DEBRIS' },
    { key: 'fengyun-1c-debris', label: 'DEBRIS' },
    { key: 'iridium-33-debris', label: 'DEBRIS' },
    { key: 'cosmos-2251-debris', label: 'DEBRIS' }
];

export const useSatelliteData = () => {
    const [satellites, setSatellites] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [status, setStatus] = useState('SYNCING...');

    const validateTLEChecksum = (line) => {
        if (!line || line.length < 69) return false;
        const check = line[68];
        let sum = 0;
        for (let i = 0; i < 68; i++) {
            const char = line[i];
            if (char >= '0' && char <= '9') sum += parseInt(char);
            else if (char === '-') sum += 1;
        }
        return (sum % 10) === parseInt(check);
    };

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const CACHE_KEYS = [CACHE_KEY, 'st-model-sat-data-v6', 'st-model-sat-data-v5'];
                let cachedData = null;
                let cacheTimestamp = null;
                let usedKey = null;

                for (const key of CACHE_KEYS) {
                    const raw = localStorage.getItem(key);
                    if (raw) {
                        try {
                            const parsed = JSON.parse(raw);
                            if (parsed.data?.length > 0) {
                                // Check cache age (24 hours = 86400000ms)
                                const age = Date.now() - (parsed.timestamp || 0);
                                if (age < CACHE_EXPIRY) {
                                    cachedData = parsed.data;
                                    cacheTimestamp = parsed.timestamp;
                                    usedKey = key;
                                    break;
                                } else {
                                    console.log(`[SYNC] Cache expired (${Math.round(age / 3600000)}h old). Fetching fresh data.`);
                                }
                            }
                        } catch (e) { }
                    }
                }

                if (usedKey && usedKey !== CACHE_KEY) {
                    console.log(`[SYNC] Legacy cache found (${usedKey}). Using as failover backup.`);
                }

                // If valid cache exists, use it immediately and skip network fetch
                if (cachedData && cacheTimestamp) {
                    console.log(`[SYNC] Using cached data (${cachedData.length} satellites, age: ${Math.round((Date.now() - cacheTimestamp) / 3600000)}h)`);
                    const restored = cachedData.map(s => {
                        const sat = Array.isArray(s) ? { name: s[0], tle1: s[1], tle2: s[2], category: s[3], id: s[4] } : s;
                        return { ...sat, satrec: satellite.twoline2satrec(sat.tle1, sat.tle2) };
                    });
                    setSatellites(restored);
                    setStatus('SYSTEM: ACTIVE (CACHED)');
                    setLoading(false);
                    return;
                }

                const fetchWithFallback = async (group) => {
                    const targets = [
                        `/api-celestrak/NORAD/elements/gp.php?GROUP=${group.key}&FORMAT=TLE`,
                        `/api-celestrak/NORAD/elements/${group.key}.txt`
                    ];

                    for (const url of targets) {
                        const controller = new AbortController();
                        const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
                        try {
                            const response = await fetch(url, { signal: controller.signal });
                            clearTimeout(id);
                            if (response.ok) {
                                const text = await response.text();
                                if (text && text.length > 50) {
                                    const sats = parseBulkTLE(text, group.label);
                                    if (sats.length > 0) return sats;
                                }
                            }
                        } catch (e) {
                            clearTimeout(id);
                        }
                    }
                    return null;
                };

                const parseSingleTLE = (name, tle1, tle2, categoryLabel) => {
                    if (!validateTLEChecksum(tle1) || !validateTLEChecksum(tle2)) return null;
                    const noradId = tle2.substring(2, 7).trim();
                    let category = 'PAYLOAD';
                    if (categoryLabel === 'STATION' || name.includes('ISS') || name.includes('CSS') || name.includes('TIANGONG')) {
                        category = 'STATION';
                    } else if (categoryLabel === 'DEBRIS' || name.includes('DEB') || name.includes('R/B')) {
                        category = 'DEBRIS';
                    }

                    try {
                        return {
                            name: name.trim(),
                            tle1: tle1.trim(),
                            tle2: tle2.trim(),
                            id: noradId,
                            category,
                            isVisible: true,
                            satrec: satellite.twoline2satrec(tle1, tle2)
                        };
                    } catch (e) { return null; }
                };

                const parseBulkTLE = (text, categoryLabel) => {
                    const lines = text.trim().split(/\r?\n/);
                    const sats = [];
                    for (let i = 0; i < lines.length; i += 3) {
                        if (i + 2 >= lines.length) break;
                        const sat = parseSingleTLE(lines[i], lines[i + 1], lines[i + 2], categoryLabel);
                        if (sat) sats.push(sat);
                    }
                    return sats;
                };

                setStatus('SYNCING...');
                let masterList = [];
                const seenIds = new Set();

                const processGroup = async (group) => {
                    const groupSats = await fetchWithFallback(group);
                    if (groupSats && groupSats.length > 0) {
                        const uniqueInGroup = groupSats.filter(s => {
                            if (seenIds.has(s.id)) return false;
                            seenIds.add(s.id);
                            return true;
                        });

                        masterList = [...masterList, ...uniqueInGroup];
                        setSatellites(prev => [...prev, ...uniqueInGroup]);
                    }
                };

                await Promise.all(GROUP_MAP.map(processGroup));

                // ATOMIC CACHE WRITE: Only write complete dataset after all groups succeed
                if (masterList.length > 0) {
                    try {
                        const cachePayload = masterList.map(({ satrec, ...rest }) => rest);
                        localStorage.setItem(CACHE_KEY, JSON.stringify({
                            data: cachePayload,
                            timestamp: Date.now()
                        }));
                        console.log(`[SYNC] Cached ${masterList.length} satellites successfully.`);
                    } catch (e) {
                        console.warn('[SYNC] Failed to write cache:', e);
                    }
                    setStatus('SYSTEM: ACTIVE');
                    setLoading(false);
                } else {
                    // Network fetch failed completely
                    if (cachedData) {
                        console.warn("[SYNC] All network tiers failed. Falling back to stale cached data.");
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
                setLoading(false);
            }
        };

        fetchAll();
    }, []);

    return { satellites, loading, error, status };
};
