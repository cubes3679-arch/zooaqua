// 生き物記録アプリ - JavaScript

// データ保存キー
const STORAGE_KEY = 'zoo_animal_records';
const FACILITY_VISITS_STORAGE_KEY = 'zoo_facility_visits';

// ページネーション設定
const ITEMS_PER_PAGE = 20;
let currentPage = 1;
let filteredRecords = [];

// アプリ初期化
document.addEventListener('DOMContentLoaded', function() {
    // 応急処置：盛岡動物園の見学日を一括で7/24に修正（一度だけ実行）
    applyMoriokaZooDateFix();

    // ページによって処理を分岐
    const isListPage = document.getElementById('animalList') !== null;
    const isFormPage = document.getElementById('animalForm') !== null;

    if (isFormPage) {
        initForm();
        updateDatalists();
        initDuplicateCheck();
    }

    if (isListPage) {
        loadRecords();
        updateDatalists();
    }
});

// フォーム初期化
function initForm() {
    const form = document.getElementById('animalForm');
    form.addEventListener('submit', handleSubmit);

    // 見学日フィールドに今日の日付をデフォルトで設定
    const visitDateInput = document.getElementById('visitDate');
    if (visitDateInput && !visitDateInput.value) {
        visitDateInput.value = new Date().toISOString().split('T')[0];
    }
}

// 重複チェックの初期化
function initDuplicateCheck() {
    const animalNamesInput = document.getElementById('animalNames');
    const facilityNamesInput = document.getElementById('facilityNames');
    const visitDateInput = document.getElementById('visitDate');

    [animalNamesInput, facilityNamesInput, visitDateInput].forEach(el => {
        el.addEventListener('input', showDuplicateWarning);
        el.addEventListener('change', showDuplicateWarning);
    });
}

// 動物名の登録済みチェック（同じ動物名があれば見学記録が自動でマージされる）
function checkDuplicates(newNames, newFacilities, records) {
    const infos = [];
    newNames.forEach(name => {
        const existing = records.find(r => r.animalName === name);
        if (existing) {
            const existingFacilities = existing.visits.map(v => v.facilityName);
            const newOnes = newFacilities.filter(f => !existingFacilities.includes(f));
            if (newOnes.length > 0) {
                infos.push({ name, newFacilities: newOnes });
            }
        }
    });
    return infos;
}

// 登録済み動物のお知らせ表示
function showDuplicateWarning() {
    const animalNamesText = document.getElementById('animalNames').value.trim();
    const facilityNamesText = document.getElementById('facilityNames').value.trim();

    const warningDiv = document.getElementById('duplicateWarning');
    if (warningDiv) warningDiv.remove();

    if (!animalNamesText || !facilityNamesText) return;

    const animalNames = animalNamesText.split('\n').map(name => name.trim()).filter(name => name.length > 0);
    const facilityNames = facilityNamesText.split('\n').map(name => name.trim()).filter(name => name.length > 0);
    const records = getRecords();
    const infos = checkDuplicates(animalNames, facilityNames, records);

    if (infos.length > 0) {
        const notice = document.createElement('div');
        notice.id = 'duplicateWarning';
        notice.style.cssText = `
            background: #e3f2fd;
            border: 1px solid #64b5f6;
            border-radius: 8px;
            padding: 12px 16px;
            margin-bottom: 16px;
            color: #1565c0;
            font-size: 13px;
        `;
        const infoText = infos.slice(0, 5).map(i => `・${i.name}に見学記録「${i.newFacilities.join('、')}」を追加`).join('<br>');
        const moreText = infos.length > 5 ? `<br>...他${infos.length - 5}件` : '';
        notice.innerHTML = `<strong>ℹ️ 登録済みの生き物です：</strong><br>${infoText}${moreText}`;

        const hint = document.getElementById('animalNames').nextElementSibling;
        if (hint && hint.classList.contains('hint')) {
            hint.parentNode.insertBefore(notice, hint);
        }
    }
}

