import React, { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line, Html } from '@react-three/drei';
import { easing } from 'maath';
import * as THREE from 'three';
import { propagateSatellite, EARTH_RADIUS } from '../services/propagation';
import { SIM_STATE } from '../services/simulationState';

const SCALE = 1 / EARTH_RADIUS;

const CAT_COLORS = {
    STATION: '#00aa00',
    PAYLOAD: '#888',
    DEBRIS: '#333'
};

const Satellite = ({ tle1, tle2, name, category, isSelected, isVisible, onClick, orbitalPeriod, onUpdatePosition, navMode, isHovered }) => {
    const meshRef = useRef();
    const [hovered, setHovered] = useState(false);

    useFrame((state, delta) => {
        const pv = propagateSatellite(tle1, tle2, new Date(SIM_STATE.simTime));
        if (pv && meshRef.current) {
            const pos = pv.position;
            const x = pos.x * SCALE;
            const y = pos.z * SCALE;
            const z = -pos.y * SCALE;
            meshRef.current.position.set(x, y, z);

            // Adaptive Scaling
            const dist = state.camera.position.distanceTo(meshRef.current.position);
            const baseScale = isSelected ? 0.015 : 0.01;
            const scaleFactor = Math.min(Math.max(dist * baseScale * 0.45, 0.001), 0.04);
            meshRef.current.scale.setScalar(scaleFactor / baseScale);

            if (isSelected && onUpdatePosition) {
                onUpdatePosition(meshRef.current.position.clone());
            }

            // Opacity Animation
            const targetOpacity = isVisible ? 1 : 0;
            easing.damp(meshRef.current.material, 'opacity', targetOpacity, 0.1, delta);

            // Visibility optimization
            meshRef.current.visible = meshRef.current.material.opacity > 0.01;
            meshRef.current.material.transparent = true;
            meshRef.current.material.depthWrite = meshRef.current.material.opacity > 0.5;
        }
    });

    const orbitPoints = useMemo(() => {
        if (!isSelected) return null;
        const path = [];
        const segments = 150;
        const step = orbitalPeriod / segments;
        const now = new Date(SIM_STATE.simTime);
        for (let i = 0; i <= segments; i++) {
            const time = new Date(now.getTime() + i * step * 60000);
            const pv = propagateSatellite(tle1, tle2, time);
            if (pv) {
                const pos = pv.position;
                path.push([pos.x * SCALE, pos.z * SCALE, -pos.y * SCALE]);
            }
        }
        return path;
    }, [tle1, tle2, isSelected, orbitalPeriod]);

    const color = (isSelected || hovered || isHovered) ? '#ED1C2E' : (CAT_COLORS[category] || '#444');

    // Manage Tooltip Visibility Life-cycle
    const [showTooltip, setShowTooltip] = useState(false);
    const [renderTooltip, setRenderTooltip] = useState(false);

    React.useEffect(() => {
        if (hovered || isSelected || isHovered) {
            setRenderTooltip(true);
            // Small delay to allow render before transition
            requestAnimationFrame(() => setShowTooltip(true));
        } else {
            setShowTooltip(false);
            const timer = setTimeout(() => setRenderTooltip(false), 300); // Extended to ensure exit animation completes
            return () => clearTimeout(timer);
        }
    }, [hovered, isSelected, isHovered]);

    return (
        <group>
            <mesh
                ref={meshRef}
                onClick={(e) => {
                    if (navMode === 'SELECT') {
                        e.stopPropagation();
                        onClick();
                    }
                }}
                onPointerOver={() => setHovered(true)}
                onPointerOut={() => setHovered(false)}
                renderOrder={10}
            >
                <sphereGeometry args={[isSelected ? 0.015 : 0.008, 16, 16]} />
                <meshBasicMaterial
                    color={color}
                    transparent={true}
                    opacity={0} // Start invisible, let animation fade it in
                    depthWrite={true}
                    depthTest={true}
                />

                {renderTooltip && (
                    <Html>
                        <div className={`satellite-label ${showTooltip ? 'visible' : ''}`} style={{
                            background: '#111',
                            border: '1px solid #333',
                            padding: '8px 14px',
                            fontSize: '11px',
                            fontFamily: 'Unbounded',
                            whiteSpace: 'nowrap',
                            color: '#fff',
                            pointerEvents: 'none',
                            borderRadius: '4px',
                            zIndex: (isSelected || isHovered) ? 10 : 1
                        }}>
                            {name} <span style={{ color: '#666', fontSize: '10px', marginLeft: '5px' }}>({category})</span>
                        </div>
                    </Html>
                )}
            </mesh>

            {isSelected && orbitPoints && (
                <Line
                    points={orbitPoints}
                    color="#ED1C2E"
                    lineWidth={2}
                    transparent={true}
                    opacity={0.6}
                    renderOrder={5}
                />
            )}
        </group>
    );
};

export default Satellite;
