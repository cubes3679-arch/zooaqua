import { normalizeName } from './model.mjs';

const groups = {
  Mammalia: '哺乳類', Aves: '鳥類', Reptilia: '爬虫類', Amphibia: '両生類',
  Actinopterygii: '条鰭類', Chondrichthyes: '軟骨魚類', Insecta: '昆虫類',
  Arachnida: 'クモ類', Cephalopoda: '頭足類', Gastropoda: '腹足類', Bivalvia: '二枚貝類',
};

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

export function lookup(name) {
  const query = normalizeName(name);
  if (!query) return Promise.resolve(null);
  if (!searches.has(query)) {
    if (searches.size >= 512) searches.delete(searches.keys().next().value);
    searches.set(query, lookupTaxon(query).catch(error => {
      searches.delete(query);
      throw error;
    }));
  }
  return searches.get(query);
}

async function lookupTaxon(query) {
  const candidates = await taxa('/autocomplete?' + new URLSearchParams({ q: query, locale: 'ja', per_page: 20 }));
  const matches = candidates.filter(taxon => taxon.is_active && (
    normalizeName(taxon.preferred_common_name) === query || normalizeName(taxon.matched_term) === query || taxon.name === query
  ));
  if (matches.length !== 1) return null;
  const [taxon] = await taxa('/' + matches[0].id + '?locale=ja');
  if (!taxon) return null;
  const lineage = Object.fromEntries([...(taxon.ancestors ?? []), taxon].map(item => [item.rank, item]));
  const nameOf = rank => lineage[rank]?.preferred_common_name || lineage[rank]?.name || '';
  return {
    taxonomy: {
      group: groups[lineage.class?.name] || nameOf('class'),
      order: nameOf('order'),
      family: nameOf('family'),
      genus: nameOf('genus'),
    },
    source: { id: taxon.id, scientificName: taxon.name },
    japaneseName: /[ぁ-ゖァ-ヺ一-龯]/.test(taxon.preferred_common_name ?? '')
      ? taxon.preferred_common_name : '',
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

async function imageCanvas(file, limit) {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, limit / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
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
  const job = tesseract.createWorker('jpn', 1, {
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

export async function readSign(worker, file, retry, progress) {
  const canvas = await imageCanvas(file, retry ? 2200 : 1500);
  try {
    await worker.setParameters({ tessedit_pageseg_mode: retry ? '11' : '3' });
    const { data } = await worker.recognize(canvas);
    const candidates = nameCandidates(data.text);
    const matches = [];
    if (candidates.length) {
      progress('分類を照合中');
      for (const name of candidates.slice(0, 2)) {
        try {
          const result = await lookup(name);
          if (result) matches.push({ name, ...result });
        } catch {
          break;
        }
      }
    }
    const scientific = data.text.match(/\b[A-Z][a-z]{2,} [a-z]{3,}(?: [a-z]{3,})?\b/)?.[0];
    if (scientific) {
      try {
        const result = await lookup(scientific);
        if (result?.japaneseName && result.source.scientificName === scientific) {
          const existing = matches.find(match => match.source.id === result.source.id);
          if (!existing) matches.push({ name: result.japaneseName, ...result });
        }
      } catch {
        // The user can still check the text and enter the name manually.
      }
    }
    const names = [...new Set([...matches.map(match => match.name), ...candidates])];
    return { candidates: names, text: data.text, best: matches.length === 1 ? matches[0] : null };
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}
