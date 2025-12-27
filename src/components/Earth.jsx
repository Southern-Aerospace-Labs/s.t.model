import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, useTexture } from '@react-three/drei';
import * as satellite from 'satellite.js';
import { SIM_STATE } from '../services/simulationState';

const Earth = () => {
    const earthRef = useRef();

    // Load the texture map from the public folder
    const texture = useTexture('/texturemap.jpg');

    useFrame(() => {
        if (earthRef.current) {
            // Earth rotation in ECI frame:
            // Calculate Greenwich Sidereal Time (GST)
            const date = new Date(SIM_STATE.simTime);
            const gmst = satellite.gstime(date);

            // In our Three.js ECI frame: Z(TLE) is Y(Three), X is X, Y is -Z
            // Rotation is around the North Pole (Y axis)
            earthRef.current.rotation.y = gmst;
        }
    });

    return (
        <group ref={earthRef}>
            <Sphere args={[1, 64, 64]}>
                <meshStandardMaterial
                    map={texture}
                    roughness={0.8}
                    metalness={0.05}
                />
            </Sphere>
        </group>
    );
};

export default Earth;
