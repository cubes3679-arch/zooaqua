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
        // 編集モード：施設名・種類・備考を更新し、訪問日は既存の記録に追加する（過去の訪問日は消さない）
        const index = records.findIndex(r => r.id == id);
        const target = index !== -1 ? records[index] : null;
        if (target) {
            const newName = facilityNames[0];
            const collision = records.find(r => r.id !== id && r.facilityName === newName);
            if (collision) {
                // 変更後の施設名が別の記録と同じ場合は、両方の訪問日を統合する
                records.splice(index, 1);
                target.visitDates.forEach(d => {
                    if (!collision.visitDates.includes(d)) collision.visitDates.push(d);
                });
                if (!collision.visitDates.includes(visitDate)) collision.visitDates.push(visitDate);
                collision.facilityType = facilityType;
                if (notes) collision.notes = notes;
                collision.updatedAt = new Date().toISOString();
            } else {
                target.facilityName = newName;
                target.facilityType = facilityType;
                if (!target.visitDates.includes(visitDate)) target.visitDates.push(visitDate);
                target.notes = notes;
                target.updatedAt = new Date().toISOString();
            }
        }
    } else {
        // 新規登録：同じ施設名の記録が既にあれば訪問日だけ追加し、なければ新規作成する
        facilityNames.forEach((facilityName, fIndex) => {
            const existing = records.find(r => r.facilityName === facilityName);
            if (existing) {
                if (!existing.visitDates.includes(visitDate)) existing.visitDates.push(visitDate);
                existing.facilityType = facilityType;
                if (notes) existing.notes = notes;
                existing.updatedAt = new Date().toISOString();
            } else {
                records.unshift({
                    id: Date.now().toString() + '_' + fIndex + '_' + Math.random().toString(36).slice(2, 6),
                    facilityName,
                    facilityType,
                    visitDates: [visitDate],
                    notes,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });
            }
        });
    }

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
    const latestDate = record.visitDates.length > 0 ? record.visitDates.reduce((max, d) => d > max ? d : max) : '';
    document.getElementById('facilityVisitDate').value = latestDate;
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

// 特定の1つの訪問日だけを削除する
function deleteFacilityVisitDate(id, date) {
    const records = getFacilityRecords();
    const record = records.find(r => r.id === id);
    if (!record) return;

    if (!confirm(`「${record.facilityName}」の${date}の訪問日を削除しますか？`)) return;

    record.visitDates = record.visitDates.filter(d => d !== date);
    record.updatedAt = new Date().toISOString();
    saveFacilityRecords(records);
    loadFacilityRecords();
}

// 特定の1つの訪問日だけを修正する
function editFacilityVisitDate(id, oldDate) {
    const records = getFacilityRecords();
    const record = records.find(r => r.id === id);
    if (!record) return;

    const newDate = prompt('訪問日を修正してください（YYYY-MM-DD形式）', oldDate);
    if (!newDate || newDate === oldDate) return;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
        alert('日付はYYYY-MM-DD形式で入力してください。');
        return;
    }
    if (record.visitDates.includes(newDate)) {
        alert('その訪問日は既に登録されています。');
        return;
    }

    const index = record.visitDates.indexOf(oldDate);
    if (index !== -1) record.visitDates[index] = newDate;
    record.updatedAt = new Date().toISOString();
    saveFacilityRecords(records);
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

    // 最新の訪問日が新しい順に並べ替え
    const latestOf = r => r.visitDates.length > 0 ? r.visitDates.reduce((max, d) => d > max ? d : max) : '';
    facilityFilteredRecords.sort((a, b) => latestOf(b).localeCompare(latestOf(a)));

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
        const sortedDates = [...record.visitDates].sort().reverse();
        const dateBadges = sortedDates.map(d => `
            <span class="facility-item">
                ${d}
                <button class="date-edit-btn" onclick="editFacilityVisitDate('${record.id}', '${d}')" title="この日付を修正">✎</button>
                <button class="date-delete-btn" onclick="deleteFacilityVisitDate('${record.id}', '${d}')" title="この日付を削除">✕</button>
            </span>
        `).join('');
        return `<tr>
            <td><strong>${escapeFacilityHtml(record.facilityName)}</strong></td>
            <td><span class="badge ${badgeClass}">${record.facilityType}</span></td>
            <td><div class="facility-list">${dateBadges || '-'}</div></td>
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
        const records = (data ? JSON.parse(data) : []).map(normalizeFacilityRecord);
        const { merged, changed } = consolidateDuplicateFacilities(records);
        if (changed) {
            saveFacilityRecords(merged);
            return merged;
        }
        return records;
    } catch (e) {
        console.error('施設訪問記録の取得に失敗しました:', e);
        return [];
    }
}

// 旧データ形式（visitDate単一文字列）をvisitDates配列に変換
function normalizeFacilityRecord(record) {
    if (!Array.isArray(record.visitDates)) {
        record.visitDates = record.visitDate ? [record.visitDate] : [];
        delete record.visitDate;
    }
    return record;
}

// 過去に別々に登録された同じ施設名の記録を1件に統合する（既存データ向けの一括統合）
function consolidateDuplicateFacilities(records) {
    const merged = [];
    const indexByName = new Map();
    let changed = false;

    records.forEach(record => {
        const existingIndex = indexByName.get(record.facilityName);
        if (existingIndex === undefined) {
            indexByName.set(record.facilityName, merged.length);
            merged.push(record);
            return;
        }

        changed = true;
        const target = merged[existingIndex];

        record.visitDates.forEach(d => {
            if (!target.visitDates.includes(d)) target.visitDates.push(d);
        });
        if (!target.facilityType && record.facilityType) target.facilityType = record.facilityType;
        if (record.notes && record.notes !== target.notes) {
            target.notes = target.notes ? `${target.notes}\n${record.notes}` : record.notes;
        }
        target.updatedAt = new Date().toISOString();
    });

    return { merged, changed };
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
        // undefinedが混ざっているとFirebaseへの書き込みが失敗するため、
        // JSONを介して除去してから書き込む
        const sanitized = JSON.parse(JSON.stringify(recordsObj));
        await facilityRecordsRef.set(sanitized);
    } catch (e) {
        console.error('Firebase(facility_visits) 保存エラー:', e);
    }
}

// saveFacilityRecordsが編集のたびにFirebaseへ即座にpushするため、
// ここはpull専用にする（id単位マージだと、統合・削除された記録が
// 未同期の端末から復活してしまう問題があったため）
async function syncFacilityWithFirebase() {
    const firebaseRecords = await loadFacilityFromFirebase();
    localStorage.setItem(FACILITY_STORAGE_KEY, JSON.stringify(firebaseRecords));
}
