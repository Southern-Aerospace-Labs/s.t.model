import React, { useState, useEffect, useRef, memo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Search, Info, Clock, RotateCcw, Play, Pause, Check } from 'lucide-react';
import * as THREE from 'three';
import Earth from './components/Earth';
import Satellite from './components/Satellite';
import SatellitesInstanced from './components/SatellitesInstanced';
import CameraController from './components/CameraController';
import LoadingScreen from './components/LoadingScreen';
import NavControls from './components/NavControls';
import { useSatelliteData } from './hooks/useSatelliteData';
import { propagateSatellite, eciToEcef, ecefToGeodetic, formatCoords, getOrbitalPeriod, getSatelliteStats } from './services/propagation';
import { SIM_STATE } from './services/simulationState';

// High-performance time storage is now in services/simulationState.js

const SunLight = () => {
  const lightRef = useRef();
  useFrame(() => {
    if (lightRef.current) {
      const date = new Date(SIM_STATE.simTime);
      // ECI Frame: Sun moves ~1 degree per day (Annual orbit), not per hour
      // Calculate approximate Right Ascension (RA) of Sun based on day of year
      const start = new Date(date.getUTCFullYear(), 0, 0);
      const diff = date - start;
      const oneDay = 1000 * 60 * 60 * 24;
      const dayOfYear = diff / oneDay;

      // Vernal Equinox (~March 20, Day 79) is RA 0 (Angle 0)
      // We adjust phase so Day 79 ~= 0 radians
      // OFFSET: Adding Math.PI (180 deg) because the Earth texture/rotation vs Sun seems flipped 180 degrees
      // (Fixes "America Midday when it should be Night" issue)
      const angle = ((dayOfYear - 79) / 365.25) * Math.PI * 2 + Math.PI;

      // Distance far enough to be directional
      const distance = 100;
      lightRef.current.position.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
    }
  });
  return (
    <>
      <directionalLight ref={lightRef} intensity={5.5} />
      <hemisphereLight intensity={0.8} groundColor="#000000" color="#ffffff" />
    </>
  );
};

const SimulationManager = () => {
  useFrame((state, delta) => {
    const now = Date.now();
    SIM_STATE.realTime = now;
    if (!SIM_STATE.paused) {
      SIM_STATE.simTime += delta * 1000 * SIM_STATE.speed;
    }
  });
  return null;
};

// UI component that only updates once in a while
const ClockDisplay = () => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <Clock size={12} color="#fff" />
        <span style={{ color: '#666', fontSize: '12px' }}>REAL:</span>
        <span style={{ fontSize: '12px' }}>{new Date(SIM_STATE.realTime).toLocaleTimeString()}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Clock size={12} color="#ED1C2E" />
        <span style={{ color: '#666', fontSize: '12px' }}>MODEL:</span>
        <span style={{ color: '#ED1C2E', fontSize: '12px' }}>{new Date(SIM_STATE.simTime).toLocaleTimeString()}</span>
      </div>
    </div>
  );
};

