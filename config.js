// ─────────────────────────────────────────────────────
//  config.js  —  Google OAuth 설정
// ─────────────────────────────────────────────────────
//
//  이미 Google Cloud Console에서 발급받은 Client ID를 아래에 입력하세요.
//  (이전에 로그인 기능 설정 시 발급받은 것 그대로 사용 가능)
//
//  주의: 승인된 JavaScript 출처에 아래 주소가 등록되어 있어야 합니다:
//    https://kangjoohyun.github.io

window.APP_CONFIG = {
  CLIENT_ID: 'YOUR_CLIENT_ID_HERE.apps.googleusercontent.com'
};

// 앱 시작 시 config 자동 주입
(function() {
  const stored = JSON.parse(localStorage.getItem('gConfig') || '{}');
  if (!stored.clientId && window.APP_CONFIG.CLIENT_ID !== 'YOUR_CLIENT_ID_HERE.apps.googleusercontent.com') {
    stored.clientId = window.APP_CONFIG.CLIENT_ID;
    localStorage.setItem('gConfig', JSON.stringify(stored));
  }
})();
