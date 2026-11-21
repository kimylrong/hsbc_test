import httpx


class ModelClientError(RuntimeError):
    """上游 Task 1 模型服务不可达或返回错误。"""


class ModelClient:
    def __init__(self, base_url: str, timeout: float = 10.0) -> None:
        self._client = httpx.AsyncClient(base_url=base_url.rstrip("/"), timeout=timeout)

    async def predict(self, features: dict) -> float:
        try:
            resp = await self._client.post("/predict", json=features)
        except httpx.HTTPError as exc:
            raise ModelClientError(f"Model service unreachable: {exc}") from exc
        if resp.status_code != 200:
            raise ModelClientError(f"Model service returned {resp.status_code}")
        return float(resp.json()["price"])

    async def close(self) -> None:
        await self._client.aclose()