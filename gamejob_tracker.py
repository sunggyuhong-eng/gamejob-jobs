"""
gamejob_tracker.py
게임잡(gamejob.co.kr) 채용공고 트래킹 스크립트

기능
----
1. 게임잡 전체 채용공고 리스트를 크롤링
2. 이전 달 스냅샷과 비교해서 신규 등록 / 삭제(마감) 공고 파악
3. 직무별(제목 키워드 기반 분류), 기업별 공고 수 집계
4. 공고 가장 많이/적게 올린 기업 랭킹
5. 월별 리포트(Markdown + CSV) 자동 생성

사용법
------
    # 1) 최초 1회: 사이트 구조가 예상과 맞는지 확인 (필수!)
    python gamejob_tracker.py --debug

    # 2) 실제 크롤링 + 리포트 생성 (매달 1번씩 실행 -> cron 등록 추천)
    python gamejob_tracker.py --run

설치
----
    pip install requests beautifulsoup4

중요
----
이 스크립트는 2026년 9월 기준으로 확인된 gamejob.co.kr의 HTML 구조를 바탕으로
작성했습니다. 다만 실제 사이트 HTML을 라이브로 직접 파싱 테스트하지는 못했기
때문에(제 실행 환경에서 이 사이트로 직접 접속이 차단되어 있음), 처음 실행할 때는
반드시 --debug 모드로 먼저 원본 HTML을 저장해서 구조를 확인해주세요.
파싱이 잘 안 되면 data/debug/ 폴더의 html 파일 일부를 보여주시면 같이 고칠 수
있습니다.
"""

import argparse
import csv
import re
import time
from collections import Counter
from datetime import datetime
from pathlib import Path

import requests
from bs4 import BeautifulSoup

# ----------------------------------------------------------------------------
# 설정
# ----------------------------------------------------------------------------

BASE = "https://www.gamejob.co.kr"
MAIN_LIST_URL = BASE + "/Recruit/joblist?menucode=searchdetail"

# 리스트 페이지 후보 URL들 (사이트가 AJAX 페이징을 쓰는 걸로 보여서 후보를 여러 개 둠).
# "_GI_Job_List"가 들어간 후보는 AJAX 전용 헤더(X-Requested-With)를 같이 보내서 시도합니다.
LIST_URL_CANDIDATES = [
    BASE + "/recruit/_GI_Job_List?Page={page}",
    BASE + "/Recruit/_GI_Job_List?Page={page}",
    BASE + "/recruit/_GI_Job_List?PageIndex={page}",
    BASE + "/recruit/_GI_Job_List?page={page}",
    BASE + "/recruit/_GI_Job_List?CurPage={page}",
    BASE + "/recruit/_GI_Job_List?GI_Page={page}",
    BASE + "/Recruit/joblist?menucode=searchall&Page={page}",
    BASE + "/Recruit/joblist?menucode=searchdetail&Page={page}",
]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Referer": MAIN_LIST_URL,
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
}


def make_session() -> requests.Session:
    """세션을 만들고, 메인 검색 페이지를 한 번 방문해서 쿠키를 확보합니다.
    (AJAX 페이징이 쿠키/세션 상태에 의존하는 경우가 많아서 필요합니다.)"""
    s = requests.Session()
    s.headers.update(HEADERS)
    try:
        s.get(MAIN_LIST_URL, timeout=15)
    except Exception:
        pass
    return s


def request_headers_for(url_tmpl: str) -> dict:
    """AJAX 전용 엔드포인트(_GI_Job_List)면 XHR인 것처럼 보이는 헤더를 추가."""
    if "_GI_Job_List" in url_tmpl:
        return {
            "X-Requested-With": "XMLHttpRequest",
            "Referer": MAIN_LIST_URL,
        }
    return {}

DATA_DIR = Path("data")
SNAPSHOT_DIR = DATA_DIR / "snapshots"
DEBUG_DIR = DATA_DIR / "debug"
REPORT_DIR = DATA_DIR / "reports"
CATEGORY_CACHE_PATH = DATA_DIR / "job_categories_cache.csv"

