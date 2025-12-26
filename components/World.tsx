import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { InstancedMesh, Object3D, Color } from 'three';
import { useGameStore, MAX_HEALTH } from '../store';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      instancedMesh: any;
      dodecahedronGeometry: any;
      coneGeometry: any;
      sphereGeometry: any;
      meshStandardMaterial: any;
      meshBasicMaterial: any;
      gridHelper: any;
      boxGeometry: any;
      [key: string]: any;
    }
  }
}

const OBSTACLE_COUNT = 30;
const ENEMY_COUNT = 12; 
const ENEMY_BULLET_COUNT = 30;
const POWERUP_COUNT = 3;

// Reduced speeds for a more relaxed pace
const OBSTACLE_SPEED = 12; 
const BULLET_COUNT = 50; 
const BULLET_SPEED = 50; 
const ENEMY_BULLET_SPEED = 15;
const FIRE_RATE = 0.15; 
const EXPLOSION_PARTICLES = 40;

// Audio System
class AudioSystem {
  ctx: AudioContext | null = null;
  alarmOsc: OscillatorNode | null = null;
  alarmGain: GainNode | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  playTone(freq: number, type: 'square' | 'sine' | 'sawtooth' | 'triangle', duration: number, vol: number = 0.1) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playShoot() { this.playTone(600, 'square', 0.05, 0.05); } 
  playEnemyShoot() { this.playTone(200, 'sawtooth', 0.15, 0.1); }
  playPowerup() { 
      if (!this.ctx) return;
      this.playTone(800, 'sine', 0.1);
      setTimeout(() => this.playTone(1200, 'sine', 0.2), 100);
  }
  playImpact() { this.playTone(100, 'sawtooth', 0.3, 0.3); }
  
  playExplosion() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 0.5;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1000;
    const gain = this.ctx.createGain();
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);
    noise.start();
  }

  startAlarm() {
    if (!this.ctx || this.alarmOsc) return;
    this.alarmOsc = this.ctx.createOscillator();
    this.alarmGain = this.ctx.createGain();
    this.alarmOsc.connect(this.alarmGain);
    this.alarmGain.connect(this.ctx.destination);
    this.alarmOsc.type = 'sine';
    this.alarmOsc.frequency.setValueAtTime(600, this.ctx.currentTime);
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 2;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 200;
    lfo.connect(lfoGain);
    lfoGain.connect(this.alarmOsc.frequency);
    lfo.start();
    this.alarmGain.gain.value = 0.1;
    this.alarmOsc.start();
  }

  stopAlarm() {
    if (this.alarmOsc) {
      try {
        this.alarmOsc.stop();
        this.alarmOsc.disconnect();
      } catch (e) {}
      this.alarmOsc = null;
    }
  }
}

