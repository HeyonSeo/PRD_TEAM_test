# 반복 기록

(각 반복이 맨 아래에 추가합니다)

## 반복 1 — 1. 뼈대와 가짜 데이터 (PASS)
- index/field/hq.html 뼈대, `assets/data.js`(window.LH_DATA: 단지 12곳·동/호·입주민·시드 40건·maskName/maskPhone·findResident), `assets/store.js`(window.Store: list/add/setStatus/reset/getMyComplex/setMyComplex/onChange/daysSince), `assets/style.css` 작성.
- 가짜 데이터는 고정 시드 난수라 매번 같음. 시드 접수 날짜만 `Date.now()` 기준(최근 40일). 사진은 SVG dataURL 자리표시.
- 접수 객체: {id, complexId, dong, ho, text, photos[], status('접수'|'업체 배정'|'보수 완료'), createdAt, statusAt, history[]}. 저장 키 `Store.KEY`, 내 단지 키는 reset 시 같이 지워짐.
- check.js: 페이지별 콘솔 에러·외부 요청·가로 스크롤 검사 헬퍼(`watch`, `noHScroll`)가 있음. localStorage 차단 컨텍스트 검사도 있으니 새 코드도 Store를 통해서만 저장할 것.
- 함정: 입주민 원본 이름·연락처는 LH_DATA에 평문으로 있음. 화면에는 반드시 maskName/maskPhone을 거쳐 표시(항목 5에서 검사 예정). shots/는 .gitignore 대상.

## 반복 2 — 2. 현장 등록 흐름 (PASS)
- field.html을 세 화면(`#view-pick` 단지 고르기 / `#view-register` 등록 / `#view-done` 완료)으로 구성. `show(name)`으로 전환하고, 하단 "단지 바꾸기"로 고르기 화면 복귀. 단지는 `Store.setMyComplex`로 기억.
- 등록: 사진(`#photo-input` multiple, canvas로 긴 변 480px JPEG) → 동 버튼(`data-dong`) → 호 버튼(`data-ho`, 층당 호수만큼 열) → 한 줄(`#text-input`, 자주 쓰는 말 칩) → `#submit-btn`. 연락처는 `#resident`에 마스킹해서 자동 표시, 저장 객체에는 넣지 않음(필요하면 findResident로 찾기).
- 완료 화면 `#done-title`에 "등록 완료 · 00초"(60초 넘으면 "1분 05초"). 타이머는 등록 화면을 연 순간(`openRegister`) 시작.
- 항목 3(접수 목록)은 field.html에 view를 하나 더 추가하고 `show()`의 목록 배열에 이름을 넣으면 됨. `[hidden]{display:none!important}`가 style.css에 있음.
- 함정: check.js 항목 2는 끝에 Store.reset()으로 정리함. 버튼 44px·글씨 16px 검사가 `#view-register` 안 요소 전체에 걸려 있으니 새 요소도 이 기준을 지킬 것.

## 반복 3 — 3. 현장 접수 목록과 상태 변경 (PASS)
- field.html 위쪽에 탭(`#tabs`: `#tab-register` 새로 등록 / `#tab-list` 접수 목록, 진행 중 건수 표시) 추가, 단지 고르기 화면에서만 숨김. 새 화면 `#view-list`, 완료 화면에 `#to-list-btn`.
- 목록: 우리 단지 건만 최근 순, `#search-input`(숫자 둘이면 앞=동·뒤=호 앞자리 일치, 하나면 동 또는 호), `#status-filter button[data-filter]`로 상태 거르기. 각 건 `.report[data-id]`에 배지·3단계 표시·"n일째"(statusAt 기준, `.report-meta[data-days]`)·마스킹 연락처·사진 썸네일.
- `.next-btn`(data-next) 한 번에 Store.setStatus로 다음 상태. 보수 완료면 버튼 없이 "처리 끝". 7일 이상 멈춘 진행 중 건은 `.report-meta.stale`(빨간 글씨) — 본부 카드 경고(항목 4)도 같은 기준(statusAt 기준 7일)을 쓰면 일관됨.
- Store.onChange로 다른 탭 변경 시 목록 다시 그림. 함정: 호수 "101"(1층 1호)과 동 "101"이 같아서 숫자 하나 검색은 둘 다 걸림(의도된 동작).

