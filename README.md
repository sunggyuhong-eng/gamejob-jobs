# 게임잡 채용 데이터

게임잡 공개 채용공고를 수집해 회사별·직무별 추이를 보여주는 정적 React 대시보드입니다. 별도 서버와 데이터베이스 없이 GitHub Actions, 저장소 JSON, GitHub Pages만으로 운영합니다.

화면은 토스 스타일의 넓은 여백, `#3182F6` 포인트 컬러, 밝은 회색 섹션, 둥근 카드와 큰 수치 중심의 반응형 디자인 시스템을 사용합니다. PC에서는 데이터 비교에 집중하고 모바일에서는 공고를 카드 형태로 읽을 수 있도록 자동 전환됩니다.

> 현재 ZIP에는 2026-09-02 실제 CSV **1,589건**과 2026-09-15 실제 수집 데이터 **1,551건**이 포함되어 있습니다. 두 기준일의 공고 고유번호를 비교한 변화(신규 310건·유지 1,241건·종료 348건)를 화면에서 시험할 수 있습니다. 이후 Actions가 최신 데이터로 갱신하며, 수집기가 접근 제한을 만나면 기존 정상 데이터는 유지하고 수치를 만들지 않습니다.

## 작동 구조

1. 매일 오전 9시(한국 시간) 공개 채용공고를 수집해 `data/daily/YYYY-MM-DD.json`에 보존합니다.
2. 매월 1일 오전 9시에는 `data/snapshots/YYYY-MM.json`을 만들고 전월과 비교합니다.
3. Anthropic Claude API가 제공된 경우에만 `reports/YYYY-MM.md`와 `data/reports/YYYY-MM.json`을 생성합니다.
4. React는 저장소의 정적 JSON만 읽습니다. 외부 사이트를 브라우저에서 직접 호출하지 않습니다.
5. 수집 성공 여부와 오류는 `data/collection-status.json`에 기록합니다.
6. 직무별 화면은 `data/category-history.json`을 사용해 선택한 대분류 또는 소분류만 날짜별로 비교합니다.
7. 매일 수집할 때도 `data/company-profiles.json`의 기존 로고·대표게임을 최신 공고에 재적용하며, 일부 상세 조회가 실패해도 기존 값을 지우지 않습니다.

## 폴더 구조

```text
game-industry-hiring-tracker/
├─ .github/
│  └─ workflows/             ← 워크플로 파일이 들어 있는 폴더
├─ collector/
│  ├─ adapters/              ← 사이트별 수집 코드
│  ├─ normalize.py           ← 회사·직무·날짜 정규화
│  ├─ pipeline.py            ← 저장·중복 제거·전월 비교
│  ├─ report.py              ← Claude 월간 리포트 생성
│  └─ validate.py            ← 데이터 검증
├─ config/                   ← 수정 가능한 분류 규칙
├─ data/                     ← JSON 데이터가 들어 있는 폴더
│  ├─ daily/
│  ├─ comparisons/           ← 기준일 사이의 고유번호 비교 결과
│  ├─ snapshots/
│  └─ reports/
├─ reports/                  ← 월별 Markdown 리포트
├─ scripts/
│  ├─ run_pipeline.py
│  └─ import_gamejob_csv.py  ← 허가받아 받은 CSV 변환
├─ src/                      ← React 화면
├─ tests/                    ← Python 테스트
├─ package.json
└─ requirements.txt
```

`.github`, `.github/workflows`, `data`, `data/snapshots`는 파일이 아니라 **폴더**입니다. GitHub 웹에서 폴더를 한 개의 파일처럼 만들지 마세요.

## GitHub에 처음 올리는 방법

### 1. 새 저장소 만들기

1. GitHub에 로그인하고 오른쪽 위 `+` → `New repository`를 누릅니다.
2. 저장소 이름을 입력합니다. 예: `game-hiring-radar`.
3. `Public`을 선택합니다.
4. `Add a README`, `.gitignore`, 라이선스 자동 생성을 모두 체크하지 않고 저장소를 만듭니다.

### 2. ZIP 업로드