for d in (SNAPSHOT_DIR, DEBUG_DIR, REPORT_DIR):
    d.mkdir(parents=True, exist_ok=True)

GI_NO_RE = re.compile(r"GI_Read/View\?GI_No=(\d+)")
COMPANY_RE = re.compile(r"Company/Detail\?tabcode=1&M=(\d+)")

# 리스트에는 정확한 "직종" 필드가 안 보여서, 공고 제목 키워드로 근사 분류합니다.
# 필요하면 이 사전에 키워드를 추가/수정해서 정확도를 높일 수 있어요.
JOB_FUNCTION_KEYWORDS = {
    "프로그래밍": ["프로그래머", "개발자", "클라이언트", "서버 개발", "엔진", "백엔드",
              "프론트엔드", "인프라", "DevOps", "데이터 엔지니어", "게임 클라이언트"],
    "게임기획": ["기획자", "기획", "밸런스", "레벨디자이너", "게임 PM", "사업 PM", "개발 PM"],
    "아트": ["아티스트", "디자이너", "원화", "모델러", "애니메이터", "이펙트",
           "UI/UX", "UI Designer", "그래픽", "스파인"],
    "사운드/영상": ["사운드", "작곡", "음향", "영상"],
    "QA": ["QA", "테스터", "품질"],
    "마케팅/CM": ["마케터", "마케팅", "퍼포먼스", "UA", "홍보", "CM", "커뮤니티 매니저"],
    "사업/전략": ["사업기획", "전략", "BD", "사업개발", "사업 PM"],
    "경영지원/HR": ["HR", "인사", "채용 담당자", "총무", "재무", "회계", "법무", "경영지원", "피플팀"],
    "데이터": ["데이터 사이언티스트", "데이터 분석", "데이터 엔지니어"],
}


def classify_job_function(title: str) -> str:
    for func, keywords in JOB_FUNCTION_KEYWORDS.items():
        for kw in keywords:
            if kw in title:
                return func
    return "기타/미분류"


# ----------------------------------------------------------------------------
# 정확한 직종(모집분야) 가져오기 — 모바일 상세페이지 이용
# ----------------------------------------------------------------------------
# 게임잡 필터에 나오는 "게임개발(클라이언트) 200" 같은 정식 분류는 목록 페이지에는
# 없지만, 모바일 상세페이지(m.gamejob.co.kr)의 "모집분야" 항목에 정확히 나와있어서
# 그대로 긁어옵니다. 한 번 가져온 공고는 캐시에 저장해두고 재사용해서, 매달 다시
# 실행할 때는 "새로 생긴 공고"만 상세페이지를 조회합니다.

MOBILE_DETAIL_URL = "https://m.gamejob.co.kr/Recruit?GI_No={gi_no}"
CATEGORY_FIELD_RE = re.compile(r"모집분야\s*(.+?)\s*(?:툴팁기능|접수안내|경력)", re.DOTALL)


def load_category_cache() -> dict:
    """gi_no -> '카테고리1;카테고리2' 형태의 캐시를 읽어옴."""
    cache = {}
    if CATEGORY_CACHE_PATH.exists():
        with CATEGORY_CACHE_PATH.open(encoding="utf-8-sig") as f:
            for row in csv.DictReader(f):
                cache[row["gi_no"]] = row["categories"]
    return cache


def save_category_cache(cache: dict):
    with CATEGORY_CACHE_PATH.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["gi_no", "categories"])
        for gi_no, categories in cache.items():
            w.writerow([gi_no, categories])


COMPANY_INFO_CACHE_PATH = DATA_DIR / "company_info_cache.csv"
COMPANY_INFO_FIELDS = ["logo_url", "ceo_name", "founded_year", "flagship_games", "homepage_url"]


def load_company_info_cache() -> dict:
    """company_id -> {logo_url, ceo_name, founded_year, flagship_games, homepage_url} 캐시를 읽어옴."""
    cache = {}
    if COMPANY_INFO_CACHE_PATH.exists():
        with COMPANY_INFO_CACHE_PATH.open(encoding="utf-8-sig") as f:
            for row in csv.DictReader(f):
                cache[row["company_id"]] = {k: row.get(k, "") for k in COMPANY_INFO_FIELDS}
    return cache


