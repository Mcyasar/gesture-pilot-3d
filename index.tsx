import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Fix for missing React Three Fiber JSX types in this environment
declare global {
  namespace JSX {
    interface IntrinsicElements {
      group: any;
      mesh: any;
      capsuleGeometry: any;
      meshStandardMaterial: any;
      boxGeometry: any;
      cylinderGeometry: any;
      instancedMesh: any;
      dodecahedronGeometry: any;
      gridHelper: any;
      ambientLight: any;
      directionalLight: any;
      fog: any;
    }
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);