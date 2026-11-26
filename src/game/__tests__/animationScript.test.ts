import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  animationScriptFor,
  buildCastPlan,
  clipTimeAt,
  segmentAt
} from '../castPlan.ts';
import { compileAnimationScript } from '../animationScript.ts';
import {
  attackScript,
  channelFillScript,
  channelScript,
  dashScript,
  releaseScript
} from '../animationPresets.ts';
import type { AbilityDef } from '../core/abilities/def.ts';
import type { AnimationScript } from '../core/animationScript.ts';
import type { CastSegment, ClipResolver } from '../core/castPlan.ts';
import type {
  ClipInfo,
  ClipLibrary,
  ResolvedClip
} from '../core/clipLibrary.ts';

const EPSILON = 1e-6;

function makeClip(
  duration = 0.4,
  impact = 0.25,
  followThrough = 0.5,
  loop = false
): ClipInfo {
  return {
    animation: 'attack',
    duration,
    loop,
    markers: { impact, followThrough },
    rootMotion: 'ignore'
  };
}

function resolver(clips: ClipLibrary): ClipResolver {
  return (name) => {
    const clip = clips[name];
    return clip ? ({ name, clip } as ResolvedClip) : null;
  };
}

function defWith(overrides: Record<string, unknown> = {}): AbilityDef {
  return {
    id: 'test',
    shape: 'melee',
    startup: 0,
    active: 0,
    recovery: 0,
    presentation: [],
    presentationBySpecies: null,
    ...overrides
  } as unknown as AbilityDef;
}

function close(actual: number, expected: number, message?: string): void {
  assert.ok(
    Math.abs(actual - expected) < EPSILON,
    message ?? `${actual} != ${expected}`
  );
}

test('clipTimeAt repite solo el tramo del segmento', () => {
  const segment: CastSegment = {
    animation: 'attack',
    clipStart: 0.1,
    clipEnd: 0.2,
    startAt: 0,
    endAt: 10,
    speed: 1,
    loop: true,
    blendIn: 0,
    blendOut: 0
  };
  close(clipTimeAt(segment, 0), 0.1);
  close(clipTimeAt(segment, 0.05), 0.15);
  close(clipTimeAt(segment, 0.1), 0.1);
  close(clipTimeAt(segment, 0.15), 0.15);
  close(clipTimeAt(segment, 0.2), 0.1);
});

test('attackScript alinea impacto, activo y recuperación', () => {
  const def = defWith({
    startup: 0.2,
    active: 0.1,
    recovery: 0.3,
    presentation: attackScript('attack')
  });
  const plan = buildCastPlan(
    def,
    resolver({ attack: makeClip(0.4, 0.25, 0.5) })
  );

  close(plan.effectAt, 0.2);
  close(plan.activeEnd, 0.3);
  close(plan.endAt, 0.6);
  close(plan.animationEndAt, 0.6);
  assert.equal(plan.impactClip, 'attack');
  close(plan.impactTime ?? -1, 0.1);
  assert.equal(plan.segments.length, 4);

  const [hold, lead, active, recovery] = plan.segments;
  close(hold.startAt, 0);
  close(hold.endAt, 0.2 - 0.1 / 0.6);
  close(hold.clipStart, 0);
  close(hold.clipEnd, 0);

  close(lead.startAt, hold.endAt);
  close(lead.endAt, 0.2);
  close(lead.clipStart, 0);
  close(lead.clipEnd, 0.1);
  close(lead.speed, 0.6);

  close(active.startAt, 0.2);
  close(active.endAt, 0.3);
  close(active.clipStart, 0.1);
  close(active.clipEnd, 0.2);
  close(active.speed, 1);

  close(recovery.startAt, 0.3);
  close(recovery.endAt, 0.6);
  close(recovery.clipStart, 0.2);
  close(recovery.clipEnd, 0.4);
  close(recovery.speed, 0.2 / 0.3);

  const impactSegment = segmentAt(plan, plan.effectAt);
  assert.ok(impactSegment);
  close(
    clipTimeAt(impactSegment!, plan.effectAt),
    plan.impactTime ?? -1
  );
});

