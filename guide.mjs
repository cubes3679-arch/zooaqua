import { key, normalizeName, normalizeSearchName, ordered, project, ranks, missingTaxonomy } from './model.mjs';
import { migrateLocal, openDatabase, operation, putEntries, readEntries, readLegacyCloud, saveTaxonomyCandidates, readTaxonomyLookup, writeTaxonomyLookup } from './storage.mjs';
import { lookup, ocrWorker, readSign, speciesPhoto } from './recognition.mjs';

const $ = id => document.getElementById(id);
const nodes = (selector, root = document) => [...root.querySelectorAll(selector)];
const collator = new Intl.Collator('ja');
const compare = (a, b) => collator.compare(a, b);
const batchSize = 30;
let limit = batchSize;
let db;
let entries = [];
let view = project([]);
let review = [];
let working = false;
let scanning = false;
let stopAfterImage = false;
const updates = typeof BroadcastChannel === 'function' ? new BroadcastChannel('zooaqua-field-guide') : null;

function el(tag, text, className) {
  const result = document.createElement(tag);
  if (text != null) result.textContent = text;
  if (className) result.className = className;
  return result;
}
function button(text, action, className = 'secondary') {
  const control = el('button', text, className);
  control.type = 'button';
  control.addEventListener('click', action);
  return control;
}
function notesTo(parent, notes) {
  notes.forEach(note => parent.append(el('p', note, 'notes')));
}
function message(text) {
  $('status').hidden = !text;
  $('status').textContent = text;
}
function tab(id) {
  for (const control of nodes('[data-tab]')) {
    const selected = control.dataset.tab === id;
    $(control.dataset.tab).hidden = !selected;
    if (selected) control.setAttribute('aria-current', 'page');
    else control.removeAttribute('aria-current');
  }
  message('');
  window.scrollTo(0, 0);
}
function setMode(id) {
  for (const control of nodes('[data-mode]')) {
    const selected = control.dataset.mode === id;
    control.setAttribute('aria-pressed', selected);
    $(control.dataset.mode).hidden = !selected;
  }
}
function initFilters() {
  for (const [id, title] of Object.entries({ ...ranks, facility: '施設' })) {
    const label = el('label', title);
    const select = el('select');
    select.id = 'filter-' + id;
    select.addEventListener('change', () => {
      limit = batchSize;
      if (id !== 'facility') updateTaxonomyFilters();
      renderGuide();
    });
    label.append(select);
    $('filters').append(label);
  }
}
function updateOptions(select, values) {
  const previous = select.value;
  select.replaceChildren(new Option('すべて', ''), ...values.map(([id, label]) => new Option(label, id)));
  if (values.some(([id]) => id === previous)) select.value = previous;
}
function updateTaxonomyFilters() {
  let animals = [...view.animals.values()];
  for (const field of Object.keys(ranks)) {
    const select = $('filter-' + field);
    const values = [...new Set(animals.map(item => item.taxonomy[field]).filter(Boolean))].sort(compare);
    updateOptions(select, values.map(value => [value, value]));
    if (select.value) animals = animals.filter(item => item.taxonomy[field] === select.value);
  }
}
function renderGuide() {
  const search = normalizeSearchName($('search').value);
  const facility = $('filter-facility').value;
  const filtered = [...view.animals.values()].filter(animal =>
    (animal.observations.size > 0 || view.unresolved.some(record => normalizeName(record.animalName) === animal.id)) &&
    normalizeSearchName(animal.name).includes(search) &&
    Object.keys(ranks).every(field => !$('filter-' + field).value || animal.taxonomy[field] === $('filter-' + field).value) &&
    (!facility || [...animal.observations.values()].some(observation => observation.visit.facility.id === facility))
  ).sort((a, b) => compare(a.name, b.name));
  $('count').textContent = filtered.length ? filtered.length + '種類' : '該当する記録はありません';
  $('cards').replaceChildren(...filtered.slice(0, limit).map(animal => {
    const control = button('', () => showAnimal(animal.id), 'card');
    const thumbnail = animal.photo ? el('img', null, 'thumbnail') : el('span', '◇', 'thumbnail placeholder');
    thumbnail.setAttribute('aria-hidden', 'true');
    if (animal.photo) {
      thumbnail.alt = '';
      thumbnail.loading = 'lazy';
      thumbnail.src = animal.photo;
    }
    const caption = el('span');
    caption.append(el('strong', animal.name), el('small', animal.taxonomy.group || `観察 ${animal.observations.size}回`));
    control.append(thumbnail, caption);
    return control;
  }));
  $('more').hidden = limit >= filtered.length;
}

