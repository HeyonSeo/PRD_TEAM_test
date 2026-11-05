# 반복 기록

(각 반복이 맨 아래에 추가합니다)

## 반복 1 — 1. 뼈대와 가짜 데이터 (PASS)
- index/field/hq.html 뼈대, `assets/data.js`(window.LH_DATA: 단지 12곳·동/호·입주민·시드 40건·maskName/maskPhone·findResident), `assets/store.js`(window.Store: list/add/setStatus/reset/getMyComplex/setMyComplex/onChange/daysSince), `assets/style.css` 작성.
- 가짜 데이터는 고정 시드 난수라 매번 같음. 시드 접수 날짜만 `Date.now()` 기준(최근 40일). 사진은 SVG dataURL 자리표시.
- 접수 객체: {id, complexId, dong, ho, text, photos[], status('접수'|'업체 배정'|'보수 완료'), createdAt, statusAt, history[]}. 저장 키 `Store.KEY`, 내 단지 키는 reset 시 같이 지워짐.
- check.js: 페이지별 콘솔 에러·외부 요청·가로 스크롤 검사 헬퍼(`watch`, `noHScroll`)가 있음. localStorage 차단 컨텍스트 검사도 있으니 새 코드도 Store를 통해서만 저장할 것.
- 함정: 입주민 원본 이름·연락처는 LH_DATA에 평문으로 있음. 화면에는 반드시 maskName/maskPhone을 거쳐 표시(항목 5에서 검사 예정). shots/는 .gitignore 대상.
