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
