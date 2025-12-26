import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Mesh, Vector3 } from 'three';
import { useGameStore, MAX_HEALTH } from '../store';

// Fix for missing React Three Fiber JSX types
declare global {
  namespace JSX {
    interface IntrinsicElements {
      group: any;
      mesh: any;
      capsuleGeometry: any;
      meshStandardMaterial: any;
      boxGeometry: any;
      cylinderGeometry: any;
      dodecahedronGeometry: any;
    }
  }
}

const SmokeParticle = ({ position, offset }: { position: Vector3, offset: number }) => {
    const ref = useRef<Mesh>(null);
    useFrame((state, delta) => {
        if (ref.current) {
            ref.current.position.y += delta * 2;
            ref.current.position.z += delta * 5; 
            ref.current.scale.multiplyScalar(1.02);
            
            if (ref.current.position.y > 2) {
                ref.current.position.set(position.x, position.y, position.z);
                ref.current.scale.set(0.2, 0.2, 0.2);
            }
            
            ref.current.rotation.z += delta;
        }
    });

    useFrame((state) => {
        if(state.clock.elapsedTime < 0.1 && ref.current) {
             ref.current.position.y += Math.random();
        }
    })

    return (
        <mesh ref={ref} position={position}>
            <dodecahedronGeometry args={[0.2, 0]} />
            <meshStandardMaterial color="#555" transparent opacity={0.6} />
        </mesh>
    )
}

const DamageEffects = ({ health }: { health: number }) => {
    const damage = MAX_HEALTH - health;
    const damagePoints = useMemo(() => [
        new Vector3(0.5, 0.2, 0),
        new Vector3(-0.5, 0.2, 0.2),
        new Vector3(0, 0.5, -0.5),
        new Vector3(0.8, 0, -0.2), 
        new Vector3(-0.8, 0, -0.2), 
        new Vector3(0, 0, 1.0),
    ], []);

    if (damage <= 0) return null;

    const activePoints = damagePoints.slice(0, Math.ceil(damage / 1.5));

    return (
        <group>
            {activePoints.map((pos, i) => (
                <React.Fragment key={i}>
                    <SmokeParticle position={pos} offset={i} />
                    {damage > 6 && (
                        <mesh position={pos}>
                             <boxGeometry args={[0.15, 0.15, 0.15]} />
                             <meshStandardMaterial color="orange" emissive="red" emissiveIntensity={2} />
                        </mesh>
                    )}
                </React.Fragment>
            ))}
        </group>
    );
};

