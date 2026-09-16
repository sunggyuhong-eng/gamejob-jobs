# v25 전체 업데이트 적용

이 버전은 비교 기간 선택, 데이터 품질 진단, 회사 그룹 보기, CSV 내보내기, 증권사 리서치형 PDF 요약본을 추가했습니다.

1. ZIP을 풀고 `game-industry-hiring-tracker` 폴더 안의 파일과 폴더를 저장소 루트에 모두 덮어씁니다.
2. 예전 `.github/workflows/generate-report.yml`이 남아 있다면 삭제합니다.
3. 커밋 후 `Deploy GitHub Pages`가 자동으로 실행될 때까지 기다립니다.
4. 저장소에 완성된 GPT 리포트가 이미 있으면 이 배포가 PDF 요약본도 자동 생성하므로 GPT를 다시 호출할 필요가 없습니다.
5. 새 해설까지 다시 만들고 싶을 때만 `Actions > Generate GPT Report - OpenAI > Run workflow`를 한 번 실행합니다.
6. 이 작업 하나가 GPT 생성, PDF 생성, 저장소 커밋, 웹 빌드, Pages 배포까지 모두 수행합니다.

`OPENAI_API_KEY`는 기존 GitHub Secret을 그대로 사용합니다. ZIP은 저장소에 이미 생성된 `data/reports`와 `reports`를 덮어쓰지 않도록 구성되어 있습니다.

리포트는 자유 형식 Markdown 대신 정해진 JSON 구조를 사용합니다. 숫자는 웹 그래프로 표시하고, 공고·뉴스 링크는 저장 데이터에서 직접 연결하므로 깨진 링크와 `null` 같은 개발자 표현이 화면에 노출되지 않습니다.

PDF 버튼은 월간 리포트 상단에 표시됩니다. 저장된 해설이 아직 없다면 통계 PDF 대신 해설 생성 안내를 유지하고, GPT 작업이 성공한 뒤 PDF를 함께 만듭니다.
