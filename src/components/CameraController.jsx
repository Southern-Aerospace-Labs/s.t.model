import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useRef, useEffect, useState } from 'react';
import { easing } from 'maath';

const CameraController = ({ targetPosition, isSelected }) => {
    const { camera, controls } = useThree();
    const [autoZoomActive, setAutoZoomActive] = useState(false);

    // Zoom state
    const targetDistance = useRef(camera.position.length());

    useEffect(() => {
        if (isSelected) {
            setAutoZoomActive(true);
            targetDistance.current = 0.5; // Reset zoom to comfortable level on selection
        } else {
            setAutoZoomActive(false);
        }
    }, [isSelected, !!targetPosition]);

    // Handle smooth scroll wheel zoom AND custom events
    useEffect(() => {
        const handleWheel = (e) => {
            const zoomSpeed = 0.0015;
            targetDistance.current = Math.min(Math.max(targetDistance.current + e.deltaY * zoomSpeed, 0.1), 15);
        };

        const handleCustomZoom = (e) => {
            const { factor, reset } = e.detail;
            if (reset) {
                targetDistance.current = 3;
            } else {
                targetDistance.current = Math.min(Math.max(targetDistance.current * factor, 0.1), 15);
            }
        };

        window.addEventListener('wheel', handleWheel, { passive: true });
        window.addEventListener('nav-zoom', handleCustomZoom);

        return () => {
            window.removeEventListener('wheel', handleWheel);
            window.removeEventListener('nav-zoom', handleCustomZoom);
        };
    }, []);

    useFrame((state, delta) => {
        // Handle Target Easing (Always active when selected)
        if (isSelected && targetPosition && controls) {
            easing.damp3(controls.target, targetPosition, 0.15, delta);
        } else if (!isSelected && controls) {
            easing.damp3(controls.target, new THREE.Vector3(0, 0, 0), 0.15, delta);
        }

        // Handle Smooth Zoom Easing (Radius control)
        const center = controls ? controls.target : new THREE.Vector3(0, 0, 0);
        const direction = camera.position.clone().sub(center).normalize();
        const idealPos = center.clone().add(direction.multiplyScalar(targetDistance.current));

        easing.damp3(camera.position, idealPos, 0.25, delta);
    });

    return null;
};

export default CameraController;
