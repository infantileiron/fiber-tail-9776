from datetime import date
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StringConstraints, model_validator

from src.constants.domain import Outcome

Code = Annotated[str, StringConstraints(min_length=2, max_length=32, pattern=r"^[A-Z0-9][A-Z0-9-]+$")]
ShortText = Annotated[str, StringConstraints(min_length=1, max_length=80)]
Percent = Annotated[Decimal, Field(ge=0, le=100, max_digits=5, decimal_places=2)]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)


class Login(Input):
    username: ShortText
    password: Annotated[str, Field(min_length=1, max_length=128)]

    model_config = ConfigDict(str_strip_whitespace=False)


class LotInput(Input):
    code: Code
    supplier: ShortText
    material: ShortText
    received_on: date
    shipment_kg: Annotated[StrictInt, Field(gt=0, le=100_000)]


class SampleInput(Input):
    code: Code
    location: ShortText
    dry_g: Annotated[StrictInt, Field(gt=0, le=100_000)]
    impurity_g: Annotated[StrictInt, Field(ge=0, le=100_000)]

    @model_validator(mode="after")
    def validate_weights(self):
        if self.impurity_g > self.dry_g:
            raise ValueError("杂质重量不得超过干样重量")
        return self


class RunInput(Input):
    threshold_pct: Percent = Decimal("3")
    tail_pct: Annotated[Percent, Field(gt=0)] = Decimal("15")
    exceed_cap_pct: Percent = Decimal("20")
    tail_cap_pct: Percent = Decimal("8")


class DecisionInput(Input):
    outcome: Outcome
    rationale: Annotated[str, StringConstraints(min_length=4, max_length=400)]
