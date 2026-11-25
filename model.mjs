export const sources = {
  records: 'zoo_animal_records',
  facility_visits: 'zoo_facility_visits',
  missed_records: 'zoo_missed_records',
  wild_records: 'zoo_wild_records',
};

export const ranks = { group: '大分類', order: '目', family: '科', genus: '属' };
export const types = ['動物園', '水族館'];
export const normalizeName = value => String(value ?? '').normalize('NFKC').trim();
export const key = (...parts) => JSON.stringify(parts);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  }
  return value;
}

export function legacyRows(snapshot) {
  return Object.entries(sources).flatMap(([collection, storageKey]) => {
    const local = snapshot.local?.[storageKey];
    const cloud = snapshot.cloud?.[collection];
    return [local, cloud].flatMap(rows => Object.values(rows ?? {}).map(value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('旧記録の形式を確認できませんでした。');
      }
      const record = canonical(value);
      return { id: key('legacy', collection, record), kind: 'legacy', collection, record };
    }));
  });
}

function oldObservations(record) {
  if (record.visits && typeof record.visits === 'object') return Object.values(record.visits);
  const names = record.facilityNames ?? (record.facilityName ? [record.facilityName] : []);
  const dates = record.visitDates ?? (record.visitDate ? [record.visitDate] : []);
  if (names.length <= 1 || dates.length <= 1) {
    return Array.from({ length: Math.max(names.length, dates.length) }, (_, i) => ({
      facilityName: names[i] ?? names[0],
      visitDate: dates[i] ?? dates[0],
      facilityType: record.facilityType,
      notes: record.notes,
    }));
  }
  return [];
}

const fillMap = (map, id, create) => {
  if (!map.has(id)) map.set(id, create());
  return map.get(id);
};
const addValue = (values, value) => {
  if (value && !values.includes(value)) values.push(value);
};

export function project(entries) {
  const animals = new Map();
  const facilities = new Map();
  const visits = new Map();
  const unresolved = [];
  const animal = name => fillMap(animals, normalizeName(name), () => ({
    id: normalizeName(name), name, taxonomy: {}, variants: {}, observations: new Map(), photo: null,
  }));
  const facility = (name, type) => {
    const item = fillMap(facilities, normalizeName(name), () => ({
      id: normalizeName(name), name, types: [], notes: [], visits: new Map(),
    }));
    addValue(item.types, type);
    return item;
  };
  function visit(record) {
    const place = facility(record.facilityName, record.facilityType);
    const date = record.visitDate ?? '';
    const id = key(place.id, date);
    const item = fillMap(visits, id, () => ({
      id, facility: place, date, notes: [], animals: new Map(), missed: new Map(),
    }));
    place.visits.set(id, item);
    return item;
  }
  function observe(item, record) {
    const session = visit(record);
    const observation = fillMap(item.observations, session.id, () => ({ visit: session, notes: [] }));
    addValue(observation.notes, record.notes);
    session.animals.set(item.id, item);
  }
  function miss(record) {
    const session = visit(record);
    const id = normalizeName(record.animalName);
    const item = fillMap(session.missed, id, () => ({ name: record.animalName, notes: [], labels: [] }));
    addValue(item.notes, record.notes);
    addValue(item.labels, [record.order, record.family].filter(Boolean).join(' / '));
  }

  for (const entry of entries.filter(item => item.kind === 'legacy')) {
    const { collection, record } = entry;
    if (collection === 'records') {
      const item = animal(record.animalName);
      for (const field of Object.keys(ranks)) {
        item.variants[field] ??= [];
        addValue(item.variants[field], record[field]);
      }
      const observations = oldObservations(record);
      observations.forEach(row => observe(item, row));
      if (!observations.length && (record.facilityNames?.length || record.visitDates?.length)) {
        unresolved.push(record);
      }
    }
    if (collection === 'facility_visits') {
      const place = facility(record.facilityName, record.facilityType);
      addValue(place.notes, record.notes);
      const dates = Object.values(record.visitDates ?? (record.visitDate ? [record.visitDate] : []));
      for (const visitDate of dates) visit({ ...record, visitDate });
    }
    if (collection === 'missed_records') miss(record);
  }
  for (const item of animals.values()) {
    for (const [field, values] of Object.entries(item.variants)) {
      if (values.length === 1) item.taxonomy[field] = values[0];
    }
  }
  for (const entry of entries.filter(item => item.kind !== 'legacy').sort((a, b) => a.id.localeCompare(b.id))) {
    if (entry.kind === 'visit') addValue(visit(entry).notes, entry.notes);
    if (entry.kind === 'missed') miss(entry);
    if (entry.kind === 'observation') observe(animal(entry.animalName), entry);
    if (entry.kind === 'species') {
      const item = animal(entry.animalName);
      Object.assign(item.taxonomy, entry.taxonomy);
    }
    if (entry.kind === 'photo') animal(entry.animalName).photo = entry.photo;
  }
  return { animals, facilities, visits, unresolved };
}

export const ordered = observations =>
  [...observations.values()].sort((a, b) => (a.visit.date || '9999').localeCompare(b.visit.date || '9999'));

export function missingTaxonomy(animal, offered) {
  return Object.fromEntries(Object.keys(ranks)
    .filter(field => !animal.taxonomy[field] && (animal.variants[field]?.length ?? 0) <= 1)
    .map(field => [field, offered[field]])
    .filter(([, value]) => value));
}
