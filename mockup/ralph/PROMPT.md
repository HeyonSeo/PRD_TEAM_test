# Ralph loop 프롬프트 (매 반복마다 똑같이 사용)

당신은 랄프 루프의 한 반복입니다. 이전 반복의 기억은 없습니다. 상태는 모두 파일에 있습니다.

## 먼저 읽을 것
1. `prd/lh-defect-intake-prd.md`: 무엇을, 왜 만드는지
2. `mockup/ralph/fix_plan.md`: 할 일 목록과 완료 기준
3. `mockup/ralph/progress.md`: 이전 반복이 남긴 기록과 주의사항
4. `mockup/` 아래 지금까지 만들어진 코드

## 이 목업이 이뤄야 할 것
부서장과 전산 부서 앞에서 3분 안에 두 장면을 시연할 수 있어야 합니다.
- 관리사무소 과장이 현장에서 폰으로 하자 한 건을 1분 안에 등록하는 장면
- 그 건이 본부 화면에 단지 12곳 접수와 함께 같은 양식으로 바로 모이는 장면

기능을 많이 넣는 것보다 이 두 장면이 막힘없이 설득력 있게 보이는 것이 우선입니다. 판단이 애매하면 "과장님이 엑셀보다 덜 귀찮다고 느끼는가", "부서장이 보고 고개를 끄덕이는가"를 기준으로 고르세요.

## 이번 반복에서 할 일
1. `fix_plan.md`에서 체크되지 않은 항목 중 **맨 위 하나만** 고릅니다.
2. 그 항목을 구현합니다. 다른 항목에 손대지 마세요. 단, 이전 반복이 남긴 버그가 이번 항목을 막는다면 고쳐도 됩니다.
3. 검증합니다: `node mockup/ralph/check.js`를 실행합니다. 이번 항목의 완료 기준을 확인하는 검사를 check.js에 **추가**하세요(기존 검사는 지우지 말 것). 모든 검사가 통과해야 합니다. 화면을 눈으로 확인할 필요가 있으면 check.js가 남긴 스크린샷(`mockup/ralph/shots/`)을 Read 도구로 열어보세요.
4. 통과하면 `fix_plan.md`에서 그 항목을 `[x]`로 바꾸고, `progress.md` 맨 아래에 이번 반복 기록을 3~6줄로 추가합니다(무엇을 했는지, 다음 반복이 알아야 할 함정).
5. 커밋합니다: `git add mockup && git commit -m "<한 줄 요약>"`. 커밋 메시지 끝에 아래 두 줄을 넣으세요.
   ```
   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_01LfA4BVFvBoTCDPeWqi48m6
   ```
   push는 하지 마세요.
6. 검증이 끝내 통과하지 못하면 체크하지 말고, progress.md에 막힌 이유를 적고 커밋한 뒤 끝냅니다.

## 기술 규칙
- 빌드 도구 없는 정적 HTML/CSS/JS. 외부 CDN, 외부 폰트, 외부 네트워크 요청 금지(개인정보 원칙상 외부 전송 없음을 보여줘야 함).
- 모든 데이터는 가짜입니다. 저장은 `localStorage`(읽기·쓰기는 try/catch로 감싸기). 사진은 canvas로 긴 변 480px 이하 JPEG dataURL로 줄여서 저장.
- 한국어 UI. 대상 사용자는 50대 비개발자 → 큰 글씨(본문 16px 이상), 큰 터치 영역(44px 이상), 전문 용어 금지.
- 현장 화면은 375px 폭, 본부 화면은 1280px 폭 기준. 가로 스크롤 없어야 함.
- check.js는 Node 내장 http 모듈로 `mockup/`을 로컬 서빙하고 Playwright(`require('playwright')`, `chromium.launch()` 옵션 없이)로 검사합니다. 콘솔 에러가 있으면 실패로 처리합니다.

## 끝낼 때 출력
마지막 메시지로 아래 세 줄만 출력하세요.
```
ITEM: <처리한 항목 번호와 제목>
RESULT: PASS 또는 BLOCKED
REMAINING: <남은 미체크 항목 수>
```