## 반복 4 — 4. 본부 대시보드 (PASS)
- hq.html: `#auto-summary`("이번 주 취합: 자동 완료" + 이번 주 새 접수 수), `#totals`(전체·진행 중·완료·7일 넘게 멈춤), `#complex-cards .cx-card[data-complex]` 12개(`.n-total/.n-open/.n-done strong`, 멈춘 건 있으면 `.has-stale` + `.cx-warn`), 표 `#report-rows tr[data-id][data-complex]`.
- 거르기: `#f-complex` select, `#f-status button[data-status]`(전체/접수/업체 배정/보수 완료/멈춤). 카드를 누르면 그 단지로 거르고 한 번 더 누르면 해제. 사진 `.pic-btn` → `#lightbox`(닫기 `#lightbox-close`, Esc).
- 갱신: Store.onChange(storage 이벤트)로 render. 처음 그린 뒤 새로 생긴 id는 8초간 `tr.is-new` + "방금 들어옴" 태그 + `#new-toast`. 한꺼번에 6건 넘게 생기면(초기화 등) 강조하지 않음.
- 멈춤 기준은 현장과 같은 statusAt 기준 7일. 경과일 칸은 접수일(createdAt) 기준 "n일째", 멈춘 건은 아래에 "⚠ n일 멈춤".
- 함정: storage 이벤트는 다른 탭에서만 옴. 같은 페이지에서 Store를 바꾸면 render()를 직접 불러야 함. 항목 5의 초기화 버튼이 본부 탭에 미치는 영향도 이 경로로 처리됨.

## 반복 5 — 5. 시연 시작 화면과 개인정보 표시 (PASS)
- index.html: `#problem`(문제 한 줄) → `#demo-steps` 3단계 → `#open-field`/`#open-hq`(target=_blank, 새 탭으로 열어 본부 탭을 띄워 둔 채 시연) → `#compare` 비교표 → `#reset-btn`(확인창 없이 바로 Store.reset, `#reset-msg`에 결과).
- 세 페이지 맨 위(topbar 위)에 `#privacy-note` "가짜 데이터 · 외부로 전송되지 않음". 480px 이하에선 뒤쪽 "(이 기기 안에만 저장)" 숨김(한 줄 유지). 스타일은 style.css 끝 `.privacy-note`.
- check.js [5]의 `leakScan`은 innerText·속성값·input 값에서 원본 연락처와 010-xxxx-xxxx 패턴을 찾음. 새 화면이나 title/aria-label에 연락처를 넣으면 걸림.
- 초기화는 storage 이벤트로 열린 본부 탭에 반영되고, 6건 넘게 바뀌므로 "방금 들어옴" 강조가 안 뜸(검사함). 초기화는 내 단지 기억도 지우므로 현장 화면은 단지 고르기부터 다시 시작함.

## 반복 6 — 6. 최종 점검과 시연 리허설 (PASS)
- check.js [6]: 한 컨텍스트에서 시작 화면 초기화 → `#open-hq`/`#open-field`(새 탭 popup) → 현장 단지 고르기·사진 2장 등록(1분 안) → 본부 새 건 강조·같은 양식 → 현장 목록 검색·업체 배정 → 본부 표·카드 반영 → 사진 크게 보기. 화면마다 `6-*.png` 전체 스크린샷과 `layoutScan`(화면 밖 넘침·overflow 잘림·16px 미만 글씨) 검사.
- 버그 수정: 시작 화면 `.steps`와 현장 목록의 처리 단계 `.steps` 클래스가 겹쳐 폰 폭에서 단계가 세로로 쌓여 버튼처럼 보였음 → 현장 쪽을 `.status-steps`(한 줄, 밑줄 진행 막대, › 화살표)로 이름 바꿈.
- 한국어 낱말이 중간에서 끊기던 것(등/록) → style.css 끝에 `body { word-break: keep-all; overflow-wrap: anywhere; }`.
- `mockup/README.md`: 여는 방법, 시연 전 준비, 3분 대본, PRD 대응표, 일부러 뺀 것. check.js [6]이 README 제목 문구(여는 방법·3분 시연 대본·대응표·일부러 뺀 것)를 검사하니 제목을 바꿀 때 주의.
- 함정: layoutScan은 `.visually-hidden`·INPUT/SELECT/IMG를 잘림 검사에서 뺌. 모든 항목 완료.