1. 제공된 ZIP을 Windows에서 먼저 압축 해제합니다.
2. 압축을 푼 뒤 `game-industry-hiring-tracker` 폴더 **안으로 들어갑니다**.
3. `README.md`, `package.json`, `src`, `data`, `.github` 등이 같은 위치에 보이는 상태에서 전체를 선택합니다.
4. GitHub 저장소의 `uploading an existing file`을 눌러 선택한 항목을 드래그합니다.
5. `.github`가 Windows 탐색기에서 보이지 않으면 숨김 항목 표시를 켜거나 GitHub Desktop을 사용하세요.
6. 업로드 목록에 `.github/workflows/monthly-collection.yml`처럼 경로가 보이는지 확인한 뒤 커밋합니다.

폴더 구조가 무너졌다면 파일을 개별 생성하지 말고 GitHub Desktop을 권장합니다. 저장소를 로컬에 복제한 뒤 압축 해제한 내용을 저장소 폴더로 복사하고 `Commit to main` → `Push origin`을 누르면 됩니다.

## 필수 GitHub 설정

### Actions 쓰기 권한

1. 저장소 `Settings` → `Actions` → `General`로 이동합니다.
2. `Workflow permissions`에서 `Read and write permissions`를 선택합니다.
3. `Save`를 누릅니다.

수집 워크플로가 JSON과 리포트를 저장소에 커밋하기 위해 필요합니다.

### Claude API 키

AI 리포트만 사용하도록 설계되어 있으므로 키가 없으면 월간 리포트는 생성되지 않습니다.

API 키는 공개 웹페이지에 입력하지 않습니다. 브라우저 입력칸에 넣으면 방문자에게 노출될 수 있으므로 GitHub의 암호화된 Actions Secret에만 저장합니다.

1. 저장소 `Settings` → `Secrets and variables` → `Actions`로 이동합니다.
2. `New repository secret`을 누릅니다.
3. 이름은 반드시 `ANTHROPIC_API_KEY`, 값은 Anthropic Console에서 새로 발급받은 키를 입력합니다.
4. 선택 사항으로 `Variables` 탭에 `ANTHROPIC_MODEL`을 추가할 수 있습니다. 기본값은 `claude-sonnet-5`입니다.

키를 코드, JSON, README 또는 채팅에 입력하지 마세요. 공개된 키는 즉시 폐기하고 새 키로 교체해야 합니다. API 사용료와 사용 가능 모델은 Anthropic 계정 설정에 따라 달라집니다.

### 수집 출처 승인

수집처는 `config/source_policy.yml`에서 관리합니다. 게임잡은 2026-09-14 사용자가 사용 허가를 확보했다고 확인하여 활성화되어 있습니다. 업계 뉴스는 화면에 표시하지 않고, 게임잡 업계뉴스에서 최대 최근 45일·80페이지 범위의 공개 기사 메타데이터를 월간 리포트 근거로만 수집합니다.

### GitHub Pages 활성화

1. 저장소 `Settings` → `Pages`로 이동합니다.
2. `Build and deployment`의 `Source`를 `GitHub Actions`로 선택합니다.
3. 저장소 `Actions` 탭에서 `Deploy GitHub Pages`가 성공할 때까지 기다립니다.
4. 완료된 워크플로의 배포 URL을 누릅니다.

Vite의 `base: './'`과 HashRouter를 사용하므로 `사용자명.github.io/저장소명/` 같은 하위 경로에서도 자산 로딩과 새로고침이 동작합니다.

## 자동 실행 일정

| 워크플로 | 한국 시간 | UTC cron | 역할 |
|---|---:|---:|---|
| Monthly Collection and AI Report | 매월 1일 09:00 | `0 0 1 * *` | 공식 스냅샷, 비교, AI 리포트 |
| Daily Collection | 매일 09:00 | `0 0 * * *` | 일별 스냅샷 (매월 1일은 자동 건너뜀) |
| Test and Validate | `main` 변경 시 | 해당 없음 | Python 테스트와 React 빌드 |
| Deploy GitHub Pages | 변경·수집 완료 시 | 해당 없음 | Pages 배포 |

GitHub 예약 작업은 부하에 따라 다소 늦게 시작될 수 있습니다. 공개 저장소가 60일 동안 비활성 상태이면 GitHub가 예약 워크플로를 중지할 수 있으므로 Actions 탭을 정기적으로 확인하세요.

## 수동 데이터 수집

1. GitHub 저장소 `Actions`를 엽니다.
2. 왼쪽에서 `Manual Collection`을 선택합니다.
3. `Run workflow`를 누릅니다.
4. `daily`는 오늘 기록만 저장하고, `monthly`는 공식 월간 비교와 AI 리포트까지 만듭니다.
5. 같은 날짜·월의 기존 파일을 교체할 때만 `force`를 체크합니다.

