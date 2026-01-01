import fs from 'fs';
import path from 'path';

const CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
const CACHE_FILE = path.join('/tmp', 'satellite-data-cache.json');

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

const parseSingleTLE = (name, tle1, tle2, categoryLabel) => {
    if (!validateTLEChecksum(tle1) || !validateTLEChecksum(tle2)) return null;
    const noradId = tle2.substring(2, 7).trim();
    let category = 'PAYLOAD';
    if (categoryLabel === 'STATION' || name.includes('ISS') || name.includes('CSS') || name.includes('TIANGONG')) {
        category = 'STATION';
    } else if (categoryLabel === 'DEBRIS' || name.includes('DEB') || name.includes('R/B')) {
        category = 'DEBRIS';
    }

    return {
        name: name.trim(),
        tle1: tle1.trim(),
        tle2: tle2.trim(),
        id: noradId,
        category
    };
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

const fetchGroupData = async (group) => {
    const urls = [
        `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group.key}&FORMAT=TLE`,
        `https://celestrak.org/NORAD/elements/${group.key}.txt`
    ];

    for (const url of urls) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Space-Traffic-Model/1.0'
                }
            });

            clearTimeout(timeout);

            if (response.ok) {
                const text = await response.text();
                if (text && text.length > 50) {
                    const sats = parseBulkTLE(text, group.label);
                    if (sats.length > 0) {
                        console.log(`[API] Fetched ${sats.length} satellites from ${group.key}`);
                        return sats;
                    }
                }
            }
        } catch (error) {
            console.error(`[API] Error fetching ${group.key}:`, error.message);
        }
    }
    return [];
};

const loadCache = () => {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            const age = Date.now() - cacheData.timestamp;

            if (age < CACHE_DURATION) {
                console.log(`[API] Cache hit - age: ${Math.round(age / 3600000)}h, satellites: ${cacheData.data.length}`);
                return cacheData;
            } else {
                console.log(`[API] Cache expired - age: ${Math.round(age / 3600000)}h`);
            }
        }
    } catch (error) {
        console.error('[API] Cache read error:', error.message);
    }
    return null;
};

const saveCache = (data) => {
    try {
        const cacheData = {
            data,
            timestamp: Date.now()
        };
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData), 'utf8');
        console.log(`[API] Cached ${data.length} satellites`);
    } catch (error) {
        console.error('[API] Cache write error:', error.message);
    }
};

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Check cache first
        const cached = loadCache();
        if (cached) {
            return res.status(200).json({
                satellites: cached.data,
                cached: true,
                timestamp: cached.timestamp,
                age: Date.now() - cached.timestamp
            });
        }

        // Fetch fresh data
        console.log('[API] Fetching fresh satellite data...');
        const allSatellites = [];
        const seenIds = new Set();

        // Fetch all groups in parallel
        const results = await Promise.all(GROUP_MAP.map(group => fetchGroupData(group)));

        // Deduplicate satellites
        for (const groupSats of results) {
            for (const sat of groupSats) {
                if (!seenIds.has(sat.id)) {
                    seenIds.add(sat.id);
                    allSatellites.push(sat);
                }
            }
        }

        if (allSatellites.length === 0) {
            return res.status(503).json({
                error: 'Failed to fetch satellite data from all sources',
                satellites: [],
                cached: false
            });
        }

        // Save to cache
        saveCache(allSatellites);

        return res.status(200).json({
            satellites: allSatellites,
            cached: false,
            timestamp: Date.now(),
            count: allSatellites.length
        });

    } catch (error) {
        console.error('[API] Handler error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
}
