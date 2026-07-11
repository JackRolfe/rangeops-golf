// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Shot, Target } from '../domain/types';
import { RangeMapCanvas } from './RangeMapCanvas';

const TARGET: Target = { cx: 0.5, cy: 0.5, radius: 0.1 };

const SHOTS: Shot[] = [
  { id: 'inside', x: 0.53, y: 0.5, recordedAt: '2026-07-11T01:00:00.000Z' },
  { id: 'outside', x: 0.8, y: 0.5, recordedAt: '2026-07-11T01:01:00.000Z' },
];

beforeAll(() => {
  Object.defineProperty(SVGElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(cleanup);

describe('RangeMapCanvas', () => {
  it('uses geometry-aware shape and colour markers for shot results', () => {
    const { container } = render(
      <RangeMapCanvas
        imageUrl="blob:test-map"
        imageWidth={1_000}
        imageHeight={500}
        target={TARGET}
        shots={SHOTS}
        mode="review"
      />,
    );

    expect(container.querySelector('[data-status="on-target"]')).toHaveAttribute(
      'data-shot-id',
      'inside',
    );
    expect(container.querySelector('[data-status="off-target"]')).toHaveAttribute(
      'data-shot-id',
      'outside',
    );
    expect(screen.getByLabelText(/shot 1: on target/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/shot 2: miss/i)).toBeInTheDocument();
  });

  it('moves the target with accessible keyboard controls in setup mode', () => {
    const onTargetChange = vi.fn();
    render(
      <RangeMapCanvas
        imageUrl="blob:test-map"
        imageWidth={1_000}
        imageHeight={500}
        target={TARGET}
        mode="setup"
        onTargetChange={onTargetChange}
      />,
    );

    fireEvent.keyDown(screen.getByRole('application'), { key: 'ArrowRight' });

    expect(onTargetChange).toHaveBeenCalledWith({
      cx: 0.51,
      cy: 0.5,
      radius: 0.1,
    });
  });

  it('resizes the target with its drag handle', () => {
    const onTargetChange = vi.fn();
    const { container } = render(
      <RangeMapCanvas
        imageUrl="blob:test-map"
        imageWidth={1_000}
        imageHeight={500}
        target={TARGET}
        mode="setup"
        onTargetChange={onTargetChange}
      />,
    );

    const map = screen.getByRole('application');
    const resizeHandle = container.querySelector('[data-target-resize-handle]');
    expect(resizeHandle).not.toBeNull();
    vi.spyOn(map, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 300,
      bottom: 150,
      width: 300,
      height: 150,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(resizeHandle as Element, {
      pointerId: 3,
      button: 0,
      clientX: 165,
      clientY: 75,
    });
    fireEvent.pointerMove(map, { pointerId: 3, clientX: 180, clientY: 75 });

    expect(onTargetChange).toHaveBeenCalledWith({ cx: 0.5, cy: 0.5, radius: 0.2 });
  });

  it('converts a map tap within a letterboxed SVG into image coordinates', () => {
    const onShot = vi.fn();
    render(
      <RangeMapCanvas
        imageUrl="blob:test-map"
        imageWidth={1_000}
        imageHeight={500}
        target={TARGET}
        mode="record"
        onShot={onShot}
      />,
    );

    const map = screen.getByRole('application');
    vi.spyOn(map, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 300,
      bottom: 300,
      width: 300,
      height: 300,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(map, { pointerId: 4, button: 0, clientX: 75, clientY: 105 });
    fireEvent.pointerUp(map, { pointerId: 4, button: 0, clientX: 75, clientY: 105 });

    expect(onShot).toHaveBeenCalledWith({ x: 0.25, y: 0.2 });

    fireEvent.pointerDown(map, { pointerId: 5, button: 0, clientX: 75, clientY: 30 });
    fireEvent.pointerUp(map, { pointerId: 5, button: 0, clientX: 75, clientY: 30 });
    expect(onShot).toHaveBeenCalledTimes(1);
  });

  it('does not mutate a read-only recording map', () => {
    const onShot = vi.fn();
    render(
      <RangeMapCanvas
        imageUrl="blob:test-map"
        imageWidth={1_000}
        imageHeight={500}
        target={TARGET}
        mode="record"
        readOnly
        onShot={onShot}
      />,
    );

    expect(screen.getByRole('img', { name: /driving range shot map/i })).not.toHaveAttribute(
      'tabindex',
    );
    fireEvent.keyDown(screen.getByRole('img', { name: /driving range shot map/i }), {
      key: 'Enter',
    });
    expect(onShot).not.toHaveBeenCalled();
  });
});