def save_company_info_cache(cache: dict):
    with COMPANY_INFO_CACHE_PATH.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=["company_id"] + COMPANY_INFO_FIELDS)
        w.writeheader()
        for company_id, info in cache.items():
            row = {"company_id": company_id}
            row.update({k: info.get(k, "") for k in COMPANY_INFO_FIELDS})
            w.writerow(row)


COMPANY_DETAIL_URL = "https://www.gamejob.co.kr/Company/Detail?M={company_id}"

LOGO_URL_RE = re.compile(
    r'(?:https?:)?//file\.gamejob\.co\.kr/net/Corp/CoImage/LogoView\?FN=[^"\'\s<>\)]+',
    re.IGNORECASE,
)
CEO_NAME_RE = re.compile(r'대표자명\s*\n\s*([^\n]+)')
FOUNDED_YEAR_RE = re.compile(r'설립(?:년도|연도)\s*\n\s*([^\n]+)')
FLAGSHIP_GAMES_RE = re.compile(r'대표게임\s*\n\s*([^\n]+)')
HOMEPAGE_LABEL_RE = re.compile(r'홈페이지\s*\n\s*(https?://\S+)')
LOCATION_LINE_RE = re.compile(r'회사위치\s*\n\s*([^\n]+)')
URL_IN_TEXT_RE = re.compile(r'https?://[^\s\)>"\']+')


def _clean_field(val):
    if not val:
        return ""
    val = val.strip()
    for junk in ("더보기", "닫기"):
        if val.endswith(junk):
            val = val[: -len(junk)].strip()
    return val


def fetch_company_info(session: requests.Session, company_id: str):
    """회사 상세페이지(Company/Detail)에서 로고 + 대표자명/설립연도/대표게임/홈페이지를
    한 번의 요청으로 함께 가져옴. 실패한 항목은 빈 문자열로 채워집니다.

    로고는 태그 속성(src/data-src 등)에 의존하지 않고 응답 본문 전체에서 URL
    패턴을 정규식으로 직접 찾습니다 — 지연 로딩 등으로 실제 주소가 src가 아닌
    다른 속성에 들어있어도 잡아낼 수 있게 하기 위함입니다.
    """
    info = {k: "" for k in COMPANY_INFO_FIELDS}
    try:
        r = session.get(COMPANY_DETAIL_URL.format(company_id=company_id), timeout=15)
        if r.status_code != 200:
            return info

        m = LOGO_URL_RE.search(r.text)
        if m:
            url = m.group(0)
            if url.startswith("//"):
                url = "https:" + url
            elif url.startswith("http://"):
                url = "https://" + url[len("http://"):]
            info["logo_url"] = url

        text = BeautifulSoup(r.text, "html.parser").get_text("\n", strip=True)

        ceo_m = CEO_NAME_RE.search(text)
        if ceo_m:
            info["ceo_name"] = _clean_field(ceo_m.group(1))

        year_m = FOUNDED_YEAR_RE.search(text)
        if year_m:
            info["founded_year"] = _clean_field(year_m.group(1))

        games_m = FLAGSHIP_GAMES_RE.search(text)
        if games_m:
            info["flagship_games"] = _clean_field(games_m.group(1))

        home_m = HOMEPAGE_LABEL_RE.search(text)
        if home_m:
            info["homepage_url"] = home_m.group(1).strip()
        else:
            # 폴백: '회사위치' 줄에 홈페이지 URL이 같이 표기된 경우가 있음
            loc_m = LOCATION_LINE_RE.search(text)
            if loc_m:
                url_m = URL_IN_TEXT_RE.search(loc_m.group(1))
                if url_m:
                    info["homepage_url"] = url_m.group(0)

        return info
    except Exception:
        return info


