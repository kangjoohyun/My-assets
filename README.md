# 📱 자산관리 웹앱 — 설치 가이드

## 완성되면 이런 모습입니다
- 아이폰 홈 화면에 아이콘
- 탭하면 앱처럼 열림 (Safari 주소창 없음)
- 구글 로그인 → 구글 시트 데이터 자동 연동
- 현황 / 종목 / 기록 / 설정 4개 탭

---

## STEP 1 — GitHub에 파일 올리기 (5분)

1. [github.com](https://github.com) 로그인
2. 우측 상단 **+** → **New repository**
3. Repository name: `my-assets`
4. **Public** 선택 → **Create repository**
5. **uploading an existing file** 클릭
6. 이 폴더의 파일 전체 드래그 업로드:
   - `index.html`
   - `config.js`
   - `manifest.json`
   - `icon.png` (별도 준비 — 없으면 건너뜀)
7. **Commit changes** 클릭

### GitHub Pages 활성화
1. 저장소 → **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: **main** / **(root)** → **Save**
4. 잠시 후 주소 생성: `https://YOUR_ID.github.io/my-assets`

---

## STEP 2 — Google Cloud 설정 (10분)

### 2-1. 프로젝트 생성
1. [console.cloud.google.com](https://console.cloud.google.com) 접속
2. 상단 프로젝트 선택 → **새 프로젝트**
3. 이름: `my-assets` → **만들기**

### 2-2. Google Sheets API 활성화
1. 왼쪽 메뉴 → **API 및 서비스** → **라이브러리**
2. `Google Sheets API` 검색 → **사용 설정**

### 2-3. OAuth 클라이언트 ID 발급
1. **API 및 서비스** → **사용자 인증 정보**
2. **+ 사용자 인증 정보 만들기** → **OAuth 클라이언트 ID**
3. 처음이면 **동의 화면 구성** 먼저 설정:
   - 사용자 유형: **외부** → 만들기
   - 앱 이름: `자산관리`
   - 지원 이메일: 본인 이메일
   - 저장 후 계속 → 계속 → 저장
4. 다시 **OAuth 클라이언트 ID** 생성:
   - 유형: **웹 애플리케이션**
   - 이름: `my-assets`
   - **승인된 JavaScript 출처**에 추가:
     ```
     https://YOUR_GITHUB_ID.github.io
     ```
   - **만들기**
5. 클라이언트 ID 복사 (`.apps.googleusercontent.com` 끝나는 문자열)

### 2-4. config.js 수정
`config.js` 파일에서 `YOUR_CLIENT_ID_HERE` 부분을 복사한 ID로 교체:
```js
CLIENT_ID: '123456789-abcdefg.apps.googleusercontent.com',
```
수정 후 GitHub에 다시 업로드 (또는 GitHub 웹에서 직접 편집)

---

## STEP 3 — 구글 시트 준비 (5분)

1. [구글 드라이브](https://drive.google.com)에서 새 스프레드시트 생성
2. 시트 이름 설정:
   - 기본 시트1 → 이름 변경: `종목현황`
   - 새 시트 추가: `거래일지`

### 종목현황 시트 헤더 (A1부터 입력)
```
명의 | 증권사 | 계좌종류 | 종목명 | 티커 | 수량 | 평균단가 | 현재가 | 평가금액 | 수익률 | 메모
```

### 거래일지 시트 헤더 (A1부터 입력)
```
거래일 | 명의 | 증권사 | 유형 | 종목명 | 수량 | 단가 | 금액 | 수수료 | 메모
```

3. URL에서 시트 ID 복사:
   ```
   docs.google.com/spreadsheets/d/【여기가 ID】/edit
   ```

4. 웹앱 → **설정** 탭 → 시트 ID 입력 → 저장

---

## STEP 4 — 아이폰 홈 화면 추가 (1분)

1. iPhone의 **Safari**로 `https://YOUR_ID.github.io/my-assets` 접속
2. 하단 공유 버튼(□↑) 탭
3. **홈 화면에 추가** 탭
4. 이름: `자산관리` → **추가**
5. 홈 화면에 아이콘 생성 완료!

---

## 사용 방법

### 매달 (10~15분)
1. 앱 열기 → 구글 로그인
2. **종목** 탭 → 현재가 업데이트 → 저장
3. **현황** 탭에서 비중 확인
4. 이탈 종목 있으면 적립 배분 조정

### 거래 시마다
- **기록** 탭 → + 새 거래 기록

---

## 문의 / 수정
Claude에게 언제든 물어보세요:
- 화면 수정 (색상, 레이아웃)
- 기능 추가 (시뮬레이션, 알림 등)
- 계좌 추가
