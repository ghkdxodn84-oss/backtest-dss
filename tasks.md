# Tasks

## In Progress
- [ ] 웹 뷰어 차트·주문 시트 고도화 (Spectrum UI 시장 블록 기법 참고, 우리 테마로 재구현) (시작 2026-09-23)
  - 참고: https://ui.spectrumhq.in/blocks/charts#market · 소스 github.com/arihantcodes/spectrum-ui `app/registry/charts/` (Apache-2.0)
  - Tailwind/shadcn/Recharts 도입 없이 순수 SVG + CSS로 이식. 색·폰트·직각 모서리는 기존 라임/마젠타 토큰 유지
  - [x] 1. 에쿼티 차트 (2026-09-23): 드로다운 패널, 기간 선택(1M/3M/6M/1Y/ALL, 데이터 부족 구간 비활성), 우측 Y축 nice ticks, 헤더 리드아웃(호버 시점 값·구간 수익률·DD), 단순보유 곡선을 구간 시작 에쿼티에 리베이스해 같은 축, 축 범위 트윈·라인 드로잉 애니메이션(prefers-reduced-motion 존중), 방향키 탐색
    - `src/chart/engine.ts` 공통 유틸(niceTicks, monotonePath, useTween, useElementWidth). ResizeObserver 실측 폭으로 그려 preserveAspectRatio 왜곡·툴팁 클램프 코드 제거
    - 모드 밴드 경계가 휴장일이면 이진탐색으로 가장 가까운 거래일에 붙임 (기존엔 end가 없으면 start로 붕괴해 밴드가 한 칸으로 보였음)
  - [x] 2. LOC 주문 시트 래더 (2026-09-23): `LocLadder.tsx`. 매도 위 / 최근 종가 스프레드 행 / 매수 아래. 게이지는 근거 칸 안에서 종가(0%)를 절반 위치 기준선으로 두고 종가 대비 거리만큼 길거나 짧게 (사용자 피드백으로 누적 수량 → 거리 절대값 → 종가 기준선 순으로 바뀜). 행 클릭 복사 시 라임 플래시. 모바일은 근거 텍스트만 숨기고 게이지 유지
    - 개발용 샘플: URL `?demo` 붙이면 주문 시트를 `src/dev/demoOrders.ts` 데이터로 교체
  - [x] 3. 요약 지표 스파크라인 (2026-09-23): `Sparkline.tsx` + `src/chart/metricSeries.ts`. 서버 응답의 equity 배열만으로 유도, API 변경 없음
    - 성과 지표 7개 타일만 (Final Equity·Sharpe·변동성·MDD·누적수익률·단순보유·CAGR). 실현 지표(거래횟수·이익금 등)는 사용자 요청으로 숫자만 유지
    - Sharpe·변동성은 60거래일 롤링, CAGR은 20일 이후부터. QQQ 단순보유는 시계열이 없어 스파크라인 없음
    - 타일 위에서 스크럽하면 그 날짜의 값·날짜가 큰 숫자 자리에 표시
  - 이후 후보: 4. 일별 손익·모드 캘린더 히트맵, 5. 캔들+RSI 패널(API에 OHLC·RSI 시계열 추가 필요)
- [ ] 데이터 자동 갱신 방법 결정: GitHub Actions 러너(Azure IP)가 Yahoo에 차단됨
  - 후보 A: 집 PC 스케줄러(Windows Task Scheduler → WSL)에서 fetch + push
  - 후보 B: Tiingo 무료 API 키 발급 후 Actions에서 Tiingo로 fetch
  - 워크플로 cron은 임시 비활성화 (workflow_dispatch만 유지)
- [ ] Cloud Run 배포 (scale-to-zero, asia-northeast1 도쿄 = Tier 1 무료 한도)
  - Phase 0 (사용자): GCP 가입·카드, Budget $5 알림, gcloud auth login
  - Phase 1: entrypoint `--port ${PORT:-8000}` (완료). boot 백그라운드 데이터 갱신은 유지
    - Cloud Run 참고: 요청 기반 과금에선 요청 처리 중에만 CPU가 배정되어 백그라운드 갱신이 느리거나 멈출 수 있음.
      실패해도 베이스라인 + 갭필로 정상 동작하므로 문제 시에만 startup CPU boost 검토
  - Phase 2 (완료 2026-09-10): personal-447204 프로젝트, asia-northeast1
    - https://dongpa-viewer-138405702335.asia-northeast1.run.app (1Gi/1cpu, max-instances 1)
    - 백테스트·오더북 API 정상 (1.7s/0.2s), 예산 ₩10,000/월 알림 기존재, 이미지 최근 2개 보관 정책 설정
    - IAP 구글 로그인 설정 (2026-09-10): 조직 없는 개인 프로젝트라 관리형 클라이언트 불가 →
      커스텀 OAuth 클라이언트(dongpa-iap) 생성 후 `gcloud iap settings set`으로 연결.
      허용 계정: ymj02349@gmail.com (iap.httpsResourceAccessor). make deploy에 --iap 반영
    - 콜드스타트 실측은 IAP 로그인 후 브라우저에서 체감 확인으로 대체
  - Phase 3: WIF 인증 + deploy-web.yml (web/·engines/·Dockerfile.web 변경 시), 이미지 2개만 보관
  - Phase 4: 데이터 갱신 재개되면 DONGPA_DATA_URL=raw GitHub 전환, (선택) 커스텀 도메인
  - 429 심하면 대안: Render free / 집 PC + Cloudflare Tunnel (조사 문서: claude.ai/code/artifact/fe573437-3a8e-4882-a918-c473ea653852)

## Done
- [x] 웹 뷰어 파비콘 적용 (2026-09-21)
  - 라임 D 안에 물결 한 줄(시안 I) — 시안 비교: claude.ai/artifact/XbhjeKbnC5rTzksfiVPmcN
  - `web/frontend/public/` favicon.svg + favicon-32.png + apple-touch-icon.png, index.html 링크
  - PNG는 playwright 캐시의 headless_shell로 렌더 (cairosvg/rsvg 없음)
- [x] 웹 뷰어 모바일 레이아웃 수정 (2026-09-16)
  - 오더북 페이지 가로 스크롤 제거 (`1fr` → `minmax(0,1fr)` 가드, `.order-column min-width:0`)
  - 차트 모바일 대응: 레터박스 제거(preserveAspectRatio none + 고정 높이), 축 라벨 HTML 이동, 툴팁 px 클램프, touch-action pan-y
  - LOC 주문 시트 컬럼 재배치: 구분·주문가·수량·근거 순
  - iOS 입력 줌 방지(모바일 16px), 전략 스트립 EDIT sticky, 터치 탭 타겟 40px
  - 검증: 헤드리스 크로미움 390px/320px 전 화면 scrollWidth == viewport 확인
- [x] yfinance 의존 제거: 일봉 데이터를 git으로 관리 (2026-09-06)
  - `scripts/update_market_data.py` 증분 다운로드 (7일 겹침 재수집, 3회 재시도)
  - `.github/workflows/update-data.yml` 평일 22:30 UTC cron → data/ 커밋
  - 뷰어는 dataset 우선 (로컬 data/ → raw GitHub), 미추적 티커·7일 이상 낡은 데이터만 yfinance 폴백
- [x] 웹 뷰어 (FastAPI + React) 커밋·푸시 (2026-09-06)
- [x] 오더북 진입 시 자동 실행, 계산 버튼 제거 (2026-09-06)
- [x] 넓은 화면에서 본문 가운데 정렬 (2026-09-06)
