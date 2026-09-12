// 生き物記録アプリ - 施設訪問記録

const FACILITY_STORAGE_KEY = 'zoo_facility_visits';
const FACILITY_ITEMS_PER_PAGE = 20;
let facilityCurrentPage = 1;
let facilityFilteredRecords = [];

document.addEventListener('DOMContentLoaded', function() {
    initFacilityForm();
    loadFacilityRecords();
    initFacilityFirebaseSync();
});

function initFacilityForm() {
    const form = document.getElementById('facilityForm');
    form.addEventListener('submit', handleFacilitySubmit);

    const visitDateInput = document.getElementById('facilityVisitDate');
    if (visitDateInput && !visitDateInput.value) {
        visitDateInput.value = new Date().toISOString().split('T')[0];
    }
}

function handleFacilitySubmit(e) {
    e.preventDefault();

    const id = document.getElementById('facilityEntryId').value;
    const facilityType = document.querySelector('input[name="facilityVisitType"]:checked').value;
    const facilityNamesText = document.getElementById('facilityVisitNames').value.trim();
    const visitDate = document.getElementById('facilityVisitDate').value;
    const notes = document.getElementById('facilityVisitNotes').value.trim();

    if (!facilityNamesText) { alert('施設名を入力してください。'); return; }
    if (!visitDate) { alert('訪問日を選択してください。'); return; }

    const facilityNames = facilityNamesText.split('\n').map(name => name.trim()).filter(name => name.length > 0);
    if (facilityNames.length === 0) { alert('施設名を入力してください。'); return; }

    const records = getFacilityRecords();

    if (id) {
        const index = records.findIndex(r => r.id == id);
        if (index !== -1) records.splice(index, 1);
    }

    facilityNames.forEach((facilityName, fIndex) => {
        records.unshift({
            id: (id && facilityNames.length === 1) ? id : Date.now().toString() + '_' + fIndex + '_' + Math.random().toString(36).slice(2, 6),
            facilityName,
            facilityType,
            visitDate,
            notes,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
    });

    saveFacilityRecords(records);
    resetFacilityForm();
    loadFacilityRecords();
}

function editFacilityRecord(id) {
    const records = getFacilityRecords();
    const record = records.find(r => r.id === id);
    if (!record) { alert('記録が見つかりません。'); return; }

    document.getElementById('facilityEntryId').value = record.id;
    document.getElementById('facilityVisitNames').value = record.facilityName;
    document.getElementById('facilityVisitDate').value = record.visitDate;
    document.getElementById('facilityVisitNotes').value = record.notes || '';

    const radios = document.querySelectorAll('input[name="facilityVisitType"]');
    radios.forEach(radio => { radio.checked = radio.value === record.facilityType; });

    document.getElementById('facilitySubmitBtn').textContent = '更新する';
    document.getElementById('facilityCancelBtn').style.display = 'inline-block';

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteFacilityRecord(id) {
    if (!confirm('この記録を削除してもよろしいですか？')) return;
    const records = getFacilityRecords();
    const filtered = records.filter(r => r.id !== id);
    saveFacilityRecords(filtered);
    loadFacilityRecords();
}

function cancelFacilityEdit() {
    resetFacilityForm();
}

function resetFacilityForm() {
    document.getElementById('facilityEntryId').value = '';
    document.getElementById('facilityVisitNames').value = '';
    document.getElementById('facilityVisitNotes').value = '';
    document.getElementById('facilitySubmitBtn').textContent = '登録する';
    document.getElementById('facilityCancelBtn').style.display = 'none';
}

function applyFacilityFilter() {
    facilityCurrentPage = 1;
    loadFacilityRecords();
}

function resetFacilityFilter() {
    document.getElementById('facilitySearchName').value = '';
    document.getElementById('facilityFilterType').value = '';
    facilityCurrentPage = 1;
    loadFacilityRecords();
}

function loadFacilityRecords() {
    let records = getFacilityRecords();

    const searchName = document.getElementById('facilitySearchName')?.value.trim().toLowerCase() || '';
    const filterType = document.getElementById('facilityFilterType')?.value.trim() || '';

    facilityFilteredRecords = records.filter(record => {
        if (searchName && !record.facilityName.toLowerCase().includes(searchName)) return false;
        if (filterType && record.facilityType !== filterType) return false;
        return true;
    });

    // 訪問日が新しい順に並べ替え
    facilityFilteredRecords.sort((a, b) => (b.visitDate || '').localeCompare(a.visitDate || ''));

    const totalPages = Math.ceil(facilityFilteredRecords.length / FACILITY_ITEMS_PER_PAGE);
    if (facilityCurrentPage > totalPages) facilityCurrentPage = Math.max(1, totalPages);

    const startIndex = (facilityCurrentPage - 1) * FACILITY_ITEMS_PER_PAGE;
    const pageRecords = facilityFilteredRecords.slice(startIndex, startIndex + FACILITY_ITEMS_PER_PAGE);

    const entryCount = document.getElementById('facilityEntryCount');
    if (entryCount) entryCount.textContent = `${facilityFilteredRecords.length}件（全${records.length}件中）`;

    renderFacilityList(pageRecords);
    renderFacilityPagination(totalPages);
}

function renderFacilityList(records) {
    const tbody = document.getElementById('facilityList');
    if (!tbody) return;

    if (records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 60px 20px; color: #999; font-size: 15px;">記録がありません。</td></tr>`;
        return;
    }

    tbody.innerHTML = records.map(record => {
        const badgeClass = record.facilityType === '動物園' ? 'badge-zoo' :
                          record.facilityType === '水族館' ? 'badge-aquarium' : 'badge-etc';
        return `<tr>
            <td><strong>${escapeFacilityHtml(record.facilityName)}</strong></td>
            <td><span class="badge ${badgeClass}">${record.facilityType}</span></td>
            <td>${record.visitDate || '-'}</td>
            <td class="notes-cell" title="${escapeFacilityHtml(record.notes || '')}">${escapeFacilityHtml(record.notes || '-')}</td>
            <td class="action-buttons">
                <button class="btn-edit" onclick="editFacilityRecord('${record.id}')">編集</button>
                <button class="btn-delete" onclick="deleteFacilityRecord('${record.id}')">削除</button>
            </td>
        </tr>`;
    }).join('');
}

function renderFacilityPagination(totalPages) {
    const pagination = document.getElementById('facilityPagination');
    if (!pagination) return;

    if (totalPages <= 1) { pagination.innerHTML = ''; return; }

    let html = '';
    html += `<button onclick="goToFacilityPage(${facilityCurrentPage - 1})" ${facilityCurrentPage === 1 ? 'disabled' : ''}>← 前へ</button>`;

    const maxVisiblePages = 5;
    let startPage = Math.max(1, facilityCurrentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    if (endPage - startPage < maxVisiblePages - 1) startPage = Math.max(1, endPage - maxVisiblePages + 1);

    if (startPage > 1) {
        html += `<button onclick="goToFacilityPage(1)">1</button>`;
        if (startPage > 2) html += `<span class="page-info">...</span>`;
    }
    for (let i = startPage; i <= endPage; i++) {
        html += `<button onclick="goToFacilityPage(${i})" class="${i === facilityCurrentPage ? 'active' : ''}">${i}</button>`;
    }
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<span class="page-info">...</span>`;
        html += `<button onclick="goToFacilityPage(${totalPages})">${totalPages}</button>`;
    }
    html += `<button onclick="goToFacilityPage(${facilityCurrentPage + 1})" ${facilityCurrentPage === totalPages ? 'disabled' : ''}>次へ →</button>`;

    pagination.innerHTML = html;
}

function goToFacilityPage(page) {
    const totalPages = Math.ceil(facilityFilteredRecords.length / FACILITY_ITEMS_PER_PAGE);
    if (page < 1 || page > totalPages) return;
    facilityCurrentPage = page;
    loadFacilityRecords();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function escapeFacilityHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getFacilityRecords() {
    try {
        const data = localStorage.getItem(FACILITY_STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('施設訪問記録の取得に失敗しました:', e);
        return [];
    }
}

function saveFacilityRecords(records) {
    try {
        localStorage.setItem(FACILITY_STORAGE_KEY, JSON.stringify(records));
    } catch (e) {
        console.error('施設訪問記録の保存に失敗しました:', e);
    }
    if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
        saveFacilityToFirebase(records);
    }
}

// --- Firebase 同期（facility_visits コレクション） ---
let facilityRecordsRef = null;

function initFacilityFirebaseSync() {
    if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) return;
    facilityRecordsRef = firebase.database().ref('facility_visits');

    const checkAuthAndSync = setInterval(async () => {
        if (sessionStorage.getItem('zoo_auth_authenticated') === 'true') {
            clearInterval(checkAuthAndSync);
            await syncFacilityWithFirebase();
            loadFacilityRecords();
        }
    }, 100);

    setInterval(syncFacilityWithFirebase, 5 * 60 * 1000);
}

async function loadFacilityFromFirebase() {
    try {
        const snapshot = await facilityRecordsRef.once('value');
        const data = snapshot.val();
        return data ? Object.values(data) : [];
    } catch (e) {
        console.error('Firebase(facility_visits) 読み込みエラー:', e);
        return [];
    }
}

async function saveFacilityToFirebase(records) {
    try {
        if (!facilityRecordsRef) return;
        const recordsObj = {};
        records.forEach((record, index) => {
            recordsObj[record.id || `record_${index}`] = record;
        });
        await facilityRecordsRef.set(recordsObj);
    } catch (e) {
        console.error('Firebase(facility_visits) 保存エラー:', e);
    }
}

async function syncFacilityWithFirebase() {
    const localRecords = getFacilityRecords();
    const firebaseRecords = await loadFacilityFromFirebase();

    const localLatest = localRecords.reduce((latest, r) => Math.max(latest, new Date(r.updatedAt || r.createdAt || 0).getTime()), 0);
    const firebaseLatest = firebaseRecords.reduce((latest, r) => Math.max(latest, new Date(r.updatedAt || r.createdAt || 0).getTime()), 0);

    if (localLatest >= firebaseLatest) {
        await saveFacilityToFirebase(localRecords);
    } else {
        localStorage.setItem(FACILITY_STORAGE_KEY, JSON.stringify(firebaseRecords));
    }
}