const Plane = () => {
  const mainGroupRef = useRef<Group>(null);
  
  // Parts Refs for destruction
  const fuselageRef = useRef<Group>(null);
  const leftWingRef = useRef<Mesh>(null);
  const rightWingRef = useRef<Mesh>(null);
  const tailRef = useRef<Group>(null);
  const propRef = useRef<Group>(null);

  const health = useGameStore((state) => state.health);
  const gameStatus = useGameStore((state) => state.gameStatus);

  useFrame((state, delta) => {
    if (!mainGroupRef.current) return;

    if (gameStatus === 'playing') {
        const steering = useGameStore.getState().steering;

        // Smooth banking logic
        const targetRoll = -steering * 0.8;
        // Expanded movement range to 18 to fit the wider ground view
        const targetX = steering * 18; 
        
        mainGroupRef.current.rotation.z += (targetRoll - mainGroupRef.current.rotation.z) * 10 * delta;
        mainGroupRef.current.rotation.y = -steering * 0.2;

        const currentX = mainGroupRef.current.position.x;
        // Increased Lerp speed to 10 for snappier control
        mainGroupRef.current.position.x += (targetX - currentX) * 10 * delta;
        mainGroupRef.current.position.y = 0; // Lock Y
        
        // CRITICAL: Reset parts to local origin AND rotation every frame during play
        // This fixes the "shape changing" bug on restart
        if (fuselageRef.current) {
            fuselageRef.current.position.set(0,0,0);
            fuselageRef.current.rotation.set(0,0,0);
        }
        if (leftWingRef.current) {
            leftWingRef.current.position.set(-0.6, 0.1, -0.3);
            leftWingRef.current.rotation.set(Math.PI / 2, 0, 0);
        }
        if (rightWingRef.current) {
            rightWingRef.current.position.set(0.6, 0.1, -0.3);
            rightWingRef.current.rotation.set(Math.PI / 2, 0, 0);
        }
        if (tailRef.current) {
            tailRef.current.position.set(0, 0, 0.8);
            tailRef.current.rotation.set(0,0,0);
        }

        // Propeller Spin
        if (propRef.current) propRef.current.rotation.z += 20 * delta;

        // Jitter effect if heavily damaged
        if (health <= 3) {
            mainGroupRef.current.position.x += (Math.random() - 0.5) * 0.1;
        }

    } else if (gameStatus === 'gameover') {
        // Destruction Animation: Parts fly off more dramatically
        if (leftWingRef.current) {
            leftWingRef.current.position.x -= 3 * delta;
            leftWingRef.current.rotation.z += 5 * delta;
        }
        if (rightWingRef.current) {
            rightWingRef.current.position.x += 3 * delta;
            rightWingRef.current.rotation.z -= 5 * delta;
        }
        if (fuselageRef.current) {
            fuselageRef.current.rotation.x -= 2 * delta; 
            fuselageRef.current.position.y -= 4 * delta; 
        }
        if (tailRef.current) {
            tailRef.current.position.z += 5 * delta;
            tailRef.current.rotation.x += 3 * delta;
        }
    }
  });

  return (
    // Scaled to be visible but proportional
    <group ref={mainGroupRef} position={[0, 0, 0]} scale={[0.8, 0.8, 0.8]}>
      
      {/* Fuselage Group */}
      <group ref={fuselageRef}>
        <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
            {/* Radius 0.25, Length 2.0 */}
            <capsuleGeometry args={[0.25, 2.0, 4, 8]} />
            <meshStandardMaterial color="#3b82f6" metalness={0.6} roughness={0.4} />
        </mesh>
        
        {/* Cockpit */}
        <mesh position={[0, 0.25, -0.3]} rotation={[Math.PI / 2 - 0.1, 0, 0]}>
            <capsuleGeometry args={[0.2, 0.8, 4, 8]} />
            <meshStandardMaterial color="#bae6fd" transparent opacity={0.6} />
        </mesh>
        
        {/* Propeller hub */}
        <mesh position={[0, 0, -1.1]}>
            <cylinderGeometry args={[0.1, 0.1, 0.2]} />
            <meshStandardMaterial color="#475569" />
        </mesh>
        <group ref={propRef} position={[0, 0, -1.2]}>
            <mesh rotation={[0, 0, 0]}>
                <boxGeometry args={[0.1, 2.2, 0.05]} />
                <meshStandardMaterial color="#cbd5e1" />
            </mesh>
            <mesh rotation={[0, 0, Math.PI / 2]}>
                <boxGeometry args={[0.1, 2.2, 0.05]} />
                <meshStandardMaterial color="#cbd5e1" />
            </mesh>
        </group>
      </group>
      
      {/* Left Wing - reduced size (1.2 width) */}
      <mesh ref={leftWingRef} position={[-0.6, 0.1, -0.3]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <boxGeometry args={[1.2, 0.6, 0.08]} />
        <meshStandardMaterial color="#1d4ed8" />
      </mesh>
      
      {/* Right Wing - reduced size */}
      <mesh ref={rightWingRef} position={[0.6, 0.1, -0.3]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <boxGeometry args={[1.2, 0.6, 0.08]} />
        <meshStandardMaterial color="#1d4ed8" />
      </mesh>
      
      {/* Tail Group */}
      <group ref={tailRef} position={[0, 0, 0.8]}>
         <mesh position={[0, 0.35, 0]} rotation={[0, 0, 0]} castShadow>
            <boxGeometry args={[0.08, 0.6, 0.5]} />
            <meshStandardMaterial color="#1e40af" />
        </mesh>
        <mesh position={[0, 0.1, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <boxGeometry args={[1.0, 0.4, 0.05]} />
            <meshStandardMaterial color="#1e40af" />
        </mesh>
      </group>

      <DamageEffects health={health} />
    </group>
  );
};

export default Plane;