기본 정책은 기존 스냅샷 보존입니다. 같은 날 또는 같은 달에 다시 실행하면 건너뛰며, `force=true`로 실행한 경우에만 교체합니다. 교체 전 파일이 중요하다면 먼저 GitHub 커밋 기록에서 내려받으세요.

## 실행 결과 및 오류 확인

- `Actions` → 실행한 워크플로 → 실패한 단계에서 로그를 확인합니다.
- `data/collection-status.json`에는 사이트별 `success`/`failed`, 수집 건수, 오류 이유가 기록됩니다.
- `data/latest.json`의 `collected_at`이 마지막 정상 수집 시각입니다.
- 채용공고가 0건이면 새 `latest.json`을 저장하지 않아 기존 정상 화면을 보호합니다.
- `ANTHROPIC_API_KEY`가 없으면 `pending_api_key` 상태만 기록하며 대체 문장을 만들지 않습니다.
- 게임잡처럼 사용 허가가 기록된 도메인은 `robots.txt` 연결을 3회 재시도합니다. 그래도 네트워크로 확인할 수 없을 때만 `ROBOTS_UNAVAILABLE_ALLOWED_HOSTS`의 승인 도메인 정책을 사용하며, 정상 응답에서 `Disallow`가 확인되면 수집을 중단합니다.

상세 대응표는 [운영 및 오류 대응 안내서](docs/OPERATIONS.md)를 참고하세요.

## 사이트 구조가 바뀌었을 때

| 대상 | 수정할 파일 |
|---|---|
| 게임잡 공고 목록·페이지네이션 | `collector/adapters/gamejob.py` |
| 게임잡 대분류·소분류 연결 | `config/job_categories.yml` |
| 회사명 통합 | `config/company_aliases.yml` |
| 전월 비교·저장 정책 | `collector/pipeline.py` |
| AI 리포트 전체 프롬프트 | `config/report_prompt.md` |
| 화면·필터 | `src/App.tsx` |

사이트 HTML 선택자는 변경될 수 있습니다. 브라우저 개발자 도구에서 새 요소를 확인한 뒤 해당 어댑터만 수정합니다. 로그인, CAPTCHA 또는 접근 제한을 우회하는 코드는 추가하지 마세요.

## 로컬 실행

Python 3.12와 Node.js 22가 권장됩니다.

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python -m pytest -q

