# v26 검색·집계·리포트 UI 업데이트 적용

이 버전은 반복 검색 오류를 수정하고, 직무 집계 기준 전환, 이번 달 결론, 뉴스 근거 강도 시각화를 추가했습니다. 채용공고 페이지는 검색 결과용으로 유지하지만 상단과 모바일 메뉴에서는 제거했습니다.

1. ZIP을 풀고 `game-industry-hiring-tracker` 폴더 안의 파일과 폴더를 저장소 루트에 모두 덮어씁니다.
2. 예전 `.github/workflows/generate-report.yml`이 남아 있다면 삭제합니다.
3. 커밋 후 `Deploy GitHub Pages`가 자동으로 실행될 때까지 기다립니다.
4. 저장소에 완성된 GPT 리포트가 이미 있으면 이 배포가 PDF 요약본도 자동 생성하므로 GPT를 다시 호출할 필요가 없습니다.
5. 새 해설까지 다시 만들고 싶을 때만 `Actions > Generate GPT Report - OpenAI > Run workflow`를 한 번 실행합니다.
6. 이 작업 하나가 GPT 생성, PDF 생성, 저장소 커밋, 웹 빌드, Pages 배포까지 모두 수행합니다.

`OPENAI_API_KEY`는 기존 GitHub Secret을 그대로 사용합니다. ZIP은 저장소에 이미 생성된 `data/reports`와 `reports`를 덮어쓰지 않도록 구성되어 있습니다.

리포트는 자유 형식 Markdown 대신 정해진 JSON 구조를 사용합니다. 숫자는 웹 그래프로 표시하고, 공고·뉴스 링크는 저장 데이터에서 직접 연결하므로 깨진 링크와 `null` 같은 개발자 표현이 화면에 노출되지 않습니다.

PDF 버튼은 월간 리포트 상단에 표시됩니다. 저장된 해설이 아직 없다면 통계 PDF 대신 해설 생성 안내를 유지하고, GPT 작업이 성공한 뒤 PDF를 함께 만듭니다.
