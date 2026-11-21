import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

interface JoystickProps {
  /** Each axis -1..1: x right, y forward (up the screen). */
  onMove: (x: number, y: number) => void;
  onRelease: () => void;
  disabled?: boolean;
}

const KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] as const;
type ArrowKey = (typeof KEYS)[number];
const isArrow = (key: string): key is ArrowKey => (KEYS as readonly string[]).includes(key);

/**
 * Hold-to-drive stick, ported from the site demo. Let go, lift the finger off
 * the screen, lose the pointer or the focus, and it releases.
 */
export function Joystick({ onMove, onRelease, disabled = false }: JoystickProps) {
  const pad = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const keys = useRef(new Set<ArrowKey>());
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  function release() {
    const wasHeld = dragging.current || keys.current.size > 0;
    dragging.current = false;
    keys.current.clear();
    setKnob({ x: 0, y: 0 });
    if (wasHeld) onRelease();
  }

  function moveTo(event: PointerEvent<HTMLDivElement>) {
    const rect = pad.current!.getBoundingClientRect();
    const radius = rect.width / 2 || 1;
    let dx = event.clientX - (rect.left + rect.width / 2);
    let dy = event.clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(dx, dy);
    if (distance > radius) {
      dx *= radius / distance;
      dy *= radius / distance;
    }
    setKnob({ x: dx / radius, y: dy / radius });
    onMove(dx / radius, -dy / radius);
  }

  function keyStick(): { x: number; y: number } {
    const held = keys.current;
    return {
      x: (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0),
      y: (held.has('ArrowUp') ? 1 : 0) - (held.has('ArrowDown') ? 1 : 0),
    };
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled || !isArrow(event.key)) return;
    event.preventDefault();
    keys.current.add(event.key);
    const { x, y } = keyStick();
    setKnob({ x: x * 0.7, y: -y * 0.7 });
    onMove(x, y);
  }

  function onKeyUp(event: KeyboardEvent<HTMLDivElement>) {
    if (!isArrow(event.key)) return;
    keys.current.delete(event.key);
    if (keys.current.size === 0) {
      setKnob({ x: 0, y: 0 });
      onRelease();
      return;
    }
    const { x, y } = keyStick();
    setKnob({ x: x * 0.7, y: -y * 0.7 });
    onMove(x, y);
  }

  return (
    <div
      ref={pad}
      className={`joystick ${disabled ? 'is-disabled' : ''}`}
      role="application"
      aria-label="Joystick. Hold and drag, or hold the arrow keys, to drive Mulligan. Let go to stop."
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onPointerDown={(event) => {
        if (disabled) return;
        dragging.current = true;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Capture is a nicety; release still comes from pointerup.
        }
        event.preventDefault();
        moveTo(event);
      }}
      onPointerMove={(event) => {
        if (dragging.current) moveTo(event);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={release}
    >
      <div
        className="joystick__knob"
        style={{ transform: `translate(${knob.x * 50}%, ${knob.y * 50}%)` }}
        data-testid="joystick-knob"
      />
    </div>
  );
}