def backfill_company_logos(jobs, verbose=True):
    """jobs에 등장하는 모든 회사(company_id)에 대해 로고 + 기업정보를 확보.
    이미 캐시에 있는 회사는 건너뛰고, 없는 회사만 새로 조회합니다.
    (회사 수는 공고 수보다 훨씬 적어서 빠르게 끝납니다.)"""
    session = make_session()
    info_cache = load_company_info_cache()

    company_ids = sorted({j.get("company_id") for j in jobs if j.get("company_id")})
    missing = [cid for cid in company_ids if not info_cache.get(cid, {}).get("logo_url")]

    if verbose:
        print(f"[logo] 전체 회사 수: {len(company_ids)}곳 / 정보 없는 회사: {len(missing)}곳")

    for i, company_id in enumerate(missing, 1):
        info = fetch_company_info(session, company_id)
        if any(info.values()):
            info_cache[company_id] = info
        if verbose and i % 30 == 0:
            print(f"[logo] {i}/{len(missing)}곳 완료")
        time.sleep(0.2)

    save_company_info_cache(info_cache)

    for j in jobs:
        cid = j.get("company_id")
        info = info_cache.get(cid, {}) if cid else {}
        j["company_logo_url"] = info.get("logo_url", "")
        j["company_ceo"] = info.get("ceo_name", "")
        j["company_founded_year"] = info.get("founded_year", "")
        j["company_flagship_games"] = info.get("flagship_games", "")
        j["company_homepage"] = info.get("homepage_url", "")

    return jobs


def fetch_job_detail_info(session: requests.Session, gi_no: str):
    """모바일 상세페이지에서 '모집분야'(직종)를 긁어옴.
    반환값: (categories_list_or_None, logo_url_or_None) — 로고는 참고용 보조 수단이고,
    실제 로고 채우기는 backfill_company_logos()가 회사 상세페이지에서 확실하게 처리합니다."""
    try:
        r = session.get(MOBILE_DETAIL_URL.format(gi_no=gi_no), timeout=15)
        if r.status_code != 200:
            return None, None
        soup = BeautifulSoup(r.text, "html.parser")

        text = soup.get_text("\n", strip=True)
        m = CATEGORY_FIELD_RE.search(text)
        cats = None
        if m:
            raw = m.group(1).strip()
            parsed = [c.strip() for c in raw.split(",") if c.strip()]
            cats = parsed if parsed else None

        logo_url = None
        m2 = LOGO_URL_RE.search(r.text)
        if m2:
            logo_url = m2.group(0)
            if logo_url.startswith("//"):
                logo_url = "https:" + logo_url
            elif logo_url.startswith("http://"):
                logo_url = "https://" + logo_url[len("http://"):]

        return cats, logo_url
    except Exception:
        return None, None




def enrich_with_categories(jobs, verbose=True):
    """jobs 리스트에 정확한 job_categories(공식 분류)를 채워넣음.
    캐시에 없는 gi_no만 상세페이지를 새로 조회합니다.
    (회사 로고/기업정보는 이후 backfill_company_logos()가 별도로 채웁니다.)"""
    session = make_session()
    cat_cache = load_category_cache()

    to_fetch = [j["gi_no"] for j in jobs if j["gi_no"] not in cat_cache]
    already_cached = len(jobs) - len(to_fetch)
    if verbose:
        print(f"[category] 캐시 보유: {already_cached}건 / 새로 조회할 공고: {len(to_fetch)}건")

    for i, gi_no in enumerate(to_fetch, 1):
        cats, _logo_url = fetch_job_detail_info(session, gi_no)
        if cats is not None:
            cat_cache[gi_no] = ";".join(cats)
        # 실패한 경우 캐시에 안 넣어서 다음 실행 때 다시 시도되게 함
        if verbose and i % 50 == 0:
            print(f"[category] {i}/{len(to_fetch)}건 완료")
        time.sleep(0.15)

    save_category_cache(cat_cache)

    for j in jobs:
        raw = cat_cache.get(j["gi_no"], "")
        j["job_categories"] = raw.split(";") if raw else []
        j["job_function"] = j["job_categories"][0] if j["job_categories"] else classify_job_function(j["title"])

    return jobs


# ----------------------------------------------------------------------------
# 크롤링
# ----------------------------------------------------------------------------

