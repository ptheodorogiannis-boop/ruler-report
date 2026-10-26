'use client';

// Avatars (docs/DESIGN.md › Award pass): UserAvatar is the quiet identity mark; LoginAvatar is the face that watches
// the pointer, becomes yours as you type your email, and closes its eyes while you type your password. A face that only
// stands still (the 404) is StaticAvatar in ./avatar-static, rendered on the server without this module (Pass 5b).
import clsx from 'clsx';
import { useEffect, useMemo, useRef } from 'react';
import { Avatar, type AvatarController } from '@bible-strong/avatar-react';
import { avatarFor } from '@/lib/avatar';

export function UserAvatar({ seed, size = 32, className, label, animate = false, expression }: { seed: string; size?: number; className?: string; label?: string; animate?: boolean; /** a fixed expression key of the base character, e.g. 'far-right-glance' */ expression?: string }) {
  const def = useMemo(() => avatarFor(seed), [seed]);
  return <Avatar definition={def} size={size} className={clsx('shrink-0', className)} ariaLabel={label ?? 'Avatar'} {...(expression ? { defaultExpression: expression } : animate ? { defaultAnimation: 'idle' } : { defaultExpression: 'neutral' })} />;
}

export type Mood = 'watch' | 'covered' | 'wrong' | 'thinking' | 'success';

// gaze expressions of the base character, by where the pointer is relative to the face
const GAZE: Record<string, string> = {
  'up-left': 'asymmetric-up-left',
  up: 'upward-side-glance',
  'up-right': 'upward-side-glance',
  left: 'attentive-left',
  right: 'far-right-glance',
  'down-left': 'wide-down-left',
  down: 'downward-gaze',
  'down-right': 'joyful-down-right',
};

export function LoginAvatar({ seed, size, mood, className }: { seed: string; /** pixels; left out, the box is sized by CSS so the server already renders its final size (docs/DESIGN.md › Pass 5) */ size?: number; mood: Mood; className?: string }) {
  const def = useMemo(() => avatarFor(seed), [seed]);
  const ref = useRef<AvatarController>(null);
  const box = useRef<HTMLDivElement>(null);
  const gaze = useRef<string | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // moods that are not "watching" take over the face
  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    gaze.current = null;
    if (mood === 'covered') a.setExpression('eyes-closed');
    else if (mood === 'wrong') a.setExpression('skeptical-right');
    else if (mood === 'thinking') a.play('thinking');
    else if (mood === 'success') a.play('happy');
    else a.play('idle');
  }, [mood, def]);

  // watching: pick a gaze from the pointer position, fall back to the idle animation after a pause
  useEffect(() => {
    if (mood !== 'watch') return;
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.matchMedia('(hover: none)').matches) return;
    const onMove = (e: PointerEvent) => {
      const el = box.current;
      const a = ref.current;
      if (!el || !a) return;
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width * 1.2);
      const dy = (e.clientY - (r.top + r.height / 2)) / (r.height * 1.2);
      const h = dx < -0.22 ? 'left' : dx > 0.22 ? 'right' : '';
      const v = dy < -0.22 ? 'up' : dy > 0.22 ? 'down' : '';
      const key = h && v ? `${v}-${h}` : v || h;
      const next = key ? GAZE[key] ?? null : null;
      if (next !== gaze.current) {
        gaze.current = next;
        if (next) a.setExpression(next);
        else a.play('idle');
      }
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        gaze.current = null;
        ref.current?.play('idle');
      }, 2600);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      clearTimeout(idleTimer.current);
    };
  }, [mood, def]);

  return (
    <div ref={box} className={clsx('login-avatar', className)} style={size ? { width: size, height: size } : undefined}>
      <Avatar ref={ref} definition={def} size={size ?? '100%'} defaultAnimation="idle" ariaLabel="Your avatar" />
    </div>
  );
}
