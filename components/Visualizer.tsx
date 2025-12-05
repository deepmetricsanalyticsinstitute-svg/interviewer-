import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  inputLevel: number; // 0-1
  outputLevel: number; // 0-1
  isActive: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ inputLevel, outputLevel, isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      const centerY = height / 2;
      
      ctx.clearRect(0, 0, width, height);
      
      // Background gradient
      const gradient = ctx.createRadialGradient(centerX, centerY, 50, centerX, centerY, width/1.5);
      gradient.addColorStop(0, '#1e293b');
      gradient.addColorStop(1, '#0f172a');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      if (!isActive) {
        // Idle state: subtle pulse
        ctx.beginPath();
        ctx.arc(centerX, centerY, 50 + Math.sin(time * 0.05) * 5, 0, Math.PI * 2);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2;
        ctx.stroke();
        time += 1;
        animationId = requestAnimationFrame(draw);
        return;
      }

      // Active state: Dynamic Orbs
      // The "Manager" (AI Output) - Main inner orb
      const aiBaseSize = 60;
      const aiScale = 1 + (outputLevel * 4); // Reacts strongly to output
      const aiSize = aiBaseSize * aiScale;
      
      // Glow
      const glow = ctx.createRadialGradient(centerX, centerY, aiSize * 0.5, centerX, centerY, aiSize * 1.5);
      glow.addColorStop(0, 'rgba(217, 119, 6, 0.8)'); // Gold/Orange core
      glow.addColorStop(1, 'rgba(217, 119, 6, 0)');
      
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(centerX, centerY, aiSize * 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.fillStyle = '#f59e0b'; // Amber 500
      ctx.beginPath();
      ctx.arc(centerX, centerY, aiSize, 0, Math.PI * 2);
      ctx.fill();

      // The "Candidate" (User Input) - Outer ripples or ring
      // Only visible when user talks
      if (inputLevel > 0.05) {
        const ringBase = 120;
        const ringScale = 1 + (inputLevel * 2);
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, ringBase * ringScale, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)'; // Slate 400
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(centerX, centerY, (ringBase + 20) * ringScale, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      time += 1;
      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [inputLevel, outputLevel, isActive]);

  return (
    <canvas 
      ref={canvasRef} 
      width={600} 
      height={400} 
      className="w-full h-full object-cover rounded-3xl"
    />
  );
};

export default Visualizer;