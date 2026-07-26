// 生き物記録アプリ - パスワード認証

// パスワード設定
const PASSWORD = '1479kryo';
const AUTH_KEY = 'zoo_auth_authenticated';

// 認証チェック
function checkAuth() {
    const isAuth = sessionStorage.getItem(AUTH_KEY) === 'true';
    if (!isAuth) {
        showLoginModal();
    }
}

// ログインモーダルを表示
function showLoginModal() {
    const modal = document.createElement('div');
    modal.id = 'loginModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;
    
    modal.innerHTML = `
        <div style="
            background: white;
            padding: 40px;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            max-width: 400px;
            width: 90%;
            text-align: center;
        ">
            <h2 style="margin: 0 0 24px 0; color: #333; font-size: 1.5em;">🔒 パスワード認証</h2>
            <p style="margin: 0 0 20px 0; color: #666; font-size: 14px;">このページはパスワードで保護されています。</p>
            <input 
                type="password" 
                id="passwordInput" 
                placeholder="パスワードを入力"
                style="
                    width: 100%;
                    padding: 14px 16px;
                    border: 2px solid #e0e0e0;
                    border-radius: 10px;
                    font-size: 16px;
                    margin-bottom: 16px;
                    box-sizing: border-box;
                "
                onkeydown="if(event.key === 'Enter') verifyPassword()"
            >
            <p id="errorMsg" style="color: #e74c3c; font-size: 14px; margin: 0 0 16px 0; display: none;">
                パスワードが正しくありません。
            </p>
            <button 
                onclick="verifyPassword()"
                style="
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    padding: 14px 28px;
                    border-radius: 25px;
                    cursor: pointer;
                    font-size: 15px;
                    font-weight: 600;
                    width: 100%;
                    transition: all 0.3s ease;
                "
                onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(102, 126, 234, 0.4)'"
                onmouseout="this.style.transform='';this.style.boxShadow=''"
            >
                ログイン
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.getElementById('passwordInput').focus();
    
    // 背景のスクロールを無効化
    document.body.style.overflow = 'hidden';
}

// パスワード認証
function verifyPassword() {
    const input = document.getElementById('passwordInput').value;
    const errorMsg = document.getElementById('errorMsg');
    
    if (input === PASSWORD) {
        // 認証成功
        sessionStorage.setItem(AUTH_KEY, 'true');
        const modal = document.getElementById('loginModal');
        if (modal) {
            modal.remove();
            document.body.style.overflow = '';
        }
    } else {
        // 認証失敗
        errorMsg.style.display = 'block';
        document.getElementById('passwordInput').value = '';
        document.getElementById('passwordInput').focus();
    }
}

// ページ読み込み時に認証チェック
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
});