"use client";

import { useEffect, useRef } from "react";

type VoiceOrbStage = "idle" | "listening" | "thinking" | "speaking";

/**
 * Gemini-style voice visualizer.
 *
 * Renders a pulsing orb with an animated audio-wave ring. The ring reacts to
 * the current session stage: listening (active wave), thinking (slow pulse),
 * speaking (gentle pulse), idle (dim).
 */
export function VoiceOrb({ stage }: { stage: VoiceOrbStage }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const phaseRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    const dpr = window.devicePixelRatio || 1;
    const size = 96;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const center = size / 2;

    const draw = () => {
      phaseRef.current += 0.08;
      ctx.clearRect(0, 0, size, size);

      const isListening = stage === "listening";
      const isSpeaking = stage === "speaking";
      const isThinking = stage === "thinking";

      const gradient = ctx.createRadialGradient(center, center, 8, center, center, 44);
      if (isListening) {
        gradient.addColorStop(0, "rgba(99, 102, 241, 0.9)");
        gradient.addColorStop(0.6, "rgba(99, 102, 241, 0.35)");
        gradient.addColorStop(1, "rgba(99, 102, 241, 0)");
      } else if (isSpeaking) {
        gradient.addColorStop(0, "rgba(16, 185, 129, 0.85)");
        gradient.addColorStop(0.6, "rgba(16, 185, 129, 0.3)");
        gradient.addColorStop(1, "rgba(16, 185, 129, 0)");
      } else if (isThinking) {
        gradient.addColorStop(0, "rgba(245, 158, 11, 0.8)");
        gradient.addColorStop(0.6, "rgba(245, 158, 11, 0.28)");
        gradient.addColorStop(1, "rgba(245, 158, 11, 0)");
      } else {
        gradient.addColorStop(0, "rgba(148, 163, 184, 0.5)");
        gradient.addColorStop(1, "rgba(148, 163, 184, 0)");
      }

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(center, center, isListening ? 42 : isSpeaking ? 38 : isThinking ? 36 : 28, 0, Math.PI * 2);
      ctx.fill();

      // Inner solid orb.
      ctx.fillStyle = isListening
        ? "rgba(99, 102, 241, 1)"
        : isSpeaking
          ? "rgba(16, 185, 129, 1)"
          : isThinking
            ? "rgba(245, 158, 11, 1)"
            : "rgba(148, 163, 184, 0.6)";
      ctx.beginPath();
      ctx.arc(center, center, 18, 0, Math.PI * 2);
      ctx.fill();

      // Wave ring for listening / speaking.
      if (isListening || isSpeaking) {
        ctx.strokeStyle = isListening ? "rgba(99, 102, 241, 0.6)" : "rgba(16, 185, 129, 0.5)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let angle = 0; angle < Math.PI * 2; angle += 0.15) {
          const ringBase = 26;
          const amplitude = isListening ? 10 : 5;
          const frequency = isListening ? 5 : 3;
          const r = ringBase + Math.sin(angle * frequency + phaseRef.current) * amplitude;
          const x = center + Math.cos(angle) * r;
          const y = center + Math.sin(angle) * r;
          if (angle === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [stage]);

  return <canvas ref={canvasRef} aria-hidden="true" className="atlas-voice-orb" />;
}
