from app.utils.answer_validation import validated_email_normalized, validated_phone_normalized, validated_short_text


def test_short_text_strips_and_rejects_overflow() -> None:
    assert validated_short_text("  hi  ") == "hi"
    assert validated_short_text("x" * 2048) is not None
    assert validated_short_text("x" * 2049) is None


def test_phone_normalized() -> None:
    assert validated_phone_normalized("") == ""
    assert validated_phone_normalized("   ") == ""
    assert validated_phone_normalized("+44 7911 123456") == "+447911123456"
    assert validated_phone_normalized("(555) 123-4567") == "5551234567"
    assert validated_phone_normalized("abcd") is None
    assert validated_phone_normalized("+") is None
    assert validated_phone_normalized("123") is None


def test_email_normalized() -> None:
    assert validated_email_normalized("") == ""
    assert validated_email_normalized("  Jane@Example.COM ") == "Jane@example.com"
    assert validated_email_normalized("not-email") is None