def fetch(session: requests.Session, url: str, **kwargs) -> requests.Response:
    resp = session.get(url, timeout=15, **kwargs)
    resp.raise_for_status()
    return resp


def _extract_gi_nos(html: str):
    return set(GI_NO_RE.findall(html))


def debug_dump():
    """최초 실행용: 각 후보 URL이 '진짜로' 페이지마다 다른 공고를 주는지 확인.
    (1페이지만 열리는지가 아니라, 1페이지와 2페이지의 내용이 서로 다른지까지 검증합니다.)"""
    session = make_session()
    print("[debug] 후보 URL들의 1페이지 vs 2페이지 비교 중...\n")

    working = []

    for i, url_tmpl in enumerate(LIST_URL_CANDIDATES):
        extra_headers = request_headers_for(url_tmpl)
        try:
            r1 = fetch(session, url_tmpl.format(page=1), headers=extra_headers)
            time.sleep(0.3)
            r2 = fetch(session, url_tmpl.format(page=2), headers=extra_headers)
        except Exception as e:
            print(f"  - 후보 {i} ({url_tmpl}) 요청 실패: {e}")
            continue

        ids1 = _extract_gi_nos(r1.text)
        ids2 = _extract_gi_nos(r2.text)

        out1 = DEBUG_DIR / f"list_candidate_{i}_page1.html"
        out2 = DEBUG_DIR / f"list_candidate_{i}_page2.html"
        out1.write_text(r1.text, encoding="utf-8")
        out2.write_text(r2.text, encoding="utf-8")

        if not ids1:
            print(f"  - 후보 {i} ({url_tmpl}): 1페이지에서 공고링크 자체를 못 찾음 (실패)")
            continue

        is_different = bool(ids2) and ids1 != ids2
        status = "정상 (페이지마다 다른 공고)" if is_different else "실패 (2페이지가 1페이지와 동일함)"
        print(f"  - 후보 {i} ({url_tmpl})")
        print(f"      1페이지 공고 수: {len(ids1)}건 / 2페이지 공고 수: {len(ids2)}건 -> {status}")

        if is_different:
            working.append(i)

    print()
    if working:
        print(f"[debug] 정상 작동하는 후보 번호: {working} -> --run 실행하면 됩니다.")
    else:
        print("[debug] 모든 후보가 페이지네이션이 안 먹혔어요.")
        print("[debug] data/debug/ 폴더의 list_candidate_*_page1.html / _page2.html 중")
        print("        아무 파일이나 열어서 실제 채용공고가 보이는지 확인해주시고,")
        print("        안 보이면 그 파일 내용 일부를 저한테 보여주세요. 같이 고쳐볼게요.")


def parse_list_page(html: str):
    """리스트 페이지 HTML에서 공고 목록 추출."""
    soup = BeautifulSoup(html, "html.parser")
    jobs = []
    seen_rows = set()

    for a in soup.find_all("a", href=True):
        m = GI_NO_RE.search(a["href"])
        if not m:
            continue
        gi_no = m.group(1)

        row = a.find_parent("tr") or a.find_parent("li") or a.parent
        row_key = id(row)
        if row_key in seen_rows:
            continue
        seen_rows.add(row_key)

        row_text = row.get_text(" ", strip=True) if row else ""

        company_name, company_id = None, None
        comp_a = row.find("a", href=COMPANY_RE) if row else None
        if comp_a:
            company_name = comp_a.get_text(strip=True)
            cm = COMPANY_RE.search(comp_a["href"])
            company_id = cm.group(1) if cm else None

        title = a.get_text(strip=True)

        career_m = re.search(r"(경력\s*무관|신입|경력\s*\d+년\s*[↑~]?\s*\d*년?)", row_text)
        edu_m = re.search(r"(학력무관|고등학교졸업 이하|대학졸업\([^)]+\))", row_text)
        employ_m = re.search(r"(정규직|계약직|인턴직|아르바이트|프리랜서|병역특례|파견직|교육생|헤드헌팅)",
                              row_text)
        deadline_m = re.search(r"(채용시|\d{2}/\d{2}\([가-힣]\)|~\d{2}/\d{2}|\d+일 전|\d+시간 전)",
                                row_text)

        jobs.append({
            "gi_no": gi_no,
            "title": title,
            "company_name": company_name,
            "company_id": company_id,
            "career": career_m.group(1) if career_m else None,
            "education": edu_m.group(1) if edu_m else None,
            "employment_type": employ_m.group(1) if employ_m else None,
            "deadline_raw": deadline_m.group(1) if deadline_m else None,
            "job_function": classify_job_function(title),  # 임시값, enrich_with_categories()가 정확한 값으로 덮어씀
            "job_categories": [],
            "company_logo_url": "",
            "company_ceo": "",
            "company_founded_year": "",
            "company_flagship_games": "",
            "company_homepage": "",
        })

    return jobs


