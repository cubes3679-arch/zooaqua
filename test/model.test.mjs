import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { key, legacyRows, normalizeName, ordered, project, sources } from '../model.mjs';
import { nameCandidates } from '../recognition.mjs';
import { operation } from '../storage.mjs';

test('preserves distinct source content and deduplicates views on repeat migrations', () => {
  const first = { animalName: 'イルカ', order: '旧分類', visits: [{ facilityName: '水族館A', visitDate: '2026-02-01', notes: '端末の備考' }] };
  const other = { ...first, order: '別分類', visits: [{ ...first.visits[0], notes: 'クラウドの備考' }] };
  const input = {
    local: { zoo_animal_records: [first], zoo_wild_records: [{ id: '1', notes: '野生記録' }] },
    cloud: {
      records: { first: other },
      facility_visits: [{ facilityName: '水族館A', facilityType: '水族館', visitDates: ['2026-02-01', '2026-02-02'], notes: '施設の備考' }],
    },
  };
  const rows = legacyRows(input);
  const deduplicated = new Map([...rows, ...legacyRows(input)].map(entry => [entry.id, entry]));
  assert.equal(deduplicated.size, 4);
  const view = project([...deduplicated.values()]);
  const animal = view.animals.get('イルカ');
  assert.equal(animal.observations.size, 1);
  assert.deepEqual(ordered(animal.observations)[0].notes, ['端末の備考', 'クラウドの備考']);
  assert.equal(animal.taxonomy.order, undefined);
  assert.deepEqual(animal.variants.order, ['旧分類', '別分類']);
  assert.deepEqual(view.facilities.get('水族館A').notes, ['施設の備考']);
  assert.deepEqual(view.visits.get(key('水族館A', '2026-02-01')).notes, []);
  assert.equal(view.visits.size, 2);
  assert.equal(rows.find(entry => entry.collection === 'wild_records').record.notes, '野生記録');
});

test('never guesses the pairing of multiple old facilities and dates', () => {
  const record = { animalName: 'イルカ', facilityNames: ['A', 'B'], visitDates: ['2026-01-01', '2026-05-01'], notes: '旧備考' };
  const view = project(legacyRows({ local: { zoo_animal_records: [record] } }));
  assert.deepEqual(view.unresolved, [record]);
  assert.equal(view.visits.size, 0);
});

test('new visits are idempotent while distinct notes and revisit dates remain visible', () => {
  const fields = { facilityName: '水族館A', facilityType: '水族館', visitDate: '2026-06-05' };
  const observation = { ...fields, animalName: 'イルカ', notes: '観察の備考' };
  const first = operation('observation', observation);
  assert.equal(first.id, operation('observation', observation).id);
  const view = project([
    first,
    operation('observation', { ...observation, visitDate: '2026-06-06' }),
    operation('visit', { ...fields, notes: '訪問の備考' }),
    operation('missed', { ...fields, animalName: 'アザラシ' }),
  ]);
  assert.equal(view.animals.size, 1);
  assert.equal(view.visits.size, 2);
  const visit = view.visits.get(key('水族館A', '2026-06-05'));
  assert.deepEqual(visit.notes, ['訪問の備考']);
  assert(visit.missed.has('アザラシ'));
  assert.deepEqual(ordered(view.animals.get('イルカ').observations).map(row => row.visit.date), ['2026-06-05', '2026-06-06']);
});

test('extracts Japanese sign name candidates', () => {
  assert.deepEqual(nameCandidates('和名：ホッキョクグマ\nUrsus maritimus\nレッドリスト\nホッキョクグマ'), ['ホッキョクグマ']);
});

test('compares original records and history against a private backup', { skip: !process.env.ZOOAQUA_BACKUP }, () => {
  const backup = JSON.parse(readFileSync(process.env.ZOOAQUA_BACKUP, 'utf8'));
  const rows = legacyRows(backup);
  const index = new Map(rows.map(entry => [entry.id, entry]));
  assert.equal(new Set([...index.keys(), ...legacyRows(backup).map(entry => entry.id)]).size, index.size);
  const view = project([...index.values()]);
  let observations = 0;
  for (const [collection, storageKey] of Object.entries(sources)) {
    for (const input of [backup.local?.[storageKey], backup.cloud?.[collection]]) {
      for (const record of Object.values(input ?? {})) {
        const [row] = legacyRows({ cloud: { [collection]: [record] } });
        assert.deepEqual(index.get(row.id)?.record, record);
        if (collection === 'records') {
          const animal = view.animals.get(normalizeName(record.animalName));
          for (const history of Object.values(record.visits ?? {})) {
            observations++;
            const observation = animal.observations.get(key(normalizeName(history.facilityName), history.visitDate ?? ''));
            assert(observation);
            if (history.notes) assert(observation.notes.includes(history.notes));
          }
        }
        if (collection === 'facility_visits') {
          const facility = view.facilities.get(normalizeName(record.facilityName));
          if (record.notes) assert(facility.notes.includes(record.notes));
          for (const date of Object.values(record.visitDates ?? [])) assert(facility.visits.has(key(facility.id, date)));
        }
      }
    }
  }
  assert(observations >= [...view.animals.values()].reduce((sum, animal) => sum + animal.observations.size, 0));
});
