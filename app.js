// 生き物記録アプリ - JavaScript

// データ保存キー
const STORAGE_KEY = 'zoo_animal_records';

// ページネーション設定
const ITEMS_PER_PAGE = 20;
let currentPage = 1;
let filteredRecords = [];

// アプリ初期化
document.addEventListener('DOMContentLoaded', function() {
    // 既存の生き物記録から施設訪問記録を補完登録（一度登録済みのものはスキップされる）
    backfillFacilityVisitsFromRecords();

    // ページによって処理を分岐
    const isListPage = document.getElementById('animalList') !== null;
    const isFormPage = document.getElementById('animalForm') !== null;

    if (isFormPage) {
        initForm();
        updateDatalists();
    }
    
    if (isListPage) {
        loadRecords();
        updateDatalists();
    }
    
    if (isFormPage) {
        initDuplicateCheck();
    }
});

// フォーム初期化
function initForm() {
    const form = document.getElementById('animalForm');
    form.addEventListener('submit', handleSubmit);
    
    // 訪問日フィールドに今日の日付をデフォルトで設定
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

// 動物名の登録済みチェック（同じ動物名があれば施設名は自動でマージされる）
function checkDuplicates(newNames, newFacilities, records, excludeId) {
    const infos = [];
    newNames.forEach(name => {
        const existing = records.find(r => r.animalName === name && r.id !== excludeId);
        if (existing) {
            const newOnes = newFacilities.filter(f => !existing.facilityNames.includes(f));
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
    const currentId = document.getElementById('entryId').value;
    const infos = checkDuplicates(animalNames, facilityNames, records, currentId);

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
        const infoText = infos.slice(0, 5).map(i => `・${i.name}に施設名「${i.newFacilities.join('、')}」を追加`).join('<br>');
        const moreText = infos.length > 5 ? `<br>...他${infos.length - 5}件` : '';
        notice.innerHTML = `<strong>ℹ️ 登録済みの生き物です：</strong><br>${infoText}${moreText}`;

        const hint = document.getElementById('animalNames').nextElementSibling;
        if (hint && hint.classList.contains('hint')) {
            hint.parentNode.insertBefore(notice, hint);
        }
    }
}

// フォーム送信ハンドラー
function handleSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('entryId').value;
    const facilityType = document.querySelector('input[name="facilityType"]:checked').value;
    const facilityNamesText = document.getElementById('facilityNames').value.trim();
    const visitDate = document.getElementById('visitDate').value;
    const animalNamesText = document.getElementById('animalNames').value.trim();
    const order = document.getElementById('order').value.trim();
    const family = document.getElementById('family').value.trim();
    const notes = document.getElementById('notes').value.trim();
    
    if (!facilityNamesText) { alert('施設名を入力してください。'); return; }
    if (!visitDate) { alert('最終見学日を選択してください。'); return; }
    if (!animalNamesText) { alert('生き物の名前を入力してください。'); return; }
    
    // 施設名と生き物の名前を分割
    const facilityNames = facilityNamesText.split('\n').map(name => name.trim()).filter(name => name.length > 0);
    const animalNames = animalNamesText.split('\n').map(name => name.trim()).filter(name => name.length > 0);
    
    if (facilityNames.length === 0) { alert('施設名を入力してください。'); return; }
    if (animalNames.length === 0) { alert('生き物の名前を入力してください。'); return; }

    const records = getRecords();

    // 編集モードの場合、対象レコードを一旦取り除く
    if (id) {
        const index = records.findIndex(r => r.id == id);
        if (index !== -1) records.splice(index, 1);
    }

    // 生き物ごとに、同じ動物名の記録が既にあれば施設名だけ追加し、なければ新規作成する
    animalNames.forEach((name, aIndex) => {
        const existing = records.find(r => r.animalName === name);
        if (existing) {
            facilityNames.forEach(facility => {
                if (!existing.facilityNames.includes(facility)) {
                    existing.facilityNames.push(facility);
                }
            });
            existing.visitDate = visitDate;
            existing.facilityType = facilityType;
            if (order) existing.order = order;
            if (family) existing.family = family;
            if (notes) existing.notes = notes;
            existing.updatedAt = new Date().toISOString();
        } else {
            records.unshift({
                id: (id && animalNames.length === 1) ? id : Date.now().toString() + '_' + aIndex + '_' + Math.random().toString(36).slice(2, 6),
                animalName: name,
                order,
                family,
                facilityType,
                facilityNames: [...facilityNames],
                visitDate,
                notes,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        }
    });

    saveRecords(records);

    // 施設訪問記録にも自動反映（同じ施設・同じ日の記録が無い場合のみ追加）
    syncFacilityVisits(facilityType, facilityNames, visitDate);

    resetFormKeepFacility();

    // 一覧ページにリダイレクト
    window.location.href = 'index.html';
}

// 生き物記録の入力内容を施設訪問記録（zoo_facility_visits）にも登録する
const FACILITY_VISITS_STORAGE_KEY = 'zoo_facility_visits';

function syncFacilityVisits(facilityType, facilityNames, visitDate) {
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
            firebase.database().ref('facility_visits').set(recordsObj)
                .catch(e => console.error('Firebase(facility_visits) 保存エラー:', e));
        }
    } catch (e) {
        console.error('施設訪問記録の自動登録に失敗しました:', e);
    }
}

// 既存の生き物記録（過去に登録済みのもの）を施設訪問記録に補完登録する
function backfillFacilityVisitsFromRecords() {
    const records = getRecords();
    records.forEach(record => {
        if (record.facilityNames && record.facilityNames.length > 0 && record.visitDate) {
            syncFacilityVisits(record.facilityType, record.facilityNames, record.visitDate);
        }
    });
}

// 編集ボタンクリック
function editRecord(id) {
    const records = getRecords();
    const record = records.find(r => r.id === id);
    if (!record) { alert('記録が見つかりません。'); return; }
    
    // 入力ページに移動して編集モードに
    const params = new URLSearchParams({
        editId: record.id,
        animalName: record.animalName,
        order: record.order || '',
        family: record.family || '',
        facilityType: record.facilityType,
        facilityName: (record.facilityNames || []).join('\n'),
        visitDate: record.visitDate,
        notes: record.notes || ''
    });
    window.location.href = `list.html?${params.toString()}`;
}

// 削除ボタンクリック
function deleteRecord(id) {
    if (!confirm('この記録を削除してもよろしいですか？')) return;
    
    const records = getRecords();
    const filtered = records.filter(r => r.id !== id);
    saveRecords(filtered);
    loadRecords();
}

// キャンセルボタン
function cancelEdit() {
    resetFormKeepFacility();
}

// フォームリセット（施設情報と訪問日は保持）
function resetFormKeepFacility() {
    document.getElementById('entryId').value = '';
    document.getElementById('facilityNames').value = '';
    document.getElementById('animalNames').value = '';
    document.getElementById('order').value = '';
    document.getElementById('family').value = '';
    document.getElementById('notes').value = '';
    document.getElementById('submitBtn').textContent = '一括追加する';
    document.getElementById('cancelBtn').style.display = 'none';
    
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
    const facilities = [...new Set(records.flatMap(r => r.facilityNames || []).filter(Boolean))].sort();
    
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
        // 施設名で絞り込み
        if (filterFacility && !(record.facilityNames || []).some(f => f.toLowerCase().includes(filterFacility))) {
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

// 記録一覧の描画
function renderList(records) {
    const tbody = document.getElementById('animalList');
    if (!tbody) return;
    
    if (records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 60px 20px; color: #999; font-size: 15px;">記録がありません。</td></tr>`;
        return;
    }
    
    tbody.innerHTML = records.map(record => {
        const badgeClass = record.facilityType === '動物園' ? 'badge-zoo' : 
                          record.facilityType === '水族館' ? 'badge-aquarium' : 'badge-etc';
        return `<tr>
            <td><strong>${escapeHtml(record.animalName)}</strong></td>
            <td>${escapeHtml(record.order || '-')}</td>
            <td>${escapeHtml(record.family || '-')}</td>
            <td><span class="badge ${badgeClass}">${record.facilityType}</span></td>
            <td><div class="facility-list">${(record.facilityNames || []).map(f => `<span class="facility-item">${escapeHtml(f)}</span>`).join('') || '-'}</div></td>
            <td>${record.visitDate || '-'}</td>
            <td class="notes-cell" title="${escapeHtml(record.notes || '')}">${escapeHtml(record.notes || '-')}</td>
            <td class="action-buttons">
                <button class="btn-edit" onclick="editRecord('${record.id}')">編集</button>
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

// 旧データ形式（facilityName単一文字列）をfacilityNames配列に変換
function normalizeRecord(record) {
    if (!Array.isArray(record.facilityNames)) {
        record.facilityNames = record.facilityName ? [record.facilityName] : [];
        delete record.facilityName;
    }
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

        record.facilityNames.forEach(f => {
            if (!target.facilityNames.includes(f)) target.facilityNames.push(f);
        });
        if (record.visitDate && (!target.visitDate || record.visitDate > target.visitDate)) {
            target.visitDate = record.visitDate;
        }
        if (!target.order && record.order) target.order = record.order;
        if (!target.family && record.family) target.family = record.family;
        if (record.notes && record.notes !== target.notes) {
            target.notes = target.notes ? `${target.notes}\n${record.notes}` : record.notes;
        }
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