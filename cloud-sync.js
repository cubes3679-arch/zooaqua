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

// ローカルストレージと Firebase の同期
//
// saveRecords は編集のたびに（保存直後・ページ遷移前に）その時点の
// ローカルの内容をまるごとFirebaseへ即座にpushする。そのため、この
// syncWithFirebaseは「他の端末での変更を取り込む」ためのpull専用にし、
// Firebaseの内容をそのままローカルへ反映する。
//
// 以前はid単位でマージしてからFirebaseへ書き戻していたが、その方式には
// 「レコードの削除・統合を表現できない」という欠陥があった。例えば
// 別の端末で2つの記録を1つに統合（片方のidを削除）しても、まだ同期して
// いない端末はローカルに古い方のidをまだ持っているため、そのidをpull後に
// マージ→書き戻ししてしまうと、消えたはずの記録がFirebase上に復活して
// しまっていた。pull専用にすることでこの問題を避ける。
async function syncWithFirebase() {
    console.log('同期開始...');

    const firebaseRecords = await loadFromFirebase();
    console.log('Firebase レコード数:', firebaseRecords.length);

    localStorage.setItem('zoo_animal_records', JSON.stringify(firebaseRecords));

    console.log('同期完了。最終レコード数:', firebaseRecords.length);
    return firebaseRecords;
}

// ページ読み込み後に saveRecords をラップして Firebase 同期を有効化
document.addEventListener('DOMContentLoaded', async function() {
    // saveRecords をラップして Firebase にも保存するようにする
    const originalSaveRecords = window.saveRecords;
    if (typeof originalSaveRecords === 'function') {
        window.saveRecords = async function(records) {
            // ローカルに保存（元々の機能）
            originalSaveRecords(records);
            // Firebase にも保存
            await saveToFirebase(records);
        };
        console.log('saveRecords を Firebase 同期付きでラップしました');
    } else {
        console.warn('saveRecords 関数が見つかりませんでした。app.js の確認が必要です。');
    }

    // 認証完了を待つ（auth.js が sessionStorage にフラグを設定）
    const checkAuthAndSync = setInterval(async () => {
        if (sessionStorage.getItem('zoo_auth_authenticated') === 'true') {
            clearInterval(checkAuthAndSync);
            await syncWithFirebase();
            console.log('Cloud sync completed');

            // 一覧ページの場合、データを読み込み直す
            if (typeof loadRecords === 'function') {
                loadRecords();
            }
        }
    }, 100);
});

// 5分ごとに自動同期
setInterval(async () => {
    await syncWithFirebase();
}, 5 * 60 * 1000); // 5分