// フォーム送信ハンドラー（常に新規の見学記録を追加する。既存の動物なら見学記録が積み上がる）
async function handleSubmit(e) {
    e.preventDefault();

    const facilityType = document.querySelector('input[name="facilityType"]:checked').value;
    const facilityNamesText = document.getElementById('facilityNames').value.trim();
    const visitDate = document.getElementById('visitDate').value;
    const animalNamesText = document.getElementById('animalNames').value.trim();
    const order = document.getElementById('order').value.trim();
    const family = document.getElementById('family').value.trim();
    const notes = document.getElementById('notes').value.trim();

    if (!facilityNamesText) { alert('施設名を入力してください。'); return; }
    if (!visitDate) { alert('見学日を選択してください。'); return; }
    if (!animalNamesText) { alert('生き物の名前を入力してください。'); return; }

    // 施設名と生き物の名前を分割
    const facilityNames = facilityNamesText.split('\n').map(name => name.trim()).filter(name => name.length > 0);
    const animalNames = animalNamesText.split('\n').map(name => name.trim()).filter(name => name.length > 0);

    if (facilityNames.length === 0) { alert('施設名を入力してください。'); return; }
    if (animalNames.length === 0) { alert('生き物の名前を入力してください。'); return; }

    const records = getRecords();

    animalNames.forEach((name, aIndex) => {
        let target = records.find(r => r.animalName === name);
        if (!target) {
            target = {
                id: Date.now().toString() + '_' + aIndex + '_' + Math.random().toString(36).slice(2, 6),
                animalName: name,
                order: '',
                family: '',
                visits: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            records.unshift(target);
        }

        facilityNames.forEach((facilityName, fIndex) => {
            const dup = target.visits.find(v => v.facilityName === facilityName && v.visitDate === visitDate);
            if (dup) {
                if (notes) dup.notes = notes;
            } else {
                target.visits.push({
                    id: Date.now().toString() + '_' + aIndex + '_' + fIndex + '_' + Math.random().toString(36).slice(2, 6),
                    facilityType,
                    facilityName,
                    visitDate,
                    notes
                });
            }
        });

        if (order) target.order = order;
        if (family) target.family = family;
        target.updatedAt = new Date().toISOString();
    });

    // クラウドへの保存が終わるのを待ってから画面遷移する
    // （遷移が先に起きると、送信中のFirebaseへの書き込みが中断されてしまうことがある）
    await saveRecords(records);

    // 施設訪問記録にも自動反映（同じ施設・同じ日の記録が無い場合のみ追加）
    await syncFacilityVisits(facilityType, facilityNames, visitDate);

    resetForm();

    // 一覧ページにリダイレクト
    window.location.href = 'index.html';
}

// 生き物記録の入力内容を施設訪問記録（zoo_facility_visits）にも登録する
async function syncFacilityVisits(facilityType, facilityNames, visitDate) {
    try {
        const data = localStorage.getItem(FACILITY_VISITS_STORAGE_KEY);
        const facilityRecords = (data ? JSON.parse(data) : []).map(record => {
            if (!Array.isArray(record.visitDates)) {
                record.visitDates = record.visitDate ? [record.visitDate] : [];
                delete record.visitDate;
            }
            return record;
        });
        let changed = false;

        facilityNames.forEach(facilityName => {
            const existing = facilityRecords.find(r => r.facilityName === facilityName);
            if (existing) {
                if (!existing.visitDates.includes(visitDate)) {
                    existing.visitDates.push(visitDate);
                    existing.updatedAt = new Date().toISOString();
                    changed = true;
                }
            } else {
                facilityRecords.unshift({
                    id: Date.now().toString() + '_' + Math.random().toString(36).slice(2, 6),
                    facilityName,
                    facilityType,
                    visitDates: [visitDate],
                    notes: '',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });
                changed = true;
            }
        });

        if (!changed) return;

        localStorage.setItem(FACILITY_VISITS_STORAGE_KEY, JSON.stringify(facilityRecords));

        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
            const recordsObj = {};
            facilityRecords.forEach((record, index) => {
                recordsObj[record.id || `record_${index}`] = record;
            });
            try {
                await firebase.database().ref('facility_visits').set(recordsObj);
            } catch (e) {
                console.error('Firebase(facility_visits) 保存エラー:', e);
            }
        }
    } catch (e) {
        console.error('施設訪問記録の自動登録に失敗しました:', e);
    }
}

