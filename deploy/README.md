# Deploying

One compose stack runs the whole site on a single server:

| Service    | What it does                                                  |
| ---------- | ------------------------------------------------------------- |
| `caddy`    | HTTPS on ports 80/443. Sends `/api/*` to the API, everything else to the frontend. |
| `frontend` | Next.js site                                                  |
| `server`   | Report API                                                    |
| `worker`   | Ingests live games from the Factions websocket                |
| `db`       | MySQL. Not published on the host.                             |
| `backup`   | Daily `mysqldump` into `deploy/backups`                       |

## First start

1. Install Docker, then clone both repos side by side:

   ```sh
   git clone <backend repo> factions-companion-backend
   git clone <frontend repo> factions-companion-frontend
   ```

2. Point the domain's DNS (an A/AAAA record) at the server, and open ports 80 and 443.

3. Create the settings file and fill it in:

   ```sh
   cd factions-companion-backend/deploy
   cp deploy.env.example .env
   ```

   `SITE_URL` is baked into the frontend at build time, so rebuild the
   frontend after changing it.

4. Start it:

   ```sh
   docker compose up -d --build
   ```

   Caddy gets the certificate on the first request. `docker compose logs -f caddy`
   shows any problem with it.

## Updating

```sh
git -C .. pull && git -C ../../factions-companion-frontend pull
docker compose up -d --build
```

## Backups

`backup` writes `deploy/backups/<db>-<UTC time>.sql.gz` daily at `BACKUP_TIME`
(UTC), and deletes dumps older than `BACKUP_KEEP_DAYS` days.

Take one now:

```sh
docker compose run --rm backup now
```

These live on the same disk as the database, so also copy them off the
server now and then, for example with `rsync` or `rclone`.

Restore one (this replaces the current data):

```sh
docker compose stop server worker
gunzip -c backups/<file>.sql.gz | docker compose exec -T db \
  sh -c 'mysql -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"'
docker compose start server worker
```

To move existing data onto a new server, take a dump on the old machine, copy
it into `deploy/backups`, and restore it the same way.

## Admin routes

The watch-list routes are reachable through Caddy at `/api/websocket/...` and
need the `ADMIN_API_KEY`:

```sh
curl -X POST -H "Authorization: Bearer $ADMIN_API_KEY" https://<domain>/api/websocket/watch/<gameId>
```
