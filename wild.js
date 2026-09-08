// 生き物記録アプリ - 野生記録（おまけ機能）

const WILD_STORAGE_KEY = 'zoo_wild_records';
const WILD_ITEMS_PER_PAGE = 10;
let wildCurrentPage = 1;
let wildFilteredRecords = [];

document.addEventListener('DOMContentLoaded', function() {
    initWildForm();
    loadWildRecords();
    updateWildDatalists();
    initWildFirebaseSync();
});

function initWildForm() {
    const form = document.getElementById('wildForm');
    form.addEventListener('submit', handleWildSubmit);

    const seenDateInput = document.getElementById('wildSeenDate');
    if (seenDateInput && !seenDateInput.value) {
        seenDateInput.value = new Date().toISOString().split('T')[0];
    }
}

function handleWildSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('wildEntryId').value;
    const locationsText = document.getElementById('wildLocations').value.trim();
    const seenDate = document.getElementById('wildSeenDate').value;
    const animalNamesText = document.getElementById('wildAnimalNames').value.trim();
    const order = document.getElementById('wildOrder').value.trim();
    const family = document.getElementById('wildFamily').value.trim();
    const notes = document.getElementById('wildNotes').value.trim();

    if (!animalNamesText) { alert('生き物の名前を入力してください。'); return; }

    const locations = locationsText
        ? locationsText.split('\n').map(name => name.trim()).filter(name => name.length > 0)
        : [''];
    const animalNames = animalNamesText.split('\n').map(name => name.trim()).filter(name => name.length > 0);

    const records = getWildRecords();

    if (id) {
        const index = records.findIndex(r => r.id == id);
        if (index !== -1) records.splice(index, 1);
    }

    const newRecords = [];
    locations.forEach((location, lIndex) => {
        animalNames.forEach((name, aIndex) => {
            newRecords.push({
                id: id ? `${id}_${lIndex}_${aIndex}` : Date.now().toString() + '_' + lIndex + '_' + aIndex,
                animalName: name,
                order,
                family,
                location,
                seenDate,
                notes,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        });
    });

    newRecords.forEach(record => records.unshift(record));
    saveWildRecords(records);
    resetWildForm();
    loadWildRecords();
    updateWildDatalists();
}

function editWildRecord(id) {
    const records = getWildRecords();
    const record = records.find(r => r.id === id);
    if (!record) { alert('記録が見つかりません。'); return; }

    document.getElementById('wildEntryId').value = record.id;
    document.getElementById('wildLocations').value = record.location;
    document.getElementById('wildSeenDate').value = record.seenDate;
    document.getElementById('wildAnimalNames').value = record.animalName;
    document.getElementById('wildOrder').value = record.order || '';
    document.getElementById('wildFamily').value = record.family || '';
    document.getElementById('wildNotes').value = record.notes || '';

    document.getElementById('wildSubmitBtn').textContent = '更新する';
    document.getElementById('wildCancelBtn').style.display = 'inline-block';

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteWildRecord(id) {
    if (!confirm('この記録を削除してもよろしいですか？')) return;
    const records = getWildRecords();
    const filtered = records.filter(r => r.id !== id);
    saveWildRecords(filtered);
    loadWildRecords();
}

function cancelWildEdit() {
    resetWildForm();
}

function resetWildForm() {
    document.getElementById('wildEntryId').value = '';
    document.getElementById('wildLocations').value = '';
    document.getElementById('wildAnimalNames').value = '';
    document.getElementById('wildOrder').value = '';
    document.getElementById('wildFamily').value = '';
    document.getElementById('wildNotes').value = '';
    document.getElementById('wildSubmitBtn').textContent = '登録する';
    document.getElementById('wildCancelBtn').style.display = 'none';
}

function applyWildFilter() {
    wildCurrentPage = 1;
    loadWildRecords();
}

function resetWildFilter() {
    document.getElementById('wildSearchName').value = '';
    document.getElementById('wildFilterLocation').value = '';
    wildCurrentPage = 1;
    loadWildRecords();
}

function updateWildDatalists() {
    const records = getWildRecords();
    const orders = [...new Set(records.map(r => r.order).filter(Boolean))].sort();
    const families = [...new Set(records.map(r => r.family).filter(Boolean))].sort();
    const locations = [...new Set(records.map(r => r.location).filter(Boolean))].sort();

    const orderList = document.getElementById('wildOrderList');
    const familyList = document.getElementById('wildFamilyList');
    if (orderList) orderList.innerHTML = orders.map(opt => `<option value="${escapeWildHtml(opt)}">`).join('');
    if (familyList) familyList.innerHTML = families.map(opt => `<option value="${escapeWildHtml(opt)}">`).join('');

    const filterLocation = document.getElementById('wildFilterLocation');
    if (filterLocation) {
        const currentValue = filterLocation.value;
        filterLocation.innerHTML = '<option value="">すべて</option>' + locations.map(opt =>
            `<option value="${escapeWildHtml(opt)}">${escapeWildHtml(opt)}</option>`
        ).join('');
        if (locations.includes(currentValue)) filterLocation.value = currentValue;
    }
}

function loadWildRecords() {
    let records = getWildRecords();

    const searchName = document.getElementById('wildSearchName')?.value.trim().toLowerCase() || '';
    const filterLocation = document.getElementById('wildFilterLocation')?.value.trim().toLowerCase() || '';

    wildFilteredRecords = records.filter(record => {
        if (searchName && !record.animalName.toLowerCase().includes(searchName)) return false;
        if (filterLocation && !(record.location || '').toLowerCase().includes(filterLocation)) return false;
        return true;
    });

    const totalPages = Math.ceil(wildFilteredRecords.length / WILD_ITEMS_PER_PAGE);
    if (wildCurrentPage > totalPages) wildCurrentPage = Math.max(1, totalPages);

    const startIndex = (wildCurrentPage - 1) * WILD_ITEMS_PER_PAGE;
    const pageRecords = wildFilteredRecords.slice(startIndex, startIndex + WILD_ITEMS_PER_PAGE);

    const entryCount = document.getElementById('wildEntryCount');
    if (entryCount) entryCount.textContent = `${wildFilteredRecords.length}件（全${records.length}件中）`;

    renderWildList(pageRecords);
    renderWildPagination(totalPages);
}

function renderWildList(records) {
    const tbody = document.getElementById('wildList');
    if (!tbody) return;

    if (records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 60px 20px; color: #999; font-size: 15px;">記録がありません。</td></tr>`;
        return;
    }

    tbody.innerHTML = records.map(record => {
        return `<tr>
            <td><strong>${escapeWildHtml(record.animalName)}</strong></td>
            <td>${escapeWildHtml(record.order || '-')}</td>
            <td>${escapeWildHtml(record.family || '-')}</td>
            <td><span class="facility-item">${escapeWildHtml(record.location || '-')}</span></td>
            <td>${record.seenDate || '-'}</td>
            <td class="notes-cell" title="${escapeWildHtml(record.notes || '')}">${escapeWildHtml(record.notes || '-')}</td>
            <td class="action-buttons">
                <button class="btn-edit" onclick="editWildRecord('${record.id}')">編集</button>
                <button class="btn-delete" onclick="deleteWildRecord('${record.id}')">削除</button>
            </td>
        </tr>`;
    }).join('');
}

function renderWildPagination(totalPages) {
    const pagination = document.getElementById('wildPagination');
    if (!pagination) return;

    if (totalPages <= 1) { pagination.innerHTML = ''; return; }

    let html = '';
    html += `<button onclick="goToWildPage(${wildCurrentPage - 1})" ${wildCurrentPage === 1 ? 'disabled' : ''}>← 前へ</button>`;

    const maxVisiblePages = 5;
    let startPage = Math.max(1, wildCurrentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    if (endPage - startPage < maxVisiblePages - 1) startPage = Math.max(1, endPage - maxVisiblePages + 1);

    if (startPage > 1) {
        html += `<button onclick="goToWildPage(1)">1</button>`;
        if (startPage > 2) html += `<span class="page-info">...</span>`;
    }
    for (let i = startPage; i <= endPage; i++) {
        html += `<button onclick="goToWildPage(${i})" class="${i === wildCurrentPage ? 'active' : ''}">${i}</button>`;
    }
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<span class="page-info">...</span>`;
        html += `<button onclick="goToWildPage(${totalPages})">${totalPages}</button>`;
    }
    html += `<button onclick="goToWildPage(${wildCurrentPage + 1})" ${wildCurrentPage === totalPages ? 'disabled' : ''}>次へ →</button>`;

    pagination.innerHTML = html;
}

function goToWildPage(page) {
    const totalPages = Math.ceil(wildFilteredRecords.length / WILD_ITEMS_PER_PAGE);
    if (page < 1 || page > totalPages) return;
    wildCurrentPage = page;
    loadWildRecords();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function escapeWildHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getWildRecords() {
    try {
        const data = localStorage.getItem(WILD_STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('記録の取得に失敗しました:', e);
        return [];
    }
}

function saveWildRecords(records) {
    try {
        localStorage.setItem(WILD_STORAGE_KEY, JSON.stringify(records));
    } catch (e) {
        console.error('記録の保存に失敗しました:', e);
    }
    if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
        saveWildToFirebase(records);
    }
}

// --- Firebase 同期（wild_records コレクション） ---
let wildRecordsRef = null;

function initWildFirebaseSync() {
    if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) return;
    wildRecordsRef = firebase.database().ref('wild_records');

    const checkAuthAndSync = setInterval(async () => {
        if (sessionStorage.getItem('zoo_auth_authenticated') === 'true') {
            clearInterval(checkAuthAndSync);
            await syncWildWithFirebase();
            loadWildRecords();
            updateWildDatalists();
        }
    }, 100);

    setInterval(syncWildWithFirebase, 5 * 60 * 1000);
}

async function loadWildFromFirebase() {
    try {
        const snapshot = await wildRecordsRef.once('value');
        const data = snapshot.val();
        return data ? Object.values(data) : [];
    } catch (e) {
        console.error('Firebase(wild_records) 読み込みエラー:', e);
        return [];
    }
}

async function saveWildToFirebase(records) {
    try {
        if (!wildRecordsRef) return;
        const recordsObj = {};
        records.forEach((record, index) => {
            recordsObj[record.id || `record_${index}`] = record;
        });
        await wildRecordsRef.set(recordsObj);
    } catch (e) {
        console.error('Firebase(wild_records) 保存エラー:', e);
    }
}

async function syncWildWithFirebase() {
    const localRecords = getWildRecords();
    const firebaseRecords = await loadWildFromFirebase();

    const localLatest = localRecords.reduce((latest, r) => Math.max(latest, new Date(r.updatedAt || r.createdAt || 0).getTime()), 0);
    const firebaseLatest = firebaseRecords.reduce((latest, r) => Math.max(latest, new Date(r.updatedAt || r.createdAt || 0).getTime()), 0);

    if (localLatest >= firebaseLatest) {
        await saveWildToFirebase(localRecords);
    } else {
        localStorage.setItem(WILD_STORAGE_KEY, JSON.stringify(firebaseRecords));
    }
}
