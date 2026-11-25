import { normalizeName, normalizeSearchName } from './model.mjs';

const groups = {
  Mammalia: '哺乳類', Aves: '鳥類', Reptilia: '爬虫類', Amphibia: '両生類',
  Actinopterygii: '条鰭類', Chondrichthyes: '軟骨魚類', Insecta: '昆虫類',
  Arachnida: 'クモ類', Cephalopoda: '頭足類', Gastropoda: '腹足類', Bivalvia: '二枚貝類',
};

// Japanese names documented alongside their scientific names by the Ministry of the Environment.
const scientificAliases = new Map([
  ['アカコンゴウインコ', 'Ara macao'], // https://www.env.go.jp/content/900494416.pdf
]);

const searches = new Map();
let rateLimit = Promise.resolve();

async function taxa(path) {
  const slot = rateLimit;
  rateLimit = slot.then(() => new Promise(resolve => setTimeout(resolve, 1100)));
  await slot;
  const response = await fetch('https://api.inaturalist.org/v1/taxa' + path, {
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error('分類の検索に失敗しました。');
  return (await response.json()).results;
}

export function lookup(name, { refresh = false } = {}) {
  const query = normalizeName(name);
  if (!query) return Promise.resolve(null);
  if (refresh) searches.delete(query);
  if (!searches.has(query)) {
    if (searches.size >= 512) searches.delete(searches.keys().next().value);
    searches.set(query, lookupTaxon(query).catch(error => {
      searches.delete(query);
      throw error;
    }));
  }
  return searches.get(query);
}

function nearTaxonNames(query, term) {
  if (query.length < 3) return false;
  if (term.startsWith(query)) return true;
  if (query.length < 5 || Math.abs(query.length - term.length) > 1) return false;
  const [shorter, longer] = query.length <= term.length ? [query, term] : [term, query];
  const mismatch = [...shorter].findIndex((character, index) => character !== longer[index]);
  if (mismatch < 0) return true;
  const next = mismatch + Number(shorter.length === longer.length);
  return shorter.slice(next) === longer.slice(mismatch + 1);
}

async function lookupTaxon(query) {
  const suggest = term => taxa('/autocomplete?' + new URLSearchParams({ q: term, locale: 'ja', per_page: 20 }));
  const matchingIds = (candidates, name, normalize) => candidates.filter(taxon => taxon.is_active && (
    [taxon.preferred_common_name, taxon.matched_term, taxon.name].some(term => normalize(term) === name)
  )).map(taxon => taxon.id);
  const candidates = await suggest(query);
  let ids = matchingIds(candidates, query, normalizeName);
  const variantMatch = !ids.length;
  let nearNames = [];
  if (variantMatch && /[ぁ-ゖァ-ヺ一-龯]/.test(query)) {
    const canonical = normalizeSearchName(query);
    const variants = new Set([canonical, canonical.replaceAll('ニホン', '日本')]);
    variants.delete(query);
    const alternatives = await Promise.all([...variants].map(suggest));
    ids = matchingIds(candidates.concat(...alternatives), canonical, normalizeSearchName);
  }
  const scientificAlias = scientificAliases.get(normalizeSearchName(query));
  if (!ids.length && scientificAlias) {
    const matches = (await suggest(scientificAlias))
      .filter(taxon => taxon.is_active && taxon.name === scientificAlias);
    ids = matches.map(taxon => taxon.id);
    nearNames = [...new Set(matches.map(taxon => taxon.preferred_common_name || taxon.name))];
  }
  if (!ids.length && /[ぁ-ゖァ-ヺ一-龯]/.test(query)) {
    const canonical = normalizeSearchName(query);
    const parts = canonical.match(/^([^()]+)\(([^()]+)\)$/)?.slice(1) ?? [canonical];
    const words = [...new Set(parts.flatMap(part => [part, part.replace(/^ニホン/, '')]).map(part => part.trim()))]
      .filter(part => part.length >= 2);
    const extra = await Promise.all(words.filter(word => word !== query).map(suggest));
    const available = candidates.concat(...extra).filter(taxon => taxon.is_active);
    const names = taxon => [taxon.preferred_common_name, taxon.matched_term]
      .filter(term => /[ぁ-ゖァ-ヺ一-龯]/.test(term ?? ''));
    for (const agrees of [
      term => words.includes(term),
      term => words.some(word => term === word + '属'),
      term => words.some(word => nearTaxonNames(word, term)),
    ]) {
      const matches = available.flatMap(taxon => names(taxon)
        .filter(name => agrees(normalizeSearchName(name))).map(name => ({ id: taxon.id, name })));
      if (!matches.length) continue;
      ids = matches.map(match => match.id);
      nearNames = [...new Set(matches.map(match => match.name))];
      break;
    }
  }
  ids = [...new Set(ids)];
  if (!ids.length) return null;
  const details = await Promise.all(ids.map(async id => {
    const results = await taxa('/' + id + '?locale=ja');
    return results.find(taxon => taxon.id === id);
  }));
  if (details.some(taxon => !taxon)) throw new Error('分類候補の詳細を取得できませんでした。');
  const lineages = details.map(taxon =>
    Object.fromEntries([...(taxon.ancestors ?? []), taxon].map(item => [item.rank, item])));
  const taxonomy = {};
  for (const [field, rank] of Object.entries({ group: 'class', order: 'order', family: 'family', genus: 'genus' })) {
    const first = lineages[0][rank];
    if (!first?.name || !lineages.every(lineage => lineage[rank]?.name === first.name)) continue;
    taxonomy[field] = (rank === 'class' && groups[first.name]) || first.preferred_common_name || first.name;
  }
  const [first] = details;
  const common = first.preferred_common_name ?? '';
  return {
    taxonomy,
    variantMatch,
    nearNames,
    sources: details.map(taxon => ({ id: taxon.id, scientificName: taxon.name })),
    japaneseName: /[ぁ-ゖァ-ヺ一-龯]/.test(common) && details.every(taxon => taxon.preferred_common_name === common) ? common : '',
  };
}

export function nameCandidates(text) {
  const lines = text.normalize('NFKC').split(/\r?\n/).map(line => line.trim());
  const names = lines.flatMap(line => {
    const cleaned = line
      .replace(/^(?:和名|名称|種名)\s*[:：]?\s*/, '')
      .replace(/(?<=[ァ-ヺー])[ \t]+(?=[ァ-ヺー])/g, '')
      .replace(/\s*[（(].*$/, '')
      .trim();
    if (/^[ァ-ヺー・]{2,25}$/.test(cleaned)) return [cleaned];
    return cleaned.match(/[ァ-ヺー・]{3,25}/g) ?? [];
  });
  return [...new Set(names.filter(name => !['レッドリスト', 'ワシントン', 'カテゴリー', 'データ', 'サイズ'].includes(name)))].slice(0, 12);
}

async function imageCanvas(file, limit, contrast = false) {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, limit / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (contrast) context.filter = 'grayscale(1) contrast(1.55)';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    bitmap.close();
  }
}

export async function speciesPhoto(file) {
  const canvas = await imageCanvas(file, 1280);
  return canvas.toDataURL('image/jpeg', 0.78);
}

const base = 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/';
let library;
export async function ocrWorker(logger) {
  library ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = base + 'tesseract.min.js';
    script.onload = () => resolve(globalThis.Tesseract);
    script.onerror = () => {
      script.remove();
      reject(new Error('読み取りエンジンを取得できませんでした。'));
    };
    document.head.append(script);
  }).catch(error => {
    library = undefined;
    throw error;
  });
  const tesseract = await library;
  let timer;
  let expired = false;
  const job = tesseract.createWorker('jpn+eng', 1, {
    workerPath: base + 'worker.min.js',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',
    logger,
  }).then(async worker => {
    if (expired) await worker.terminate();
    return worker;
  });
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      reject(new Error('読み取りエンジンの準備がタイムアウトしました。'));
    }, 60000);
  });
  try {
    return await Promise.race([job, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function recognizeSign(worker, file, retry) {
  const canvas = await imageCanvas(file, retry ? 2400 : 1800, retry);
  try {
    await worker.setParameters({ tessedit_pageseg_mode: retry ? '11' : '3', user_defined_dpi: '300' });
    const { data } = await worker.recognize(canvas, { rotateAuto: true });
    return data.text;
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}

export async function readSign(worker, file, retry, progress) {
  const texts = [await recognizeSign(worker, file, retry)];
  const checkedNames = new Set();
  const checkedScientific = new Set();
  const matches = [];
  const candidates = new Set();
  async function checkText(text) {
    const names = nameCandidates(text);
    names.forEach(name => candidates.add(name));
    for (const name of names.slice(0, 3)) {
      if (checkedNames.has(name)) continue;
      checkedNames.add(name);
      const result = await lookup(name).catch(() => null);
      if (!result || result.nearNames.length || !Object.keys(result.taxonomy).length) continue;
      const duplicate = matches.some(match => match.sources.length === result.sources.length &&
        match.sources.every(source => result.sources.some(other => other.id === source.id)));
      if (!duplicate) matches.push({ name, ...result });
    }
    const lowercaseLabels = text.split(/\r?\n/).map(line => line.trim())
      .filter(line => /^[a-z]{3,} [a-z]{3,}(?: [a-z]{3,})?$/.test(line))
      .map(line => line[0].toUpperCase() + line.slice(1));
    const academicText = [text, ...lowercaseLabels].join('\n');
    const scientificNames = [...academicText.matchAll(/\b([A-Z][a-z]{2,})[ \t]+([a-z]{3,})(?:[ \t]+([a-z]{3,}))?\b/g)]
      .slice(0, 3).map(match => match.slice(1).filter(Boolean));
    for (const words of scientificNames) {
      for (const scientific of [...new Set([words.join(' '), words.slice(0, 2).join(' ')])]) {
        if (checkedScientific.has(scientific)) continue;
        checkedScientific.add(scientific);
        const result = await lookup(scientific).catch(() => null);
        if (result?.japaneseName && result.sources.length === 1 && result.sources[0].scientificName === scientific) {
          const existing = matches.some(match => match.sources.some(source => source.id === result.sources[0].id));
          if (!existing) matches.push({ name: result.japaneseName, ...result });
          break;
        }
      }
    }
  }
  progress('分類を照合中');
  await checkText(texts[0]);
  if (matches.length !== 1 && !retry) {
    progress('文字を強調して再読み取り中');
    texts.push(await recognizeSign(worker, file, true));
    progress('再読み取り結果を照合中');
    await checkText(texts[1]);
  }
  const names = [...new Set([...matches.map(match => match.name), ...candidates])];
  return { candidates: names, text: [...new Set(texts)].join('\n\n'), best: matches.length === 1 ? matches[0] : null };
}
