"""Shim so older pip can run `pip install -e .`; full config is in pyproject.toml."""

from setuptools import setup

if __name__ == "__main__":
    setup()
