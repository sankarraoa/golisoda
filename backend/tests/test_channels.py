import re

from app.services.channels import generate_channel_code


def test_channel_code_is_short_url_safe_and_high_entropy() -> None:
    codes = {generate_channel_code() for _ in range(100)}

    assert len(codes) == 100
    for code in codes:
        assert 8 <= len(code) <= 16
        assert re.fullmatch(r"[A-Za-z0-9_-]+", code)
