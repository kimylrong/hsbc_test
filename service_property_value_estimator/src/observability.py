import contextvars
import json
import logging

from prometheus_client import Counter, Histogram

SERVICE_NAME = "property-value-estimator"
_BUCKETS = (0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1.0, 2.5, 5.0, 7.5, 10.0, 30.0, 60.0)

trace_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar("trace_id", default=None)

http_requests_total = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["service", "endpoint", "method", "status_code"],
)

http_request_duration = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency",
    ["service", "endpoint", "method", "status_code"],
    buckets=_BUCKETS,
)


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "service": SERVICE_NAME,
            "logger": record.name,
            "file.name": record.filename,
            "line.number": record.lineno,
            "function.name": record.funcName,
            "message": record.getMessage(),
        }
        for field in ("trace_id", "method", "path", "status_code", "latency_ms"):
            value = getattr(record, field, None)
            if value is not None:
                entry[field] = value
        if record.exc_info:
            entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(entry)


class _TraceAdapter(logging.LoggerAdapter):
    def process(self, msg, kwargs):
        extra = kwargs.setdefault("extra", {})
        if "trace_id" not in extra:
            extra["trace_id"] = trace_id_var.get() or None
        return msg, kwargs


def configure_logging() -> logging.LoggerAdapter:
    handler = logging.StreamHandler()
    handler.setFormatter(_JsonFormatter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)

    logger = logging.getLogger(__name__)
    return _TraceAdapter(logger, {})