function observationLabel(item, id) {
  const history = ordered(item.observations).filter(row => row.visit.date);
  if (!item.observations.get(id)?.visit.date) return '観察日不明';
  return history[0]?.visit.id === id ? '初観察' : '再観察';
}
function startAt(visit, mode) {
  if ($('detail').open) $('detail').close();
  tab('register');
  setMode(mode);
  $('place').value = visit.facility.name;
  $('place-type').value = visit.facility.types.length === 1 ? visit.facility.types[0] : '';
  $('date').value = visit.date;
  $('visit-notes').value = '';
  reviewStatus();
}
function renderPlaces() {
  const places = [...view.facilities.values()].filter(place => place.id).sort((a, b) => compare(a.name, b.name));
  $('place-list').replaceChildren(...places.map(place => new Option(place.name)));
  $('places').replaceChildren(...places.map(place => {
    const group = el('details');
    group.dataset.place = place.id;
    group.append(el('summary', `${place.name}　${[...place.visits.values()].filter(visit => visit.date).length}回`));
    if (place.types.length) group.append(el('p', place.types.join(' / ')));
    if (place.notes.length) {
      group.append(el('h3', '施設の備考（旧記録）'));
      notesTo(group, place.notes);
    }
    for (const visit of [...place.visits.values()].sort((a, b) => b.date.localeCompare(a.date))) {
      const session = el('details');
      session.dataset.visit = visit.id;
      session.append(el('summary', `${visit.date || '日付不明'}　観察${visit.animals.size}種`));
      notesTo(session, visit.notes);
      for (const animal of [...visit.animals.values()].sort((a, b) => compare(a.name, b.name))) {
        const row = el('div');
        row.append(button(animal.name + ' · ' + observationLabel(animal, visit.id), () => showAnimal(animal.id), 'text-button'));
        notesTo(row, animal.observations.get(visit.id).notes);
        session.append(row);
      }
      if (visit.missed.size) {
        session.append(el('h3', '見られなかった生き物'));
        for (const missed of visit.missed.values()) {
          session.append(el('p', [missed.name, ...missed.labels].join(' · ')));
          notesTo(session, missed.notes);
        }
      }
      const actions = el('div', null, 'inline');
      actions.append(button('観察を追加', () => startAt(visit, 'manual')), button('見られなかった生き物を追加', () => startAt(visit, 'missed')));
      session.append(actions);
      group.append(session);
    }
    return group;
  }));
  if (!places.length) $('places').append(el('p', '施設の訪問を記録すると、ここに表示されます。'));
}
function renderStats() {
  const animals = [...view.animals.values()].filter(animal => animal.observations.size > 0);
  const datedVisits = [...view.visits.values()].filter(visit => visit.date && visit.facility.id);
  const visitsByAnimal = animals.map(animal => ordered(animal.observations).filter(row => row.visit.date).length);
  const counts = {
    '観察した種類': animals.length,
    '訪問した施設': new Set(datedVisits.map(visit => visit.facility.id)).size,
    '訪問回数': datedVisits.length,
    '初観察': visitsByAnimal.filter(count => count > 0).length,
    '再観察': visitsByAnimal.reduce((sum, count) => sum + Math.max(0, count - 1), 0),
  };
  const grid = el('div', null, 'stats-grid');
  for (const [label, value] of Object.entries(counts)) {
    const card = el('div', label, 'panel');
    card.append(el('strong', value));
    grid.append(card);
  }
  $('statistics').replaceChildren(grid);
  for (const [field, label] of Object.entries(ranks)) {
    const breakdown = new Map();
    for (const animal of animals) {
      const category = animal.taxonomy[field] || '未分類';
      breakdown.set(category, (breakdown.get(category) || 0) + 1);
    }
    const section = el('details');
    const list = el('ul');
    for (const [category, value] of [...breakdown].sort((a, b) => b[1] - a[1] || compare(a[0], b[0]))) {
      list.append(el('li', `${category}　${value}種`));
    }
    section.append(el('summary', label + '別の種類数'), list);
    $('statistics').append(section);
  }
}
function taxonomyFields(taxonomy = {}, variants = {}) {
  const group = el('div', null, 'fields');
  const fields = {};
  for (const [field, title] of Object.entries(ranks)) {
    const label = el('label', title);
    const input = el('input');
    input.value = taxonomy[field] ?? '';
    fields[field] = input;
    label.append(input);
    if (variants[field]?.length > 1) label.append(el('small', '旧記録の値 ' + variants[field].join(' / ')));
    group.append(label);
  }
  return { group, fields, values: () => Object.fromEntries(Object.entries(fields).map(([id, input]) => [id, input.value.trim()])) };
}
function taxonomySourceLabel(result) {
  const names = result.sources.map(source => source.scientificName).join(' / ');
  const label = result.sources.length > 1 ? '複数の候補で共通する分類' : 'iNaturalistの分類候補';
  const prefix = result.nearNames.length ? `近い名前：${result.nearNames.join(' / ')} · ` : result.variantMatch ? '表記ゆれで一致 · ' : '';
  return `${prefix}${label}：${names}`;
}

