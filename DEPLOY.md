# Deploying Auriance Ops on Railway

The app runs as **one service**: a Node server that hosts both the API and the web app. Data lives in a
**SQLite** file on a Railway volume. No separate database service is needed. At a few hundred records a day,
a year of data is tens of megabytes, and the service idles at about 100–150 MB of RAM. That fits within
Railway's Hobby plan usage credit.

## One-time setup (about 5 minutes)

1. **Create the service.** In Railway, choose **New Project → Deploy from GitHub repo** and pick this
   repository. If the app is in a subfolder of the repo, set **Settings → Source → Root Directory** to that
   folder (for example `/app`). Railway finds `railway.json` and builds the `Dockerfile`.
2. **Add a volume.** Right-click the service (or use the command palette), choose **Attach volume**, and set
   the mount path to **`/data`**. 1 GB is plenty.
3. **Set variables** under **Variables**:

   | Variable         | Example                  | Notes                                                    |
   | ---------------- | ------------------------ | -------------------------------------------------------- |
   | `ADMIN_EMAIL`    | `owner@yourcompany.com`  | The first admin, created on the first start              |
   | `ADMIN_PASSWORD` | a long random password   | At least 8 characters. Change it in the app later        |
   | `ADMIN_NAME`     | `Owner`                  | Optional                                                 |
   | `APP_CURRENCY`   | `EGP`                    | ISO code. Editable later in **Settings**                 |
   | `APP_TIMEZONE`   | `Africa/Cairo`           | Defines "today" for reports. Editable in **Settings**    |
   | `APP_LOCALE`     | `en-US`                  | Optional, number and date format                         |
   | `SEED_DEMO`      | `true`                   | Optional: fills an empty database with demo data         |

   `PORT`, `DATABASE_PATH=/data/app.db` and `BACKUP_DIR=/data/backups` are already set by the image.
   Don't change them unless you mount the volume somewhere else.
4. **Deploy.** Railway builds the image, waits for `/api/health`, and switches traffic over.
5. **Get a URL.** Under **Settings → Networking**, click **Generate Domain** (or add your own domain). Open it
   and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

> If you skip `ADMIN_EMAIL`/`ADMIN_PASSWORD`, the first visitor sees a setup screen and becomes the admin.
> Open the URL yourself right after the first deploy, or set the variables first.

After that, every push to the connected branch redeploys automatically. Database migrations run on start.

## Adding your team

Sign in as an admin, open **Team → Add member**, and choose the sections they can use. The app has no
email service, so you copy the **invite link** it shows and send it yourself (the link expires in 7 days).
The member opens the link and picks a password. **Reset password** works the same way.

**Admin Mode** (sidebar, at the bottom) asks for your own password again and unlocks destructive actions
(deleting orders, products, movements and expenses, managing fields, downloading backups) for 15 minutes.

## Backups

- **Automatic:** the server writes a consistent copy of the database to `/data/backups` once a day and keeps
  the last 7 (`BACKUP_KEEP`).
- **Download:** **Settings → Backup → Download backup** (needs Admin Mode). These copies are on the same
  volume as the database, so they don't protect against losing the volume. **Download a backup regularly**
  (weekly, for example) and keep it somewhere else. Railway's volume backups (service → Backups) are a
  good extra layer.

### Restoring a backup

1. Scale the service down, or put it in maintenance by removing the domain.
2. Upload the backup file to the volume as `/data/app.db`. Delete any `app.db-wal`/`app.db-shm` files next to
   it. The simplest way is `railway ssh` into the service and use `curl` to fetch the file from wherever you
   keep it.
3. Redeploy or restart the service.

## Customer emails (shop)

Shop customers can confirm an email and reset their password by email. This stays off
(customers use the WhatsApp reset instead) until you add two variables in Railway → Variables:

- `RESEND_API_KEY`: the API key from your email service (Resend), after verifying your domain there
- `EMAIL_FROM`: the sender, for example `Auriance <hello@yourdomain.com>`

Enter the key yourself in Railway; never paste it into a chat.

## Costs and limits

- One service plus one volume, with no database add-on. With a volume attached, Railway runs a single
  replica, and each deploy restarts the app (a few seconds of downtime). That suits an internal tool.
- To move off Railway, any host that runs a Docker image with a persistent disk works the same way
  (Render, Fly.io, a VPS). Mount the disk at `/data` and set the same variables.

## Running the image locally

```sh
docker build -t auriance-ops .
docker run --rm -p 3000:3000 -v "$PWD/.data:/data" \
  -e ADMIN_EMAIL=owner@example.com -e ADMIN_PASSWORD=change-me-please -e SEED_DEMO=true \
  auriance-ops
# open http://localhost:3000
```