const World = () => {
  const meshRef = useRef<InstancedMesh>(null); // Rocks
  const enemyMeshRef = useRef<InstancedMesh>(null); // Enemies
  const bulletMeshRef = useRef<InstancedMesh>(null); // Player Bullets
  const enemyBulletMeshRef = useRef<InstancedMesh>(null); // Enemy Bullets
  const powerupMeshRef = useRef<InstancedMesh>(null); // Powerups
  const explosionMeshRef = useRef<InstancedMesh>(null);
  
  const audioRef = useRef<AudioSystem | null>(null);
  const dummy = useMemo(() => new Object3D(), []);
  
  const gameStatus = useGameStore((state) => state.gameStatus);
  const increaseScore = useGameStore((state) => state.increaseScore);
  const takeDamage = useGameStore((state) => state.takeDamage);
  const heal = useGameStore((state) => state.heal);
  const health = useGameStore((state) => state.health);
  
  // Track visual position locally to sync hitboxes with the delayed visual movement
  const visualPlaneX = useRef(0);

  // Adjusted spawn range to be slightly closer
  const [obstacles] = useState(() => new Array(OBSTACLE_COUNT).fill(null).map(() => ({
      x: (Math.random() - 0.5) * 40, z: -30 - Math.random() * 50, y: 0, active: true, scale: 1
  })));

  const [enemies] = useState(() => new Array(ENEMY_COUNT).fill(null).map(() => ({
      x: (Math.random() - 0.5) * 35, z: -25 - Math.random() * 50, y: 0, active: true, 
      canShoot: Math.random() > 0.3, lastShot: 0,
      moveSpeed: OBSTACLE_SPEED * 1.2
  })));

  const powerups = useRef(new Array(POWERUP_COUNT).fill(null).map(() => ({
      x: 0, y: 0, z: 0, active: false
  })));

  const bullets = useRef(new Array(BULLET_COUNT).fill(null).map(() => ({ x: 0, y: 0, z: 0, active: false })));
  const enemyBullets = useRef(new Array(ENEMY_BULLET_COUNT).fill(null).map(() => ({ x: 0, y: 0, z: 0, active: false })));
  const explosions = useRef(new Array(EXPLOSION_PARTICLES).fill(null).map(() => ({ x: 0, y: 0, z: 0, life: 0, scale: 0 })));
  
  const lastFireTime = useRef(0);

  useEffect(() => {
    audioRef.current = new AudioSystem();
    return () => { audioRef.current?.stopAlarm(); };
  }, []);

  useEffect(() => {
    if (gameStatus === 'playing' && health <= 3 && health > 0) audioRef.current?.startAlarm();
    else audioRef.current?.stopAlarm();
  }, [health, gameStatus]);

  // Spawn Helpers
  const spawnExplosion = (x: number, y: number, z: number) => {
    const explosion = explosions.current.find(e => e.life <= 0);
    if (explosion) {
      explosion.x = x; explosion.y = y; explosion.z = z;
      explosion.life = 1.0; explosion.scale = 0.5;
    }
  };

  const trySpawnPowerup = (x: number, z: number) => {
      if (Math.random() > 0.8) {
          const p = powerups.current.find(p => !p.active);
          if (p) {
              p.active = true;
              p.x = x;
              p.z = z;
              p.y = 0;
          }
      }
  }

  // Reset Game
  useEffect(() => {
    if (gameStatus === 'playing') {
      visualPlaneX.current = 0;
      obstacles.forEach(o => { o.z = -30 - Math.random() * 50; o.x = (Math.random() - 0.5) * 40; o.active = true; });
      enemies.forEach(e => { e.z = -25 - Math.random() * 50; e.x = (Math.random() - 0.5) * 35; e.active = true; });
      bullets.current.forEach(b => b.active = false);
      enemyBullets.current.forEach(b => b.active = false);
      powerups.current.forEach(p => p.active = false);
      explosions.current.forEach(e => e.life = 0);
      if (audioRef.current?.ctx?.state === 'suspended') audioRef.current.ctx.resume();
    }
  }, [gameStatus, obstacles, enemies]);

  useFrame((state, delta) => {
    const currentState = useGameStore.getState();
    const isFiring = currentState.isFiring;

    // Calculate simulated visual position for collisions
    const targetX = currentState.steering * 18;
    // CRITICAL: This lerp speed must match the Plane.tsx lerp speed (10) to prevent ghost collisions
    visualPlaneX.current += (targetX - visualPlaneX.current) * 10 * delta; 
    
    const planeX = visualPlaneX.current;
    const planeZ = 0; 

    if (gameStatus === 'playing') {
        // --- Player Shooting ---
        if (isFiring && state.clock.elapsedTime - lastFireTime.current > FIRE_RATE) {
            const bullet = bullets.current.find(b => !b.active);
            if (bullet) {
                bullet.active = true;
                bullet.x = planeX; // Spawn from the VISUAL position, not the target
                bullet.y = 0;
                bullet.z = -1.5; // Spawn slightly ahead to clear nose
                lastFireTime.current = state.clock.elapsedTime;
                audioRef.current?.playShoot();
            }
        }

        // --- Enemy Shooting ---
        enemies.forEach(enemy => {
            if (enemy.active && enemy.canShoot && enemy.z > -40 && enemy.z < -5) {
                // Enemies shoot when in front of player
                if (Math.abs(enemy.x - planeX) < 6) { // Wider acquisition
                    if (state.clock.elapsedTime - enemy.lastShot > 1.5) { 
                        const b = enemyBullets.current.find(b => !b.active);
                        if (b) {
                            b.active = true;
                            b.x = enemy.x;
                            b.y = 0;
                            b.z = enemy.z;
                            enemy.lastShot = state.clock.elapsedTime;
                            audioRef.current?.playEnemyShoot();
                        }
                    }
                }
            }
        });
    }

    // --- Update Player Bullets ---
    if (bulletMeshRef.current) {
        bullets.current.forEach((bullet, i) => {
            if (bullet.active) {
                bullet.z -= BULLET_SPEED * delta;
                if (bullet.z < -80) bullet.active = false; // Despawn earlier
            }
            dummy.position.set(bullet.x, bullet.y, bullet.z);
            dummy.rotation.set(0, 0, 0); 
            // Scale Z for length
            dummy.scale.set(bullet.active ? 1 : 0, bullet.active ? 1 : 0, (bullet.active ? 1 : 0) * 8);
            dummy.updateMatrix();
            bulletMeshRef.current!.setMatrixAt(i, dummy.matrix);
        });
        bulletMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    // --- Update Enemy Bullets ---
    if (enemyBulletMeshRef.current) {
        enemyBullets.current.forEach((bullet, i) => {
            if (bullet.active && gameStatus === 'playing') {
                bullet.z += ENEMY_BULLET_SPEED * delta;
                if (bullet.z > 10) bullet.active = false; // Despawn bottom screen
                
                // Collision with Player
                if (Math.abs(bullet.z - planeZ) < 1.0 && Math.abs(bullet.x - planeX) < 1.0) {
                    bullet.active = false;
                    spawnExplosion(planeX, 0, planeZ);
                    audioRef.current?.playImpact();
                    takeDamage();
                }
            }
            dummy.position.set(bullet.x, bullet.y, bullet.z);
            dummy.rotation.set(0,0,0);
            const s = bullet.active ? 1 : 0;
            dummy.scale.set(s, s, s);
            dummy.updateMatrix();
            enemyBulletMeshRef.current!.setMatrixAt(i, dummy.matrix);
        });
        enemyBulletMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    // --- Update Powerups ---
    if (powerupMeshRef.current) {
        powerups.current.forEach((p, i) => {
            if (p.active && gameStatus === 'playing') {
                p.z += OBSTACLE_SPEED * delta;
                if (p.z > 10) p.active = false;

                if (Math.abs(p.z - planeZ) < 1.5 && Math.abs(p.x - planeX) < 1.5) {
                    p.active = false;
                    heal(3);
                    audioRef.current?.playPowerup();
                }
            }
            dummy.position.set(p.x, p.y + Math.sin(state.clock.elapsedTime * 5) * 0.2, p.z);
            dummy.rotation.set(0, state.clock.elapsedTime, 0);
            const s = p.active ? 1 : 0;
            dummy.scale.set(s, s, s);
            dummy.updateMatrix();
            powerupMeshRef.current!.setMatrixAt(i, dummy.matrix);
        });
        powerupMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    // --- Update Rocks (Obstacles) ---
    if (meshRef.current) {
        obstacles.forEach((obstacle, i) => {
            if (gameStatus === 'playing') {
                obstacle.z += OBSTACLE_SPEED * delta;
                if (obstacle.z > 10) { // Passed camera (bottom screen)
                    obstacle.z = -30 - Math.random() * 50;
                    obstacle.x = (Math.random() - 0.5) * 40;
                    obstacle.active = true;
                }
                if (obstacle.active) {
                    if (Math.abs(obstacle.z - planeZ) < 1.5 && Math.abs(obstacle.x - planeX) < 1.2) {
                        audioRef.current?.playImpact();
                        spawnExplosion(planeX, 0, planeZ - 1);
                        takeDamage();
                        obstacle.z = -30 - Math.random() * 50;
                        obstacle.x = (Math.random() - 0.5) * 40;
                    }
                    if (obstacle.z < 0) {
                        bullets.current.forEach(bullet => {
                            if (bullet.active) {
                                if (Math.abs(bullet.x - obstacle.x) < 1.5 && Math.abs(bullet.z - obstacle.z) < 1.5) {
                                    bullet.active = false;
                                    increaseScore();
                                    audioRef.current?.playExplosion();
                                    spawnExplosion(obstacle.x, obstacle.y, obstacle.z);
                                    trySpawnPowerup(obstacle.x, obstacle.z);
                                    obstacle.z = -30 - Math.random() * 50;
                                    obstacle.x = (Math.random() - 0.5) * 40;
                                }
                            }
                        });
                    }
                }
            }
            dummy.position.set(obstacle.x, obstacle.y, obstacle.z);
            dummy.rotation.set(i * 0.1, i * 0.2 + (state.clock.elapsedTime * 0.5), 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            meshRef.current!.setMatrixAt(i, dummy.matrix);
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
    }

    // --- Update Enemies ---
    if (enemyMeshRef.current) {
        enemies.forEach((enemy, i) => {
            if (gameStatus === 'playing') {
                enemy.z += enemy.moveSpeed * delta;
                if (enemy.z > 10) {
                    enemy.z = -25 - Math.random() * 50; 
                    enemy.x = (Math.random() - 0.5) * 35;
                    enemy.active = true;
                }
                if (enemy.active) {
                    if (Math.abs(enemy.z - planeZ) < 1.5 && Math.abs(enemy.x - planeX) < 1.5) {
                        audioRef.current?.playImpact();
                        spawnExplosion(planeX, 0, planeZ - 1);
                        takeDamage();
                        enemy.z = -25 - Math.random() * 50;
                        enemy.x = (Math.random() - 0.5) * 35;
                    }
                    if (enemy.z < 0) {
                        bullets.current.forEach(bullet => {
                            if (bullet.active) {
                                if (Math.abs(bullet.x - enemy.x) < 1.5 && Math.abs(bullet.z - enemy.z) < 1.5) {
                                    bullet.active = false;
                                    increaseScore(); 
                                    increaseScore();
                                    audioRef.current?.playExplosion();
                                    spawnExplosion(enemy.x, enemy.y, enemy.z);
                                    trySpawnPowerup(enemy.x, enemy.z);
                                    enemy.z = -25 - Math.random() * 50;
                                    enemy.x = (Math.random() - 0.5) * 35;
                                }
                            }
                        });
                    }
                }
            }
            dummy.position.set(enemy.x, enemy.y, enemy.z);
            // Rotate X -90 to point "forward" (towards +Z which is DOWN screen)
            dummy.rotation.set(-Math.PI / 2, 0, Math.sin(state.clock.elapsedTime * 3 + i) * 0.2);
            dummy.scale.set(0.8, 0.8, 0.8);
            dummy.updateMatrix();
            enemyMeshRef.current!.setMatrixAt(i, dummy.matrix);
        });
        enemyMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    // --- Explosion Animation ---
    if (explosionMeshRef.current) {
      explosions.current.forEach((expl, i) => {
        if (expl.life > 0) {
          expl.life -= delta * 2;
          expl.scale += delta * 5;
          dummy.position.set(expl.x, expl.y, expl.z);
          const s = Math.max(0, expl.scale * expl.life);
          dummy.scale.set(s, s, s);
          dummy.rotation.set(0, 0, Math.random() * Math.PI);
        } else {
           dummy.scale.set(0, 0, 0);
        }
        dummy.updateMatrix();
        explosionMeshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      explosionMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      {/* Rocks */}
      <instancedMesh ref={meshRef} args={[null, null, OBSTACLE_COUNT]} frustumCulled={false}>
        <dodecahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial color="#ef4444" metalness={0.8} roughness={0.2} />
      </instancedMesh>

      {/* Enemies (Cone Jets) */}
      <instancedMesh ref={enemyMeshRef} args={[null, null, ENEMY_COUNT]} frustumCulled={false}>
        {/* Radius 0.4, Height 1.5, Segments 4 */}
        <coneGeometry args={[0.4, 1.5, 4]} />
        <meshStandardMaterial color="#9333ea" emissive="#7e22ce" emissiveIntensity={0.5} metalness={0.8} roughness={0.2} />
      </instancedMesh>

      {/* Player Bullets - Unlit material for max visibility */}
      <instancedMesh ref={bulletMeshRef} args={[null, null, BULLET_COUNT]} frustumCulled={false}>
        <boxGeometry args={[0.08, 0.08, 0.4]} />
        <meshBasicMaterial color="#ffff00" />
      </instancedMesh>

      {/* Enemy Bullets */}
      <instancedMesh ref={enemyBulletMeshRef} args={[null, null, ENEMY_BULLET_COUNT]} frustumCulled={false}>
        <sphereGeometry args={[0.2, 8, 8]} />
        <meshStandardMaterial color="#ff5722" emissive="#ff5722" emissiveIntensity={2} />
      </instancedMesh>

      {/* Powerups (Green Boxes) */}
      <instancedMesh ref={powerupMeshRef} args={[null, null, POWERUP_COUNT]} frustumCulled={false}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="#22c55e" emissive="#4ade80" emissiveIntensity={1} />
      </instancedMesh>

      {/* Explosions */}
      <instancedMesh ref={explosionMeshRef} args={[null, null, EXPLOSION_PARTICLES]} frustumCulled={false}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#ff5500" emissive="#ff2200" emissiveIntensity={3} transparent opacity={0.8} />
      </instancedMesh>
      
      <gridHelper args={[100, 50, 0x1e293b, 0x0f172a]} position={[0, -2, 0]} />
    </>
  );
};

export default World;