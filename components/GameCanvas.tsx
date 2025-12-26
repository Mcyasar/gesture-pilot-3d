import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, PerspectiveCamera, Stars } from '@react-three/drei';
import Plane from './Plane';
import World from './World';

// Fix for missing React Three Fiber JSX types
declare global {
  namespace JSX {
    interface IntrinsicElements {
      ambientLight: any;
      directionalLight: any;
      fog: any;
    }
  }
}

const GameCanvas: React.FC = () => {
  return (
    <div className="w-full h-full">
      <Canvas shadows>
        {/* Telephoto Perspective View */}
        {/* Position: [0, 50, 30] - High up and behind */}
        {/* Rotation: [-0.9, 0, 0] (approx 51 degrees down) - Looks further ahead */}
        {/* Result: Plane (at 0,0,0) sits near the bottom of the screen. */}
        {/* FOV: 19 - Zoomed in tight to reduce perspective distortion */}
        <PerspectiveCamera 
            makeDefault 
            position={[0, 50, 30]} 
            rotation={[-0.9, 0, 0]} 
            fov={19} 
        />
        
        <ambientLight intensity={0.5} />
        <directionalLight 
          position={[10, 50, 20]} 
          intensity={1.5} 
          castShadow 
          shadow-mapSize={[2048, 2048]} 
        />
        
        <Suspense fallback={null}>
            {/* Reduced speed from 2 to 0.5 to match the slower gameplay */}
            <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={0.5} />
            <Plane />
            <World />
            <Environment preset="city" />
        </Suspense>
        
        {/* Increased fog range to ensure visibility of distant objects */}
        <fog attach="fog" args={['#0f172a', 60, 180]} />
      </Canvas>
    </div>
  );
};

export default GameCanvas;