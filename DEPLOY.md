# Deployment

The production image (root `Dockerfile`) builds the frontend and runs the Express API, which also serves it. It listens on `127.0.0.1:3010` and an existing nginx terminates HTTPS in front of it. The SQLite database lives in a Docker volume.

Two ways to deploy, both using the same server setup:

- **GitHub Actions** (`.github/workflows/ci.yml`): every push to `main` is checked, built, pushed to GHCR (`ghcr.io/<owner>/<repo>`) and deployed over SSH.
- **Manual** (`scripts/deploy.sh`): run on the server; pulls the repo and builds the image there.

In the examples below, replace `viet.example.com` with your domain and `you@your-vps` with your SSH user and host.

## 1. Server setup (once)

Requires Docker with the Compose plugin (`docker compose version`).

```bash
# Let your user run docker without sudo (log out and back in afterwards)
sudo usermod -aG docker $USER

sudo mkdir -p /opt/viet && sudo chown $USER: /opt/viet
cd /opt/viet

cat > .env <<EOF
APP_PASSWORD=$(openssl rand -base64 18)
SESSION_SECRET=$(openssl rand -hex 32)
COOKIE_SECURE=true
NEW_CARDS_PER_DAY=20
APP_PORT=3010
EOF
chmod 600 .env
cat .env   # APP_PASSWORD is your login password; replace it with your own if you prefer
```

If port 3010 is already used, change `APP_PORT` here and in `proxy_pass` below.

### nginx

```bash
sudo tee /etc/nginx/sites-available/viet > /dev/null <<'EOF'
server {
    listen 80;
    server_name viet.example.com;

    client_max_body_size 5m;

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/viet /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d viet.example.com   # the domain's DNS must already point to the server
```

## 2a. Deploy with GitHub Actions

Create a dedicated SSH key on your machine and authorize it on the server:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/viet_deploy -N "" -C "github-actions-viet"
ssh-copy-id -i ~/.ssh/viet_deploy.pub you@your-vps
```

On Windows (PowerShell), `ssh-copy-id` isn't available:

```powershell
ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\viet_deploy -C "github-actions-viet"
Get-Content $env:USERPROFILE\.ssh\viet_deploy.pub | ssh you@your-vps "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

Then add these repository secrets (**Settings → Secrets and variables → Actions**):

| Secret        | Value                                                    |
| ------------- | -------------------------------------------------------- |
| `VPS_HOST`    | server IP or hostname                                    |
| `VPS_USER`    | SSH user (member of the `docker` group)                  |
| `VPS_SSH_KEY` | full content of the private key `viet_deploy`            |
| `VPS_PORT`    | SSH port, only if not 22                                 |

The GHCR token is provided by Actions (`GITHUB_TOKEN`). Push to `main` and follow the run in the **Actions** tab; the last step checks `/api/health`.

## 2b. Deploy manually

```bash
# Read-only deploy key so the server can clone the repository
ssh-keygen -t ed25519 -f ~/.ssh/viet_repo -N "" -C "viet-readonly"
cat ~/.ssh/viet_repo.pub   # add it under GitHub → repo Settings → Deploy keys (no write access)

cd /opt/viet
GIT_SSH_COMMAND="ssh -i ~/.ssh/viet_repo -o IdentitiesOnly=yes" git clone git@github.com:<owner>/<repo>.git src
git -C src config core.sshCommand "ssh -i ~/.ssh/viet_repo -o IdentitiesOnly=yes"
```

For a public repository, a plain `git clone https://github.com/<owner>/<repo>.git src` is enough.

Then, for every deploy:

```bash
/opt/viet/src/scripts/deploy.sh
```

The frontend build needs about 1 GB of free memory on the server.

## Operations

```bash
cd /opt/viet
docker compose -f docker-compose.prod.yml logs -f      # logs
docker compose -f docker-compose.prod.yml restart      # restart
```

- **Change the password**: edit `/opt/viet/.env`, then `docker compose -f docker-compose.prod.yml up -d`. Existing sessions are invalidated if `SESSION_SECRET` changes.
- **Roll back** (Actions deploys): set `IMAGE=ghcr.io/<owner>/<repo>:<older commit sha>` in `.env`, then `up -d`.
- **Back up the database** (good candidate for a daily cron):

  ```bash
  docker compose -f /opt/viet/docker-compose.prod.yml exec -T app \
    node -e "require('better-sqlite3')('/data/viet.db').backup('/data/backup.db')"
  docker compose -f /opt/viet/docker-compose.prod.yml cp app:/data/backup.db /opt/viet/backup-$(date +%F).db
  ```

## Troubleshooting

- **`denied` when pulling from ghcr.io**: on GitHub, open the `vn` package settings and make sure the repository has access.
- **SSH step fails**: check that `VPS_SSH_KEY` includes the `-----BEGIN` / `-----END` lines and that `VPS_USER` owns the matching `authorized_keys`.
- **`permission denied` on the Docker socket**: log out and back in after `usermod -aG docker`.
