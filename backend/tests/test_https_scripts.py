"""scripts/setup-https.sh (local CA + server certificate) and
scripts/nginx-site.sh (which Nginx config to use). Needs bash and openssl."""
import os
import shutil
import subprocess

import pytest

from tests.test_scripts import BASH, REPO

OPENSSL = shutil.which("openssl")
pytestmark = pytest.mark.skipif(not BASH or not OPENSSL, reason="needs bash and openssl")


def run(script, tls_dir, **env):
    r = subprocess.run([BASH, f"scripts/{script}"], cwd=REPO, capture_output=True, text=True,
                       env=dict(os.environ, PM_TLS_DIR=str(tls_dir).replace("\\", "/"), **env))
    assert r.returncode == 0, r.stdout + r.stderr
    return r.stdout


def openssl(*args):
    return subprocess.run([OPENSSL, *args], capture_output=True, text=True).stdout


def test_ca_and_server_certificate(tmp_path):
    tls = tmp_path / "tls"
    out = run("setup-https.sh", tls, PM_TLS_IPS="10.1.2.3 127.0.0.1", PM_TLS_NAMES="pm.test")
    assert "Created local CA" in out and "Issued server certificate" in out
    ca, crt = tls / "ca.crt", tls / "server.crt"
    assert "OK" in openssl("verify", "-CAfile", str(ca), str(crt))
    san = openssl("x509", "-in", str(crt), "-noout", "-ext", "subjectAltName")
    assert "IP Address:10.1.2.3" in san and "DNS:pm.test" in san and "DNS:localhost" in san
    assert "CA:TRUE" in openssl("x509", "-in", str(ca), "-noout", "-ext", "basicConstraints")
    if os.name == "posix":
        assert oct((tls / "server.key").stat().st_mode & 0o777) == "0o600"
        assert oct((tls / "ca.key").stat().st_mode & 0o777) == "0o600"

    # second run: nothing to do
    before = crt.read_bytes()
    assert "up to date" in run("setup-https.sh", tls, PM_TLS_IPS="10.1.2.3 127.0.0.1", PM_TLS_NAMES="pm.test")
    assert crt.read_bytes() == before

    # new IP: new server certificate from the same CA
    ca_before = ca.read_bytes()
    out = run("setup-https.sh", tls, PM_TLS_IPS="10.9.9.9 127.0.0.1", PM_TLS_NAMES="pm.test")
    assert "names/addresses changed" in out
    assert ca.read_bytes() == ca_before and crt.read_bytes() != before
    assert "IP Address:10.9.9.9" in openssl("x509", "-in", str(crt), "-noout", "-ext", "subjectAltName")
    assert "OK" in openssl("verify", "-CAfile", str(ca), str(crt))

    # extra names are remembered for runs without PM_TLS_NAMES (updates)
    env = {k: v for k, v in os.environ.items() if k != "PM_TLS_NAMES"}
    r = subprocess.run([BASH, "scripts/setup-https.sh"], cwd=REPO, capture_output=True, text=True,
                       env=dict(env, PM_TLS_DIR=str(tls).replace("\\", "/"), PM_TLS_IPS="10.9.9.9 127.0.0.1"))
    assert r.returncode == 0 and "up to date" in r.stdout, r.stdout + r.stderr


def test_nginx_site_picks_https_when_ready(tmp_path):
    conf, tls = tmp_path / "conf", tmp_path / "tls"
    conf.mkdir()
    env = {"PM_CONF_DIR": str(conf).replace("\\", "/"), "PM_APP_DIR": "/srv/pm"}
    plain = run("nginx-site.sh", tls, **env)
    assert "listen 443" not in plain and "root /srv/pm/frontend/build;" in plain  # no certificate yet

    run("setup-https.sh", tls, PM_TLS_IPS="127.0.0.1")
    https = run("nginx-site.sh", tls, **env)
    tls_path = str(tls).replace("\\", "/")
    assert "listen 443 ssl" in https and f"ssl_certificate {tls_path}/server.crt;" in https
    assert "return 301 https://" in https and "root /srv/pm/frontend/build;" in https
    assert f"alias {tls_path}/ca.crt;" in https

    (conf / "no-https").touch()
    assert "listen 443" not in run("nginx-site.sh", tls, **env)


def test_templates_share_the_app_locations():
    """Both configs must serve the same app; only TLS and redirects differ."""
    plain = (REPO / "deploy" / "nginx.conf").read_text()
    https = (REPO / "deploy" / "nginx-https.conf").read_text()
    for needle in ("location /api/", "location /static/", "try_files $uri /index.html;", "client_max_body_size 100M;",
                   "proxy_set_header X-Forwarded-Proto $scheme;"):
        assert needle in plain and needle in https, needle