async function fillTaxonomy(name, controls, status) {
  status.textContent = '分類を検索中…';
  const before = controls.values();
  try {
    const result = await lookup(name.value);
    if (!result || !Object.keys(result.taxonomy).length) {
      status.textContent = '和名から分類を特定できませんでした。手動入力できます。';
      return;
    }
    if (normalizeName(name.input?.value ?? name.value) !== normalizeName(name.value)) return;
    for (const field of Object.keys(ranks)) {
      if (!before[field] && controls.fields[field].value === before[field]) controls.fields[field].value = result.taxonomy[field];
    }
    status.textContent = taxonomySourceLabel(result);
  } catch {
    status.textContent = '分類を取得できませんでした。再検索または手動入力ができます。';
  }
}
function showAnimal(id, saved = false, suggestions = {}) {
  const item = view.animals.get(id);
  if (!item) return;
  const target = $('detail-content');
  target.replaceChildren(el('h2', item.name));
  if (item.photo) {
    const photo = el('img', null, 'species-photo');
    photo.src = item.photo;
    photo.alt = item.name;
    target.append(photo);
  }
  const taxonomy = taxonomyFields({ ...item.taxonomy, ...suggestions }, item.variants);
  const form = el('form');
  const photo = el('input');
  photo.type = 'file';
  photo.accept = 'image/*';
  const photoLabel = el('label', '自分で撮影した写真（1枚）');
  photoLabel.append(photo);
  const status = el('p', saved ? '分類・写真を保存しました。' : '');
  status.setAttribute('role', 'status');
  const submit = el('button', '分類・写真を保存');
  const find = button('分類を検索', () => fillTaxonomy({ value: item.name }, taxonomy, status));
  const removal = el('input');
  removal.type = 'checkbox';
  const removeLabel = el('label', '写真を削除', 'inline');
  removeLabel.prepend(removal);
  if (Object.keys(suggestions).length) form.append(el('p', '候補を編集欄に入れました。内容を確認して保存してください。'));
  form.append(taxonomy.group, find, photoLabel);
  if (item.photo) form.append(removeLabel);
  form.append(submit, status);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    try {
      const changed = Object.fromEntries(Object.entries(taxonomy.values()).filter(([field, value]) => value !== (item.taxonomy[field] ?? '')));
      const edits = [];
      if (Object.keys(changed).length) edits.push(operation('species', { animalName: item.name, taxonomy: changed }));
      if (photo.files[0] || removal.checked) {
        edits.push(operation('photo', {
          animalName: item.name,
          photo: photo.files[0] ? await speciesPhoto(photo.files[0]) : null,
        }));
      }
      if (edits.length) await commit(edits);
      if ($('detail').open && $('detail-content').contains(form)) showAnimal(id, true);
    } catch {
      status.textContent = '保存できませんでした。写真の形式や端末の空き容量を確認してください。';
    } finally {
      submit.disabled = false;
    }
  });
  target.append(form, el('h2', '観察履歴'));
  for (const row of ordered(item.observations).reverse()) {
    const history = el('div', null, 'panel');
    history.append(el('strong', [row.visit.date || '日付不明', row.visit.facility.name || '施設不明', observationLabel(item, row.visit.id)].join(' · ')));
    notesTo(history, row.notes);
    target.append(history);
  }
  const unresolved = view.unresolved.filter(record => normalizeName(record.animalName) === id);
  for (const record of unresolved) {
    const history = el('div', null, 'panel');
    history.append(el('h3', '施設と日付の対応が不明な旧記録'));
    history.append(el('p', [...(record.facilityNames ?? []), ...(record.visitDates ?? [])].join(' / ')));
    notesTo(history, [record.notes].filter(Boolean));
    target.append(history);
  }
  if (!$('detail').open) $('detail').showModal();
}

async function refresh() {
  entries = await readEntries(db);
  view = project(entries);
  updateTaxonomyFilters();
  updateOptions($('filter-facility'), [...view.facilities.values()].filter(place => place.id)
    .sort((a, b) => compare(a.name, b.name)).map(place => [place.id, place.name]));
  const expanded = new Set(nodes('#places details[open]').map(item => item.dataset.place ?? item.dataset.visit));
  renderGuide();
  renderPlaces();
  for (const detail of nodes('#places details')) detail.open = expanded.has(detail.dataset.place ?? detail.dataset.visit);
  renderStats();
}
async function commit(operations) {
  if (!db) throw new Error('端末の記録を開けませんでした。');
  await putEntries(db, operations);
  navigator.storage?.persist?.().catch(() => {});
  updates?.postMessage('changed');
  await refresh();
}
function visitFields() {
  const visit = $('visit-form');
  const facilityName = $('place').value.trim();
  $('place').setCustomValidity(facilityName ? '' : '施設名を入力してください。');
  if (!visit.reportValidity()) return null;
  return { facilityName, facilityType: $('place-type').value, visitDate: $('date').value };
}
const lines = value => [...new Set(value.split(/\r?\n/).map(normalizeName).filter(Boolean))];
const visitOperation = fields => operation('visit', { ...fields, notes: $('visit-notes').value.trim() });
function newRow(name, notes = '') {
  const existing = view.animals.get(normalizeName(name));
  return { name, originalName: name, notes, taxonomy: { ...existing?.taxonomy }, selected: Boolean(name) };
}

