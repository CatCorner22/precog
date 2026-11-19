#!/usr/bin/env bash
set -euo pipefail
set +x

fail() {
  printf 'Precog bootstrap: %s\n' "$*" >&2
  exit 1
}

[[ $EUID == 0 ]] || fail 'Run this script with sudo.'
[[ $# == 1 && $1 =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ ]] ||
  fail 'Usage: sudo bash bootstrap-wsl.sh BRANCH_TAG_OR_COMMIT'
. /etc/os-release
[[ $ID == ubuntu && $VERSION_CODENAME == noble ]] || fail 'Use Ubuntu 24.04.'
systemctl show-environment >/dev/null || fail 'Start Ubuntu with systemd enabled.'

repo=https://github.com/CatCorner22/precog.git
checkout=/opt/precog
settings=/etc/precog/precog.env
export DEBIAN_FRONTEND=noninteractive

apt-get -o APT::Update::Error-Mode=any update
apt-get install -y --no-install-recommends ca-certificates curl git gnupg openssl
install -d -m 0755 /etc/apt/keyrings /etc/apt/sources.list.d
scratch=$(mktemp -d /opt/precog-bootstrap.XXXXXX)
trap 'rm -rf -- "$scratch"' EXIT

curl -fsSL --retry 3 https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key |
  gpg --batch --dearmor > "$scratch/nodesource.gpg"
curl -fsSL --retry 3 https://www.postgresql.org/media/keys/ACCC4CF8.asc -o "$scratch/pgdg.asc"
curl -fsSL --retry 3 https://pkg.cloudflare.com/cloudflare-main.gpg -o "$scratch/cloudflare.gpg"
install -m 0644 "$scratch/"{nodesource.gpg,pgdg.asc,cloudflare.gpg} /etc/apt/keyrings/
printf '%s\n' 'deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main' > /etc/apt/sources.list.d/precog-nodesource.list
printf '%s\n' 'deb [signed-by=/etc/apt/keyrings/pgdg.asc] https://apt.postgresql.org/pub/repos/apt noble-pgdg main' > /etc/apt/sources.list.d/precog-pgdg.list
printf '%s\n' 'deb [signed-by=/etc/apt/keyrings/cloudflare.gpg] https://pkg.cloudflare.com/cloudflared noble main' > /etc/apt/sources.list.d/precog-cloudflared.list

apt-get -o APT::Update::Error-Mode=any update
apt-get install -y --no-install-recommends 'nodejs=22.*' postgresql-16 postgresql-client-16 cloudflared
systemctl enable --now postgresql.service

[[ ! -L $checkout ]] || fail "$checkout is a symbolic link."
if [[ ! -e $checkout ]]; then
  git clone --no-checkout "$repo" "$checkout"
else
  [[ -d $checkout/.git && $(git -C "$checkout" remote get-url origin) == "$repo" ]] ||
    fail "$checkout is not a checkout of $repo."
  [[ -z $(git -C "$checkout" status --porcelain) ]] ||
    fail "$checkout has local changes. Preserve them before rerunning."
fi
cd "$checkout"
git fetch --no-tags origin "$1"
git switch --detach FETCH_HEAD
[[ -f deploy/self-host/install.sh ]] || fail 'This ref does not contain the self-hosting installer.'

if ! id precog-build >/dev/null 2>&1; then
  useradd --system --user-group --home-dir /nonexistent --shell /usr/sbin/nologin precog-build
fi
chmod 0711 "$scratch"
install -d -m 0700 -o precog-build -g precog-build "$scratch/build"
git archive HEAD | runuser -u precog-build -- tar -xf - -C "$scratch/build"
(
  cd "$scratch/build"
  runuser -u precog-build -- env HOME="$scratch/build" npm ci
  runuser -u precog-build -- env -u VERCEL_ENV -u VERCEL \
    HOME="$scratch/build" PRECOG_BUILD_TARGET=node-server npm run build
)

runuser -u postgres -- psql --no-psqlrc --set ON_ERROR_STOP=1 --dbname=postgres <<'SQL'
SELECT 'CREATE ROLE precog LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'precog')
\gexec
SELECT 'CREATE DATABASE precog OWNER precog' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'precog')
\gexec
SQL

if [[ ! -e $settings ]]; then
  install -d -m 0750 /etc/precog
  (
    umask 077
    set -o noclobber
    auth_secret=$(openssl rand -hex 32)
    cron_secret=$(openssl rand -hex 32)
    printf '%s\n' \
      'DATABASE_URL=postgresql:///precog?host=/var/run/postgresql&user=precog' \
      'BETTER_AUTH_URL=http://localhost:8080' \
      "BETTER_AUTH_SECRET=$auth_secret" "CRON_SECRET=$cron_secret" > "$settings"
  )
fi

for name in .output node_modules; do
  [[ -d $scratch/build/$name && ! -L $scratch/build/$name ]] ||
    fail "The build did not produce $name."
done
if systemctl is-active --quiet precog.service; then
  systemctl stop precog.service
fi
for name in .output node_modules; do
  if [[ -e $name || -L $name ]]; then mv -- "$name" "$scratch/"; fi
  chown -hR root:root "$scratch/build/$name"
  mv -- "$scratch/build/$name" "$checkout/"
done
bash deploy/self-host/install.sh

curl --fail --silent --show-error --noproxy '*' \
  --retry 15 --retry-connrefused --retry-delay 1 --max-time 5 \
  http://localhost:8080/api/health
printf '\nPrecog is running at http://localhost:8080. No tunnel was configured by bootstrap.\n'
