"""A single local structured retry; valid answers retain their interpretation."""


def classify_output(generate_raw, validate_raw):
    """Callbacks keep inference/model policy outside the output validator.

    generate_raw(constrained: bool) must use the same local model and prompt.
    Generation errors propagate. Only validation errors permit one retry.
    Returns (validated advice, structured retry used).
    """
    raw = generate_raw(False)
    try:
        return validate_raw(raw), False
    except (ValueError, TypeError):
        # The retry is outside the try: a second invalid result must fail closed.
        return validate_raw(generate_raw(True)), True
