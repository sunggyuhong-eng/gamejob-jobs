"""
gamejob_talent_search.py
게임잡(gamejob.co.kr) 인재검색 결과를 직무/경력 필터로 직접 조회하는 스크립트

원리
----
브라우저에서 인재검색 페이지의 직무/경력 체크박스를 클릭하면,
"_Resume_List/" 라는 주소로 그 조건(SearchCondition[duty], SearchCondition[career] 등)이
그대로 담긴 POST 요청이 나가고, 그 응답으로 검색 결과 HTML이 옵니다.
이 스크립트는 그 요청을 그대로 재현합니다 (채용공고 스크립트가 페이지네이션을
재현했던 것과 같은 원리입니다).

사용 전 꼭 확인할 것: 직무(duty) 코드 알아내기
------------------------------------------------
1. https://www.gamejob.co.kr/Corp/Person/Find 접속
2. F12 → Network 탭 → 원하는 직무 체크박스 클릭
3. 새로 생긴 요청 중 아무거나(SetSearchSave 또는 _Resume_List) 클릭 → Payload 탭에서
   "SearchCondition[duty]" 값 확인 → 아래 DUTY_CODE 에 그 숫자를 넣으세요.
4. 경력도 필요하면 경력 체크박스 클릭 후 "SearchCondition[career]" 값을 확인해서
   CAREER_CODE 에 넣으세요 (형식 예: "5_99" = 5년 이상).

사용법
------
    pip install requests beautifulsoup4

    python gamejob_talent_search.py --duty 1 --career 5_99
    python gamejob_talent_search.py --duty 1 --pages 3          # 여러 페이지 조회
    python gamejob_talent_search.py --duty 1 --out result.csv   # CSV로 저장

로그인이 필요한 경우
--------------------
스크립트를 그냥 돌렸는데 결과가 0건이거나 이상하면, 로그인 세션이 필요한 것일 수
있습니다. 그럴 때는:
1. 브라우저에서 로그인한 상태로 인재검색 페이지 접속
2. F12 → Network 탭 → 아무 요청이나 클릭 → Headers 탭에서 "Cookie" 값 전체 복사
3. 이 파일 아래쪽 COOKIE_STRING 변수에 큰따옴표 안에 붙여넣기
"""

import argparse
import csv
import time

import requests
from bs4 import BeautifulSoup

BASE = "https://www.gamejob.co.kr"
RESUME_LIST_URL = BASE + "/Corp/Person/_Resume_List/"
RESUME_VIEW_URL = BASE + "/User/Resume/View?R_No={r_no}&callMenu=Search"

# 로그인이 필요할 경우, 브라우저에서 복사한 Cookie 값을 여기에 붙여넣으세요.
# (필요 없으면 빈 문자열로 두세요)
COOKIE_STRING = ""

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Referer": BASE + "/Corp/Person/Find",
    "Origin": BASE,
    "X-Requested-With": "XMLHttpRequest",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
}


def make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update(HEADERS)
    if COOKIE_STRING.strip():
        # "key1=val1; key2=val2" 형태의 쿠키 문자열을 그대로 세션에 반영
        for part in COOKIE_STRING.split(";"):
            if "=" in part:
                k, v = part.strip().split("=", 1)
                s.cookies.set(k, v)
    # 먼저 검색 페이지를 한 번 방문해서 기본 쿠키를 확보
    try:
        s.get(BASE + "/Corp/Person/Find", timeout=15)
    except Exception:
        pass
    return s


def fetch_resume_page(session: requests.Session, duty: str, career: str, page: int, pagesize: int):
    payload = {
        "isDefault": "true",
        "SearchCondition[duty]": duty or "",
        "SearchCondition[career]": career or "",
        "SearchCondition[mcode]": "",
        "SearchCondition[tabcode]": "1",
        "tabcode": "1",
        "page": str(page),
        "direct": "0",
        "order": "1",
        "pagesize": str(pagesize),
    }
    r = session.post(RESUME_LIST_URL, data=payload, timeout=20)
    r.raise_for_status()
    return r.text


