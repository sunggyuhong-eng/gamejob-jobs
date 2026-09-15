from collector.models import JobPosting
from collector.pipeline import collect_all


def test_news_failure_does_not_discard_hiring_data(monkeypatch):
    class Jobs:
        def collect(self, enrich_companies=False):
            return [JobPosting(id="1", company="A", title="개발자", url="https://example.com/1")]

    class BrokenNews:
        def collect(self):
            raise RuntimeError("temporary news error")

    monkeypatch.setattr("collector.pipeline.GameJobAdapter", Jobs)
    monkeypatch.setattr("collector.pipeline.GameJobNewsAdapter", BrokenNews)
    jobs, news, status = collect_all(include_report_news=True)

    assert len(jobs) == 1
    assert news == []
    assert status["success"] is True
    assert status["sources"][-1]["status"] == "failed"
