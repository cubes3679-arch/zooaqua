// 生き物記録アプリ - 見られなかった記録（おまけ機能）

const MISS_STORAGE_KEY = 'zoo_missed_records';
const MISS_ITEMS_PER_PAGE = 20;
let missCurrentPage = 1;
let missFilteredRecords = [];

document.addEventListener('DOMContentLoaded', function() {
    initMissForm();
    loadMissRecords();
    updateMissDatalists();
    initMissFirebaseSync();
});

function initMissForm() {
    const form = document.getElementById('missForm');
    form.addEventListener('submit', handleMissSubmit);

    const visitDateInput = document.getElementById('missVisitDate');
    if (visitDateInput && !visitDateInput.value) {
        visitDateInput.value = new Date().toISOString().split('T')[0];
    }
}

function handleMissSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('missEntryId').value;
    const facilityType = document.querySelector('input[name="missFacilityType"]:checked').value;
    const facilityNamesText = document.getElementById('missFacilityNames').value.trim();
    const visitDate = document.getElementById('missVisitDate').value;
    const animalNamesText = document.getElementById('missAnimalNames').value.trim();
    const order = document.getElementById('missOrder').value.trim();
    const family = document.getElementById('missFamily').value.trim();
    const notes = document.getElementById('missNotes').value.trim();

    if (!facilityNamesText) { alert('施設名を入力してください。'); return; }
    if (!visitDate) { alert('訪問日を選択してください。'); return; }
    if (!animalNamesText) { alert('生き物の名前を入力してください。'); return; }

    const facilityNames = facilityNamesText.split('\n').map(name => name.trim()).filter(name => name.length > 0);
    const animalNames = animalNamesText.split('\n').map(name => name.trim()).filter(name => name.length > 0);

    const records = getMissRecords();

    if (id) {
        const index = records.findIndex(r => r.id == id);
        if (index !== -1) records.splice(index, 1);
    }

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
    saveMissRecords(records);
    resetMissForm();
    loadMissRecords();
    updateMissDatalists();
}

