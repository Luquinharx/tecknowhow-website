#!/usr/bin/env bash
# Publica o site na VM Oracle (www.tecknowhow.pt) a partir deste PC.
#
#   bash deploy/publicar.sh
#
# Normalmente nao e preciso: a VM verifica o main a cada 2 minutos e publica
# sozinha os commits novos (deploy/tecknowhow-atualizar.sh). Isto serve para publicar a
# mao o que esta na pasta, mesmo sem commit.
set -euo pipefail

VM="${ORACLE_VM:-ubuntu@146.235.62.113}"
KEY="${ORACLE_KEY:-C:/Users/Lucas/Desktop/Projetos/oracle/oracle-freetier-instance-creation/id_rsa}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RAIZ"

# O script da VM vai sempre na versao desta pasta
scp -i "$KEY" -o BatchMode=yes -q deploy/tecknowhow-publicar.sh "$VM:/tmp/tecknowhow-publicar.sh"

echo "== a empacotar e enviar o codigo"
git ls-files -co --exclude-standard   | grep -E '^(src|public|api|server|deploy)/|^(package(-lock)?\.json|index\.html|vite\.config\.ts|tsconfig(\.app|\.node)?\.json|tailwind\.config\.ts|postcss\.config\.js|components\.json)$'   | while IFS= read -r f; do [ -f "$f" ] && printf '%s\n' "$f"; done   | tar -czf - -T -   | ssh -i "$KEY" -o BatchMode=yes "$VM" 'sudo bash /tmp/tecknowhow-publicar.sh'
echo "== feito: https://www.tecknowhow.pt"