// 応急処置：旧データ移行で「盛岡」の施設に紐づいてしまった見学日を、
// 一括で2026-07-24に修正する（一度だけ実行し、以降は何もしない）
// v1は施設名の完全一致でチェックしていたため、実際の施設名の表記が
// 想定と違っていると何も修正されないまま「実行済み」扱いになってしまう
// 問題があった。v2では「盛岡」を含む施設名すべてを対象にする
const MORIOKA_FIX_KEY = 'zoo_morioka_zoo_date_fix_v2';
const MORIOKA_FIX_MATCH = '盛岡';
const MORIOKA_FIX_DATE = '2026-07-24';

function isMoriokaFacility(name) {
    return typeof name === 'string' && name.includes(MORIOKA_FIX_MATCH);
}

function applyMoriokaZooDateFix() {
    if (localStorage.getItem(MORIOKA_FIX_KEY)) return;

    // 生き物記録側の見学記録を修正
    const records = getRecords();
    let recordsChanged = false;
    records.forEach(record => {
        let recordTouched = false;
        record.visits.forEach(visit => {
            if (isMoriokaFacility(visit.facilityName) && visit.visitDate !== MORIOKA_FIX_DATE) {
                visit.visitDate = MORIOKA_FIX_DATE;
                recordTouched = true;
            }
        });
        if (recordTouched) {
            // updatedAtを更新しないと、他の端末との同期で「どちらが新しいデータか」の
            // 判定に使われず、この修正が他の端末に伝わらないことがあるため必ず更新する
            record.updatedAt = new Date().toISOString();
            recordsChanged = true;
        }
    });
    if (recordsChanged) saveRecords(records);

    // 施設訪問記録側も同じ施設名なら日付を1つにまとめる
    try {
        const data = localStorage.getItem(FACILITY_VISITS_STORAGE_KEY);
        const facilityRecords = data ? JSON.parse(data) : [];
        let facilityChanged = false;
        facilityRecords.forEach(fr => {
            if (isMoriokaFacility(fr.facilityName)) {
                const dates = Array.isArray(fr.visitDates) ? fr.visitDates : (fr.visitDate ? [fr.visitDate] : []);
                if (dates.length !== 1 || dates[0] !== MORIOKA_FIX_DATE) {
                    fr.visitDates = [MORIOKA_FIX_DATE];
                    delete fr.visitDate;
                    fr.updatedAt = new Date().toISOString();
                    facilityChanged = true;
                }
            }
        });
        if (facilityChanged) {
            localStorage.setItem(FACILITY_VISITS_STORAGE_KEY, JSON.stringify(facilityRecords));
            if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
                const recordsObj = {};
                facilityRecords.forEach((record, index) => {
                    recordsObj[record.id || `record_${index}`] = record;
                });
                firebase.database().ref('facility_visits').set(recordsObj)
                    .catch(e => console.error('Firebase(facility_visits) 保存エラー:', e));
            }
        }
    } catch (e) {
        console.error('施設訪問記録の盛岡動物園修正に失敗しました:', e);
    }

    localStorage.setItem(MORIOKA_FIX_KEY, 'true');
}

// 詳細ページへ移動
function goToDetail(id) {
    window.location.href = `detail.html?id=${encodeURIComponent(id)}`;
}

// 削除ボタンクリック
function deleteRecord(id) {
    if (!confirm('この記録を削除してもよろしいですか？（見学記録もすべて削除されます）')) return;

    const records = getRecords();
    const filtered = records.filter(r => r.id !== id);
    saveRecords(filtered);
    loadRecords();
}

// フォームリセット（施設名・見学日は保持せずクリア）
function resetForm() {
    document.getElementById('facilityNames').value = '';
    document.getElementById('animalNames').value = '';
    document.getElementById('order').value = '';
    document.getElementById('family').value = '';
    document.getElementById('notes').value = '';

    const warningDiv = document.getElementById('duplicateWarning');
    if (warningDiv) warningDiv.remove();
}

// 検索・絞り込み
function applyFilter() {
    currentPage = 1;
    loadRecords();
}

function resetFilter() {
    document.getElementById('searchName').value = '';
    document.getElementById('filterOrder').value = '';
    document.getElementById('filterFamily').value = '';
    document.getElementById('filterFacility').value = '';
    currentPage = 1;
    loadRecords();
}

