from app.services.response_reports import compute_question_aggregate


def test_compute_question_aggregate_nps() -> None:
    question = {
        "question_key": "nps_score",
        "question_type": "nps",
        "prompt": "How likely?",
        "sort_order": 0,
        "options": [],
    }
    entries = [(9, False), (10, False), (8, False)]
    out = compute_question_aggregate(
        question=question,
        question_key="nps_score",
        stored_type="nps",
        entries=entries,
        total_responses_in_cohort=3,
    )
    assert out["average"] == 9.0
    assert out["min_value"] == 8.0
    assert out["max_value"] == 10.0
    assert len(out["distribution"]) == 3


def test_compute_question_aggregate_legacy_key() -> None:
    out = compute_question_aggregate(
        question=None,
        question_key="old_field",
        stored_type="single_selection",
        entries=[("a", False), ("b", False), ("a", False)],
        total_responses_in_cohort=4,
    )
    assert out["prompt"] == "old_field"
    assert out["sort_order"] == 9999
    assert len(out["choice_counts"]) == 2


def test_compute_question_aggregate_unknown_type_coerces_to_fallback() -> None:
    question = {
        "question_key": "x",
        "question_type": "plain_text",
        "prompt": "Notes",
        "sort_order": 0,
        "options": [],
    }
    out = compute_question_aggregate(
        question=question,
        question_key="x",
        stored_type="plain_text",
        entries=[(" hello ", False), ("", False)],
        total_responses_in_cohort=3,
    )
    assert out["text_sample_count"] == 2
    assert len(out["text_samples"]) >= 1
