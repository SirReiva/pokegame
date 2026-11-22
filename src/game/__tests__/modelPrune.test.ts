import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as pc from 'playcanvas';
import { pruneBindConstantTracks } from '../modelAnim.ts';

type Property = 'localPosition' | 'localRotation' | 'localScale';

interface CurveSpec {
  property: Property;
  values: number[][];
  /** Ruta del nodo; por defecto `bone`. */
  entityPath?: string[];
}

function makeTrack(name: string, specs: CurveSpec[]): pc.AnimTrack {
  const inputs = [new pc.AnimData(1, [0, 1])];
  const outputs: pc.AnimData[] = [];
  const curves: pc.AnimCurve[] = [];
  specs.forEach((spec, index) => {
    outputs.push(
      new pc.AnimData(spec.values[0].length, spec.values.flat())
    );
    curves.push(
      new pc.AnimCurve(
        [
          {
            entityPath: spec.entityPath ?? ['bone'],
            component: 'graph',
            propertyPath: [spec.property]
          }
        ],
        0,
        index,
        pc.INTERPOLATION_LINEAR
      )
    );
  });
  return new pc.AnimTrack(name, 1, inputs, outputs, curves);
}

function makeRig(): pc.GraphNode {
  const root = new pc.GraphNode('model');
  const bone = new pc.GraphNode('bone');
  bone.setLocalPosition(1, 2, 3);
  bone.setLocalRotation(0, 0, 0, 1);
  bone.setLocalScale(1, 1, 1);
  root.addChild(bone);
  return root;
}

test('poda las curvas constantes que coinciden con el bind', () => {
  const root = makeRig();
  const specs: CurveSpec[] = [
    { property: 'localPosition', values: [[1, 2, 3], [1, 2, 3]] },
    { property: 'localRotation', values: [[0, 0, 0, 1], [0, 0, 0.7071, 0.7071]] },
    { property: 'localScale', values: [[1, 1, 1], [1, 1, 1]] }
  ];
  const result = pruneBindConstantTracks(
    [makeTrack('a', specs), makeTrack('b', specs)],
    root
  );

  assert.equal(result.size, 2);
  for (const pruned of result.values()) {
    assert.equal(pruned.curves.length, 1);
    assert.deepEqual(pruned.curves[0].paths[0].propertyPath, ['localRotation']);
    assert.equal(pruned.curves[0].output, 0);
    assert.equal(pruned.outputs[0].components, 4);
    assert.ok(Math.abs((pruned.outputs[0].data[6] as number) - 0.7071) < 1e-4);
  }
});

test('no poda una ruta que alguna pista anima', () => {
  const root = makeRig();
  const constant = makeTrack('a', [
    { property: 'localPosition', values: [[1, 2, 3], [1, 2, 3]] }
  ]);
  const animated = makeTrack('b', [
    { property: 'localPosition', values: [[1, 2, 3], [1, 2, 4]] }
  ]);

  assert.equal(pruneBindConstantTracks([constant, animated], root).size, 0);
});

test('no poda una constante distinta del bind', () => {
  const root = makeRig();
  const track = makeTrack('a', [
    { property: 'localPosition', values: [[9, 2, 3], [9, 2, 3]] }
  ]);

  assert.equal(pruneBindConstantTracks([track, track], root).size, 0);
});

test('no poda una ruta ausente en otra pista', () => {
  const root = makeRig();
  const withPosition = makeTrack('a', [
    { property: 'localPosition', values: [[1, 2, 3], [1, 2, 3]] },
    { property: 'localRotation', values: [[0, 0, 0, 1], [0, 0, 0, 1]] }
  ]);
  const withoutPosition = makeTrack('b', [
    { property: 'localRotation', values: [[0, 0, 0, 1], [0, 0, 0, 1]] }
  ]);
  const result = pruneBindConstantTracks([withPosition, withoutPosition], root);

  const prunedA = result.get(withPosition);
  assert.ok(prunedA);
  assert.equal(prunedA.curves.length, 1);
  assert.deepEqual(prunedA.curves[0].paths[0].propertyPath, ['localPosition']);

  const prunedB = result.get(withoutPosition);
  assert.ok(prunedB);
  assert.equal(prunedB.curves.length, 0);
});

test('acepta quitar el primer segmento de la ruta como el binder', () => {
  const root = makeRig();
  const specs: CurveSpec[] = [
    {
      property: 'localRotation',
      values: [[0, 0, 0, 1], [0, 0, 0, 1]],
      entityPath: ['model', 'bone']
    }
  ];

  const track = makeTrack('a', specs);
  const result = pruneBindConstantTracks([track, track], root);
  assert.ok(result.get(track));
  assert.equal(result.get(track)?.curves.length, 0);
});

test('trata q y -q como la misma rotación', () => {
  const root = makeRig();
  const track = makeTrack('a', [
    { property: 'localRotation', values: [[0, 0, 0, -1], [0, 0, 0, -1]] }
  ]);

  const result = pruneBindConstantTracks([track, track], root);
  assert.ok(result.get(track));
  assert.equal(result.get(track)?.curves.length, 0);
});

test('no poda rutas que no son transforms de grafo', () => {
  const root = makeRig();
  const inputs = [new pc.AnimData(1, [0, 1])];
  const outputs = [new pc.AnimData(1, [1, 1])];
  const track = new pc.AnimTrack('a', 1, inputs, outputs, [
    new pc.AnimCurve(
      [
        {
          entityPath: ['bone'],
          component: 'entity',
          propertyPath: ['enabled']
        }
      ],
      0,
      0,
      pc.INTERPOLATION_STEP
    )
  ]);

  assert.equal(pruneBindConstantTracks([track, track], root).size, 0);
});
