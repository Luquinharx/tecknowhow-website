#!/usr/bin/env bash
# Corre NA VM (instalado em /usr/local/sbin/tecknowhow-atualizar), pelo
# tecknowhow-atualizar.timer a cada 2 minutos.
# Se houver um commit novo no main do GitHub, descarrega o codigo e publica-o
# (tecknowhow-publicar). O repositorio e publico: nao precisa de chaves.
set -euo pipefail
REPO="Luquinharx/tecknowhow-website"
ESTADO=/var/lib/tecknowhow
install -d -m 755 "$ESTADO"

SHA="$(git ls-remote "https://github.com/$REPO.git" refs/heads/main | cut -f1)"
[ -n "$SHA" ] || { echo "nao consegui ler o main do GitHub"; exit 1; }

# ja publicado, ou ja falhou (so tenta outra vez quando houver outro commit)
[ "$SHA" = "$(cat "$ESTADO/publicado" 2>/dev/null || true)" ] && exit 0
[ "$SHA" = "$(cat "$ESTADO/falhou" 2>/dev/null || true)" ] && exit 0

# outra publicacao a decorrer (ex.: deploy/publicar.sh a mao): tenta na proxima volta
if ! flock -n /run/tecknowhow-publicar.lock true; then
  echo "publicacao em curso; fica para a proxima verificacao"
  exit 0
fi

echo "== commit novo: $SHA"
TMP="$(mktemp -d /tmp/tecknowhow-git-XXXXXX)"
trap 'rm -rf -- "$TMP"' EXIT
curl -fsSL "https://codeload.github.com/$REPO/tar.gz/$SHA" | tar -xzf - -C "$TMP" --strip-components=1

if tar -czf - -C "$TMP" . | /usr/local/sbin/tecknowhow-publicar; then
  echo "$SHA" > "$ESTADO/publicado"
  rm -f "$ESTADO/falhou"
  echo "== publicado $SHA"
else
  echo "$SHA" > "$ESTADO/falhou"
  echo "!! a publicacao de $SHA falhou (o site continua na versao anterior)"
  exit 1
fi
