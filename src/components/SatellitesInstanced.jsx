import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { easing } from 'maath';
import * as THREE from 'three';
import * as satellite from 'satellite.js';
import { EARTH_RADIUS } from '../services/propagation';
import { SIM_STATE } from '../services/simulationState';

const SCALE = 1 / EARTH_RADIUS;
const CAT_COLORS = {
    STATION: new THREE.Color('#00aa00'),
    PAYLOAD: new THREE.Color('#888'),
    DEBRIS: new THREE.Color('#333')
};

// Global bounding sphere for the entire orbital shell
// Ensures raycaster ALWAYS checks for satellites, preventing "sometimes works" behavior
const ORBITAL_BOUNDS = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 2.5);

const tempMatrix = new THREE.Matrix4();
const tempObject = new THREE.Object3D();

const SatGroup = ({ type, satellites, categoryFilters, selectedSatId, onClick, onHover, navMode }) => {
    const meshRef = useRef();
    const { camera } = useThree();
    const count = satellites.length;

    const colorArray = useMemo(() => {
        const array = new Float32Array(count * 3);
        const color = CAT_COLORS[type] || CAT_COLORS.PAYLOAD;
        for (let i = 0; i < count; i++) {
            array[i * 3] = color.r;
            array[i * 3 + 1] = color.g;
            array[i * 3 + 2] = color.b;
        }
        return array;
    }, [count, type]);

    useFrame((state, delta) => {
        if (!meshRef.current || count === 0) return;

        // Animate Material Opacity
        const isVisible = !categoryFilters.ONLY_SELECTED && categoryFilters[type];
        const targetOpacity = isVisible ? 1 : 0;
        easing.damp(meshRef.current.material, 'opacity', targetOpacity, 0.15, delta);

        // Hide mesh completely if fully transparent to save performance
        meshRef.current.visible = meshRef.current.material.opacity > 0.01;
        if (!meshRef.current.visible) return;

        const date = new Date(SIM_STATE.simTime);
        const camPos = camera.position;

        for (let i = 0; i < count; i++) {
            const sat = satellites[i];

            // Hide the selected satellite in this group mesh (it's rendered individually)
            if (sat.id === selectedSatId) {
                tempMatrix.makeScale(0, 0, 0);
                meshRef.current.setMatrixAt(i, tempMatrix);
                continue;
            }

            const pv = satellite.propagate(sat.satrec, date);

            if (pv && pv.position) {
                const pos = pv.position;
                const x = pos.x * SCALE;
                const y = pos.z * SCALE;
                const z = -pos.y * SCALE;

                tempObject.position.set(x, y, z);

                const dist = camPos.distanceTo(tempObject.position);
                const baseSize = 0.008;
                const scaleFactor = Math.min(Math.max(dist * baseSize * 0.45, 0.001), 0.04);

                tempObject.scale.setScalar(scaleFactor / baseSize);
                tempObject.updateMatrix();
                meshRef.current.setMatrixAt(i, tempObject.matrix);
            } else {
                tempMatrix.makeScale(0, 0, 0);
                meshRef.current.setMatrixAt(i, tempMatrix);
            }
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    // CRITICAL: Force raycaster to always check this mesh
    // Without this, the engine "optimizes away" clicks on distant satellites
    useEffect(() => {
        if (meshRef.current && meshRef.current.geometry) {
            meshRef.current.geometry.boundingSphere = ORBITAL_BOUNDS;
            // Prevent Three.js from recalculating bounding sphere
            meshRef.current.geometry.boundingSphere.needsUpdate = false;
        }
    }, [count]);

    const handlePointerDown = (e) => {
        e.stopPropagation();
        const { instanceId } = e;
        if (instanceId !== undefined && satellites[instanceId]) {
            onClick(satellites[instanceId].id);
        }
    };

    const handlePointerMove = (e) => {
        e.stopPropagation();
        const { instanceId } = e;
        if (instanceId !== undefined && satellites[instanceId]) {
            onHover(satellites[instanceId].id);
        }
    };

    if (count === 0) return null;

    // Disable pointer events when category is hidden
    const isVisible = !categoryFilters.ONLY_SELECTED && categoryFilters[type];

    return (
        <instancedMesh
            ref={meshRef}
            args={[null, null, count]}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerOut={() => onHover(null)}
            frustumCulled={false}
            raycast={isVisible ? undefined : () => null}
        >
            {/* Larger hit area = more reliable clicks */}
            <sphereGeometry args={[0.008, 6, 6]}>
                <instancedBufferAttribute attach="attributes-color" args={[colorArray, 3]} />
            </sphereGeometry>
            <meshBasicMaterial
                vertexColors={true}
                transparent={true}
                opacity={0}
                depthWrite={false}
            />
        </instancedMesh>
    );
};

const SatellitesInstanced = ({ satellites, selectedSatId, hoveredSatId, categoryFilters, onClick, onHover, navMode }) => {
    // Memoize the split lists to prevent thrashing
    const groups = useMemo(() => {
        const result = { STATION: [], PAYLOAD: [], DEBRIS: [] };
        satellites.forEach(sat => {
            if (result[sat.category]) result[sat.category].push(sat);
            else result.PAYLOAD.push(sat);
        });
        return result;
    }, [satellites]);

    return (
        <group>
            {Object.entries(groups).map(([type, sats]) => (
                <SatGroup
                    key={type}
                    type={type}
                    satellites={sats}
                    categoryFilters={categoryFilters}
                    selectedSatId={selectedSatId}
                    onClick={onClick}
                    onHover={onHover}
                    navMode={navMode}
                />
            ))}
        </group>
    );
};

export default SatellitesInstanced;
