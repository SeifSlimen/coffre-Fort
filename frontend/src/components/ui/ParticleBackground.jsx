import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * 3D Particle Background using Three.js / react-three-fiber
 * A subtle, GPU-accelerated floating particle field that responds to scroll.
 */

function Particles({ count = 200, color = '#2563eb' }) {
  const mesh = useRef();
  
  // Create particle positions and velocities once
  const particles = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 10;
      
      velocities[i * 3] = (Math.random() - 0.5) * 0.01;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.01;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.005;
    }
    
    return { positions, velocities };
  }, [count]);

  // Animate particles
  useFrame((state) => {
    if (!mesh.current) return;
    
    const positions = mesh.current.geometry.attributes.position.array;
    const time = state.clock.getElapsedTime();
    
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      
      // Gentle floating motion
      positions[i3] += particles.velocities[i3] + Math.sin(time * 0.5 + i) * 0.002;
      positions[i3 + 1] += particles.velocities[i3 + 1] + Math.cos(time * 0.3 + i) * 0.002;
      positions[i3 + 2] += particles.velocities[i3 + 2];
      
      // Wrap around boundaries
      if (positions[i3] > 10) positions[i3] = -10;
      if (positions[i3] < -10) positions[i3] = 10;
      if (positions[i3 + 1] > 10) positions[i3 + 1] = -10;
      if (positions[i3 + 1] < -10) positions[i3 + 1] = 10;
      if (positions[i3 + 2] > 5) positions[i3 + 2] = -5;
      if (positions[i3 + 2] < -5) positions[i3 + 2] = 5;
    }
    
    mesh.current.geometry.attributes.position.needsUpdate = true;
    
    // Subtle rotation
    mesh.current.rotation.y = time * 0.02;
    mesh.current.rotation.x = Math.sin(time * 0.1) * 0.1;
  });

  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={particles.positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        color={color}
        transparent
        opacity={0.6}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function FloatingMesh({ color = '#2563eb' }) {
  const mesh = useRef();
  
  useFrame((state) => {
    if (!mesh.current) return;
    const time = state.clock.getElapsedTime();
    mesh.current.rotation.x = Math.sin(time * 0.2) * 0.2;
    mesh.current.rotation.y = time * 0.1;
    mesh.current.position.y = Math.sin(time * 0.5) * 0.3;
  });

  return (
    <mesh ref={mesh} position={[0, 0, -2]}>
      <icosahedronGeometry args={[1.5, 1]} />
      <meshBasicMaterial
        color={color}
        wireframe
        transparent
        opacity={0.15}
      />
    </mesh>
  );
}

export default function ParticleBackground() {
  const [primaryColor, setPrimaryColor] = useState('#2563eb');

  useEffect(() => {
    try {
      const computed = getComputedStyle(document.documentElement);
      const cssPrimary = computed.getPropertyValue('--cf-primary-600')?.trim();
      if (cssPrimary) setPrimaryColor(cssPrimary);
    } catch {
      // Ignore and keep fallback
    }
  }, []);

  return (
    <div className="fixed inset-0 -z-10 pointer-events-none">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 60 }}
        dpr={[1, 1.5]}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.5} />
        <Particles count={150} color={primaryColor} />
        <FloatingMesh color={primaryColor} />
      </Canvas>
    </div>
  );
}