def parse_resume_list_html(html: str):
    soup = BeautifulSoup(html, "html.parser")
    rows = soup.select(".resume-search-list table tbody tr")
    if not rows:
        rows = soup.select("table tbody tr")

    results = []
    for tr in rows:
        link_el = tr.select_one(".title a") or tr.find("a", href=lambda h: h and "Resume/View" in h)
        if not link_el:
            continue

        href = link_el.get("href", "")
        if href.startswith("/"):
            href = BASE + href
        elif href and not href.startswith("http"):
            href = BASE + "/" + href

        name_el = tr.select_one(".info .name")
        gender_el = tr.select_one(".info .gender")
        age_el = tr.select_one(".info .age")
        career_badge = tr.select_one(".badge-career")
        etc_cells = tr.select(".etc .cell")
        career_cells = tr.select(".career .cell, .career .cell-corp-name, .career span")
        keywords_el = tr.select_one(".keywords")
        update_el = tr.select_one(".update")

        results.append({
            "name": name_el.get_text(strip=True) if name_el else "",
            "gender": gender_el.get_text(strip=True) if gender_el else "",
            "age": age_el.get_text(strip=True) if age_el else "",
            "career_badge": career_badge.get_text(strip=True) if career_badge else "",
            "title": link_el.get_text(strip=True),
            "link": href,
            "etc": " | ".join(c.get_text(strip=True) for c in etc_cells),
            "company_info": " · ".join(c.get_text(strip=True) for c in career_cells),
            "keywords": keywords_el.get_text(strip=True) if keywords_el else "",
            "update": update_el.get_text(strip=True) if update_el else "",
        })
    return results


def search_talent(duty: str, career: str, pages: int, pagesize: int, sleep_sec: float = 0.6, verbose: bool = True):
    session = make_session()
    all_results = []
    seen_links = set()

    for page in range(1, pages + 1):
        if verbose:
            print(f"[search] {page}페이지 조회 중... (duty={duty}, career={career})")
        html = fetch_resume_page(session, duty, career, page, pagesize)
        jobs = parse_resume_list_html(html)

        if not jobs:
            if verbose:
                print(f"[search] {page}페이지에서 결과 없음 → 종료")
            break

        new_count = 0
        for j in jobs:
            if j["link"] not in seen_links:
                seen_links.add(j["link"])
                all_results.append(j)
                new_count += 1

        if verbose:
            print(f"[search] {page}페이지: {len(jobs)}건 (신규 {new_count}건, 누적 {len(all_results)}건)")

        if new_count == 0:
            break

        time.sleep(sleep_sec)

    return all_results


def save_csv(results, path):
    fieldnames = ["name", "gender", "age", "career_badge", "title", "link",
                  "etc", "company_info", "keywords", "update"]
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in results:
            w.writerow(r)
    print(f"[save] 저장 완료: {path} ({len(results)}건)")


def main():
    parser = argparse.ArgumentParser(description="게임잡 인재검색 필터 조회 스크립트")
    parser.add_argument("--duty", default="", help="직무 코드 (Network 탭에서 확인, 예: 1)")
    parser.add_argument("--career", default="", help="경력 코드 (예: 5_99 = 5년 이상)")
    parser.add_argument("--pages", type=int, default=200, help="최대 조회 페이지 수 (기본 200 = 사실상 끝까지)")
    parser.add_argument("--pagesize", type=int, default=100, help="페이지당 건수 (30/50/100, 기본 100)")
    parser.add_argument("--out", default="", help="결과를 저장할 CSV 파일 경로")
    args = parser.parse_args()

    if not args.duty and not args.career:
        print("[안내] --duty 또는 --career 중 하나는 지정해주세요.")
        print("       (Network 탭에서 SearchCondition[duty] / SearchCondition[career] 값을 확인하세요)")
        return

    results = search_talent(args.duty, args.career, args.pages, args.pagesize)

    if not results:
        print("\n[결과] 조회된 인재가 없어요.")
        print("       - 코드가 정확한지, 로그인이 필요한 상황은 아닌지 확인해보세요.")
        print("       - 로그인이 필요하면 파일 상단 COOKIE_STRING에 브라우저 쿠키를 넣어보세요.")
        return

    print(f"\n[결과] 총 {len(results)}명 조회됨\n")
    for r in results:
        print(f"- [{r['career_badge']}] {r['title']}  ({r['company_info']})")
        print(f"  키워드: {r['keywords']}")
        print(f"  링크: {r['link']}\n")

    if args.out:
        save_csv(results, args.out)


if __name__ == "__main__":
    main()
