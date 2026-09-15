from collector.http import RespectfulClient


def test_approved_host_can_continue_only_when_robots_is_unavailable(monkeypatch):
    client = RespectfulClient()
    monkeypatch.setenv("ROBOTS_UNAVAILABLE_ALLOWED_HOSTS", "www.gamejob.co.kr")

    def timeout(_url):
        raise RuntimeError("timeout")

    monkeypatch.setattr(client, "_fetch_robots_text", timeout)
    assert client.allowed("https://www.gamejob.co.kr/Recruit/joblist") is True


def test_explicit_robots_disallow_is_never_overridden(monkeypatch):
    client = RespectfulClient()
    monkeypatch.setenv("ROBOTS_UNAVAILABLE_ALLOWED_HOSTS", "www.gamejob.co.kr")
    monkeypatch.setattr(client, "_fetch_robots_text", lambda _url: "User-agent: *\nDisallow: /Recruit/")
    assert client.allowed("https://www.gamejob.co.kr/Recruit/joblist") is False
