#!/bin/bash
set -e

CRON_SECRET="${CRON_SECRET:-maytheforcebewithyou}"
LOG_FILE="/var/log/saral-cron.log"

curl -s -H "Authorization: Bearer ${CRON_SECRET}" http://localhost:3000/api/cron >> "${LOG_FILE}" 2>&1
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cron job completed" >> "${LOG_FILE}"
