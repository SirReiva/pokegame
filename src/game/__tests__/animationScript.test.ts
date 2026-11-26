import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  animationScriptFor,
  buildCastPlan,
  frameForSegment
} from '../castPlan.ts';
import { compileAnimationScript } from '../animationScript.ts';
import {
  attackScript,
  channelFillScript,
  channelScript,
  dashScript,
  releaseScript
} from '../animationPresets.ts';
import {
  frameBoundary,
  frameSpanDuration
} from '../animationTimeline.ts';
import type { AbilityDef } from '../core/abilities/def.ts';
import type { AnimationScript } from '../core/animationScript.ts';
import type { CastSegment, ClipResolver } from '../core/castPlan.ts';
import type { SpriteAnimation } from '../core/types.ts';

const EPSILON = 1e-6;

function makeAnimation(
  overrides: Partial<SpriteAnimation> = {}
): SpriteAnimation {
  const durations = overrides.durations ?? [6, 6, 6, 6];
  return {
    durations,
    rushFrame: 0,
    hitFrame: 1,
    returnFrame: 2,
    ...overrides
  };
}

function resolver(
  clips: Record<string, SpriteAnimation>
): ClipResolver {
  return (name) => {
    const animation = clips[name];
    return animation ? { name, animation } : null;
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

test('frameBoundary incluye el borde final y frameSpanDuration suma el tramo', () => {
  const clip = makeAnimation();
  close(frameBoundary(clip, 0), 0);
  close(frameBoundary(clip, 1), 0.1);
  close(frameBoundary(clip, 4), 0.4);
  close(frameBoundary(clip, 99), 0.4);
  close(frameSpanDuration(clip, 0, 0), 0.1);
  close(frameSpanDuration(clip, 1, 2), 0.2);
});

test('frameForSegment repite solo el tramo del segmento', () => {
  const clip = makeAnimation();
  const segment: CastSegment = {
    animation: 'attack',
    startFrame: 1,
    endFrame: 2,
    startAt: 0,
    endAt: 10,
    playback: 1,
    clipStartAt: frameBoundary(clip, 1),
    loop: true
  };
  assert.equal(frameForSegment(segment, clip, 0), 1);
  assert.equal(frameForSegment(segment, clip, 0.15), 2);
  assert.equal(frameForSegment(segment, clip, 0.2), 1);
  assert.equal(frameForSegment(segment, clip, 0.25), 1);
  assert.equal(frameForSegment(segment, clip, 0.35), 2);
  assert.equal(frameForSegment(segment, clip, 0.4), 1);
});

test('attackScript coloca anticipación, impacto y recuperación', () => {
  const def = defWith({
    startup: 0.2,
    active: 0.1,
    recovery: 0.3,
    presentation: attackScript('attack')
  });
  const plan = buildCastPlan(def, resolver({ attack: makeAnimation() }));

  close(plan.effectAt, 0.2);
  close(plan.activeEnd, 0.3);
  close(plan.endAt, 0.6);
  close(plan.animationEndAt, 0.6);
  assert.equal(plan.hitFrame, 1);
  assert.equal(plan.hitClip, 'attack');
  assert.equal(plan.segments.length, 4);

  const [hold, lead, active, recovery] = plan.segments;
  assert.equal(hold.animation, 'attack');
  assert.equal(hold.startFrame, 0);
  assert.equal(hold.endFrame, 0);
  close(hold.startAt, 0);
  close(hold.endAt, 0.2 - 0.1 / 0.6);

  assert.equal(lead.startFrame, 0);
  assert.equal(lead.endFrame, 0);
  close(lead.startAt, hold.endAt);
  close(lead.endAt, 0.2);
  close(lead.playback, 0.6);

  assert.equal(active.startFrame, 1);
  assert.equal(active.endFrame, 1);
  close(active.startAt, 0.2);
  close(active.endAt, 0.3);
  close(active.playback, 1);

  assert.equal(recovery.startFrame, 2);
  assert.equal(recovery.endFrame, 3);
  close(recovery.startAt, 0.3);
  close(recovery.endAt, 0.6);
  close(recovery.playback, 0.2 / 0.3);
});

test('un hueco deja el sprite sin animación y animationEndAt lo refleja', () => {
  const script: AnimationScript = [
    { clip: 'attack', at: { at: 0 }, duration: 0.1, fit: 'natural' },
    { clip: 'charge', at: { at: 0.2 }, duration: 0.1, fit: 'natural' }
  ];
  const plan = buildCastPlan(
    defWith({ startup: 0, active: 0.2, recovery: 0.2, presentation: script }),
    resolver({ attack: makeAnimation(), charge: makeAnimation() })
  );

  close(plan.endAt, 0.4);
  assert.equal(plan.segments.length, 2);
  assert.equal(plan.segments[0].animation, 'attack');
  close(plan.segments[0].startAt, 0);
  close(plan.segments[0].endAt, 0.1);
  assert.equal(plan.segments[1].animation, 'charge');
  close(plan.segments[1].startAt, 0.2);
  close(plan.segments[1].endAt, 0.3);
  close(plan.animationEndAt, 0.3);
});

test('el script puede encadenar clips distintos', () => {
  const script: AnimationScript = [
    { clip: 'charge', at: 'start', until: 'effect', mode: 'loop' },
    {
      clip: 'attack',
      frames: { from: 'hit', to: 'last' },
      at: 'effect',
      until: 'end',
      fit: 'trimEnd',
      hold: true
    }
  ];
  const plan = buildCastPlan(
    defWith({ startup: 0.3, active: 0.1, recovery: 0.2, presentation: script }),
    resolver({ attack: makeAnimation(), charge: makeAnimation() })
  );

  assert.equal(plan.segments.length, 2);
  assert.equal(plan.segments[0].animation, 'charge');
  assert.equal(plan.segments[0].loop, true);
  close(plan.segments[0].endAt, 0.3);
  assert.equal(plan.segments[1].animation, 'attack');
  assert.equal(plan.segments[1].startFrame, 1);
  close(plan.segments[1].startAt, 0.3);
  close(plan.segments[1].endAt, 0.6);
});

test('trimStart descarta anticipación cuando el clip no cabe', () => {
  const clip = makeAnimation({ hitFrame: 3, returnFrame: 3 });
  const plan = buildCastPlan(
    defWith({
      startup: 0.1,
      active: 0,
      recovery: 0,
      presentation: [
        {
          clip: 'attack',
          frames: { from: 'first', to: 'beforeHit' },
          at: 'start',
          until: 'effect',
          fit: 'trimStart'
        }
      ]
    }),
    resolver({ attack: clip })
  );

  assert.equal(plan.segments.length, 1);
  assert.equal(plan.segments[0].startFrame, 2);
  assert.equal(plan.segments[0].endFrame, 2);
  close(plan.segments[0].playback, 1);
});

test('trimEnd descarta el final cuando el clip no cabe', () => {
  const clip = makeAnimation({ hitFrame: 3, returnFrame: 3 });
  const plan = buildCastPlan(
    defWith({
      startup: 0.1,
      active: 0,
      recovery: 0,
      presentation: [
        {
          clip: 'attack',
          frames: { from: 'first', to: 'beforeHit' },
          at: 'start',
          until: 'effect',
          fit: 'trimEnd'
        }
      ]
    }),
    resolver({ attack: clip })
  );

  assert.equal(plan.segments.length, 1);
  assert.equal(plan.segments[0].startFrame, 0);
  assert.equal(plan.segments[0].endFrame, 1);
  close(plan.segments[0].playback, 1.8);
});

test('hold mantiene el último frame y sin hold deja hueco', () => {
  const clip = makeAnimation();
  const base = {
    startup: 0,
    active: 0,
    recovery: 0.4
  };
  const withHold = buildCastPlan(
    defWith({
      ...base,
      presentation: [
        {
          clip: 'attack',
          frames: { from: 0, to: 0 },
          at: 'start',
          until: 'end',
          hold: true
        }
      ]
    }),
    resolver({ attack: clip })
  );
  assert.equal(withHold.segments.length, 2);
  close(withHold.segments[0].endAt, 0.1 / 0.6);
  assert.equal(withHold.segments[1].startFrame, 0);
  assert.equal(withHold.segments[1].endFrame, 0);
  close(withHold.segments[1].startAt, withHold.segments[0].endAt);
  close(withHold.segments[1].endAt, 0.4);

  const withoutHold = buildCastPlan(
    defWith({
      ...base,
      presentation: [
        {
          clip: 'attack',
          frames: { from: 0, to: 0 },
          at: 'start',
          until: 'end'
        }
      ]
    }),
    resolver({ attack: clip })
  );
  assert.equal(withoutHold.segments.length, 1);
  close(withoutHold.segments[0].endAt, 0.1 / 0.6);
  close(withoutHold.animationEndAt, 0.1 / 0.6);
});

test('el override por especie reemplaza el script común', () => {
  const def = defWith({
    startup: 0.2,
    active: 0.1,
    recovery: 0.1,
    presentation: attackScript('attack'),
    presentationBySpecies: { gengar: attackScript('quickstrike') }
  });
  const resolve = resolver({
    attack: makeAnimation(),
    quickstrike: makeAnimation()
  });

  const common = buildCastPlan(def, resolve);
  const gengar = buildCastPlan(def, resolve, 'gengar');
  assert.equal(
    common.segments.some((segment) => segment.animation === 'quickstrike'),
    false
  );
  assert.equal(
    gengar.segments.some((segment) => segment.animation === 'quickstrike'),
    true
  );
  assert.equal(animationScriptFor(def, 'gengar'), def.presentationBySpecies?.gengar);
  assert.equal(animationScriptFor(def, 'pikachu'), def.presentation);
  assert.equal(animationScriptFor(def), def.presentation);
});

test('un paso se recorta al final del casteo', () => {
  const plan = buildCastPlan(
    defWith({
      startup: 0.1,
      active: 0,
      recovery: 0.1,
      presentation: [
        { clip: 'attack', at: 'start', until: { at: 5 }, fit: 'trimEnd' }
      ]
    }),
    resolver({ attack: makeAnimation() })
  );

  close(plan.endAt, 0.2);
  assert.equal(plan.segments.length, 1);
  close(plan.segments[0].startAt, 0);
  close(plan.segments[0].endAt, 0.2);
});

test('los solapamientos los gana el paso que empieza después', () => {
  const plan = buildCastPlan(
    defWith({
      startup: 0,
      active: 0.3,
      recovery: 0.1,
      presentation: [
        { clip: 'attack', at: 'start', duration: 0.2, fit: 'natural' },
        { clip: 'charge', at: 'start', duration: 0.2, fit: 'natural' }
      ]
    }),
    resolver({ attack: makeAnimation(), charge: makeAnimation() })
  );

  assert.equal(plan.segments.length, 1);
  assert.equal(plan.segments[0].animation, 'charge');
  close(plan.segments[0].startAt, 0);
  close(plan.segments[0].endAt, 0.2);
});

test('un clip que no existe deja un hueco sin romper el plan', () => {
  const plan = buildCastPlan(
    defWith({
      startup: 0.2,
      active: 0,
      recovery: 0,
      presentation: [
        { clip: 'charge', duration: 0.1, fit: 'natural' },
        { clip: 'attack', duration: 0.1, fit: 'natural' }
      ]
    }),
    resolver({ attack: makeAnimation() })
  );

  assert.equal(plan.segments.length, 1);
  assert.equal(plan.segments[0].animation, 'attack');
  close(plan.segments[0].startAt, 0.1);
  close(plan.segments[0].endAt, 0.2);
});

test('el impacto solo se fuerza si el HitFrame cae en el tramo', () => {
  const plan = buildCastPlan(
    defWith({
      startup: 0,
      active: 0,
      recovery: 0.2,
      presentation: [
        {
          clip: 'attack',
          frames: { from: 'return', to: 'last' },
          at: 'start',
          until: 'end',
          fit: 'trimEnd'
        }
      ]
    }),
    resolver({ attack: makeAnimation() })
  );

  assert.equal(plan.hitFrame, null);
  assert.equal(plan.hitClip, null);
});

test('un tramo vacío con hold congela el frame de inicio', () => {
  const clip = makeAnimation({ hitFrame: 1, returnFrame: 1 });
  const plan = buildCastPlan(
    defWith({
      startup: 0,
      active: 0.2,
      recovery: 0.1,
      presentation: attackScript('attack')
    }),
    resolver({ attack: clip })
  );

  assert.equal(plan.segments.length, 2);
  assert.equal(plan.segments[0].startFrame, 1);
  assert.equal(plan.segments[0].endFrame, 1);
  close(plan.segments[0].startAt, 0);
  close(plan.segments[0].endAt, 0.2);
  assert.equal(plan.hitFrame, 1);
});

test('releaseScript encadena anticipación y recuperación sin ventana activa', () => {
  const plan = buildCastPlan(
    defWith({
      startup: 0.2,
      active: 0,
      recovery: 0.3,
      presentation: releaseScript('attack')
    }),
    resolver({ attack: makeAnimation() })
  );

  assert.equal(plan.segments.length, 3);
  const [hold, lead, release] = plan.segments;
  close(hold.endAt, 0.2 - 0.1 / 0.6);
  close(lead.startAt, hold.endAt);
  close(lead.endAt, 0.2);
  assert.equal(release.startFrame, 1);
  assert.equal(release.endFrame, 3);
  close(release.startAt, 0.2);
  close(release.endAt, 0.5);
  assert.equal(plan.hitFrame, 1);
  assert.equal(plan.hitClip, 'attack');
});

test('fill ocupa solo el hueco que deja la anticipación', () => {
  const def = defWith({
    startup: 0.2,
    active: 0,
    recovery: 0.3,
    presentation: channelFillScript('charge', releaseScript('shoot'))
  });
  const plan = buildCastPlan(
    def,
    resolver({ charge: makeAnimation(), shoot: makeAnimation() })
  );

  assert.equal(plan.segments.length, 3);
  assert.equal(plan.segments[0].animation, 'charge');
  close(plan.segments[0].startAt, 0);
  close(plan.segments[0].endAt, 0.2 - 0.1 / 0.6);
  assert.equal(plan.segments[0].startFrame, 0);
  assert.equal(plan.segments[1].animation, 'shoot');
  close(plan.segments[1].startAt, plan.segments[0].endAt);
  close(plan.segments[1].endAt, 0.2);
  assert.equal(plan.hitFrame, 1);
});

test('fill no se dibuja si la anticipación cabe entera', () => {
  const clip = makeAnimation({ hitFrame: 2 });
  const def = defWith({
    startup: 0.2,
    active: 0,
    recovery: 0.3,
    presentation: channelFillScript('charge', releaseScript('shoot'))
  });
  const plan = buildCastPlan(
    def,
    resolver({ charge: makeAnimation(), shoot: clip })
  );

  assert.equal(plan.segments.length, 2);
  assert.equal(
    plan.segments.some((segment) => segment.animation === 'charge'),
    false
  );
  close(plan.segments[0].startAt, 0);
  close(plan.segments[0].endAt, 0.2);
});

test('fill puede ser un bucle', () => {
  const def = defWith({
    startup: 0.2,
    active: 0,
    recovery: 0.3,
    presentation: channelFillScript('charge', releaseScript('shoot'), {
      mode: 'loop'
    })
  });
  const plan = buildCastPlan(
    def,
    resolver({ charge: makeAnimation(), shoot: makeAnimation() })
  );

  assert.equal(plan.segments[0].animation, 'charge');
  assert.equal(plan.segments[0].loop, true);
  close(plan.segments[0].endAt, 0.2 - 0.1 / 0.6);
});

test('fill se omite cuando carga y lanzamiento usan el mismo clip', () => {
  const script = channelFillScript('attack', releaseScript('attack'));
  assert.equal(script.length, releaseScript('attack').length);
  assert.equal(
    script.some((step) => step.fill === true),
    false
  );

  const plan = buildCastPlan(
    defWith({ startup: 0.2, active: 0, recovery: 0.3, presentation: script }),
    resolver({ attack: makeAnimation() })
  );
  assert.equal(plan.segments.length, 3);
  assert.equal(plan.segments[0].startFrame, 0);
  assert.equal(plan.segments[0].endFrame, 0);
});

test('sin anticipación la carga ocupa todo el startup', () => {
  const clip = makeAnimation({ hitFrame: 0, returnFrame: 0 });
  const def = defWith({
    startup: 0.2,
    active: 0,
    recovery: 0.3,
    presentation: channelFillScript('charge', releaseScript('shoot'))
  });
  const plan = buildCastPlan(
    def,
    resolver({ charge: makeAnimation(), shoot: clip })
  );

  assert.equal(plan.segments.length, 2);
  assert.equal(plan.segments[0].animation, 'charge');
  close(plan.segments[0].startAt, 0);
  close(plan.segments[0].endAt, 0.2);
  assert.equal(plan.segments[1].animation, 'shoot');
  close(plan.segments[1].startAt, 0.2);
});

test('channelScript encadena carga y liberación', () => {
  const plan = buildCastPlan(
    defWith({
      startup: 0.5,
      active: 0.1,
      recovery: 0.2,
      presentation: channelScript('charge', 'attack')
    }),
    resolver({ attack: makeAnimation(), charge: makeAnimation() })
  );

  assert.equal(plan.segments[0].animation, 'charge');
  assert.equal(plan.segments[0].loop, true);
  close(plan.segments[0].endAt, 0.5);
  assert.equal(plan.segments[1].animation, 'attack');
  close(plan.segments[1].startAt, 0.5);
  close(plan.segments[1].endAt, 0.6);
});

test('dashScript cubre la ventana activa con el clip completo', () => {
  const plan = buildCastPlan(
    defWith({
      startup: 0,
      active: 0.3,
      recovery: 0.2,
      presentation: dashScript('quickstrike')
    }),
    resolver({ quickstrike: makeAnimation() })
  );

  assert.equal(plan.segments.length, 1);
  assert.equal(plan.segments[0].animation, 'quickstrike');
  assert.equal(plan.segments[0].startFrame, 0);
  assert.equal(plan.segments[0].endFrame, 3);
  close(plan.segments[0].startAt, 0);
  close(plan.segments[0].endAt, 0.3);
  close(plan.animationEndAt, 0.3);
});

test('un loop sin fin explícito dura hasta el final del casteo', () => {
  const plan = compileAnimationScript(
    [{ clip: 'charge', mode: 'loop' }],
    { startup: 0.2, active: 0.2, recovery: 0.1 },
    resolver({ charge: makeAnimation() })
  );

  assert.equal(plan.segments.length, 1);
  close(plan.segments[0].startAt, 0);
  close(plan.segments[0].endAt, 0.5);
  assert.equal(plan.segments[0].loop, true);
});