function reviewStatus() {
  const visitId = key(normalizeName($('place').value), $('date').value);
  const counts = new Map();
  for (const row of review) {
    if (row.selected && normalizeName(row.name)) {
      const id = normalizeName(row.name);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  for (const row of review) {
    const id = normalizeName(row.name);
    const animal = view.animals.get(id);
    const labels = [];
    if (counts.get(id) > 1) labels.push('一覧内で重複');
    if (animal) labels.push(animal.observations.has(visitId) ? '同じ施設・日付に記録済み' : '登録済みの種類 · 再観察');
    row.badge.textContent = labels.join('／');
  }
  if (!working) $('review-status').textContent = `${counts.size}種類を選択中`;
}
function renderReview() {
  $('review').hidden = !review.length;
  $('review-list').replaceChildren(...review.map(row => {
    const card = el('article', null, 'panel');
    const toggle = el('input');
    toggle.type = 'checkbox';
    toggle.checked = row.selected;
    const include = el('label', '登録に含める', 'inline');
    include.prepend(toggle);
    toggle.addEventListener('change', () => {
      row.selected = toggle.checked;
      reviewStatus();
    });
    const label = el('label', row.file ? row.file.name + ' の和名' : '和名');
    const name = el('input');
    name.value = row.name;
    const taxonomy = taxonomyFields(row.taxonomy);
    const status = el('p', row.status || '');
    status.setAttribute('role', 'status');
    row.badge = el('p', null, 'result-count');
    name.addEventListener('input', () => {
      const current = normalizeName(name.value);
      if (current !== normalizeName(row.name)) {
        const existing = view.animals.get(current);
        for (const [field, input] of Object.entries(taxonomy.fields)) input.value = existing?.taxonomy[field] ?? '';
        status.textContent = current ? '必要に応じて分類を検索してください。' : '';
      }
      row.name = name.value;
      if (!row.selected && current) toggle.checked = row.selected = true;
      reviewStatus();
    });
    label.append(name);
    const find = button('分類を検索', async () => {
      find.disabled = true;
      await fillTaxonomy({ value: name.value, input: name }, taxonomy, status);
      find.disabled = false;
    });
    const noteLabel = el('label', '観察の備考');
    const note = el('input');
    note.value = row.notes;
    noteLabel.append(note);
    row.read = () => {
      row.taxonomy = taxonomy.values();
      row.notes = note.value.trim();
      row.status = status.textContent;
    };
    row.fields = taxonomy.fields;
    row.statusElement = status;
    card.append(include, label, row.badge);
    if (row.file) {
      const actions = el('div', null, 'inline');
      const retry = button('再読み取り', () => scanRows([row], true));
      retry.dataset.retry = '';
      actions.append(retry);
      for (const candidate of row.candidates ?? []) {
        actions.append(button(candidate, () => {
          name.value = candidate;
          name.dispatchEvent(new Event('input'));
          find.click();
        }));
      }
      card.append(actions);
      if (row.text) {
        const raw = el('details');
        raw.append(el('summary', '読み取った文字'), el('p', row.text, 'notes'));
        card.append(raw);
      }
    }
    const extra = el('details');
    extra.append(el('summary', '分類・備考'), taxonomy.group, find, noteLabel);
    card.append(extra, status);
    return card;
  }));
  reviewStatus();
}
async function scanRows(rows, retry = false) {
  if (scanning || working) return;
  review.forEach(row => row.read?.());
  scanning = true;
  $('review-list').inert = true;
  stopAfterImage = false;
  $('scan').disabled = $('files').disabled = true;
  $('review-form').querySelector('button[type=submit]').disabled = true;
  $('cancel-scan').hidden = $('progress').hidden = $('scan-status').hidden = false;
  $('cancel-scan').disabled = false;
  for (const control of nodes('[data-retry]')) control.disabled = true;
  const bar = $('progress');
  bar.max = rows.length;
  bar.value = 0;
  let done = 0;
  let worker;
  const setProgress = description => {
    $('scan-status').textContent = `${done}/${rows.length}枚　${description}`;
  };
  setProgress('エンジンを準備中');
  try {
    worker = await ocrWorker(event => {
      if (event.status === 'recognizing text') setProgress(`読み取り中 ${Math.round(event.progress * 100)}%`);
    });
    for (const row of rows) {
      if (stopAfterImage) break;
      setProgress('画像を読み取り中');
      try {
        const result = await readSign(worker, row.file, retry, setProgress);
        row.candidates = result.candidates;
        row.text = result.text;
        const name = result.best?.name;
        if (name && !row.name) {
          Object.assign(row, newRow(name, row.notes));
          for (const field of Object.keys(ranks)) row.taxonomy[field] ||= result.best.taxonomy[field];
        }
        row.status = result.best ? '和名と分類の候補を確認してください。'
          : '和名を特定できませんでした。候補を選ぶか入力してください。';
      } catch {
        row.status = '画像を読み取れませんでした。再読み取りまたは手動入力ができます。';
      }
      bar.value = ++done;
    }
    setProgress(stopAfterImage ? '途中で停止しました。残りは個別に再読み取りできます。' : '完了');
  } catch {
    rows.forEach(row => { row.status = '読み取りの準備に失敗しました。再読み取りまたは手動入力ができます。'; });
    setProgress('読み取りエンジンを起動できませんでした');
  } finally {
    if (worker) await worker.terminate().catch(() => {});
    scanning = false;
    $('review-list').inert = false;
    $('cancel-scan').hidden = true;
    $('scan').disabled = $('files').disabled = false;
    $('review-form').querySelector('button[type=submit]').disabled = false;
    renderReview();
  }
}

async function prepareManual(names) {
  if (working || scanning) return;
  review = names.map(name => newRow(name, $('observation-notes').value.trim()));
  working = true;
  const reviewSubmit = $('review-form').querySelector('button[type=submit]');
  reviewSubmit.disabled = true;
  renderReview();
  $('review').scrollIntoView({ block: 'nearest' });
  const prepared = review;
  try {
    let index = 0;
    const search = async () => {
      while (index < prepared.length) {
        const row = prepared[index++];
        if (Object.keys(ranks).every(field => row.taxonomy[field])) continue;
        $('review-status').textContent = `分類を取得中 ${index}/${names.length}`;
        try {
          const result = await lookup(row.originalName);
          if (row.name !== row.originalName) continue;
          if (result && Object.keys(result.taxonomy).length) {
            for (const [field, value] of Object.entries(result.taxonomy)) {
              row.fields[field].value ||= value;
            }
            row.statusElement.textContent = taxonomySourceLabel(result);
          } else row.statusElement.textContent = '分類は手動で入力できます。';
        } catch {
          row.statusElement.textContent = '分類を取得できませんでした。再検索できます。';
        }
      }
    };
    await Promise.all([search(), search()]);
  } finally {
    working = false;
    reviewSubmit.disabled = false;
    reviewStatus();
  }
}

async function recordForm(event, create, success) {
  event.preventDefault();
  const submit = event.submitter ?? event.currentTarget.querySelector('[type=submit]') ?? event.currentTarget.querySelector('button');
  if (submit.disabled) return;
  const fields = visitFields();
  if (!fields) return;
  submit.disabled = true;
  try {
    const operations = create(fields);
    if (!operations.length) return;
    await commit(operations);
    $('visit-notes').value = '';
    success();
  } catch {
    message('記録を保存できませんでした。端末の空き容量を確認してからもう一度お試しください。');
  } finally {
    submit.disabled = false;
  }
}

initFilters();
$('search').addEventListener('input', () => { limit = batchSize; renderGuide(); });
$('more').addEventListener('click', () => { limit += batchSize; renderGuide(); });
for (const control of nodes('[data-tab]')) control.onclick = () => tab(control.dataset.tab);
for (const control of nodes('[data-mode]')) control.onclick = () => setMode(control.dataset.mode);
for (const control of nodes('[data-close]')) control.onclick = () => control.closest('dialog').close();
$('place').addEventListener('input', () => {
  $('place').setCustomValidity('');
  const place = view.facilities.get(normalizeName($('place').value));
  if (place?.types.length === 1) $('place-type').value = place.types[0];
  reviewStatus();
});
$('date').addEventListener('change', reviewStatus);
const now = new Date();
$('date').value = new Date(now - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
$('visit-form').addEventListener('submit', event => recordForm(event,
  fields => [visitOperation(fields)],
  () => message('訪問を記録しました。続けて生き物を追加できます。')));
$('missed').addEventListener('submit', event => recordForm(event,
  fields => {
    const names = lines($('missed-names').value);
    if (!names.length) {
      message('生き物の名前を入力してください。');
      return [];
    }
    return [visitOperation(fields), ...names.map(animalName => operation('missed', { ...fields, animalName }))];
  },
  () => {
    $('missed-names').value = '';
    message('見られなかった生き物を訪問に追加しました。');
  }));
$('manual').addEventListener('submit', event => {
  event.preventDefault();
  const names = lines($('names').value);
  if (names.length) prepareManual(names);
});
$('scan').onclick = () => {
  if (scanning || working) return;
  const files = [...$('files').files];
  if (!files.length) {
    message('読み取る看板写真を選択してください。');
    return;
  }
  message('');
  review = files.map(file => ({ ...newRow(''), file, status: '未処理' }));
  renderReview();
  scanRows(review);
};
$('cancel-scan').onclick = () => {
  stopAfterImage = true;
  $('cancel-scan').disabled = true;
};
$('review-form').addEventListener('submit', event => {
  if (scanning || working) {
    event.preventDefault();
    return;
  }
  let started = 0;
  let duplicates = 0;
  recordForm(event, fields => {
    const selected = new Map();
    const visitId = key(normalizeName(fields.facilityName), fields.visitDate);
    for (const row of review.filter(item => item.selected && normalizeName(item.name))) {
      row.read();
      const id = normalizeName(row.name);
      const existing = view.animals.get(id);
      const rowPatch = Object.fromEntries(Object.entries(row.taxonomy).filter(([field, value]) =>
        value !== (existing?.taxonomy[field] ?? '') && (value || row.originalName === id)));
      const current = selected.get(id);
      if (current) {
        duplicates++;
        for (const [field, value] of Object.entries(rowPatch)) {
          if (Object.hasOwn(current.taxonomy, field) && current.taxonomy[field] !== value) {
            message(id + ' の分類が複数あります。一覧で分類をそろえるか、登録する行を選んでください。');
            return [];
          }
          current.taxonomy[field] = value;
        }
        if (row.notes) current.notes.add(row.notes);
      } else {
        selected.set(id, { animalName: id, taxonomy: rowPatch, notes: new Set(row.notes ? [row.notes] : []) });
      }
    }
    if (!selected.size) {
      message('和名を入力し、登録する生き物を選択してください。');
      return [];
    }
    const operations = [visitOperation(fields)];
    for (const [id, item] of selected) {
      const observation = view.animals.get(id)?.observations.get(visitId);
      if (observation) duplicates++;
      else started++;
      const notes = [...item.notes].filter(note => !observation?.notes.includes(note));
      if (!observation && !notes.length) notes.push('');
      for (const note of notes) operations.push(operation('observation', { ...fields, animalName: item.animalName, notes: note }));
      if (Object.keys(item.taxonomy).length) operations.push(operation('species', { animalName: item.animalName, taxonomy: item.taxonomy }));
    }
    return operations;
  }, () => {
    $('names').value = $('observation-notes').value = $('files').value = '';
    review = [];
    renderReview();
    message(`観察を${started}件追加しました。重複${duplicates}件をまとめました。`);
    window.scrollTo(0, 0);
  });
});

const taxonomyCandidates = new Map();
const taxonomyIssues = new Map();
let stopTaxonomy = false;
let taxonomyBusy = false;

function renderTaxonomyCandidates() {
  const list = $('taxonomy-results');
  list.replaceChildren(...[...taxonomyCandidates.values()].map(candidate => {
    const panel = el('article', null, 'panel');
    const select = el('input');
    select.type = 'checkbox';
    select.checked = candidate.selected;
    const label = el('label', candidate.name, 'inline');
    label.prepend(select);
    select.onchange = () => { candidate.selected = select.checked; };
    const sources = el('div', null, 'inline');
    if (candidate.nearNames.length) sources.append(el('span', '近い名前：' + candidate.nearNames.join(' / ')));
    else if (candidate.variantMatch) sources.append(el('span', '表記ゆれで一致'));
    if (candidate.sources.length > 1) sources.append(el('span', '候補に共通する分類'));
    for (const taxon of candidate.sources) {
      const source = el('a', taxon.scientificName, 'taxon-reference');
      source.href = 'https://www.inaturalist.org/taxa/' + encodeURIComponent(taxon.id);
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      sources.append(source);
    }
    const fields = el('dl');
    for (const [field, value] of Object.entries(candidate.taxonomy)) {
      fields.append(el('dt', ranks[field]), el('dd', value));
    }
    panel.append(label, sources, fields);
    return panel;
  }));
  $('taxonomy-form').hidden = !taxonomyCandidates.size;
}

function renderTaxonomyIssues() {
  const list = $('taxonomy-issues-list');
  list.replaceChildren(...[...taxonomyIssues].map(([id, { name, reason }]) => {
    const row = el('li', null, 'panel');
    row.append(el('strong', name), el('p', reason), button('詳細を開く', () => {
      $('taxonomy').close();
      showAnimal(id);
    }));
    return row;
  }));
  $('taxonomy-issues').hidden = !taxonomyIssues.size;
  $('taxonomy-issues-title').textContent = `取得できなかった分類 · ${taxonomyIssues.size}種類`;
}

let differenceRows = [];
let selectingAllDifferences = false;

function updateDifferenceSelection() {
  if (selectingAllDifferences) return;
  const boxes = nodes('#taxonomy-differences-list input[type=checkbox]');
  const count = boxes.filter(box => box.checked).length;
  const all = $('taxonomy-differences-all');
  all.checked = count > 0 && count === boxes.length;
  all.indeterminate = count > 0 && count < boxes.length;
  all.disabled = taxonomyBusy || !boxes.length;
  $('taxonomy-save-differences').disabled = taxonomyBusy || !count;
}

$('taxonomy-differences-all').onchange = event => {
  const checked = event.target.checked;
  selectingAllDifferences = true;
  for (const box of nodes('#taxonomy-differences-list input[type=checkbox]')) {
    box.checked = checked;
    box.dispatchEvent(new Event('change'));
  }
  selectingAllDifferences = false;
  updateDifferenceSelection();
};
$('taxonomy-save-differences').onclick = async () => {
  if (taxonomyBusy || !db) return;
  const selected = differenceRows.filter(row => row.selected.size);
  if (!selected.length) return;
  taxonomyBusy = true;
  updateDifferenceSelection();
  const list = $('taxonomy-differences-list');
  list.inert = true;
  $('taxonomy-scan').disabled = true;
  const status = $('taxonomy-differences-status');
  try {
    const changes = selected.map(({ animal, result, selected }) => [
      animal.id,
      Object.fromEntries([...selected].map(field => [field, result.taxonomy[field]])),
      Object.fromEntries([...selected].map(field => [field, animal.taxonomy[field]])),
    ]);
    const saved = await saveTaxonomyCandidates(db, changes);
    updates?.postMessage('changed');
    if (await refresh().then(() => true, () => false)) {
      const remaining = differenceRows.map(row => {
        const animal = view.animals.get(row.animal.id);
        return { ...row, animal, fields: row.fields.filter(field =>
          animal?.taxonomy[field] === row.animal.taxonomy[field] && animal.taxonomy[field] !== row.result.taxonomy[field]) };
      }).filter(row => row.fields.length);
      renderTaxonomyDifferences(remaining);
    }
    $('taxonomy-differences').hidden = false;
    status.textContent = `${saved}種類の分類を更新しました。実行前に値が変わった項目はスキップされます。`;
  } catch {
    status.textContent = '分類を保存できませんでした。もう一度お試しください。';
  } finally {
    taxonomyBusy = false;
    list.inert = false;
    $('taxonomy-scan').disabled = false;
    updateDifferenceSelection();
  }
};

function renderTaxonomyDifferences(differences) {
  differenceRows = differences.map(row => ({ ...row, selected: new Set() }));
  const section = $('taxonomy-differences');
  $('taxonomy-differences-title').textContent = `入力済みの分類との違い · ${differences.length}種類`;
  $('taxonomy-differences-list').replaceChildren(...differenceRows.map(({ animal, result, fields, selected: fieldsToApply }) => {
    const row = el('li', null, 'panel');
    row.append(el('strong', animal.name), el('p', taxonomySourceLabel(result)));
    const list = el('div', null, 'stack');
    const apply = button('選択した候補で編集', () => {
      const suggestions = Object.fromEntries([...fieldsToApply].map(field => [field, result.taxonomy[field]]));
      $('taxonomy').close();
      showAnimal(animal.id, false, suggestions);
    });
    apply.disabled = true;
    for (const field of fields) {
      const check = el('input');
      check.type = 'checkbox';
      const label = el('label', `${ranks[field]}：登録「${animal.taxonomy[field]}」 → 候補「${result.taxonomy[field]}」`, 'inline');
      label.prepend(check);
      check.onchange = () => {
        if (check.checked) fieldsToApply.add(field);
        else fieldsToApply.delete(field);
        apply.disabled = !fieldsToApply.size;
        updateDifferenceSelection();
      };
      list.append(label);
    }
    row.append(list, apply, button('詳細を開く', () => {
      $('taxonomy').close();
      showAnimal(animal.id);
    }));
    return row;
  }));
  section.hidden = !differences.length;
  updateDifferenceSelection();
}

$('taxonomy-open').onclick = () => $('taxonomy').showModal();
$('taxonomy-stop').onclick = () => {
  stopTaxonomy = true;
  $('taxonomy-stop').disabled = true;
};
async function scanTaxonomy(refreshResults) {
  if (taxonomyBusy || !db) return;
  taxonomyBusy = true;
  stopTaxonomy = false;
  const status = $('taxonomy-status');
  const scan = $('taxonomy-scan');
  const refreshButton = $('taxonomy-refresh');
  const compareToggle = $('taxonomy-compare');
  const compareAll = compareToggle.checked;
  const differences = [];
  $('taxonomy-differences-status').textContent = '';
  renderTaxonomyDifferences(differences);
  const stop = $('taxonomy-stop');
  const bar = $('taxonomy-progress');
  const submit = $('taxonomy-form').querySelector('[type=submit]');
  scan.disabled = refreshButton.disabled = submit.disabled = compareToggle.disabled = true;
  let completed = 0;
  let errors = 0;
  let unmatched = 0;
  let reused = 0;
  let cacheWriteFailed = false;
  try {
    const current = project(await readEntries(db));
    const fields = Object.fromEntries(Object.keys(ranks).map(field => [field, true]));
    const animals = [...current.animals.values()].filter(animal => animal.name && (compareAll || Object.keys(ranks).some(field => !animal.taxonomy[field])));
    const eligible = new Set(animals.map(animal => animal.id));
    for (const id of taxonomyIssues.keys()) {
      if (!eligible.has(id)) taxonomyIssues.delete(id);
    }
    const targets = animals.filter(animal => {
      if (compareAll) return true;
      if (!Object.keys(missingTaxonomy(animal, fields)).length) {
        taxonomyIssues.set(animal.id, { name: animal.name, reason: '旧記録の分類に複数の値があります。詳細で確認してください。' });
        return false;
      }
      return true;
    });
    const queue = targets.map(animal => ({
      animal, cached: refreshResults ? undefined : readTaxonomyLookup(animal.name),
    })).sort((a, b) => Number(a.cached === undefined) - Number(b.cached === undefined));
    renderTaxonomyIssues();
    if (!queue.length) {
      status.textContent = taxonomyCandidates.size ? '取得済みの候補を確認してください。' : taxonomyIssues.size ? '詳細で分類を確認してください。' : '一括取得できる分類の空欄はありません。';
      return;
    }
    stop.disabled = stop.hidden = bar.hidden = false;
    bar.max = queue.length;
    bar.value = 0;
    for (const { animal, cached } of queue) {
      if (stopTaxonomy) break;
      status.textContent = `${completed} / ${queue.length}件を確認 · ${animal.name}`;
      let reason = '';
      try {
        const result = cached === undefined ? await lookup(animal.name, { refresh: refreshResults }) : cached;
        if (cached !== undefined) reused++;
        else if (!writeTaxonomyLookup(animal.name, result)) cacheWriteFailed = true;
        const taxonomy = result ? missingTaxonomy(animal, result.taxonomy) : {};
        if (result) {
          const differentFields = Object.keys(ranks).filter(field =>
            animal.taxonomy[field] && result.taxonomy[field] &&
            normalizeName(animal.taxonomy[field]) !== normalizeName(result.taxonomy[field]));
          if (differentFields.length) differences.push({ animal, result, fields: differentFields });
        }
        if (Object.keys(taxonomy).length) {
          taxonomyCandidates.set(animal.id, { ...result, taxonomy, name: animal.name, selected: taxonomyCandidates.get(animal.id)?.selected ?? !result.variantMatch });
        } else {
          taxonomyCandidates.delete(animal.id);
          if (!result || !Object.keys(result.taxonomy).length) unmatched++;
        }
        const missing = Object.keys(ranks).filter(field => !animal.taxonomy[field] && !taxonomy[field]);
        if (compareAll && !result && !missing.length) reason = '和名から照合先を特定できませんでした。';
        if (missing.length) {
          const labels = missing.map(field => ranks[field]).join('・');
          reason = result?.sources.length > 1 ? `複数候補で共通する値を確認できなかった項目：${labels}` : result ? `補えなかった項目：${labels}` : `和名から分類を特定できませんでした（${labels}）。`;
        }
      } catch {
        errors++;
        reason = '通信または検索サービスのエラー。もう一度検索できます。';
      }
      if (reason) taxonomyIssues.set(animal.id, { name: animal.name, reason });
      else taxonomyIssues.delete(animal.id);
      bar.value = ++completed;
    }
    renderTaxonomyCandidates();
    renderTaxonomyIssues();
    renderTaxonomyDifferences(differences);
    if (taxonomyIssues.size && !taxonomyCandidates.size) $('taxonomy-issues').open = true;
    const lead = stopTaxonomy ? '検索を停止しました。' : '検索が完了しました。';
    status.textContent = `${lead} 候補 ${taxonomyCandidates.size}件、分類の違い ${differences.length}種類、照合候補なし ${unmatched}件、取得失敗 ${errors}件。保存済みの照会結果を${reused}件再利用しました。
      ${cacheWriteFailed ? '一部の照会結果を次回用に保存できませんでした。' : ''}`;
  } catch {
    status.textContent = '端末の記録を読み込めませんでした。';
  } finally {
    taxonomyBusy = false;
    stop.hidden = true;
    scan.disabled = refreshButton.disabled = submit.disabled = compareToggle.disabled = false;
    updateDifferenceSelection();
  }
}
$('taxonomy-scan').onclick = () => scanTaxonomy(false);
$('taxonomy-refresh').onclick = () => scanTaxonomy(true);
$('taxonomy-form').onsubmit = async event => {
  event.preventDefault();
  if (taxonomyBusy || !db) return;
  const selected = [...taxonomyCandidates].filter(([, candidate]) => candidate.selected)
    .map(([id, candidate]) => [id, candidate.taxonomy]);
  const status = $('taxonomy-status');
  if (!selected.length) {
    status.textContent = '保存する候補を選択してください。';
    return;
  }
  taxonomyBusy = true;
  const submit = event.currentTarget.querySelector('[type=submit]');
  $('taxonomy-scan').disabled = submit.disabled = true;
  try {
    const saved = await saveTaxonomyCandidates(db, selected);
    for (const [id] of selected) taxonomyCandidates.delete(id);
    renderTaxonomyCandidates();
    updates?.postMessage('changed');
    status.textContent = `${saved}種類の分類を保存しました。`;
    await refresh().catch(() => { status.textContent += ' 図鑑を再読み込みすると反映されます。'; });
  } catch {
    status.textContent = '分類を保存できませんでした。もう一度お試しください。';
  } finally {
    taxonomyBusy = false;
    $('taxonomy-scan').disabled = submit.disabled = false;
  }
};

$('backup-open').onclick = () => $('backup').showModal();
$('download').onclick = async () => {
  try {
    const payload = { format: 'zooaqua-field-guide', version: 2, exportedAt: new Date().toISOString(), entries: await readEntries(db) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: 'application/json' }));
    const link = el('a');
    link.href = url;
    link.download = `zooaqua-${payload.exportedAt.slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    $('backup-status').textContent = 'JSONを書き出しました。';
  } catch {
    $('backup-status').textContent = 'JSONを書き出せませんでした。';
  }
};
$('legacy-cloud').onclick = async event => {
  const control = event.currentTarget;
  const status = $('backup-status');
  control.disabled = true;
  status.textContent = 'Firebaseから旧記録を読み込み中…';
  try {
    const legacy = await readLegacyCloud();
    await commit(legacy);
    status.textContent = legacy.length ? '旧記録を確認し、未保存の内容を取り込みました。' : 'Firebaseに読み込める旧記録はありませんでした。';
  } catch {
    status.textContent = '読み込みに失敗しました。接続やFirebaseのアクセス設定を確認してください。';
  } finally {
    control.disabled = false;
  }
};

const requestedTab = location.hash.slice(1);
if (['facilities', 'register', 'stats'].includes(requestedTab)) tab(requestedTab);
if (location.hash.startsWith('#species=')) {
  try { sessionStorage.setItem('zooaqua-open-legacy-species', decodeURIComponent(location.hash.slice(9))); } catch {}
}

try {
  db = await openDatabase();
  let migrationFailed = false;
  try {
    migrationFailed = await migrateLocal(db);
  } catch {
    migrationFailed = true;
  }
  await refresh();
  if (migrationFailed) message('端末の旧記録の一部または全部を読み込めませんでした。旧記録は端末に残っています。');
  if (updates) updates.onmessage = () => refresh().catch(() => message('記録を再読み込みできませんでした。'));
  const oldId = sessionStorage.getItem('zooaqua-open-legacy-species');
  if (oldId) {
    sessionStorage.removeItem('zooaqua-open-legacy-species');
    const legacy = entries.find(entry => entry.collection === 'records' && String(entry.record.id) === oldId);
    if (legacy) showAnimal(normalizeName(legacy.record.animalName));
  }
} catch {
  message('端末の記録を開けませんでした。ブラウザの保存設定を確認して再読み込みしてください。');
}
navigator.serviceWorker?.register('./sw.js').catch(() => {});
