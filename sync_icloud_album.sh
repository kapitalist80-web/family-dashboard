#!/bin/bash

# iCloud Shared Album Token (Teil hinter dem # in der URL)
ALBUM_TOKEN=""

# Zielverzeichnis
TARGET_DIR="/home/USERNAME/bilder"

mkdir -p "$TARGET_DIR"

# Hole JSON-Daten des Albums über npx (CLI)
json=$(npx --yes icloud-shared-album "$ALBUM_TOKEN" 2>/dev/null)
if [ $? -ne 0 ] || [ -z "$json" ]; then
  echo "$(date '+%F %T') - Fehler: Konnte Albumdaten nicht holen." >&2
  exit 1
fi

# Aus dem JSON die höchstaufgelöste Bild-URL je Foto extrahieren
echo "$json" \
  | jq -r '.photos[].derivatives
           | to_entries
           | max_by(.value.height)
           | .value.url' \
  | while read -r url; do

      # Leere Zeilen überspringen
      [ -z "$url" ] && continue

      # Dateinamen aus der URL ableiten (Query-Parameter abschneiden)
      base="${url%%\?*}"
      fname="$(basename "$base")"
      dest="$TARGET_DIR/$fname"

      # Wenn Datei schon existiert → überspringen
      if [ -f "$dest" ]; then
        echo "$(date '+%F %T') - Überspringe $fname (bereits vorhanden)"
        continue
      fi

      echo "$(date '+%F %T') - Lade $fname ..."
      if curl -L --fail "$url" -o "$dest"; then
        echo "$(date '+%F %T') - Fertig: $fname"
      else
        echo "$(date '+%F %T') - Fehler beim Download von $url" >&2
        rm -f "$dest"
      fi
    done