function editMissRecord(id) {
    const records = getMissRecords();
    const record = records.find(r => r.id === id);
    if (!record) { alert('記録が見つかりません。'); return; }

    document.getElementById('missEntryId').value = record.id;
    document.getElementById('missFacilityNames').value = record.facilityName;
    document.getElementById('missVisitDate').value = record.visitDate;
    document.getElementById('missAnimalNames').value = record.animalName;
    document.getElementById('missOrder').value = record.order || '';
    document.getElementById('missFamily').value = record.family || '';
    document.getElementById('missNotes').value = record.notes || '';

    const radios = document.querySelectorAll('input[name="missFacilityType"]');
    radios.forEach(radio => { radio.checked = radio.value === record.facilityType; });

    document.getElementById('missSubmitBtn').textContent = '更新する';
    document.getElementById('missCancelBtn').style.display = 'inline-block';

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteMissRecord(id) {
    if (!confirm('この記録を削除してもよろしいですか？')) return;
    const records = getMissRecords();
    const filtered = records.filter(r => r.id !== id);
    saveMissRecords(filtered);
    loadMissRecords();
}

function cancelMissEdit() {
    resetMissForm();
}

function resetMissForm() {
    document.getElementById('missEntryId').value = '';
    document.getElementById('missFacilityNames').value = '';
    document.getElementById('missAnimalNames').value = '';
    document.getElementById('missOrder').value = '';
    document.getElementById('missFamily').value = '';
    document.getElementById('missNotes').value = '';
    document.getElementById('missSubmitBtn').textContent = '登録する';
    document.getElementById('missCancelBtn').style.display = 'none';
}

function applyMissFilter() {
    missCurrentPage = 1;
    loadMissRecords();
}

function resetMissFilter() {
    document.getElementById('missSearchName').value = '';
    document.getElementById('missFilterFacility').value = '';
    missCurrentPage = 1;
    loadMissRecords();
}

function updateMissDatalists() {
    const records = getMissRecords();
    const orders = [...new Set(records.map(r => r.order).filter(Boolean))].sort();
    const families = [...new Set(records.map(r => r.family).filter(Boolean))].sort();
    const facilities = [...new Set(records.map(r => r.facilityName).filter(Boolean))].sort();

    const orderList = document.getElementById('missOrderList');
    const familyList = document.getElementById('missFamilyList');
    if (orderList) orderList.innerHTML = orders.map(opt => `<option value="${escapeMissHtml(opt)}">`).join('');
    if (familyList) familyList.innerHTML = families.map(opt => `<option value="${escapeMissHtml(opt)}">`).join('');

    const filterFacility = document.getElementById('missFilterFacility');
    if (filterFacility) {
        const currentValue = filterFacility.value;
        filterFacility.innerHTML = '<option value="">すべて</option>' + facilities.map(opt =>
            `<option value="${escapeMissHtml(opt)}">${escapeMissHtml(opt)}</option>`
        ).join('');
        if (facilities.includes(currentValue)) filterFacility.value = currentValue;
    }
}

function loadMissRecords() {
    let records = getMissRecords();

    const searchName = document.getElementById('missSearchName')?.value.trim().toLowerCase() || '';
    const filterFacility = document.getElementById('missFilterFacility')?.value.trim().toLowerCase() || '';

    missFilteredRecords = records.filter(record => {
        if (searchName && !record.animalName.toLowerCase().includes(searchName)) return false;
        if (filterFacility && !(record.facilityName || '').toLowerCase().includes(filterFacility)) return false;
        return true;
    });

    const totalPages = Math.ceil(missFilteredRecords.length / MISS_ITEMS_PER_PAGE);
    if (missCurrentPage > totalPages) missCurrentPage = Math.max(1, totalPages);

    const startIndex = (missCurrentPage - 1) * MISS_ITEMS_PER_PAGE;
    const pageRecords = missFilteredRecords.slice(startIndex, startIndex + MISS_ITEMS_PER_PAGE);

    const entryCount = document.getElementById('missEntryCount');
    if (entryCount) entryCount.textContent = `${missFilteredRecords.length}件（全${records.length}件中）`;

    renderMissList(pageRecords);
    renderMissPagination(totalPages);
}

function renderMissList(records) {
    const tbody = document.getElementById('missList');
    if (!tbody) return;

    if (records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 60px 20px; color: #999; font-size: 15px;">記録がありません。</td></tr>`;
        return;
    }

    tbody.innerHTML = records.map(record => {
        const badgeClass = record.facilityType === '動物園' ? 'badge-zoo' :
                          record.facilityType === '水族館' ? 'badge-aquarium' : 'badge-etc';
        return `<tr>
            <td><strong>${escapeMissHtml(record.animalName)}</strong></td>
            <td>${escapeMissHtml(record.order || '-')}</td>
            <td>${escapeMissHtml(record.family || '-')}</td>
            <td><span class="badge ${badgeClass}">${record.facilityType}</span></td>
            <td><span class="facility-item">${escapeMissHtml(record.facilityName || '-')}</span></td>
            <td>${record.visitDate || '-'}</td>
            <td class="notes-cell" title="${escapeMissHtml(record.notes || '')}">${escapeMissHtml(record.notes || '-')}</td>
            <td class="action-buttons">
                <button class="btn-edit" onclick="editMissRecord('${record.id}')">編集</button>
                <button class="btn-delete" onclick="deleteMissRecord('${record.id}')">削除</button>
            </td>
        </tr>`;
    }).join('');
}

function renderMissPagination(totalPages) {
    const pagination = document.getElementById('missPagination');
    if (!pagination) return;

    if (totalPages <= 1) { pagination.innerHTML = ''; return; }

    let html = '';
    html += `<button onclick="goToMissPage(${missCurrentPage - 1})" ${missCurrentPage === 1 ? 'disabled' : ''}>← 前へ</button>`;

    const maxVisiblePages = 5;
    let startPage = Math.max(1, missCurrentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    if (endPage - startPage < maxVisiblePages - 1) startPage = Math.max(1, endPage - maxVisiblePages + 1);

    if (startPage > 1) {
        html += `<button onclick="goToMissPage(1)">1</button>`;
        if (startPage > 2) html += `<span class="page-info">...</span>`;
    }
    for (let i = startPage; i <= endPage; i++) {
        html += `<button onclick="goToMissPage(${i})" class="${i === missCurrentPage ? 'active' : ''}">${i}</button>`;
    }
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<span class="page-info">...</span>`;
        html += `<button onclick="goToMissPage(${totalPages})">${totalPages}</button>`;
    }
    html += `<button onclick="goToMissPage(${missCurrentPage + 1})" ${missCurrentPage === totalPages ? 'disabled' : ''}>次へ →</button>`;

    pagination.innerHTML = html;
}

function goToMissPage(page) {
    const totalPages = Math.ceil(missFilteredRecords.length / MISS_ITEMS_PER_PAGE);
    if (page < 1 || page > totalPages) return;
    missCurrentPage = page;
    loadMissRecords();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function escapeMissHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getMissRecords() {
    try {
        const data = localStorage.getItem(MISS_STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('記録の取得に失敗しました:', e);
        return [];
    }
}

function saveMissRecords(records) {
    try {
        localStorage.setItem(MISS_STORAGE_KEY, JSON.stringify(records));
    } catch (e) {
        console.error('記録の保存に失敗しました:', e);
    }
    if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
        saveMissToFirebase(records);
    }
}

// --- Firebase 同期（missed_records コレクション） ---
let missRecordsRef = null;

function initMissFirebaseSync() {
    if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) return;
    missRecordsRef = firebase.database().ref('missed_records');

    const checkAuthAndSync = setInterval(async () => {
        if (sessionStorage.getItem('zoo_auth_authenticated') === 'true') {
            clearInterval(checkAuthAndSync);
            await syncMissWithFirebase();
            loadMissRecords();
            updateMissDatalists();
        }
    }, 100);

    setInterval(syncMissWithFirebase, 5 * 60 * 1000);
}

async function loadMissFromFirebase() {
    try {
        const snapshot = await missRecordsRef.once('value');
        const data = snapshot.val();
        return data ? Object.values(data) : [];
    } catch (e) {
        console.error('Firebase(missed_records) 読み込みエラー:', e);
        return [];
    }
}

async function saveMissToFirebase(records) {
    try {
        if (!missRecordsRef) return;
        const recordsObj = {};
        records.forEach((record, index) => {
            recordsObj[record.id || `record_${index}`] = record;
        });
        await missRecordsRef.set(recordsObj);
    } catch (e) {
        console.error('Firebase(missed_records) 保存エラー:', e);
    }
}

async function syncMissWithFirebase() {
    const localRecords = getMissRecords();
    const firebaseRecords = await loadMissFromFirebase();

    const localLatest = localRecords.reduce((latest, r) => Math.max(latest, new Date(r.updatedAt || r.createdAt || 0).getTime()), 0);
    const firebaseLatest = firebaseRecords.reduce((latest, r) => Math.max(latest, new Date(r.updatedAt || r.createdAt || 0).getTime()), 0);

    if (localLatest >= firebaseLatest) {
        await saveMissToFirebase(localRecords);
    } else {
        localStorage.setItem(MISS_STORAGE_KEY, JSON.stringify(firebaseRecords));
    }
}
