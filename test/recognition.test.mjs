import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lookup } from '../recognition.mjs';

test('an ambiguous Japanese name returns only ranks shared by every candidate', async t => {
  const first = { id: 1, name: 'Genus_a species_a', rank: 'species' };
  const second = { id: 2, name: 'Genus_b species_b', rank: 'species' };
  const shared = [
    { rank: 'class', name: 'Mammalia' },
    { rank: 'order', name: 'Carnivora' },
  ];
  const details = new Map([
    ['1', { ...first, ancestors: [...shared, { rank: 'family', name: 'Felidae' }, { rank: 'genus', name: 'Genus_a' }] }],
    ['2', { ...second, ancestors: [...shared, { rank: 'genus', name: 'Genus_b' }] }],
  ]);
  t.mock.method(globalThis, 'fetch', async url => {
    const path = new URL(url).pathname.split('/').pop();
    const results = path === 'autocomplete'
      ? [first, second].map(taxon => ({ ...taxon, is_active: true, matched_term: '検証用和名' }))
      : [details.get(path)];
    return Response.json({ results });
  });
  const result = await lookup('検証用和名');
  assert.deepEqual(result.taxonomy, { group: '哺乳類', order: 'Carnivora' });
  assert.deepEqual(result.sources.map(source => source.id), [1, 2]);
});
