from enum import StrEnum


class Role(StrEnum):
    REVIEWER = "reviewer"
    ANALYST = "analyst"
    OBSERVER = "observer"


class RunStatus(StrEnum):
    QUEUED = "queued"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class Outcome(StrEnum):
    ACCEPT = "accept"
    RETEST = "retest"
    REJECT = "reject"


MIN_SAMPLES = 3
MAX_SAMPLES = 250
ALGORITHM_VERSION = "weighted-tail-v1"
