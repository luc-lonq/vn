# Déploiement (VPS + nginx existant)

Chaque push sur `main` → GitHub Actions build l'image, la pousse sur GHCR (`ghcr.io/luc-lonq/vn`), copie `docker-compose.prod.yml` sur le VPS et relance le conteneur. L'app écoute sur `127.0.0.1:3010`, nginx fait le HTTPS devant.

## 1. Sur le VPS (une seule fois)

Prérequis : Docker + le plugin compose (`docker compose version`).

```bash
# utilisateur qui déploie (ici l'utilisateur courant) dans le groupe docker
sudo usermod -aG docker $USER        # puis se reconnecter

# dossier de l'app
sudo mkdir -p /opt/viet && sudo chown $USER: /opt/viet
cd /opt/viet

# config de prod
cat > .env <<EOF
APP_PASSWORD=$(openssl rand -base64 18)
SESSION_SECRET=$(openssl rand -hex 32)
COOKIE_SECURE=true
NEW_CARDS_PER_DAY=20
APP_PORT=3010
EOF
chmod 600 .env
cat .env    # note le mot de passe (ou remplace-le par le tien)
```

> Si le port 3010 est déjà pris par une autre app, change `APP_PORT` (et le `proxy_pass` nginx).

### Clé SSH dédiée au déploiement

Sur **ta machine** :

```bash
ssh-keygen -t ed25519 -f viet_deploy -N "" -C "github-actions-viet"
ssh-copy-id -i viet_deploy.pub user@ton-vps      # ou ajoute le .pub dans ~/.ssh/authorized_keys
```

### nginx

`/etc/nginx/sites-available/viet` (remplace `viet.ton-domaine.fr`) :

```nginx
server {
    listen 80;
    server_name viet.ton-domaine.fr;

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
```

```bash
sudo ln -s /etc/nginx/sites-available/viet /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d viet.ton-domaine.fr     # HTTPS Let's Encrypt
```

(Le DNS du domaine doit déjà pointer vers le VPS pour que certbot passe.)

## 2. Sur GitHub (une seule fois)

Repo → **Settings → Secrets and variables → Actions → New repository secret** :

| secret | valeur |
|---|---|
| `VPS_HOST` | IP ou domaine du VPS |
| `VPS_USER` | utilisateur SSH (celui du groupe docker) |
| `VPS_SSH_KEY` | contenu **complet** du fichier `viet_deploy` (clé privée) |
| `VPS_PORT` | port SSH, seulement s'il n'est pas 22 |

Le token GHCR est fourni automatiquement par Actions (`GITHUB_TOKEN`), rien à créer.

## 3. Déployer

```bash
git push origin main
```

Suivi dans l'onglet **Actions**. Le job se termine par un check sur `/api/health` : s'il est vert, l'app tourne.
Relance manuelle possible via **Actions → deploy → Run workflow**.

## Au quotidien

```bash
cd /opt/viet
docker compose -f docker-compose.prod.yml logs -f        # logs
docker compose -f docker-compose.prod.yml restart        # redémarrer
```

**Changer le mot de passe** : édite `/opt/viet/.env` puis `docker compose -f docker-compose.prod.yml up -d`.

**Revenir à une version précédente** : dans `.env`, remplace le tag de `IMAGE=ghcr.io/luc-lonq/vn:<sha>` par le sha d'un commit précédent, puis `up -d`.

**Sauvegarde de la base** (à mettre en cron) :

```bash
docker compose -f /opt/viet/docker-compose.prod.yml exec -T app \
  node -e "require('better-sqlite3')('/data/viet.db').backup('/data/backup.db')"
docker compose -f /opt/viet/docker-compose.prod.yml cp app:/data/backup.db /opt/viet/backup-$(date +%F).db
```
