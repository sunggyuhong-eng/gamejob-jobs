import json

from collector.adapters.gamejob import GameJobAdapter
from collector.models import JobPosting


class Response:
    def __init__(self, text: str, url: str = "https://www.gamejob.co.kr/Recruit/joblist"):
        self.text, self.url = text, url


class FakeClient:
    def __init__(self):
        self.calls = 0

    def get(self, _url):
        self.calls += 1
        return Response("""
            <table class="tblList"><tbody>
              <tr><td><div class="company"><a href="/Company/Detail?M=1"><strong>(주)넥슨코리아</strong></a></div></td>
              <td><div class="tit"><a href="/Recruit/GI_Read/View?GI_No=101" onclick="x(IsNullOrWhiteSpace('게임제작, 서버'))"><strong>서버 개발자</strong></a>
              <p class="info"><span>경력3년↑</span><span>학력무관</span><span>서울 &gt; 강남구</span><span>온라인PC게임</span><span>정규직</span></p></div></td>
              <td><span class="date">~09/30</span><span class="modifyDate">09/01 등록</span></td></tr>
            </tbody></table>""")

    def post(self, _url, **_kwargs):
        self.calls += 1
        return Response("<html><body>끝</body></html>")


def test_adapter_parses_current_listing_structure():
    client = FakeClient()
    jobs = GameJobAdapter(client=client).collect()
    assert client.calls == 2
    assert len(jobs) == 1
    assert jobs[0].company == "넥슨코리아"
    assert jobs[0].id.endswith(":101")
    assert jobs[0].categories == ["게임제작"]
    assert jobs[0].job_subcategories == ["서버"]
    assert jobs[0].career == "경력3년↑"
    assert jobs[0].location == "서울 > 강남구"
    assert jobs[0].employment_type == "정규직"
    assert jobs[0].company_url.endswith("/Company/Detail?M=1")


def test_company_profile_fields():
    html = """<div class="corpHeader"><span class="corpLogo"><img src="https://img.example/logo.png"></span></div>
    <div class="corpInfo"><dl><dt>설립년도</dt><dd>2020년</dd><dt>사원수</dt><dd>300명</dd>
    <dt>기업형태</dt><dd>중견기업</dd><dt>대표게임</dt><dd>대표작</dd><dt>주요사업</dt><dd>게임개발</dd></dl></div>"""

    class CompanyClient:
        def get(self, url): return Response(html, url)

    profile = GameJobAdapter(client=CompanyClient())._company_profile("https://www.gamejob.co.kr/Company/Detail?M=1")
    assert profile["representative_game"] == "대표작"
    assert profile["employee_count"] == "300명"
    assert profile["logo_url"] == "https://img.example/logo.png"


def test_daily_collection_reuses_cached_company_profile(tmp_path):
    cache = tmp_path / "company-profiles.json"
    company_url = "https://www.gamejob.co.kr/Company/Detail?M=1"
    cache.write_text(json.dumps({company_url: {
        "logo_url": "https://img.example/2026\\logo.png",
        "representative_game": "대표게임",
    }}, ensure_ascii=False), encoding="utf-8")
    adapter = GameJobAdapter(client=FakeClient())
    adapter.profile_cache_path = cache
    job = JobPosting(id="1", company="A", title="T", url="https://example.com", company_url=company_url)
    adapter._apply_company_profiles([job], fetch_missing=False)
    assert job.logo_url == "https://img.example/2026/logo.png"
    assert job.representative_game == "대표게임"
