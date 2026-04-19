// ─────────────────────────────────────────────────────
//  config.js  —  여기에 본인 Google OAuth 정보를 입력하세요
// ─────────────────────────────────────────────────────
//
//  설정 방법:
//  1. https://console.cloud.google.com 접속
//  2. 새 프로젝트 생성 (예: "my-assets")
//  3. API 및 서비스 → Google Sheets API 활성화
//  4. 사용자 인증 정보 → OAuth 2.0 클라이언트 ID 생성
//     - 유형: 웹 애플리케이션
//     - 승인된 JavaScript 출처: https://YOUR_GITHUB_ID.github.io
//  5. 발급된 클라이언트 ID를 아래에 붙여넣기

window.APP_CONFIG = {
  CLIENT_ID: '839551670199-9vtl04tl74a153dm1kh5qsb0efapkccd.apps.googleusercontent.com',
  API_KEY: '',   // 선택사항 — 없어도 동작합니다
  SCOPES: 'https://www.googleapis.com/auth/spreadsheets openid email profile'
};