// datalistとselectの更新
function updateDatalists() {
    const records = getRecords();

    // 重複を除去してソート
    const orders = [...new Set(records.map(r => r.order).filter(Boolean))].sort();
    const families = [...new Set(records.map(r => r.family).filter(Boolean))].sort();
    const facilities = [...new Set(records.flatMap(r => r.visits.map(v => v.facilityName)).filter(Boolean))].sort();

    // 入力フォームのdatalist
    const orderList = document.getElementById('orderList');
    const familyList = document.getElementById('familyList');
    if (orderList) updateDatalistOptions('orderList', orders);
    if (familyList) updateDatalistOptions('familyList', families);

    // フィルターのselect
    const filterOrder = document.getElementById('filterOrder');
    const filterFamily = document.getElementById('filterFamily');
    const filterFacility = document.getElementById('filterFacility');
    if (filterOrder) updateSelectOptions('filterOrder', orders);
    if (filterFamily) updateSelectOptions('filterFamily', families);
    if (filterFacility) updateSelectOptions('filterFacility', facilities);
}

function updateDatalistOptions(datalistId, options) {
    const datalist = document.getElementById(datalistId);
    if (!datalist) return;
    datalist.innerHTML = options.map(opt => `<option value="${escapeHtml(opt)}">`).join('');
}

function updateSelectOptions(selectId, options) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const currentValue = select.value;
    select.innerHTML = '<option value="">すべて</option>' + options.map(opt =>
        `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`
    ).join('');
    // 以前の選択を保持
    if (options.includes(currentValue)) {
        select.value = currentValue;
    }
}

// 記録の読み込みと表示
function loadRecords() {
    let records = getRecords();

    // 検索・絞り込み
    const searchName = document.getElementById('searchName')?.value.trim().toLowerCase() || '';
    const filterOrder = document.getElementById('filterOrder')?.value.trim().toLowerCase() || '';
    const filterFamily = document.getElementById('filterFamily')?.value.trim().toLowerCase() || '';
    const filterFacility = document.getElementById('filterFacility')?.value.trim().toLowerCase() || '';

    filteredRecords = records.filter(record => {
        // あいまい検索（名前）
        if (searchName && !record.animalName.toLowerCase().includes(searchName)) {
            return false;
        }
        // 目で絞り込み
        if (filterOrder && !(record.order || '').toLowerCase().includes(filterOrder)) {
            return false;
        }
        // 科で絞り込み
        if (filterFamily && !(record.family || '').toLowerCase().includes(filterFamily)) {
            return false;
        }
        // 施設名で絞り込み（見学記録の中を検索）
        if (filterFacility && !record.visits.some(v => v.facilityName.toLowerCase().includes(filterFacility))) {
            return false;
        }
        return true;
    });

    // ページネーション
    const totalPages = Math.ceil(filteredRecords.length / ITEMS_PER_PAGE);
    if (currentPage > totalPages) currentPage = Math.max(1, totalPages);

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const pageRecords = filteredRecords.slice(startIndex, endIndex);

    // 件数表示
    const entryCount = document.getElementById('entryCount');
    if (entryCount) {
        entryCount.textContent = `${filteredRecords.length}件（全${records.length}件中）`;
    }

    // 一覧表示
    renderList(pageRecords);

    // ページネーション表示
    renderPagination(totalPages);
}

// 記録一覧の描画（名前・目・科のみ。見学記録の詳細は詳細ページで見る）
function renderList(records) {
    const tbody = document.getElementById('animalList');
    if (!tbody) return;

    if (records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 60px 20px; color: #999; font-size: 15px;">記録がありません。</td></tr>`;
        return;
    }

    tbody.innerHTML = records.map(record => {
        const visitCount = record.visits.length;
        return `<tr>
            <td><strong>${escapeHtml(record.animalName)}</strong></td>
            <td data-label="目">${escapeHtml(record.order || '-')}</td>
            <td data-label="科">${escapeHtml(record.family || '-')}</td>
            <td class="action-buttons">
                <button class="btn-detail" onclick="goToDetail('${record.id}')">詳細（${visitCount}件）</button>
                <button class="btn-delete" onclick="deleteRecord('${record.id}')">削除</button>
            </td>
        </tr>`;
    }).join('');
}