def find_working_url_template(session: requests.Session):
    """1페이지와 2페이지 내용이 실제로 다른, 진짜로 작동하는 후보를 찾음."""
    for url_tmpl in LIST_URL_CANDIDATES:
        extra_headers = request_headers_for(url_tmpl)
        try:
            r1 = fetch(session, url_tmpl.format(page=1), headers=extra_headers)
            ids1 = _extract_gi_nos(r1.text)
            if not ids1:
                continue
            time.sleep(0.3)
            r2 = fetch(session, url_tmpl.format(page=2), headers=extra_headers)
            ids2 = _extract_gi_nos(r2.text)
            if ids2 and ids1 != ids2:
                return url_tmpl
        except Exception:
            continue
    return None


TOTAL_COUNT_RE = re.compile(r"전체\s*\(\s*([\d,]+)\s*\)")


def get_total_count(session: requests.Session):
    """메인 검색 페이지에 표시된 '전체(N)' 숫자를 읽어옴. 실패하면 None."""
    try:
        r = fetch(session, MAIN_LIST_URL)
        text = BeautifulSoup(r.text, "html.parser").get_text(" ", strip=True)
        m = TOTAL_COUNT_RE.search(text)
        if m:
            return int(m.group(1).replace(",", ""))
    except Exception:
        pass
    return None


