from typing import Optional, Any

from coloradomesh.emojis import EmojiTools
from coloradomesh.meshcore.models.general import RepeaterType, CompanionType
from pydantic import BaseModel, model_validator, Field, field_validator, ValidationInfo


class UserRepeaterInformation(BaseModel):
    mountain: str = Field(alias="mountain",
                          default=None)  # <=5-char mountain code, optional since users may be using city+landmark combo instead
    city: Optional[str] = Field(alias="city",
                                default=None)  # <=5-char city code, optional since users may be using mountain instead
    landmark: str = Field(alias="landmark",
                          default=None)  # <=5-char landmark code, optional since users may be using mountain instead
    node_type: RepeaterType = Field(alias="node-type")
    public_key_id: Optional[str] = Field(alias="public-key-id")  # Pre-filled public key ID suggestion from GUI

    @model_validator(mode="after")
    def validate_model(self):
        # If city or landmark provided, need both, both <=5 chars
        if any([self.city, self.landmark]):
            if not all([self.city, self.landmark]):
                raise ValueError("Both city and landmark must be provided if one of them is provided")
            if len(self.city) > 5:  # This is restricted to a dropdown on the UI, so this shouldn't happen
                raise ValueError("City code must be up to 5 characters long")
            if len(self.landmark) > 5:
                raise ValueError("Landmark code must be up to 5 characters long")
        # If mountain provided, need <=7 chars
        elif self.mountain:
            if len(self.mountain) > 7:  # This is restricted to a dropdown on the UI, so this shouldn't happen
                raise ValueError("Mountain code must be up to 7 characters long")

        return self

    def generate_name(self, region_code: str, public_key_id: str) -> str:
        from coloradomesh.meshcore.models.general import RepeaterName

        return RepeaterName(
            **dict(
                repeater_type=self.node_type,
                region=region_code,
                city=self.city,
                landmark=self.landmark if self.city else self.mountain,
                # Mountain will be the "landmark" if not using city
                public_key_id=public_key_id
            )
        ).formatted


class UserCompanionInformation(BaseModel):
    handle: str = Field(alias="handle")  # The handle or name of the companion device owner (e.g. "Alice")
    emoji: Optional[str] = Field(alias="emoji", default=None)  # Optional emoji prefix for companion names
    role_type: Optional[CompanionType] = Field(alias="role-type", default=None)  # Optional role type
    role_counter: Optional[int] = Field(alias="suffix-number",
                                        default=None)  # Optional counter to denote importance of device

    @field_validator('role_counter', mode='before')
    @classmethod
    def validate_role_counter(cls, value: Any) -> Any:
        if isinstance(value, str) and not value:  # Replace string with None if it's an empty string
            return None

        return value

    @model_validator(mode="after")
    def validate_model(self, info: ValidationInfo):
        context = info.context if isinstance(info.context, dict) else {}

        # With (optional) 4-char emoji and <=4-char suffix, plus spaces, handle must be <=10 chars for 23 char limit
        if len(self.handle) > 10:
            raise ValueError("Handle must be up to 10 characters long")

        if self.emoji:
            emoji_tools: EmojiTools = context.get('emoji_tools', None)
            if emoji_tools and not emoji_tools.validate_emoji_unicode(self.emoji):
                raise ValueError("Invalid emoji provided")

        if self.role_counter and not (1 <= self.role_counter <= 99):
            raise ValueError("Role counter must be between 1 and 99")

        return self

    def generate_name(self, public_key_id: str) -> str:
        from coloradomesh.meshcore.models.general import CompanionName

        return CompanionName(
            **dict(
                handle=self.handle,
                emoji=self.emoji,
                role_type=self.role_type,
                role_counter=self.role_counter,
                public_key_id=public_key_id
            )
        ).formatted