// ページネーションの描画
function renderPagination(totalPages) {
    const pagination = document.getElementById('pagination');
    if (!pagination) return;

    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let html = '';

    // 前へボタン
    html += `<button onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>← 前へ</button>`;

    // ページ番号
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage < maxVisiblePages - 1) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    if (startPage > 1) {
        html += `<button onclick="goToPage(1)">1</button>`;
        if (startPage > 2) {
            html += `<span class="page-info">...</span>`;
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<button onclick="goToPage(${i})" class="${i === currentPage ? 'active' : ''}">${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            html += `<span class="page-info">...</span>`;
        }
        html += `<button onclick="goToPage(${totalPages})">${totalPages}</button>`;
    }

    // 次へボタン
    html += `<button onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>次へ →</button>`;

    pagination.innerHTML = html;
}

// ページ移動
function goToPage(page) {
    const totalPages = Math.ceil(filteredRecords.length / ITEMS_PER_PAGE);
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    loadRecords();
    // ページ切り替え後、画面の一番上にスクロールして戻す
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// HTMLエスケープ
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// 記録を取得
function getRecords() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        const records = (data ? JSON.parse(data) : []).map(normalizeRecord);
        const { merged, changed } = consolidateDuplicateAnimals(records);
        if (changed) {
            saveRecords(merged);
            return merged;
        }
        return records;
    } catch (e) {
        console.error('記録の取得に失敗しました:', e);
        return [];
    }
}

// 旧データ形式（facilityNames/visitDates配列や、さらに古いfacilityName/visitDate単一文字列）を
// visits配列（施設名・種類・見学日・備考をひとまとめにした見学記録のリスト）に変換する。
// 旧形式ではどの施設とどの日付が対応していたかの情報が失われているため、
// 順番をそのまま組み合わせるベストエフォートの変換になる。
function normalizeRecord(record) {
    if (Array.isArray(record.visits)) return record;

    const facilityNames = Array.isArray(record.facilityNames)
        ? record.facilityNames
        : (record.facilityName ? [record.facilityName] : []);
    const visitDates = Array.isArray(record.visitDates)
        ? [...record.visitDates].sort()
        : (record.visitDate ? [record.visitDate] : []);
    const facilityType = record.facilityType || '動物園';
    const notes = record.notes || '';

    const visits = [];
    const count = Math.max(facilityNames.length, visitDates.length);
    for (let i = 0; i < count; i++) {
        const facilityName = facilityNames[i] || facilityNames[facilityNames.length - 1] || '';
        const visitDate = visitDates[i] || visitDates[visitDates.length - 1] || '';
        if (!facilityName && !visitDate) continue;
        visits.push({
            id: `${record.id || 'legacy'}_v${i}_${Math.random().toString(36).slice(2, 6)}`,
            facilityType,
            facilityName,
            visitDate,
            notes: (i === count - 1) ? notes : ''
        });
    }

    delete record.facilityNames;
    delete record.facilityName;
    delete record.visitDates;
    delete record.visitDate;
    delete record.facilityType;
    delete record.notes;

    record.visits = visits;
    return record;
}

// 過去に別々に登録された同じ動物名の記録を1件に統合する（既存データ向けの一括統合）
function consolidateDuplicateAnimals(records) {
    const merged = [];
    const indexByName = new Map();
    let changed = false;

    records.forEach(record => {
        const existingIndex = indexByName.get(record.animalName);
        if (existingIndex === undefined) {
            indexByName.set(record.animalName, merged.length);
            merged.push(record);
            return;
        }

        changed = true;
        const target = merged[existingIndex];

        record.visits.forEach(visit => {
            const dup = target.visits.find(v => v.facilityName === visit.facilityName && v.visitDate === visit.visitDate);
            if (dup) {
                if (visit.notes && !dup.notes) dup.notes = visit.notes;
            } else {
                target.visits.push(visit);
            }
        });
        if (!target.order && record.order) target.order = record.order;
        if (!target.family && record.family) target.family = record.family;
        target.updatedAt = new Date().toISOString();
    });

    return { merged, changed };
}

// 記録を保存
function saveRecords(records) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (e) {
        console.error('記録の保存に失敗しました:', e);
    }
}
