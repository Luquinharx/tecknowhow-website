#!/usr/bin/env bash
# Corre NA VM (instalado em /usr/local/sbin/tecknowhow-publicar).
# Recebe o codigo fonte do site em .tar.gz pelo stdin, compila, publica e reinicia a API.
#
#   cat codigo.tar.gz | ssh ubuntu@vm sudo /usr/local/sbin/tecknowhow-publicar
#
# A chave de deploy do GitHub Actions esta presa a este comando no
# authorized_keys (command="..."): com ela so se consegue publicar o site.
set -euo pipefail
exec 9>/run/tecknowhow-publicar.lock
flock -n 9 || { echo "ja ha uma publicacao a decorrer"; exit 1; }

PACOTE="$(mktemp /tmp/tecknowhow-src-XXXXXX.tar.gz)"
trap 'rm -f "$PACOTE"' EXIT
cat > "$PACOTE"
[ -s "$PACOTE" ] || { echo "nao chegou codigo nenhum"; exit 1; }
echo "== recebido: $(du -h "$PACOTE" | cut -f1)"

[ -f /etc/tecknowhow/app.env ] || { echo "falta /etc/tecknowhow/app.env"; exit 1; }
id tecknowhow >/dev/null 2>&1 || useradd --system --home /opt/tecknowhow --shell /usr/sbin/nologin tecknowhow
install -d -o tecknowhow -g tecknowhow /opt/tecknowhow /opt/tecknowhow/src /opt/tecknowhow/api

# codigo novo numa pasta limpa (node_modules mantem-se entre publicacoes)
find /opt/tecknowhow/src -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +
tar -xzf "$PACOTE" -C /opt/tecknowhow/src
chown -R tecknowhow:tecknowhow /opt/tecknowhow/src

cd /opt/tecknowhow/src
echo "== npm ci"
sudo -u tecknowhow -H npm ci --no-audit --no-fund --loglevel=error
echo "== build"
# VITE_FIREBASE_* entram no build do site; a chave GLM fica so no servidor
set -a; . /etc/tecknowhow/app.env; set +a
sudo -u tecknowhow -H --preserve-env=VITE_FIREBASE_API_KEY,VITE_FIREBASE_AUTH_DOMAIN,VITE_FIREBASE_PROJECT_ID,VITE_FIREBASE_STORAGE_BUCKET,VITE_FIREBASE_MESSAGING_SENDER_ID,VITE_FIREBASE_APP_ID,VITE_FIREBASE_MEASUREMENT_ID \
  npm run build
sudo -u tecknowhow -H npm run build:server
[ -f dist/index.html ] || { echo "build sem index.html"; exit 1; }

# site estatico: troca de pasta de uma vez; a versao anterior fica em tecknowhow-antigo
rm -rf /var/www/tecknowhow-novo
cp -a dist /var/www/tecknowhow-novo
chown -R root:root /var/www/tecknowhow-novo
chmod -R a+rX /var/www/tecknowhow-novo
rm -rf /var/www/tecknowhow-antigo
[ -d /var/www/tecknowhow ] && mv /var/www/tecknowhow /var/www/tecknowhow-antigo
mv /var/www/tecknowhow-novo /var/www/tecknowhow

# API
[ -f /opt/tecknowhow/api/server.cjs ] && cp -a /opt/tecknowhow/api/server.cjs /opt/tecknowhow/api/server.cjs.antigo
install -o tecknowhow -g tecknowhow -m 644 server-dist/server.cjs /opt/tecknowhow/api/server.cjs
install -m 644 deploy/tecknowhow.service /etc/systemd/system/tecknowhow.service
# o proprio script de publicacao tambem se atualiza para a proxima vez
install -m 755 deploy/tecknowhow-publicar.sh /usr/local/sbin/tecknowhow-publicar
# publicacao automatica: a VM verifica o main do GitHub a cada 2 minutos
install -m 755 deploy/tecknowhow-atualizar.sh /usr/local/sbin/tecknowhow-atualizar
install -m 644 deploy/tecknowhow-atualizar.service /etc/systemd/system/tecknowhow-atualizar.service
install -m 644 deploy/tecknowhow-atualizar.timer /etc/systemd/system/tecknowhow-atualizar.timer
systemctl daemon-reload
systemctl enable --quiet --now tecknowhow-atualizar.timer
systemctl enable --quiet tecknowhow
systemctl restart tecknowhow

for i in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:3003/api/saude >/dev/null 2>&1; then
    echo "== site publicado e API no ar (porta 3003)"
    exit 0
  fi
  sleep 1
done

echo "!! a API nova nao respondeu; ultimas linhas:"
journalctl -u tecknowhow -n 40 --no-pager || true
if [ -f /opt/tecknowhow/api/server.cjs.antigo ]; then
  echo "!! a repor a versao anterior da API"
  cp -a /opt/tecknowhow/api/server.cjs.antigo /opt/tecknowhow/api/server.cjs
  systemctl restart tecknowhow
fi
exit 1
