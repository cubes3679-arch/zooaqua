// 生き物記録アプリ - JavaScript

// データ保存キー
const STORAGE_KEY = 'zoo_animal_records';

// ページネーション設定
const ITEMS_PER_PAGE = 10;
let currentPage = 1;
let filteredRecords = [];

// アプリ初期化
document.addEventListener('DOMContentLoaded', function() {
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

// 重複チェック関数
function checkDuplicates(newNames, newFacilities, visitDate, records, excludeId) {
    const duplicates = [];
    newNames.forEach(name => {
        newFacilities.forEach(facility => {
            const isDuplicate = records.some(r => 
                r.animalName === name && 
                r.facilityName === facility && 
                r.visitDate === visitDate &&
                r.id !== excludeId
            );
            if (isDuplicate) {
                duplicates.push({ name, facility });
            }
        });
    });
    return duplicates;
}

// 重複警告表示
function showDuplicateWarning() {
    const animalNamesText = document.getElementById('animalNames').value.trim();
    const facilityNamesText = document.getElementById('facilityNames').value.trim();
    const visitDate = document.getElementById('visitDate').value;
    
    const warningDiv = document.getElementById('duplicateWarning');
    if (warningDiv) warningDiv.remove();
    
    if (!animalNamesText || !facilityNamesText || !visitDate) return;
    
    const animalNames = animalNamesText.split('\n').map(name => name.trim()).filter(name => name.length > 0);
    const facilityNames = facilityNamesText.split('\n').map(name => name.trim()).filter(name => name.length > 0);
    const records = getRecords();
    const currentId = document.getElementById('entryId').value;
    const duplicates = checkDuplicates(animalNames, facilityNames, visitDate, records, currentId);
    
    if (duplicates.length > 0) {
        const warning = document.createElement('div');
        warning.id = 'duplicateWarning';
        warning.style.cssText = `
            background: #ffebee;
            border: 1px solid #f44336;
            border-radius: 8px;
            padding: 12px 16px;
            margin-bottom: 16px;
            color: #c62828;
            font-size: 13px;
        `;
        const dupText = duplicates.slice(0, 5).map(d => `・${d.facility}の${d.name}`).join('<br>');
        const moreText = duplicates.length > 5 ? `<br>...他${duplicates.length - 5}件` : '';
        warning.innerHTML = `<strong>⚠️ 重複しています：</strong><br>${dupText}${moreText}`;
        
        const hint = document.getElementById('animalNames').nextElementSibling;
        if (hint && hint.classList.contains('hint')) {
            hint.parentNode.insertBefore(warning, hint);
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
    if (!visitDate) { alert('訪問日を選択してください。'); return; }
    if (!animalNamesText) { alert('生き物の名前を入力してください。'); return; }
    
    // 施設名と生き物の名前を分割
    const facilityNames = facilityNamesText.split('\n').map(name => name.trim()).filter(name => name.length > 0);
    const animalNames = animalNamesText.split('\n').map(name => name.trim()).filter(name => name.length > 0);
    
    if (facilityNames.length === 0) { alert('施設名を入力してください。'); return; }
    if (animalNames.length === 0) { alert('生き物の名前を入力してください。'); return; }
    
    // 重複チェック
    const records = getRecords();
    const duplicates = checkDuplicates(animalNames, facilityNames, visitDate, records, id);
    if (duplicates.length > 0) {
        const dupText = duplicates.slice(0, 3).map(d => `${d.facility}の${d.name}`).join('、');
        const moreText = duplicates.length > 3 ? `他${duplicates.length - 3}件` : '';
        if (!confirm(`以下の組み合わせは既に登録されていますが、追加しますか？\n\n${dupText}${moreText ? '、' + moreText : ''}`)) {
            return;
        }
    }
    
    // 編集モードの場合、既存レコードを削除
    if (id) {
        const index = records.findIndex(r => r.id == id);
        if (index !== -1) records.splice(index, 1);
    }
    
    // 施設名×生き物の組み合わせでレコードを作成
    const newRecords = [];
    facilityNames.forEach((facility, fIndex) => {
        animalNames.forEach((name, aIndex) => {
            newRecords.push({
                id: id ? `${id}_${fIndex}_${aIndex}` : Date.now().toString() + '_' + fIndex + '_' + aIndex,
                animalName: name,
                order,
                family,
                facilityType,
                facilityName: facility,
                visitDate,
                notes,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        });
    });
    
    newRecords.forEach(record => records.unshift(record));
    saveRecords(records);
    resetFormKeepFacility();
    
    // 一覧ページにリダイレクト
    window.location.href = 'list.html';
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
        facilityName: record.facilityName,
        visitDate: record.visitDate,
        notes: record.notes || ''
    });
    window.location.href = `index.html?${params.toString()}`;
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
    const facilities = [...new Set(records.map(r => r.facilityName).filter(Boolean))].sort();
    
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
        if (filterFacility && !(record.facilityName || '').toLowerCase().includes(filterFacility)) {
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
            <td><span class="facility-item">${escapeHtml(record.facilityName || '-')}</span></td>
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
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('記録の取得に失敗しました:', e);
        return [];
    }
}

// 記録を保存
function saveRecords(records) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (e) {
        console.error('記録の保存に失敗しました:', e);
    }
}