npm install
npm run dev
```

브라우저에서 Vite가 안내한 주소를 엽니다. 정식 빌드는 다음과 같습니다.

```bash
npm run build
npm run preview
```

로컬 실제 수집은 공개 사이트 정책과 접근 가능 여부를 확인한 뒤 실행하세요.

```bash
python scripts/run_pipeline.py --mode daily
ANTHROPIC_API_KEY=... python scripts/run_pipeline.py --mode monthly
```

## 데이터 판정 기준

- 공고 URL의 공개 고유번호를 우선 ID로 사용하고, 없으면 정규화 URL의 해시를 사용합니다.
- 동일 ID가 여러 직무 목록에 나타나면 한 공고로 합치고 직무 카테고리는 복수 보존합니다.
- 현재와 전월에 모두 있으면 `유지`, 현재만 있으면 `신규`, 전월에만 있으면 `종료`입니다.
- 수정 후 새 고유번호로 재등록된 공고는 원칙적으로 신규입니다. 제목·회사 유사도 기반 후보 연결은 단정 오류를 피하기 위해 자동 합산하지 않습니다.
- 상시채용은 `always_open=true`, 마감일 미제공은 `deadline=null`입니다.
- 첫 달에는 증감, 신규, 유지, 종료를 0으로 꾸미지 않고 `기준 데이터 없음`으로 표시합니다.
- 월중 열리고 닫힌 공고는 일별 스냅샷에서만 확인할 수 있습니다.
- 직무는 공고 제목의 단어로 추측하지 않습니다. 게임잡 원문 직무를 `job_subcategories`에 보존하고 `config/job_categories.yml`을 통해 `job_major_categories`에 연결합니다.
- 예를 들어 `게임제작`을 누르면 `게임개발(클라이언트)`, `게임개발(모바일)`, `게임AI 개발` 같은 실제 소분류를 다시 선택할 수 있습니다.

### 게임잡 CSV를 기준일 데이터로 가져오기

CSV에 `gi_no`, `title`, `company_name`, `job_categories` 등의 열이 있다면 다음 명령으로 일별 JSON과 현재 데이터와의 비교 파일을 만들 수 있습니다.

```bash
python scripts/import_gamejob_csv.py "CSV파일경로.csv" --period 2026-09-02
```

변환 결과는 `data/daily/2026-09-02.json`에 저장되고, `data/comparisons/2026-09-02_to_현재기준일.json`에 신규·유지·종료 비교가 저장됩니다. 기존 월간 공식 스냅샷은 삭제하거나 덮어쓰지 않습니다.

## 월간 리포트 작성 기준

월간 리포트는 매월 1일의 공식 스냅샷과 직전 달 공식 스냅샷을 비교한 집계값으로 작성합니다.

- 전체 오픈 공고 수와 전월 대비 건수·증감률
- 공고 고유번호 기준 신규·유지·종료 공고 수
- 회사별 및 직무별 현재 공고 수와 증감
- 회사와 직무의 교차 변화
- 경력 구간, 근무 지역, 고용 형태별 변화
- 다음 달에 추가 관찰할 회사와 직무
- 대표 공고 최대 50건의 회사명·제목·분류·원문 링크
- 최근 45일 게임잡 업계뉴스의 제목·짧은 요약·게시일·원문 링크
- 신작 출시, 프로젝트 중단, 서비스 종료, 투자·인수합병, 실적, 구조조정, 조직개편 등과 회사별 채용 변동의 시점·회사 일치 여부
- 이전 정상 월간 데이터가 없으면 증감 수치를 만들지 않고 `기준 데이터 없음`으로 표시

Claude는 위에서 계산된 통계, 대표 공고, 뉴스 근거를 함께 검토합니다. 기사에 채용 확대·축소가 직접 명시된 경우와 단순히 같은 시기에 발생한 경우를 구분하고, 인과관계가 확인되지 않으면 `관련 가능성이 있다` 또는 `추가 확인이 필요하다`고 작성합니다. 원본에 없는 수치나 원인을 만들어내지 않도록 지시되어 있으며, API 키가 없으면 리포트를 임의 생성하지 않고 `pending_api_key` 상태로 남깁니다.

웹의 월간 리포트 화면에는 비교 기준일, 전달한 공고·뉴스 근거 수, 뉴스 기간, 판단 규칙, Claude에 전달되는 전체 시스템 프롬프트를 함께 표시합니다. 운영자가 프롬프트를 바꾸려면 `config/report_prompt.md`만 수정하면 됩니다.

## 수집 정책과 법적 주의

수집 요청 전에 게임잡의 `robots.txt`를 확인하며 확인 실패 시 안전하게 수집을 중단합니다. 공개 페이지에만 접근하고, 요청 간 기본 2초 간격을 둡니다. 로그인·CAPTCHA·유료벽·접근 제한을 우회하지 않습니다.

robots.txt 허용이 곧 이용약관상 재이용 허가를 의미하지는 않습니다. 운영 전에 각 사이트 약관을 직접 확인하고, 필요하면 운영사에 서면 허가를 받으세요. 제한되는 출처는 RSS, 공식 API 또는 사용자가 합법적으로 확보한 CSV 업로드 방식으로 교체해야 합니다. 기술 확인 기록은 `docs/SOURCE_COMPLIANCE.md`에 있습니다.

## 알려진 한계

- 사이트 측 HTML 변경 또는 GitHub 호스팅 IP 차단으로 수집이 실패할 수 있습니다.
- 회사 로고와 대표 게임은 공개 목록에서 제공되지 않거나 상세 페이지 접근이 제한되면 빈 값으로 남습니다.
- 외부 로고 URL은 핫링크 정책에 따라 표시되지 않을 수 있으며 화면은 이니셜 대체 로고를 사용합니다.
- AI 리포트는 집계 결과를 문장으로 정리하는 기능이며, 공개 전 수치와 원문 링크를 사람이 검토하는 것이 안전합니다.

## 라이선스와 책임

프로젝트 코드는 MIT 방식으로 사용할 수 있도록 구성했지만, 수집된 공고와 로고의 권리는 각 원권리자에게 있습니다. 실제 공개 운영과 데이터 재이용 적법성 판단은 운영자 책임입니다.
