from alembic.config import Config
from alembic.script import ScriptDirectory


def test_alembic_graph_has_single_merged_head() -> None:
    script = ScriptDirectory.from_config(Config("alembic.ini"))

    assert script.get_heads() == ["d5e6f7a8b9c0"]
    assert script.get_revision("8c10a5c2b7d1") is not None

    merge_revision = script.get_revision("c4d5e6f7a8b9")
    assert merge_revision is not None
    assert set(merge_revision.module.down_revision) == {
        "b7c8d9e0f1a2",
        "8c10a5c2b7d1",
    }

    ev_power_revision = script.get_revision("d5e6f7a8b9c0")
    assert ev_power_revision is not None
    assert ev_power_revision.module.down_revision == "c4d5e6f7a8b9"
