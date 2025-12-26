import React, { useEffect, useState } from 'react';
import GameCanvas from './components/GameCanvas';
import HandController from './components/HandController';
import { useGameStore, MAX_HEALTH } from './store';
import { Play, RotateCcw, Trophy, Heart, Pause, XCircle, MousePointer2, Zap } from 'lucide-react';

const App: React.FC = () => {
  const gameStatus = useGameStore((state) => state.gameStatus);
  const score = useGameStore((state) => state.score);
  const health = useGameStore((state) => state.health);
  const resetGame = useGameStore((state) => state.resetGame);
  const resumeGame = useGameStore((state) => state.resumeGame);
  const endGame = useGameStore((state) => state.endGame);
  
  // Cursor Data
  const cursor = useGameStore((state) => state.cursor);
  const isGestureClicking = useGameStore((state) => state.isGestureClicking);
  const isHammerReady = useGameStore((state) => state.isHammerReady);
  const gestureRatio = useGameStore((state) => state.gestureRatio);
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);

  // Manual Hit Testing for Gesture Cursor
  useEffect(() => {
    if (gameStatus === 'playing') return;

    // Find element under cursor
    const element = document.elementFromPoint(cursor.x, cursor.y);
    const button = element?.closest('button');
    
    if (button && button.id) {
        setHoveredButton(button.id);
        
        // Trigger Click if gesture is active
        if (isGestureClicking) {
            button.click();
        }
    } else {
        setHoveredButton(null);
    }
  }, [cursor, isGestureClicking, gameStatus]);

  const getButtonClass = (id: string, baseClass: string) => {
      const isHovered = hoveredButton === id;
      const isClicking = isHovered && isGestureClicking;
      
      return `${baseClass} transition-transform duration-100 ${isHovered ? 'scale-110 ring-2 ring-offset-2 ring-offset-slate-900 ring-blue-500' : ''} ${isClicking ? 'scale-95 bg-green-500 text-white' : ''}`;
  }

  // Visual Helper for Cursor Status
  const getCursorColor = () => {
      if (isGestureClicking) return 'border-green-500 bg-green-500/30';
      if (isHammerReady) return 'border-yellow-400 bg-yellow-400/30';
      return 'border-red-500';
  };

  const getCursorDotColor = () => {
      if (isGestureClicking) return 'bg-green-500';
      if (isHammerReady) return 'bg-yellow-400';
      return 'bg-red-500';
  };

  // Hammer Gauge Calculation
  const GAUGE_HEIGHT = 60;
  const gaugeFillHeight = Math.min(1.0, Math.max(0, gestureRatio)) * GAUGE_HEIGHT;
  // Thresholds matched to logic
  const cockY = 0.70 * GAUGE_HEIGHT;
  const fireY = 0.60 * GAUGE_HEIGHT;

  return (
    <div className="relative w-full h-screen bg-slate-900 text-white overflow-hidden font-sans select-none cursor-none">
      {/* 3D Game Layer */}
      <div className="absolute inset-0 z-0">
        <GameCanvas />
        {/* Critical Health Overlay */}
        {gameStatus === 'playing' && health <= 3 && (
            <div className="absolute inset-0 pointer-events-none border-[10px] border-red-500/50 animate-pulse z-20 shadow-[inset_0_0_100px_rgba(255,0,0,0.5)]"></div>
        )}
      </div>

      {/* VIRTUAL CURSOR (Only show in Menus) */}
      {gameStatus !== 'playing' && (
          <div 
            className="absolute z-50 pointer-events-none transform -translate-x-1/2 -translate-y-1/2 transition-transform duration-75"
            style={{ left: cursor.x, top: cursor.y }}
          >
             <div className={`relative flex items-center justify-center ${isGestureClicking ? 'scale-90' : 'scale-100'}`}>
                {/* Crosshair */}
                <div className={`w-8 h-8 border-2 ${getCursorColor()} rounded-full opacity-80 shadow-[0_0_15px_rgba(0,0,0,0.5)] transition-colors duration-200`}></div>
                <div className={`absolute w-1 h-1 ${getCursorDotColor()} rounded-full transition-colors duration-200`}></div>
                
                {/* HAMMER GAUGE */}
                <div className="absolute left-6 bottom-0 w-2 bg-slate-800/80 rounded-full overflow-hidden border border-slate-600" style={{ height: GAUGE_HEIGHT }}>
                    {/* Zones */}
                    <div className="absolute w-full bg-red-500/30" style={{ bottom: 0, height: fireY }}></div>
                    <div className="absolute w-full bg-yellow-400/30" style={{ top: 0, height: GAUGE_HEIGHT - cockY }}></div>
                    
                    {/* Threshold Lines */}
                    <div className="absolute w-full h-px bg-yellow-400 z-10" style={{ bottom: cockY }}></div>
                    <div className="absolute w-full h-px bg-green-500 z-10" style={{ bottom: fireY }}></div>

                    {/* Fill Bar */}
                    <div 
                        className={`absolute bottom-0 w-full transition-all duration-75 ${isHammerReady ? 'bg-yellow-400' : 'bg-blue-400'}`} 
                        style={{ height: gaugeFillHeight }}
                    />
                </div>
                
                {/* Finger Gun Hint */}
                <MousePointer2 
                    size={24} 
                    className={`absolute -bottom-6 -right-6 ${isGestureClicking ? 'text-green-500' : isHammerReady ? 'text-yellow-400' : 'text-red-500'} transform -rotate-12 opacity-80 ${isGestureClicking ? 'translate-y-2' : ''} transition-colors duration-200`} 
                    fill="currentColor"
                />
             </div>
          </div>
      )}

      {/* UI Layer */}
      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-6">
        {/* Header */}
        <div className="flex justify-between items-start">
            <div className="bg-slate-900/50 backdrop-blur-md p-4 rounded-2xl border border-slate-700 flex flex-col gap-2 min-w-[200px]">
                <div className="flex items-center justify-between">
                     <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                        Gesture Pilot
                    </h1>
                     <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                        gameStatus === 'playing' ? 'bg-green-500/20 text-green-400' : 
                        gameStatus === 'paused' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-slate-700 text-slate-400'
                     }`}>
                        {gameStatus.toUpperCase()}
                     </span>
                </div>
               
                {/* Health Bar */}
                <div className="w-full">
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                        <span className="flex items-center gap-1"><Heart size={10} className={health < 3 ? "text-red-500 animate-bounce" : "text-red-400"} /> INTEGRITY</span>
                        <span>{Math.round((health / MAX_HEALTH) * 100)}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div 
                            className={`h-full transition-all duration-300 ${health <= 3 ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} 
                            style={{ width: `${(health / MAX_HEALTH) * 100}%` }}
                        />
                    </div>
                </div>
            </div>
            
            <div className="bg-slate-900/50 backdrop-blur-md p-4 rounded-2xl border border-slate-700 flex items-center gap-3">
                <Trophy className="text-yellow-400" />
                <div className="flex flex-col">
                    <span className="text-xs text-slate-400">SCORE</span>
                    <span className="text-2xl font-mono font-bold leading-none">{score}</span>
                </div>
            </div>
        </div>

        {/* Center Messages / Menus */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
            
            {/* START MENU */}
            {gameStatus === 'idle' && (
                <div className="bg-slate-900/90 backdrop-blur-lg p-8 rounded-3xl border border-slate-700 shadow-2xl max-w-md text-center transform transition-all hover:scale-105">
                    <h2 className="text-3xl font-bold mb-4 text-blue-400">Ready to Takeoff?</h2>
                    
                    <div className="grid grid-cols-2 gap-4 text-left text-sm text-slate-300 mb-8 bg-slate-800/50 p-4 rounded-xl">
                        <div className="col-span-2 font-bold text-white border-b border-slate-700 pb-2 mb-1">Flight Controls</div>
                        <div>👍 <span className="text-yellow-400">Tilt Hand</span></div> <div className="text-right opacity-60">Steer</div>
                        <div>✊ <span className="text-red-400">Fist</span></div> <div className="text-right opacity-60">Fire</div>
                        <div>✋ <span className="text-blue-400">Open Palm</span></div> <div className="text-right opacity-60">Pause</div>
                        
                        <div className="col-span-2 font-bold text-white border-b border-slate-700 pb-2 mb-1 mt-2">Menu Controls</div>
                        <div>👆 <span className="text-cyan-400">Index</span></div> <div className="text-right opacity-60">Move Cursor</div>
                        <div className="flex items-center gap-1"><Zap size={12} className={isHammerReady ? "text-yellow-400" : "text-slate-400"}/><span>Cock & Drop</span></div> <div className="text-right opacity-60">Click</div>
                    </div>

                    <button 
                        id="btn-start"
                        onClick={resetGame}
                        className={getButtonClass('btn-start', "group relative inline-flex h-12 w-full items-center justify-center overflow-hidden rounded-full bg-blue-600 px-8 font-medium text-white shadow-lg")}
                    >
                        <div className="mr-2"><Play fill="currentColor" size={18} /></div>
                        <span>Start Engine</span>
                        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-600 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                    </button>
                </div>
            )}

            {/* PAUSE MENU */}
            {gameStatus === 'paused' && (
                <div className="bg-slate-900/95 backdrop-blur-xl p-8 rounded-3xl border border-yellow-500/30 shadow-2xl max-w-sm text-center w-full animate-in fade-in zoom-in-95 duration-200">
                    <h2 className="text-3xl font-bold mb-6 text-yellow-400 flex items-center justify-center gap-2">
                        <Pause fill="currentColor" /> PAUSED
                    </h2>
                    <div className="flex flex-col gap-3">
                        <button 
                            id="btn-resume"
                            onClick={resumeGame}
                            className={getButtonClass('btn-resume', "flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold shadow-lg")}
                        >
                            <Play size={20} fill="currentColor" /> Resume
                        </button>
                        <button 
                            id="btn-restart"
                            onClick={resetGame}
                            className={getButtonClass('btn-restart', "flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-slate-700 hover:bg-slate-600 font-semibold shadow-lg")}
                        >
                            <RotateCcw size={20} /> Restart
                        </button>
                        <button 
                            id="btn-quit"
                            onClick={endGame}
                            className={getButtonClass('btn-quit', "flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-red-900/50 hover:bg-red-800/80 text-red-200 border border-red-800/50 font-semibold mt-2")}
                        >
                            <XCircle size={20} /> End Game
                        </button>
                    </div>
                </div>
            )}

            {/* GAME OVER MENU */}
            {gameStatus === 'gameover' && (
                <div className="bg-slate-900/90 backdrop-blur-lg p-8 rounded-3xl border border-red-500/50 shadow-2xl max-w-md text-center animate-in fade-in zoom-in duration-300">
                    <h2 className="text-4xl font-bold mb-2 text-red-500">DESTROYED</h2>
                    <p className="text-slate-400 mb-6">Plane integrity critical.</p>
                    <div className="text-6xl font-mono font-bold mb-8 text-white">{score}</div>
                    <div className="flex flex-col gap-3">
                        <button 
                            id="btn-retry"
                            onClick={resetGame}
                            className={getButtonClass('btn-retry', "inline-flex h-12 items-center justify-center rounded-full bg-white text-slate-900 px-8 font-bold hover:bg-slate-200 shadow-xl")}
                        >
                            <RotateCcw className="mr-2" size={20} />
                            Sortie Again
                        </button>
                        <button 
                            id="btn-home"
                            onClick={endGame}
                            className={getButtonClass('btn-home', "text-slate-400 hover:text-white text-sm mt-2 underline decoration-slate-600 hover:decoration-white underline-offset-4 p-2")}
                        >
                            Return to Base
                        </button>
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* Hand Controller (Always active to show camera) */}
      <HandController />
    </div>
  );
};

export default App;