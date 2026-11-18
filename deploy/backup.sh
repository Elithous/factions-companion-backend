#!/bin/bash
# Dumps the game database to /backups as <db>-<UTC timestamp>.sql.gz.
#
#   backup.sh       wait for BACKUP_TIME (UTC) each day, then dump
#   backup.sh now   dump once and exit
#
# Dumps older than BACKUP_KEEP_DAYS days are deleted after each good dump.
set -uo pipefail

: "${DB_NAME:?DB_NAME is not set}"
BACKUP_TIME="${BACKUP_TIME:-04:00}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

dump() {
    local file="/backups/${DB_NAME}-$(date -u +%Y%m%d-%H%M%S).sql.gz"
    echo "[backup] Writing ${file}"

    # --single-transaction gives a consistent snapshot without locking out
    # the worker. MYSQL_PWD carries the root password.
    if mysqldump -h db -u root --single-transaction --quick --routines --events \
        "${DB_NAME}" | gzip > "${file}.partial"; then
        mv "${file}.partial" "${file}"
        find /backups -name "${DB_NAME}-*.sql.gz" -mtime +"${BACKUP_KEEP_DAYS}" -delete
        echo "[backup] Done: $(du -h "${file}" | cut -f1)"
    else
        rm -f "${file}.partial"
        echo "[backup] Dump failed" >&2
        return 1
    fi
}

if [ "${1:-}" = "now" ]; then
    dump
    exit $?
fi

echo "[backup] Daily at ${BACKUP_TIME} UTC, keeping ${BACKUP_KEEP_DAYS} days"
while true; do
    now=$(date -u +%s)
    next=$(date -u -d "today ${BACKUP_TIME}" +%s)
    if [ "${next}" -le "${now}" ]; then
        next=$(date -u -d "tomorrow ${BACKUP_TIME}" +%s)
    fi
    sleep $((next - now))
    dump || true
done
