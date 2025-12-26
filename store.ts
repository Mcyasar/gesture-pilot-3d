import { create } from 'zustand';

export const MAX_HEALTH = 10;

interface GameState {
  gameStatus: 'idle' | 'playing' | 'paused' | 'gameover';
  score: number;
  steering: number; // -1 (left) to 1 (right)
  speed: number;
  isFiring: boolean;
  health: number;
  // Cursor State
  cursor: { x: number, y: number };
  gestureRatio: number; // 0 to ~1.0, tracking thumb extension
  isGestureClicking: boolean;
  isHammerReady: boolean; // Visual feedback state
  
  setGameStatus: (status: 'idle' | 'playing' | 'paused' | 'gameover') => void;
  setSteering: (val: number) => void;
  setFiring: (val: boolean) => void;
  setCursor: (x: number, y: number) => void;
  setGestureRatio: (val: number) => void;
  setGestureClicking: (val: boolean) => void;
  setHammerReady: (val: boolean) => void;
  
  increaseScore: () => void;
  takeDamage: () => void;
  heal: (amount: number) => void;
  resetGame: () => void;
  pauseGame: () => void;
  resumeGame: () => void;
  endGame: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  gameStatus: 'idle',
  score: 0,
  steering: 0,
  speed: 0.2,
  isFiring: false,
  health: MAX_HEALTH,
  cursor: { x: 0, y: 0 },
  gestureRatio: 0,
  isGestureClicking: false,
  isHammerReady: false,

  setGameStatus: (status) => set({ gameStatus: status }),
  setSteering: (val) => set({ steering: val }),
  setFiring: (val) => set({ isFiring: val }),
  setCursor: (x, y) => set({ cursor: { x, y } }),
  setGestureRatio: (val) => set({ gestureRatio: val }),
  setGestureClicking: (val) => set({ isGestureClicking: val }),
  setHammerReady: (val) => set({ isHammerReady: val }),

  increaseScore: () => set((state) => ({ score: state.score + 1 })),
  takeDamage: () => {
    const { health } = get();
    const newHealth = health - 1;
    if (newHealth <= 0) {
      set({ health: 0, gameStatus: 'gameover' });
    } else {
      set({ health: newHealth });
    }
  },
  heal: (amount) => set((state) => ({ health: Math.min(MAX_HEALTH, state.health + amount) })),
  resetGame: () => set({ 
    gameStatus: 'playing', 
    score: 0, 
    steering: 0, 
    speed: 0.2, 
    isFiring: false,
    health: MAX_HEALTH,
    isHammerReady: false
  }),
  pauseGame: () => set({ gameStatus: 'paused' }),
  resumeGame: () => set({ gameStatus: 'playing' }),
  endGame: () => set({ 
    gameStatus: 'idle',
    score: 0,
    health: MAX_HEALTH,
    steering: 0,
    isFiring: false,
    isHammerReady: false
  }),
}));