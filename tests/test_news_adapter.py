from collector.adapters.news import GameJobNewsAdapter, classify_issue


class Response:
    def __init__(self, page: int):
        self.url = f"https://www.gamejob.co.kr/Community/news?Comm_Stat=0&NowPage={page}"
        self.text = f"""
        <ul>
          <li><a href='/Community/news/detail?idx={page}'>
            <strong>테스트게임즈 신작 프로젝트 출시 소식 {page}</strong>
            <p>게임 프로젝트 관련 짧은 설명</p><time>2099-09-15</time>
          </a></li>
          <li><a href='/Community/news/detail?idx=999'><strong>날짜 없는 주간 인기 뉴스</strong></a></li>
        </ul>
        """


class Client:
    def __init__(self):
        self.pages = []

    def get(self, url: str):
        page = int(url.split("NowPage=")[-1]) if "NowPage=" in url else 1
        self.pages.append(page)
        return Response(page)


def test_gamejob_news_paginates_and_skips_undated_items():
    adapter = GameJobNewsAdapter(client=Client())
    adapter.max_pages = 3
    items = adapter.collect()
    assert len(items) == 3
    assert all(item.published_at == "2099-09-15" for item in items)


def test_issue_classification_for_project_events():
    assert classify_issue("대형 신작 정식 출시") == "신작 출시"
    assert classify_issue("프로젝트 개발 중단 발표") == "프로젝트 중단"
