from __future__ import annotations

from abc import ABC, abstractmethod

from collector.http import RespectfulClient


class Adapter(ABC):
    name = "unknown"

    def __init__(self, client: RespectfulClient | None = None):
        self.client = client or RespectfulClient()

    @abstractmethod
    def collect(self):
        raise NotImplementedError

