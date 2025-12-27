import * as satellite from 'satellite.js';

export const EARTH_RADIUS = 6371; // km

/**
 * Propagates a satellite's position at a given time.
 * @param {string} tle1 
 * @param {string} tle2 
 * @param {Date} time 
 * @returns {Object|null} ECI coordinates and velocity
 */
export const propagateSatellite = (tle1, tle2, time) => {
    try {
        const satrec = satellite.twoline2satrec(tle1, tle2);
        const positionAndVelocity = satellite.propagate(satrec, time);

        if (!positionAndVelocity.position) return null;

        return positionAndVelocity;
    } catch (error) {
        // console.error("Propagation error:", error);
        return null;
    }
};

/**
 * Converts ECI coordinates to ECEF (Earth-Centered Earth-Fixed).
 */
export const eciToEcef = (eciPos, time) => {
    const gmst = satellite.gstime(time);
    return satellite.eciToEcf(eciPos, gmst);
};

/**
 * Converts ECEF to Geodetic (Lat, Lon, Alt).
 */
export const ecefToGeodetic = (ecfPos, time) => {
    const gmst = satellite.gstime(time);
    return satellite.eciToGeodetic(ecfPos, gmst);
};

export const radToDeg = (rad) => (rad * 180) / Math.PI;

export const formatCoords = (geodetic) => {
    if (!geodetic) return { lat: '0', lon: '0', alt: '0' };
    return {
        lat: radToDeg(geodetic.latitude).toFixed(4),
        lon: radToDeg(geodetic.longitude).toFixed(4),
        alt: geodetic.height.toFixed(2)
    };
};

/**
 * Calculates the orbital period in minutes from TLE.
 */
export const getOrbitalPeriod = (tle2) => {
    if (!tle2) return 100;
    const meanMotion = parseFloat(tle2.substring(52, 63));
    if (isNaN(meanMotion) || meanMotion === 0) return 100;
    return (24 * 60) / meanMotion;
};

/**
 * Extracts advanced stats and IDs from TLE.
 */
export const getSatelliteStats = (tle1, tle2, time = new Date()) => {
    try {
        const satrec = satellite.twoline2satrec(tle1, tle2);
        const pv = satellite.propagate(satrec, time);

        // 1. Velocity (km/s)
        let velocity = 0;
        if (pv.velocity) {
            velocity = Math.sqrt(
                Math.pow(pv.velocity.x, 2) +
                Math.pow(pv.velocity.y, 2) +
                Math.pow(pv.velocity.z, 2)
            );
        }

        // 2. Apogee/Perigee (km)
        // a = (mu / n^2)^(1/3)
        // mu = 398600.4418 km^3/s^2
        // n = mean motion (rev/day) -> rad/s
        const n = parseFloat(tle2.substring(52, 63)) * (2 * Math.PI) / 86400; // rad/s
        const e = parseFloat("0." + tle2.substring(34, 42).trim()); // eccentricity
        const mu = 398600.4418;

        const a = Math.pow(mu / Math.pow(n, 2), 1 / 3);
        const perigee = (a * (1 - e)) - EARTH_RADIUS;
        const apogee = (a * (1 + e)) - EARTH_RADIUS;

        // 3. IDs
        const noradId = tle2.substring(2, 7).trim();
        const intlId = tle1.substring(9, 17).trim();

        return {
            velocity: velocity.toFixed(3),
            apogee: apogee.toFixed(2),
            perigee: perigee.toFixed(2),
            noradId,
            intlId,
            period: getOrbitalPeriod(tle2).toFixed(2)
        };
    } catch (e) {
        return null;
    }
};
