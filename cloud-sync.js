// 生き物記録アプリ - Firebase クラウド同期

// Firebase 設定
const firebaseConfig = {
  apiKey: "AIzaSyAR_MeO4wxSFREPam6jsmCWf5bQ5DuOmrw",
  authDomain: "zooaqua-1ba85.firebaseapp.com",
  databaseURL: "https://zooaqua-1ba85-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "zooaqua-1ba85",
  storageBucket: "zooaqua-1ba85.firebasestorage.app",
  messagingSenderId: "528015026728",
  appId: "1:528015026728:web:813fffbe9de51a69c3231d"
};

// Firebase の初期化
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const RECORDS_REF = database.ref('records');

// データの読み込み
async function loadFromFirebase() {
    try {
        console.log('Firebase から読み込み開始...');
        const snapshot = await RECORDS_REF.once('value');
        const data = snapshot.val();
        const records = data ? Object.values(data) : [];
        console.log('Firebase から読み込んだレコード数:', records.length);
        return records;
    } catch (error) {
        console.error('Firebase からの読み込みエラー:', error);
        return [];
    }
}

// データの保存
async function saveToFirebase(records) {
    try {
        console.log('Firebase に保存開始... レコード数:', records.length);
        // レコードをオブジェクト形式に変換（Firebase 用）
        const recordsObj = {};
        records.forEach((record, index) => {
            const key = record.firebaseKey || `record_${index}`;
            recordsObj[key] = record;
        });
        // undefinedが混ざっているとFirebaseへの書き込みが失敗するため、
        // JSONを介して除去してから書き込む
        const sanitized = JSON.parse(JSON.stringify(recordsObj));
        await RECORDS_REF.set(sanitized);
        console.log('Firebase に保存しました');
        return true;
    } catch (error) {
        console.error('Firebase への保存エラー:', error);
        return false;
    }
}

// --- 手動同期（この端末を「正」としてクラウドに反映する／クラウドの内容で
// この端末を上書きする）。自動同期は行わず、ボタンを押したときだけ
// クラウドとやり取りする ---

function getFacilityVisitsForSync() {
    try {
        const data = localStorage.getItem('zoo_facility_visits');
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

async function saveFacilityVisitsToFirebaseDirect(records) {
    try {
        const recordsObj = {};
        records.forEach((record, index) => {
            recordsObj[record.id || `record_${index}`] = record;
        });
        // undefinedが混ざっているとFirebaseへの書き込みが失敗するため、
        // JSONを介して除去してから書き込む
        const sanitized = JSON.parse(JSON.stringify(recordsObj));
        await firebase.database().ref('facility_visits').set(sanitized);
        return true;
    } catch (error) {
        console.error('Firebase(facility_visits) への保存エラー:', error);
        return false;
    }
}

async function loadFacilityVisitsFromFirebaseDirect() {
    try {
        const snapshot = await firebase.database().ref('facility_visits').once('value');
        const data = snapshot.val();
        return data ? Object.values(data) : [];
    } catch (error) {
        console.error('Firebase(facility_visits) からの読み込みエラー:', error);
        return [];
    }
}

// この端末のデータを「正」として、クラウドを丸ごと上書きする
async function forcePushLocalToCloud() {
    const animalRecords = (typeof getRecords === 'function') ? getRecords() : [];
    const facilityRecords = getFacilityVisitsForSync();

    const animalOk = await saveToFirebase(animalRecords);
    const facilityOk = await saveFacilityVisitsToFirebaseDirect(facilityRecords);

    if (!animalOk || !facilityOk) {
        const failed = [!animalOk ? '生き物の記録' : null, !facilityOk ? '施設訪問記録' : null].filter(Boolean).join('・');
        throw new Error(`${failed}の保存に失敗しました。詳細はコンソールを確認してください。`);
    }

    return { animalCount: animalRecords.length, facilityCount: facilityRecords.length };
}

// クラウドのデータで、この端末を丸ごと上書きする
async function forcePullCloudToLocal() {
    const animalRecords = await loadFromFirebase();
    localStorage.setItem('zoo_animal_records', JSON.stringify(animalRecords));

    const facilityRecords = await loadFacilityVisitsFromFirebaseDirect();
    localStorage.setItem('zoo_facility_visits', JSON.stringify(facilityRecords));

    return { animalCount: animalRecords.length, facilityCount: facilityRecords.length };
}

async function handleForcePush() {
    if (!confirm('この端末のデータを「正しいデータ」として、クラウドを上書きします。\n他の端末にしかない変更があれば失われます。よろしいですか？')) return;
    try {
        const result = await forcePushLocalToCloud();
        alert(`クラウドに保存しました。（生き物の記録：${result.animalCount}件、施設訪問記録：${result.facilityCount}件）\n他の端末では「クラウドから読み込み直す」を実行してください。`);
    } catch (e) {
        console.error('強制アップロードに失敗しました:', e);
        alert(`クラウドへの保存に失敗しました。\n${e.message || e}\n\n通信環境を確認してもう一度お試しください。`);
    }
}

async function handleForcePull() {
    if (!confirm('クラウドのデータで、この端末のデータを上書きします。\nこの端末にしかないまだ保存していない変更があれば失われます。よろしいですか？')) return;
    try {
        const result = await forcePullCloudToLocal();
        alert(`クラウドのデータを読み込みました。（生き物の記録：${result.animalCount}件、施設訪問記録：${result.facilityCount}件）`);
        location.reload();
    } catch (e) {
        console.error('強制ダウンロードに失敗しました:', e);
        alert(`クラウドからの読み込みに失敗しました。\n${e.message || e}\n\n通信環境を確認してもう一度お試しください。`);
    }
}