// Extracted Historical Panel Component
const HistoricalPanel = memo(({ selectedSat }) => {
  const [historyDate, setHistoryDate] = useState('');
  const [historicalTLE, setHistoricalTLE] = useState(null);
  const [fetchingHistory, setFetchingHistory] = useState(false);

  // Reset when satellite changes
  useEffect(() => {
    setHistoricalTLE(null);
    setHistoryDate('');
  }, [selectedSat?.id]);

  const extractNoradId = (sat) => {
    if (sat.tle2 && sat.tle2.length > 7) {
      return sat.tle2.substring(2, 7).trim();
    }
    return sat.id.split('-')[0];
  };

  const cleanTLE = (text) => {
    const lines = text.trim().split('\n').filter(l => l.trim().length > 0);
    // User requested full data, removing slice(0, 3) which limited to 1 entry
    return lines.join('\n');
  };

  const fetchHistory = async (date) => {
    if (!selectedSat || !date) return;
    setFetchingHistory(true);
    setHistoricalTLE(null);

    const noradId = extractNoradId(selectedSat);
    const start = `${date}`;
    const end = `${date}`;
    const primaryUrl = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${noradId}&START=${start}&STOP=${end}&FORMAT=TLE`;

    try {
      const res = await fetch(primaryUrl);
      if (res.ok) {
        const text = await res.text();
        if (text && !text.includes('No GP data found')) {
          setHistoricalTLE(`SOURCE: CELESTRAK\n${cleanTLE(text)}`);
          setFetchingHistory(false);
          return;
        }
      }
    } catch (e) {
      console.warn('CelesTrak history failed:', e);
    }

    try {
      setHistoricalTLE("BACKUP SOURCE (SATCAT): NO PUBLIC HISTORY AVAILABLE");
    } catch (e) {
      setHistoricalTLE("ERROR FETCHING HISTORY");
    }
    setFetchingHistory(false);
  };

  if (!selectedSat) return null;

  return (
    <div className="border-animate" style={{ borderTopColor: '#111', marginTop: '10px', paddingTop: '10px', width: '100%', borderTopWidth: '1px', borderTopStyle: 'solid', animationDelay: '0.5s' }}>
      <div className="reveal-mask"><div className="reveal-item stagger-10" style={{ color: '#666', fontSize: '10px', marginBottom: '4px' }}>HISTORICAL DATA</div></div>

      <div className="reveal-mask">
        <div className="reveal-item stagger-11">
          <input
            type="date"
            value={historyDate}
            onChange={(e) => {
              setHistoryDate(e.target.value);
              fetchHistory(e.target.value);
            }}
            style={{
              background: 'none',
              border: '1px solid #333',
              color: '#fff',
              fontSize: '10px',
              fontFamily: 'Unbounded',
              padding: '6px',
              borderRadius: '4px',
              width: 'calc(100% - 14px)',
              marginBottom: '6px',
              cursor: 'pointer'
            }}
          />
        </div>
      </div>

      {fetchingHistory && <div className="reveal-mask"><div className="reveal-item stagger-6" style={{ color: '#888', fontStyle: 'italic', fontSize: '10px' }}>Querying archives...</div></div>}

      {historicalTLE && (
        <div className="fade-in" style={{ position: 'relative', marginTop: '5px' }}>
          <div
            style={{
              border: '1px solid #333',
              borderRadius: '4px',
              position: 'relative',
              padding: '10px',
              background: 'none'
            }}
          >
            <pre style={{
              fontSize: '10px',
              overflowX: 'auto',
              color: '#fff',
              fontFamily: 'monospace',
              margin: 0,
              whiteSpace: 'pre' // prevent wrapping
            }}>
              {historicalTLE.split('\n').map((line, i) => (
                <div key={i} className="reveal-mask" style={{ width: 'fit-content' }}>
                  {/* Stagger each line: stagger-1 is too fast, lets start from 5 and go up */}
                  <div className={`reveal-item stagger-${Math.min(i + 3, 10)}`} style={{ minHeight: '12px' }}>
                    {line}
                  </div>
                </div>
              ))}
            </pre>

            <div className="reveal-mask" style={{ position: 'absolute', top: '4px', right: '4px' }}>
              <div className="reveal-item stagger-8">
                <button
                  className="btn-interactive"
                  onClick={() => navigator.clipboard.writeText(historicalTLE.split('\n').slice(1).join('\n'))}
                  style={{
                    background: '#222',
                    border: '1px solid #333',
                    color: '#fff',
                    fontSize: '10px',
                    borderRadius: '2px',
                    fontFamily: 'Unbounded',
                    padding: '4px 8px',
                  }}
                >
                  COPY
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

const TelemetryPanel = memo(({ selectedSatId, satellites }) => {
  const [telemetry, setTelemetry] = useState(null);
  const selectedSat = satellites.find(s => s.id === selectedSatId);

  // Reset history when satellite changes
  useEffect(() => {
    if (!selectedSat) {
      setTelemetry(null);
      return;
    }
    const interval = setInterval(() => {
      const pv = propagateSatellite(selectedSat.tle1, selectedSat.tle2, new Date(SIM_STATE.simTime));
      const stats = getSatelliteStats(selectedSat.tle1, selectedSat.tle2, new Date(SIM_STATE.simTime));
      if (pv && stats) {
        const ecf = eciToEcef(pv.position, new Date(SIM_STATE.simTime));
        const geo = ecefToGeodetic(ecf, new Date(SIM_STATE.simTime));
        setTelemetry({
          ...formatCoords(geo),
          ...stats,
          eci: pv.position,
          category: selectedSat.category,
          noradId: extractNoradId(selectedSat)
        });
      }
    }, 500);
    return () => clearInterval(interval);
  }, [selectedSatId, satellites]);

  const extractNoradId = (sat) => {
    // Helper to try and pull NORAD ID from TLE line 2 or ID field
    // Standard TLE: Line 2 chars 2-7
    if (sat.tle2 && sat.tle2.length > 7) {
      return sat.tle2.substring(2, 7).trim();
    }
    return sat.id.split('-')[0];
  };

  const formatIntlId = (rawId) => {
    if (!rawId) return 'N/A';
    // Expands YYNNNPPP -> YYYY-NNNPPP (e.g. 98067A -> 1998-067A)
    const yy = parseInt(rawId.substring(0, 2), 10);
    if (!isNaN(yy)) {
      const fullYear = yy >= 57 ? 1900 + yy : 2000 + yy;
      const rest = rawId.substring(2);
      return `${fullYear}-${rest}`;
    }
    return rawId;
  };

  if (!selectedSat || !telemetry) return null;

  return (
    <div className="telemetry border-animate" style={{ marginTop: '5px', paddingTop: '10px', borderTopWidth: '1px', borderTopStyle: 'solid' }}>
      <div className="reveal-mask" style={{ marginBottom: '10px' }}>
        <div className="reveal-item stagger-1" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Info size={12} color="#ED1C2E" />
          <h3 style={{ color: '#ED1C2E', fontSize: '11px', margin: 0 }}>TELEMETRY</h3>
        </div>
      </div>

      <div style={{ fontSize: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div className="reveal-mask"><div className="reveal-item stagger-2" style={{ fontWeight: 700, fontSize: '12px' }}>{selectedSat.name}</div></div>
        <div className="reveal-mask"><div className="reveal-item stagger-2" style={{ color: '#888', fontSize: '10px' }}>NORAD ID: {telemetry.noradId}</div></div>
        <div className="reveal-mask"><div className="reveal-item stagger-2" style={{ color: '#888', fontSize: '10px' }}>COSPAR ID: {formatIntlId(telemetry.intlId)}</div></div>

        <div style={{ marginTop: '5px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div>
            <div className="reveal-mask"><div className="reveal-item stagger-3" style={{ color: '#888', fontSize: '10px' }}>LATITUDE</div></div>
            <div className="reveal-mask"><div className="reveal-item stagger-3" style={{ fontSize: '12px' }}>{telemetry.lat}°</div></div>
          </div>
          <div>
            <div className="reveal-mask"><div className="reveal-item stagger-3" style={{ color: '#888', fontSize: '10px' }}>LONGITUDE</div></div>
            <div className="reveal-mask"><div className="reveal-item stagger-3" style={{ fontSize: '12px' }}>{telemetry.lon}°</div></div>
          </div>
          <div>
            <div className="reveal-mask"><div className="reveal-item stagger-4" style={{ color: '#888', fontSize: '10px' }}>ALTITUDE</div></div>
            <div className="reveal-mask"><div className="reveal-item stagger-4" style={{ fontSize: '12px' }}>{telemetry.alt} km</div></div>
          </div>
          <div>
            <div className="reveal-mask"><div className="reveal-item stagger-4" style={{ color: '#888', fontSize: '10px' }}>VELOCITY</div></div>
            <div className="reveal-mask"><div className="reveal-item stagger-4" style={{ fontSize: '12px' }}>{telemetry.velocity} km/s</div></div>
          </div>
          <div>
            <div className="reveal-mask"><div className="reveal-item stagger-5" style={{ color: '#888', fontSize: '10px' }}>APOGEE</div></div>
            <div className="reveal-mask"><div className="reveal-item stagger-5" style={{ fontSize: '12px' }}>{telemetry.apogee} km</div></div>
          </div>
          <div>
            <div className="reveal-mask"><div className="reveal-item stagger-5" style={{ color: '#888', fontSize: '12px' }}>PERIGEE</div></div>
            <div className="reveal-mask"><div className="reveal-item stagger-5" style={{ fontSize: '12px' }}>{telemetry.perigee} km</div></div>
          </div>
          <div>
            <div className="reveal-mask"><div className="reveal-item stagger-6" style={{ color: '#888', fontSize: '10px' }}>PERIOD</div></div>
            <div className="reveal-mask"><div className="reveal-item stagger-6" style={{ fontSize: '12px' }}>{telemetry.period} min</div></div>
          </div>
        </div>
      </div>
    </div>
  );
});

function App() {
  const { satellites, loading, error, status } = useSatelliteData();
  const [selectedSatId, setSelectedSatId] = useState(null);
  const [hoveredSatId, setHoveredSatId] = useState(null);
  const [deferredHoverId, setDeferredHoverId] = useState(null);

  useEffect(() => {
    if (hoveredSatId) {
      setDeferredHoverId(hoveredSatId);
    } else {
      const timer = setTimeout(() => setDeferredHoverId(null), 350); // Keep alive for exit animation
      return () => clearTimeout(timer);
    }
  }, [hoveredSatId]);

  const [navMode, setNavMode] = useState('PAN'); // Default to PAN mode
  const [selectedSatPos, setSelectedSatPos] = useState(null);
  const [search, setSearch] = useState('');
  const [speed, setAppSpeed] = useState(1);
  const [paused, setAppPaused] = useState(false);
  const [showModeHint, setShowModeHint] = useState(false);
  const [modeHintExiting, setModeHintExiting] = useState(false);

  // Loading Screen State Management
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);
  const [isExiting, setIsExiting] = useState(false);
  const [animationComplete, setAnimationComplete] = useState(false);
  const [loadStartTime] = useState(Date.now());

  useEffect(() => {
    // Ensure loading screen shows for minimum 2 seconds for smooth UX
    const minDisplayTime = 2000;
    const elapsed = Date.now() - loadStartTime;
    const remainingTime = Math.max(0, minDisplayTime - elapsed);

    // Only exit when BOTH conditions met: data loaded AND animation complete AND minimum time elapsed
    if (!loading && animationComplete) {
      const exitTimer = setTimeout(() => {
        setIsExiting(true);
        // Wait for exit animation (500ms exit + buffer)
        const hideTimer = setTimeout(() => {
          setShowLoadingScreen(false);
        }, 800);
        return () => clearTimeout(hideTimer);
      }, remainingTime);
      return () => clearTimeout(exitTimer);
    }
  }, [loading, animationComplete, loadStartTime]);

  const [categoryFilters, setCategoryFilters] = useState({
    STATION: true,
    PAYLOAD: true,
    DEBRIS: true,
    ONLY_SELECTED: false
  });

  const toggleFilter = (cat) => {
    setCategoryFilters(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const setSpeed = (s) => {
    SIM_STATE.speed = s;
    setAppSpeed(s);
  };

  const setPaused = (p) => {
    SIM_STATE.paused = p;
    setAppPaused(p);
  };

  // Auto-switch to PAN mode after selecting a satellite
  const prevSelectedSatId = useRef(null);
  useEffect(() => {
    // Only auto-switch if a NEW satellite was selected (not on manual mode change)
    if (selectedSatId && selectedSatId !== prevSelectedSatId.current && navMode === 'SELECT') {
      setNavMode('PAN');
    }
    prevSelectedSatId.current = selectedSatId;
  }, [selectedSatId, navMode]);

  const resetToRealTime = () => {
    SIM_STATE.simTime = Date.now();
    setSpeed(1);
    setPaused(false);
  };

  const triggerZoom = (factor, reset = false) => {
    window.dispatchEvent(new CustomEvent('nav-zoom', { detail: { factor, reset } }));
  };

  // ONLY filter by search for the rendering list
  // The category filtering is now handled visually via opacity
  const filteredSats = satellites.filter(s => {
    if (search.trim()) {
      const query = search.toLowerCase();

      // Basic checks
      const nameMatch = s.name.toLowerCase().includes(query);
      const idMatch = s.id.toLowerCase().includes(query);

      // Advanced TLE checks (on-the-fly extract)
      let noradMatch = false;
      let intlMatch = false;
      const cleanQuery = query.replace(/[-\s]/g, '');

      if (s.tle2 && s.tle2.length > 7) {
        // Standard TLE Line 2 NORAD ID is cols 2-7
        const noradId = s.tle2.substring(2, 7).trim();
        if (noradId.includes(query)) noradMatch = true;
        if (noradId.includes(cleanQuery)) noradMatch = true;
      }

      if (s.tle1 && s.tle1.length > 17) {
        // Standard TLE Line 1 Intl Designator is cols 9-17 (YYNNNPPP)
        const intlId = s.tle1.substring(9, 17).trim().toLowerCase();

        // 1. Direct match (e.g. searching "98067")
        if (intlId.includes(cleanQuery)) intlMatch = true;

        // 2. Year expansion (e.g. searching "1998-067")
        const yy = parseInt(intlId.substring(0, 2), 10);
        if (!isNaN(yy)) {
          // Standard TLE pivot: 57-99 = 19xx, 00-56 = 20xx
          const fullYear = yy >= 57 ? 1900 + yy : 2000 + yy;
          const rest = intlId.substring(2);
          const expandedId = `${fullYear}-${rest}`; // "1998-067a"

          if (expandedId.includes(query)) intlMatch = true;
        }
      }

      return nameMatch || idMatch || noradMatch || intlMatch;
    }
    return true;
  });

  const searchResults = search.trim() ? filteredSats.slice(0, 15) : [];

  return (
    <div className={`app-container ${!showLoadingScreen ? 'app-ready' : ''}`} style={{ width: '100%', height: '100vw', minHeight: '100vh', background: '#111', color: '#fff' }}>
      <NavControls
        activeMode={navMode}
        setMode={setNavMode}
        onZoomIn={() => triggerZoom(0.8)}
        onZoomOut={() => triggerZoom(1.25)}
        onResetZoom={() => triggerZoom(1.0, true)}
      />
      <div className="dashboard" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="reveal-mask">
            <div className="reveal-item stagger-1" style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ED1C2E' }}></div>
          </div>
          <div className="reveal-mask">
            <div className="reveal-item stagger-1">
              <h2 style={{ fontSize: '20px', margin: 0, fontWeight: '700', letterSpacing: '1px' }}>S.T.MODEL</h2>
            </div>
          </div>
        </div>

        {/* Search Component Container - No overflow hidden here */}
        <div style={{ position: 'relative', width: '100%', zIndex: 50 }}>
          {/* Animated Input Section */}
          <div className="reveal-mask">
            <div className="reveal-item stagger-2" style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '12px', top: '10px', color: '#666', zIndex: 2 }} />
              <input
                type="text"
                placeholder="FIND SATELLITE..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  boxSizing: 'border-box',
                  width: '100%',
                  background: '#222',
                  border: '1px solid #333',
                  color: '#fff',
                  padding: '8px 8px 8px 34px',
                  fontFamily: 'Unbounded',
                  fontSize: '10px',
                  borderRadius: '20px',
                  outline: 'none',
                  position: 'relative',
                  zIndex: 1
                }}
              />
            </div>
          </div>

          {/* Search Results - Outside mask, high z-index */}
          {search.trim() && (
            <div className="sat-list" style={{
              maxHeight: '40vh',
              overflowY: 'auto',
              background: '#111',
              border: '1px solid #333',
              borderTop: 'none',
              borderRadius: '0 0 6px 6px',
              position: 'absolute',
              top: '36px', // Explicitly below input
              left: '10px', // Align with input padding
              right: '10px',
              zIndex: 100,
              boxShadow: '0 4px 20px rgba(0,0,0,0.8)' // Stronger shadow for visibility
            }}>
              {searchResults.length > 0 ? (
                searchResults.map(sat => (
                  <div
                    key={sat.id}
                    className={`sat-item ${selectedSatId === sat.id ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedSatId(sat.id);
                      setSearch('');
                      setNavMode('PAN');
                    }}
                    style={{
                      borderBottom: '1px solid #333',
                      padding: '8px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      cursor: 'pointer'
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: '11px' }}>{sat.name}</span>
                    <span style={{ fontSize: '9px', color: '#888' }}>
                      NORAD: {sat.tle2 ? sat.tle2.substring(2, 7).trim() : 'N/A'}
                    </span>
                  </div>
                ))
              ) : (
                <div style={{ padding: '8px', color: '#666', fontSize: '10px', textAlign: 'center', fontStyle: 'italic' }}>
                  No valid matches
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ border: '1px solid #333', padding: '10px', borderRadius: '6px' }}>
          <div className="reveal-mask" style={{ marginBottom: '8px', borderBottom: '1px solid #333', paddingBottom: '4px' }}>
            <div className="reveal-item stagger-3" style={{ fontSize: '10px', color: '#666' }}>LEGEND</div>
          </div>

          <table style={{ width: '100%', fontSize: '9px', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ padding: '4px 0', cursor: 'pointer' }} onClick={() => toggleFilter('STATION')}>
                  <div className="reveal-mask"><div className="reveal-item stagger-4" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                      width: '10px', height: '10px', border: '1px solid #333',
                      background: categoryFilters.STATION ? '#00aa00' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {categoryFilters.STATION && <Check size={8} color="#fff" strokeWidth={4} />}
                    </div>
                    <span>STATION</span>
                  </div></div>
                </td>

                <td style={{ padding: '4px 0', cursor: 'pointer' }} onClick={() => toggleFilter('PAYLOAD')}>
                  <div className="reveal-mask"><div className="reveal-item stagger-4" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                      width: '10px', height: '10px', border: '1px solid #333',
                      background: categoryFilters.PAYLOAD ? '#888' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {categoryFilters.PAYLOAD && <Check size={8} color="#fff" strokeWidth={4} />}
                    </div>
                    <span>PAYLOAD</span>
                  </div></div>
                </td>
              </tr>
              <tr>
                <td style={{ padding: '4px 0', cursor: 'pointer' }} onClick={() => toggleFilter('DEBRIS')}>
                  <div className="reveal-mask"><div className="reveal-item stagger-4" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                      width: '10px', height: '10px', border: '1px solid #333',
                      background: categoryFilters.DEBRIS ? '#222' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {categoryFilters.DEBRIS && <Check size={8} color="#fff" strokeWidth={4} />}
                    </div>
                    <span>DEBRIS</span>
                  </div></div>
                </td>

                <td style={{ padding: '4px 0', cursor: 'pointer' }} onClick={() => toggleFilter('ONLY_SELECTED')}>
                  <div className="reveal-mask"><div className="reveal-item stagger-4" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                      width: '10px', height: '10px', border: '1px solid #333',
                      background: categoryFilters.ONLY_SELECTED ? '#ED1C2E' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {categoryFilters.ONLY_SELECTED && <Check size={8} color="#111" strokeWidth={4} />}
                    </div>
                    <span>SELECTED</span>
                  </div></div>
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{
            marginTop: '10px',
            borderTop: '1px solid #222',
            paddingTop: '8px'
          }}>
            <div className="reveal-mask">
              <div className="reveal-item stagger-5" style={{
                fontSize: '8px',
                color: error ? '#ED1C2E' : (status.includes('FALLBACK') ? '#FFD700' : '#666'),
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}>
                <div style={{
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  background: error ? '#ED1C2E' : (loading ? '#888' : (status.includes('FALLBACK') ? '#FFD700' : '#00ff00'))
                }}></div>
                {error ? error : (loading ? 'SYNCING CELESTRAK...' : status)}
              </div>
            </div>
          </div>
        </div>

        <div style={{ border: '1px solid #333', padding: '12px', borderRadius: '6px', position: 'relative', zIndex: 10 }}>
          <div className="reveal-mask" style={{ marginBottom: '8px', borderBottom: '1px solid #333', paddingBottom: '4px' }}>
            <div className="reveal-item stagger-6" style={{ fontSize: '12px', color: '#666' }}>SIMULATION CONTROL</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="reveal-mask">
              <div className="reveal-item stagger-7"><ClockDisplay /></div>
            </div>

            <div className="reveal-mask">
              <div className="reveal-item stagger-7" style={{ display: 'flex', gap: '4px' }}>
                <button className={`btn ${paused ? 'active' : ''} btn-interactive`} onClick={() => setPaused(!paused)} style={{ flex: 1, padding: '4px', borderRadius: '2px' }}>
                  {paused ? <Play size={12} fill="#fff" /> : <Pause size={12} fill="#fff" />}
                </button>
                {[1, 10, 100].map(s => (
                  <button key={s} className={`btn ${speed === s ? 'active' : ''} btn-interactive`} onClick={() => { setSpeed(s); setPaused(false); }} style={{ flex: 1, padding: '4px', fontSize: '10px', borderRadius: '2px' }}>
                    {s}X
                  </button>
                ))}
              </div>
            </div>

            <div className="reveal-mask">
              <div className="reveal-item stagger-8">
                <button className="btn-interactive" onClick={resetToRealTime} style={{ background: '#222', border: '1px solid #333', color: '#fff', padding: '6px', fontSize: '10px', fontFamily: 'Unbounded', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', borderRadius: '2px', width: '100%' }}>
                  <RotateCcw size={12} /> RESET TO REAL
                </button>
              </div>
            </div>
          </div>
        </div>

        <TelemetryPanel key={selectedSatId} selectedSatId={selectedSatId} satellites={satellites} />

        {selectedSatId && (
          <>
            <div className="reveal-mask" key={`${selectedSatId}-unfocus`}>
              <div className="reveal-item stagger-9">
                <button
                  className="btn-interactive"
                  onClick={() => { setSelectedSatId(null); setSelectedSatPos(null); }}
                  style={{ background: 'none', border: '1px solid #333', color: '#fff', fontSize: '10px', fontFamily: 'Unbounded', padding: '6px', width: '100%', borderRadius: '4px', marginTop: '10px', cursor: 'pointer' }}
                >
                  UNFOCUS
                </button>
              </div>
            </div>
            <HistoricalPanel key={`${selectedSatId}-history`} selectedSat={satellites.find(s => s.id === selectedSatId)} />
          </>
        )}
      </div>

      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1 }}>
        <Canvas camera={{ position: [0, 0, 3], fov: 45 }} raycaster={{ params: { Points: { threshold: 0.1 } } }}>
          <color attach="background" args={['#111']} />
          <SimulationManager />
          <SunLight />
          <Earth />

          <SatellitesInstanced
            satellites={satellites}
            selectedSatId={selectedSatId}
            hoveredSatId={hoveredSatId}
            categoryFilters={categoryFilters}
            onClick={(id) => {
              console.log('[CLICK] Satellite clicked, navMode:', navMode);
              if (navMode === 'SELECT') {
                setSelectedSatId(id);
              } else {
                // Show hint when trying to click in PAN mode
                console.log('[MODE HINT] Showing notification - clicked in PAN mode');
                setShowModeHint(true);
                setModeHintExiting(false);
                setTimeout(() => {
                  setModeHintExiting(true);
                  setTimeout(() => setShowModeHint(false), 300);
                }, 5000);
              }
            }}
            onHover={setHoveredSatId}
            navMode={navMode}
          />

          {/* Selected Satellite Rendering */}
          {selectedSatId && satellites.find(s => s.id === selectedSatId) && (
            <Satellite
              key={`selected-${selectedSatId}`}
              {...satellites.find(s => s.id === selectedSatId)}
              isSelected={true}
              isVisible={true} // Selected satellite always visible
              onClick={() => { }}
              orbitalPeriod={getOrbitalPeriod(satellites.find(s => s.id === selectedSatId).tle2)}
              onUpdatePosition={setSelectedSatPos}
              navMode={navMode}
            />
          )}

          {/* Hovered Satellite Rendering (only if not selected) */}
          {deferredHoverId && deferredHoverId !== selectedSatId && satellites.find(s => s.id === deferredHoverId) && (
            <Satellite
              key={`hover-${deferredHoverId}`}
              {...satellites.find(s => s.id === deferredHoverId)}
              isSelected={false}
              isHovered={deferredHoverId === hoveredSatId}
              isVisible={categoryFilters[satellites.find(s => s.id === deferredHoverId)?.category] !== false}
              onClick={() => {
                if (navMode === 'SELECT') {
                  setSelectedSatId(deferredHoverId);
                } else {
                  console.log('[MODE HINT] Showing notification - clicked hover satellite in PAN mode');
                  setShowModeHint(true);
                  setModeHintExiting(false);
                  setTimeout(() => {
                    setModeHintExiting(true);
                    setTimeout(() => setShowModeHint(false), 300);
                  }, 5000);
                }
              }}
              orbitalPeriod={getOrbitalPeriod(satellites.find(s => s.id === deferredHoverId).tle2)}
              onUpdatePosition={null}
              navMode={navMode}
            />
          )}

          <CameraController targetPosition={selectedSatPos} isSelected={!!selectedSatId} />
          <OrbitControls
            makeDefault
            enablePan={navMode === 'PAN'}
            enableZoom={false}
            enableRotate={navMode === 'PAN'}
            enableDamping={true}
            dampingFactor={0.05}
            rotateSpeed={0.5}
            minDistance={0.15}
            maxDistance={15}
          />
        </Canvas>
      </div>

      {/* Mode Hint Notification */}
      {showModeHint && (
        <div style={{
          position: 'fixed',
          bottom: '40px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#ED1C2E',
          color: '#111',
          padding: '12px 24px',
          borderRadius: '8px',
          fontSize: '12px',
          fontFamily: 'Unbounded',
          fontWeight: '600',
          zIndex: 10000,
          animation: modeHintExiting ? 'fadeOut 0.3s ease' : 'fadeIn 0.3s ease',
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          Switch to SELECT mode to interact with satellites
        </div>
      )}

      {showLoadingScreen && (
        <LoadingScreen
          isExiting={isExiting}
          onComplete={() => setAnimationComplete(true)}
        />
      )}
    </div>
  );
}

export default App;
