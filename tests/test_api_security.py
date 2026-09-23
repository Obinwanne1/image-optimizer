import io

from conftest import make_image_bytes

# End-to-end regression test for the path-traversal fix, exercised through the real HTTP
# routes rather than calling SessionStore directly -- confirms the fix is actually wired into
# the endpoint an attacker would hit, not just into the store's internals.


def _upload(client, name="photo.png"):
    data = {"file": (io.BytesIO(make_image_bytes()), name)}
    resp = client.post("/api/upload", data=data, content_type="multipart/form-data")
    assert resp.status_code == 201
    return resp.get_json()["image_id"]


def test_delete_session_traversal_id_returns_404_not_500(client):
    resp = client.delete("/api/session/..")
    assert resp.status_code == 404
    assert resp.get_json()["error"]["code"] == "session_not_found"


def test_delete_session_traversal_does_not_affect_real_session(client, app):
    image_id = _upload(client)

    resp = client.delete("/api/session/..")
    assert resp.status_code == 404

    # the real session must be untouched by the traversal attempt
    resp = client.get(f"/api/image-info/{image_id}")
    assert resp.status_code == 200


def test_delete_session_with_real_id_works(client):
    image_id = _upload(client)
    resp = client.delete(f"/api/session/{image_id}")
    assert resp.status_code == 200
    assert resp.get_json()["deleted"] == image_id

    resp = client.get(f"/api/image-info/{image_id}")
    assert resp.status_code == 404


def test_image_info_rejects_malformed_id(client):
    resp = client.get("/api/image-info/not-a-real-id")
    assert resp.status_code == 404
