// 生き物記録アプリ - 生き物の詳細（見学記録の管理）
// getRecords/saveRecords/escapeHtml/syncFacilityVisits は app.js のものを共用する

let currentRecordId = null;

document.addEventListener('DOMContentLoaded', function() {
    const params = new URLSearchParams(window.location.search);
    currentRecordId = params.get('id');

    if (!currentRecordId) {
        alert('生き物が指定されていません。');
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('animalInfoForm').addEventListener('submit', handleAnimalInfoSubmit);
    document.getElementById('visitForm').addEventListener('submit', handleVisitSubmit);

    const visitDateInput = document.getElementById('visitDate');
    if (visitDateInput && !visitDateInput.value) {
        visitDateInput.value = new Date().toISOString().split('T')[0];
    }

    loadDetailRecord();
});

function loadDetailRecord() {
    const records = getRecords();
    const record = records.find(r => r.id === currentRecordId);
    if (!record) {
        alert('記録が見つかりません。');
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('detailAnimalName').value = record.animalName;
    document.getElementById('detailOrder').value = record.order || '';
    document.getElementById('detailFamily').value = record.family || '';
    document.title = `生き物記録帳 - ${record.animalName}の詳細`;
    document.getElementById('detailTitle').textContent = `🔍 ${record.animalName}`;

    renderVisitList(record);
}

// 動物名・目・科の更新
function handleAnimalInfoSubmit(e) {
    e.preventDefault();

    const records = getRecords();
    const record = records.find(r => r.id === currentRecordId);
    if (!record) {
        alert('記録が見つかりませんでした。一覧に戻ります。');
        window.location.href = 'index.html';
        return;
    }

    const newName = document.getElementById('detailAnimalName').value.trim();
    const order = document.getElementById('detailOrder').value.trim();
    const family = document.getElementById('detailFamily').value.trim();

    if (!newName) { alert('生き物の名前を入力してください。'); return; }

    // 名前を変更した結果、既に別の記録と同じ名前になる場合は統合する
    const collision = records.find(r => r.id !== currentRecordId && r.animalName === newName);
    if (collision) {
        if (!confirm(`「${newName}」は既に登録されています。この記録の見学記録を統合しますか？`)) return;

        record.visits.forEach(visit => {
            const dup = collision.visits.find(v => v.facilityName === visit.facilityName && v.visitDate === visit.visitDate);
            if (dup) {
                if (visit.notes && !dup.notes) dup.notes = visit.notes;
            } else {
                collision.visits.push(visit);
            }
        });
        if (order) collision.order = order;
        if (family) collision.family = family;
        collision.updatedAt = new Date().toISOString();

        const filtered = records.filter(r => r.id !== currentRecordId);
        saveRecords(filtered);
        window.location.href = `detail.html?id=${encodeURIComponent(collision.id)}`;
        return;
    }

    record.animalName = newName;
    record.order = order;
    record.family = family;
    record.updatedAt = new Date().toISOString();
    saveRecords(records);
    loadDetailRecord();
}

// 見学記録の追加・更新
function handleVisitSubmit(e) {
    e.preventDefault();

    const records = getRecords();
    const record = records.find(r => r.id === currentRecordId);
    if (!record) {
        alert('記録が見つかりませんでした。ページを再読み込みします。');
        loadDetailRecord();
        return;
    }

    const visitId = document.getElementById('visitEntryId').value;
    const facilityType = document.querySelector('input[name="visitFacilityType"]:checked').value;
    const facilityName = document.getElementById('visitFacilityName').value.trim();
    const visitDate = document.getElementById('visitDate').value;
    const notes = document.getElementById('visitNotes').value.trim();

    if (!facilityName) { alert('施設名を入力してください。'); return; }
    if (!visitDate) { alert('見学日を選択してください。'); return; }

    if (visitId) {
        // 編集モード：この見学記録だけを更新する
        const visit = record.visits.find(v => v.id === visitId);
        if (!visit) {
            alert('更新対象の見学記録が見つかりませんでした。ページを再読み込みします。');
            resetVisitForm();
            renderVisitList(record);
            return;
        }
        const dup = record.visits.find(v => v.id !== visitId && v.facilityName === facilityName && v.visitDate === visitDate);
        if (dup) {
            alert('その施設・日付の見学記録は既にあります。');
            return;
        }
        visit.facilityType = facilityType;
        visit.facilityName = facilityName;
        visit.visitDate = visitDate;
        visit.notes = notes;
    } else {
        // 新規追加：同じ施設・同じ日付があれば備考だけ更新する
        const dup = record.visits.find(v => v.facilityName === facilityName && v.visitDate === visitDate);
        if (dup) {
            if (notes) dup.notes = notes;
        } else {
            record.visits.push({
                id: Date.now().toString() + '_' + Math.random().toString(36).slice(2, 6),
                facilityType,
                facilityName,
                visitDate,
                notes
            });
        }
    }

    record.updatedAt = new Date().toISOString();
    saveRecords(records);

    // 施設訪問記録にも自動反映
    syncFacilityVisits(facilityType, [facilityName], visitDate);

    resetVisitForm();
    renderVisitList(record);
}

// 見学記録の編集ボタン
function editVisit(visitId) {
    const records = getRecords();
    const record = records.find(r => r.id === currentRecordId);
    if (!record) {
        alert('記録が見つかりませんでした。ページを再読み込みします。');
        loadDetailRecord();
        return;
    }
    const visit = record.visits.find(v => v.id === visitId);
    if (!visit) {
        alert('この見学記録が見つかりませんでした。ページを再読み込みします。');
        renderVisitList(record);
        return;
    }

    document.getElementById('visitEntryId').value = visit.id;
    document.getElementById('visitFacilityName').value = visit.facilityName;
    document.getElementById('visitDate').value = visit.visitDate;
    document.getElementById('visitNotes').value = visit.notes || '';

    const radios = document.querySelectorAll('input[name="visitFacilityType"]');
    radios.forEach(radio => { radio.checked = radio.value === visit.facilityType; });

    document.getElementById('visitSubmitBtn').textContent = '更新する';
    document.getElementById('visitCancelBtn').style.display = 'inline-block';

    // ページ最上部ではなく、見学記録の入力フォームまでスクロールする
    document.getElementById('visitForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 見学記録の削除ボタン
function deleteVisit(visitId) {
    const records = getRecords();
    const record = records.find(r => r.id === currentRecordId);
    if (!record) {
        alert('記録が見つかりませんでした。ページを再読み込みします。');
        loadDetailRecord();
        return;
    }
    const visit = record.visits.find(v => v.id === visitId);
    if (!visit) {
        alert('この見学記録が見つかりませんでした。ページを再読み込みします。');
        renderVisitList(record);
        return;
    }

    if (!confirm(`「${visit.facilityName}」${visit.visitDate}の見学記録を削除しますか？`)) return;

    record.visits = record.visits.filter(v => v.id !== visitId);
    record.updatedAt = new Date().toISOString();
    saveRecords(records);
    renderVisitList(record);
}

function cancelVisitEdit() {
    resetVisitForm();
}

function resetVisitForm() {
    document.getElementById('visitEntryId').value = '';
    document.getElementById('visitFacilityName').value = '';
    document.getElementById('visitNotes').value = '';
    document.getElementById('visitSubmitBtn').textContent = '追加する';
    document.getElementById('visitCancelBtn').style.display = 'none';
}

// 見学記録一覧の描画（見学日が新しい順）
function renderVisitList(record) {
    const tbody = document.getElementById('visitList');
    if (!tbody) return;

    const sorted = [...record.visits].sort((a, b) => (b.visitDate || '').localeCompare(a.visitDate || ''));

    if (sorted.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 40px 20px; color: #999; font-size: 14px;">見学記録がありません。</td></tr>`;
        return;
    }

    tbody.innerHTML = sorted.map(visit => {
        const badgeClass = visit.facilityType === '動物園' ? 'badge-zoo' :
                          visit.facilityType === '水族館' ? 'badge-aquarium' : 'badge-etc';
        return `<tr>
            <td data-label="種類"><span class="badge ${badgeClass}">${visit.facilityType}</span></td>
            <td data-label="施設名">${escapeHtml(visit.facilityName)}</td>
            <td data-label="見学日">${visit.visitDate || '-'}</td>
            <td class="notes-cell" data-label="備考" title="${escapeHtml(visit.notes || '')}">${escapeHtml(visit.notes || '-')}</td>
            <td class="action-buttons">
                <button class="btn-edit" onclick="editVisit('${visit.id}')">編集</button>
                <button class="btn-delete" onclick="deleteVisit('${visit.id}')">削除</button>
            </td>
        </tr>`;
    }).join('');
}