test('alignImpact recorta la anticipación si el clip no cabe a MAX', () => {
  const def = defWith({
    startup: 0.1,
    presentation: releaseScript('attack')
  });
  const plan = buildCastPlan(
    def,
    resolver({ attack: makeClip(2, 0.5, 1) })
  );
  const lead = plan.segments[0];
  close(lead.endAt, 0.1);
  close(lead.speed, 2.5);
  close(lead.clipEnd, 1);
  close(lead.clipStart, 1 - 0.1 * 2.5);
  close(plan.impactTime ?? -1, 1);
});

test('releaseScript dibuja el impacto justo en el efecto', () => {
  const def = defWith({
    startup: 0.2,
    active: 0,
    recovery: 0.3,
    presentation: releaseScript('attack')
  });
  const plan = buildCastPlan(
    def,
    resolver({ attack: makeClip(0.4, 0.5, 1) })
  );
  const segment = segmentAt(plan, plan.effectAt);
  assert.ok(segment);
  close(clipTimeAt(segment!, plan.effectAt), 0.2);
  close(plan.impactTime ?? -1, 0.2);
});

test('dashScript estira el clip completo durante el desplazamiento', () => {
  const def = defWith({
    shape: 'dash',
    startup: 0.1,
    active: 0.3,
    recovery: 0.1,
    presentation: dashScript('attack')
  });
  const plan = buildCastPlan(
    def,
    resolver({ attack: makeClip(0.5, 0.5, 1) })
  );
  const segment = plan.segments[0];
  close(segment.startAt, 0.1);
  close(segment.endAt, 0.4);
  close(segment.clipStart, 0);
  close(segment.clipEnd, 0.5);
  close(segment.speed, 0.5 / 0.3);
});

test('channelFillScript solo dibuja la carga si el lanzamiento llega tarde', () => {
  const clip = (): ClipInfo => makeClip(0.4, 0.25, 0.5);
  const late = defWith({
    startup: 0.2,
    presentation: channelFillScript('charge', releaseScript('attack'))
  });
  const latePlan = buildCastPlan(
    late,
    resolver({ charge: { ...clip(), animation: 'charge' }, attack: clip() })
  );
  assert.ok(
    latePlan.segments.some((segment) => segment.animation === 'charge')
  );

  const onTime = defWith({
    startup: 0.1,
    presentation: channelFillScript('charge', releaseScript('attack'))
  });
  const onTimePlan = buildCastPlan(
    onTime,
    resolver({ charge: { ...clip(), animation: 'charge' }, attack: clip() })
  );
  assert.equal(
    onTimePlan.segments.some((segment) => segment.animation === 'charge'),
    false
  );
});

test('channelScript mantiene la carga en bucle hasta el efecto', () => {
  const def = defWith({
    startup: 0.4,
    active: 0.2,
    recovery: 0.2,
    presentation: channelScript('charge', 'attack')
  });
  const plan = buildCastPlan(
    def,
    resolver({
      charge: { ...makeClip(0.3, 0.5, 1), animation: 'charge' },
      attack: makeClip(0.4, 0.5, 1)
    })
  );
  const loop = plan.segments[0];
  assert.equal(loop.animation, 'charge');
  assert.equal(loop.loop, true);
  close(loop.startAt, 0);
  close(loop.endAt, 0.4);
  close(clipTimeAt(loop, 0.35), 0.05);
});

test('los segmentos solapados se recortan a favor del que empieza después', () => {
  const script: AnimationScript = [
    { clip: 'attack', at: 'start', until: { at: 0.4 }, fit: 'stretch' },
    { clip: 'attack', at: { at: 0.2 }, until: 'end', fit: 'stretch' }
  ];
  const plan = compileAnimationScript(
    script,
    { startup: 0.2, active: 0.2, recovery: 0.2 },
    resolver({ attack: makeClip(0.4, 0.5, 1) })
  );
  assert.equal(plan.segments.length, 2);
  close(plan.segments[0].endAt, 0.2);
  close(plan.segments[1].startAt, 0.2);
});

test('animationScriptFor usa el override de especie', () => {
  const def = defWith({
    presentation: attackScript('attack'),
    presentationBySpecies: { '0025': attackScript('punch') }
  });
  assert.equal(animationScriptFor(def, '0025')[0]?.clip, 'punch');
  assert.equal(animationScriptFor(def, '0001')[0]?.clip, 'attack');
});
