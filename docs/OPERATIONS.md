# 비개발자용 운영 및 오류 대응 안내서

## 매월 확인할 것

1. 매월 1일 오전 9시 이후 GitHub `Actions`에서 `Monthly Collection and AI Report`를 엽니다.
2. 초록 체크가 표시되는지 확인합니다.
3. 웹사이트 상단 수집 시각과 `예시 데이터` 배지가 사라졌는지 확인합니다.
4. `reports/YYYY-MM.md`가 생성됐는지 확인합니다.
5. 리포트에서 링크와 수치가 실제 데이터와 일치하는지 사람이 검토합니다.

## 오류별 대응

| 화면 또는 로그 | 의미 | 대응 |
|---|---|---|
| `robots.txt에서 수집을 허용하지 않는 URL` | 자동 수집이 허용되지 않음 | 우회하지 말고 RSS·API·CSV 방식 검토 |
| `robots.txt 확인 실패` | robots 파일에 접근할 수 없음 | 일시 장애인지 확인 후 다음 날 재시도. 계속되면 해당 어댑터 중지 |
| `목록 선택자와 일치하는 공고가 없습니다` | 사이트 HTML 구조 변경 가능성 | `collector/adapters/gamejob.py` 선택자 수정 필요 |
| `pending_api_key` | AI 키가 없거나 전달되지 않음 | 저장소 Secret 이름이 정확히 `ANTHROPIC_API_KEY`인지 확인 |
| Claude 인증 오류 | 키 만료·오입력 | 노출된 키를 폐기하고 Secret을 새 키로 교체한 뒤 수동 `monthly`, `force=true` 실행 |
| Claude 한도 오류 | 결제 또는 사용 한도 | Anthropic 계정 한도를 확인한 뒤 수동 재실행 |
| Pages 404 | Pages 소스 또는 배포 실패 | Settings → Pages → Source가 GitHub Actions인지 확인 |
| 화면은 열리지만 JSON 오류 | `data`가 빌드에 포함되지 않음 | Deploy workflow의 `npm run build` 로그와 `dist/data` 확인 |
| 커밋 권한 오류 | Actions 쓰기 권한 없음 | Settings → Actions → General → Read and write permissions |

## 안전한 수동 재수집

1. 실패 이유를 먼저 확인합니다.
2. 일시적인 네트워크 오류라면 `Manual Collection`에서 동일 모드를 `force=false`로 실행합니다.
3. 기존 파일이 이미 있어 건너뛰었다면 현재 데이터를 교체해도 되는지 확인합니다.
4. 교체가 필요할 때만 `force=true`로 실행합니다.
5. 결과가 잘못됐다면 GitHub의 이전 커밋에서 해당 파일을 복원할 수 있습니다.

## CSV 대체 운영

공개 자동 수집이 금지되거나 계속 실패하면 사이트를 우회하지 마세요. 운영사 제공 파일 또는 합법적으로 확보한 CSV를 정해진 스키마로 변환하는 별도 어댑터를 추가해야 합니다. 필수값은 `id`, `company`, `title`, `url`, `categories`, `collected_at`입니다.

## 데이터 이상 징후

- 전체 공고가 갑자기 0건: 새 파일은 저장되지 않지만 어댑터 구조 변경 가능성이 큽니다.
- 전체 공고가 하루 만에 지나치게 증가: 페이지네이션 순환 또는 ID 추출 오류를 확인합니다.
- 모든 회사가 `회사명 미확인`: 회사 선택자 변경 가능성이 큽니다.
- 같은 공고가 반복됨: URL 고유번호 키가 바뀌었는지 `collector/normalize.py`를 확인합니다.
- 종료 공고 급증: 이전 달과 현재 달 모두 정상 수집됐는지 먼저 확인합니다.

## 공개 전 체크리스트

- [ ] 실제 수집처별 robots.txt 및 이용약관 확인
- [ ] 필요한 경우 운영사 서면 허가 확보
- [ ] 예시 데이터가 실제 데이터로 교체됐는지 확인
- [ ] API 키가 저장소 파일과 로그에 노출되지 않았는지 확인
- [ ] 모든 원문 링크가 정상인지 표본 검사
- [ ] AI 리포트의 수치·출처·인과 표현을 사람이 검토