def crawl_all_listings(max_pages=200, sleep_sec=0.5, verbose=True):
    """모든 페이지를 순회하며 중복 없는 전체 공고 목록을 수집.

    '추천순' 정렬 특성상 광고/추천 공고가 여러 페이지에 걸쳐 겹쳐서 노출될 수
    있어서, 신규 공고가 잠깐 0건인 페이지가 나와도 바로 멈추지 않고
    사이트에 표시된 전체 공고 수(또는 넉넉한 예상 페이지 수)에 도달할 때까지
    계속 진행합니다. 진짜로 내용이 하나도 없는 페이지가 여러 번 나오면 그때
    중단합니다.
    """
    session = make_session()
    all_jobs = {}
    genuinely_empty_streak = 0

    if verbose:
        print("[crawl] 페이지네이션 방식 확인 중...")
    working_url_tmpl = find_working_url_template(session)

    if not working_url_tmpl:
        if verbose:
            print("[crawl] 페이지마다 다른 공고를 주는 URL 패턴을 못 찾았습니다.")
            print("[crawl] python gamejob_tracker.py --debug 를 실행해서 결과를 보내주세요.")
        return []

    if verbose:
        print(f"[crawl] 사용할 URL 패턴: {working_url_tmpl}")

    total_count = get_total_count(session)
    if verbose:
        if total_count:
            print(f"[crawl] 사이트 표시 전체 공고 수: {total_count}건 (이 숫자까지 모으는 것을 목표로 함)")
        else:
            print("[crawl] 사이트 전체 공고 수를 못 읽어옴 (그래도 계속 진행)")

    extra_headers = request_headers_for(working_url_tmpl)
    # 페이지당 건수를 첫 페이지 기준으로 파악해서 예상 마지막 페이지를 넉넉하게 계산
    per_page_guess = 40
    hard_stop_page = max_pages
    if total_count:
        hard_stop_page = min(max_pages, (total_count // per_page_guess) + 15)

    for page in range(1, hard_stop_page + 1):
        html = None
        try:
            r = fetch(session, working_url_tmpl.format(page=page), headers=extra_headers)
            if GI_NO_RE.search(r.text):
                html = r.text
                if page == 1:
                    per_page_guess = max(len(_extract_gi_nos(r.text)), 1)
        except Exception:
            pass

        if not html:
            genuinely_empty_streak += 1
            if verbose:
                print(f"[crawl] page {page}: 데이터 없음 ({genuinely_empty_streak}회 연속)")
            if genuinely_empty_streak >= 3:
                if verbose:
                    print("[crawl] 3페이지 연속 완전히 빈 페이지 -> 진짜 마지막으로 판단, 종료")
                break
            time.sleep(sleep_sec)
            continue

        genuinely_empty_streak = 0
        jobs = parse_list_page(html)
        new_count = 0
        for j in jobs:
            if j["gi_no"] not in all_jobs:
                all_jobs[j["gi_no"]] = j
                new_count += 1

        if verbose:
            print(f"[crawl] page {page}: {len(jobs)}건 파싱 / 신규 {new_count}건 "
                  f"(누적 {len(all_jobs)}건)")

        if total_count and len(all_jobs) >= total_count:
            if verbose:
                print(f"[crawl] 목표 수({total_count}건) 도달 -> 종료")
            break

        time.sleep(sleep_sec)

    if total_count and len(all_jobs) < total_count:
        if verbose:
            print(f"[crawl] 경고: 목표({total_count}건)보다 {total_count - len(all_jobs)}건 적게 모였습니다. "
                  f"--max-pages 값을 늘려서 다시 시도해보세요.")

    return list(all_jobs.values())


# ----------------------------------------------------------------------------
# 저장 / 비교 / 리포트
# ----------------------------------------------------------------------------

FIELDNAMES = ["gi_no", "title", "company_name", "company_id", "career",
              "education", "employment_type", "deadline_raw", "job_function", "job_categories",
              "company_logo_url", "company_ceo", "company_founded_year",
              "company_flagship_games", "company_homepage"]


def save_snapshot(jobs, run_date: str) -> Path:
    path = SNAPSHOT_DIR / f"{run_date}.csv"
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=FIELDNAMES)
        w.writeheader()
        for j in jobs:
            row = {k: j.get(k) for k in FIELDNAMES}
            row["job_categories"] = ";".join(j.get("job_categories") or [])
            w.writerow(row)
    print(f"[save] 스냅샷 저장: {path} ({len(jobs)}건)")
    update_snapshot_manifest()
    return path


def update_snapshot_manifest():
    """data/snapshots/index.json에 현재 존재하는 스냅샷 파일 목록을 기록.
    대시보드(dashboard.html)가 온라인에서 이 목록을 보고 CSV들을 자동으로 불러옵니다."""
    import json
    files = sorted(p.name for p in SNAPSHOT_DIR.glob("*.csv"))
    manifest_path = SNAPSHOT_DIR / "index.json"
    manifest_path.write_text(json.dumps(files, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[save] 매니페스트 갱신: {manifest_path} ({len(files)}개 파일)")


def load_latest_previous_snapshot(before_date: str):
    files = sorted(SNAPSHOT_DIR.glob("*.csv"))
    files = [f for f in files if f.stem < before_date]
    if not files:
        return None
    latest = files[-1]
    with latest.open(encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    return latest.stem, rows


def _write_csv(path: Path, rows):
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=FIELDNAMES)
        w.writeheader()
        for r in rows:
            row = {k: r.get(k) for k in FIELDNAMES}
            if isinstance(row.get("job_categories"), list):
                row["job_categories"] = ";".join(row["job_categories"])
            w.writerow(row)


def generate_report(jobs, run_date: str):
    prev = load_latest_previous_snapshot(run_date)
    current_ids = {j["gi_no"] for j in jobs}

    lines = [f"# 게임잡 채용공고 리포트 ({run_date})\n\n",
             f"- 현재 전체 공고 수: **{len(jobs)}건**\n"]

    if prev:
        prev_date, prev_rows = prev
        prev_ids = {r["gi_no"] for r in prev_rows}
        new_ids = current_ids - prev_ids
        removed_ids = prev_ids - current_ids

        lines.append(f"- 비교 대상 이전 스냅샷: {prev_date}\n")
        lines.append(f"- 신규 등록 공고: **{len(new_ids)}건**\n")
        lines.append(f"- 삭제/마감 처리된 공고: **{len(removed_ids)}건**\n")

        new_jobs = [j for j in jobs if j["gi_no"] in new_ids]
        removed_jobs = [r for r in prev_rows if r["gi_no"] in removed_ids]

        _write_csv(REPORT_DIR / f"{run_date}_new_jobs.csv", new_jobs)
        _write_csv(REPORT_DIR / f"{run_date}_removed_jobs.csv", removed_jobs)
    else:
        lines.append("- 이전 스냅샷 없음 (최초 실행). 다음 달부터 신규/삭제 비교가 가능합니다.\n")

    # 직무별 집계: 한 공고가 여러 직종에 걸쳐있으면(예: "게임개발(클라이언트), 게임개발(모바일)")
    # 게임잡 필터 화면과 똑같이 각 직종에 한 번씩 카운트합니다(그래서 합계가 전체 공고 수보다 클 수 있음).
    func_counter = Counter()
    for j in jobs:
        cats = j.get("job_categories") or [j["job_function"]]
        for c in cats:
            func_counter[c] += 1

    lines.append("\n## 직무별 공고 수\n")
    lines.append("*(공고 하나가 여러 직종에 속할 수 있어서 합계가 전체 공고 수보다 많을 수 있어요)*\n")
    for func, cnt in func_counter.most_common():
        lines.append(f"- {func}: {cnt}건\n")

    company_counter = Counter(j["company_name"] for j in jobs if j["company_name"])
    lines.append("\n## 공고 가장 많은 기업 (상위 10곳)\n")
    for name, cnt in company_counter.most_common(10):
        lines.append(f"- {name}: {cnt}건\n")

    least = sorted(company_counter.items(), key=lambda x: x[1])[:10]
    lines.append("\n## 공고 가장 적은 기업 (하위 10곳)\n")
    for name, cnt in least:
        lines.append(f"- {name}: {cnt}건\n")

    report_path = REPORT_DIR / f"{run_date}_report.md"
    report_path.write_text("".join(lines), encoding="utf-8")
    print(f"[report] 리포트 저장: {report_path}")

    with (REPORT_DIR / f"{run_date}_company_stats.csv").open(
            "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["company_name", "job_count"])
        for name, cnt in company_counter.most_common():
            w.writerow([name, cnt])

    with (REPORT_DIR / f"{run_date}_job_function_stats.csv").open(
            "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["job_function", "job_count"])
        for func, cnt in func_counter.most_common():
            w.writerow([func, cnt])


# ----------------------------------------------------------------------------
# 엔트리포인트
# ----------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="게임잡 채용공고 트래킹 스크립트")
    parser.add_argument("--debug", action="store_true", help="구조 확인용 원본 HTML 저장")
    parser.add_argument("--run", action="store_true", help="크롤링 + 리포트 생성 실행")
    parser.add_argument("--max-pages", type=int, default=200)
    parser.add_argument("--skip-categories", action="store_true",
                         help="정확한 직종(모집분야) 조회를 건너뛰고 제목 키워드 추측만 사용 (빠르지만 부정확)")
    args = parser.parse_args()

    if args.debug:
        debug_dump()
        return

    if args.run:
        run_date = datetime.now().strftime("%Y-%m-%d")
        print(f"[run] {run_date} 크롤링 시작...")
        jobs = crawl_all_listings(max_pages=args.max_pages)
        if not jobs:
            print("[run] 공고를 하나도 못 가져왔습니다. --debug로 구조를 다시 확인해주세요.")
            return

        if not args.skip_categories:
            jobs = enrich_with_categories(jobs)

        jobs = backfill_company_logos(jobs)

        save_snapshot(jobs, run_date)
        generate_report(jobs, run_date)
        return

    parser.print_help()


if __name__ == "__main__":
    main()
