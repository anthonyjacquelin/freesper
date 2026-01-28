#!/bin/bash

# Script pour uploader les fichiers de release vers MinIO
# Nécessite: MinIO Client (mc) installé et configuré

set -e

# Couleurs pour les messages
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Load environment variables from .env file
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | grep -v '^$' | xargs)
fi

# Check required environment variables
if [ -z "$UPDATE_SERVER_URL" ]; then
    echo -e "${RED}❌ UPDATE_SERVER_URL n'est pas défini${NC}"
    echo "   Créez un fichier .env (voir .env.example) et définissez:"
    echo "   UPDATE_SERVER_URL=http://your-server.com/bucket/"
    exit 1
fi

if [ -z "$MINIO_ENDPOINT" ]; then
    echo -e "${RED}❌ MINIO_ENDPOINT n'est pas défini${NC}"
    echo "   Créez un fichier .env (voir .env.example) et définissez:"
    echo "   MINIO_ENDPOINT=http://your-minio-server.com"
    exit 1
fi

# Set defaults for optional variables
MINIO_ALIAS="${MINIO_ALIAS:-myminio}"
MINIO_BUCKET="${MINIO_BUCKET:-freesper}"

# Lire la version depuis package.json
VERSION=$(node -p "require('./package.json').version")

echo -e "${GREEN}📦 Upload vers MinIO - Version ${VERSION}${NC}"
echo ""

# Vérifier que les fichiers existent
DIST_DIR="dist"
DMG_FILE="${DIST_DIR}/freesper-${VERSION}-arm64.dmg"
ZIP_FILE="${DIST_DIR}/freesper-${VERSION}-arm64-mac.zip"
YML_FILE="${DIST_DIR}/latest-mac.yml"

if [ ! -f "${DMG_FILE}" ]; then
    echo -e "${RED}❌ Fichier DMG introuvable: ${DMG_FILE}${NC}"
    echo "   Exécutez 'npm run build' d'abord"
    exit 1
fi

if [ ! -f "${ZIP_FILE}" ]; then
    echo -e "${RED}❌ Fichier ZIP introuvable: ${ZIP_FILE}${NC}"
    echo "   Exécutez 'npm run build' d'abord"
    exit 1
fi

if [ ! -f "${YML_FILE}" ]; then
    echo -e "${RED}❌ Fichier YML introuvable: ${YML_FILE}${NC}"
    echo "   Exécutez 'npm run build' d'abord (postbuild génère ce fichier)"
    exit 1
fi

echo -e "${GREEN}✓${NC} Tous les fichiers sont présents"
echo ""

# Vérifier que mc est installé
if ! command -v mc &> /dev/null; then
    echo -e "${RED}❌ MinIO Client (mc) n'est pas installé${NC}"
    echo ""
    echo "Installation:"
    echo "  brew install minio/stable/mc"
    echo ""
    echo "Configuration:"
    echo "  mc alias set ${MINIO_ALIAS} ${MINIO_ENDPOINT} <ACCESS_KEY> <SECRET_KEY>"
    echo ""
    echo "Ou avec les variables d'env:"
    echo "  mc alias set ${MINIO_ALIAS} ${MINIO_ENDPOINT} \$MINIO_ACCESS_KEY \$MINIO_SECRET_KEY"
    exit 1
fi

# Configure MinIO alias if credentials are provided in .env
if [ -n "$MINIO_ACCESS_KEY" ] && [ -n "$MINIO_SECRET_KEY" ]; then
    if ! mc alias ls "${MINIO_ALIAS}" &> /dev/null 2>&1; then
        echo -e "${YELLOW}🔧 Configuration de l'alias MinIO...${NC}"
        mc alias set "${MINIO_ALIAS}" "${MINIO_ENDPOINT}" "${MINIO_ACCESS_KEY}" "${MINIO_SECRET_KEY}"
        echo -e "${GREEN}✓${NC} Alias MinIO configuré"
    fi
fi

# Vérifier que l'alias existe
if ! mc alias ls "${MINIO_ALIAS}" &> /dev/null; then
    echo -e "${YELLOW}⚠️  L'alias MinIO '${MINIO_ALIAS}' n'existe pas${NC}"
    echo ""
    echo "Configurez-le avec:"
    echo "  mc alias set ${MINIO_ALIAS} ${MINIO_ENDPOINT} <ACCESS_KEY> <SECRET_KEY>"
    echo ""
    echo "Ou ajoutez MINIO_ACCESS_KEY et MINIO_SECRET_KEY dans votre fichier .env"
    exit 1
fi

echo -e "${GREEN}📤 Upload des fichiers...${NC}"
echo ""

# Upload DMG
echo -e "Uploading ${DMG_FILE}..."
mc cp "${DMG_FILE}" "${MINIO_ALIAS}/${MINIO_BUCKET}/"
echo -e "${GREEN}✓${NC} DMG uploadé"

# Upload ZIP
echo -e "Uploading ${ZIP_FILE}..."
mc cp "${ZIP_FILE}" "${MINIO_ALIAS}/${MINIO_BUCKET}/"
echo -e "${GREEN}✓${NC} ZIP uploadé"

# Upload YML
echo -e "Uploading ${YML_FILE}..."
mc cp "${YML_FILE}" "${MINIO_ALIAS}/${MINIO_BUCKET}/"
echo -e "${GREEN}✓${NC} Manifest uploadé"

echo ""
echo -e "${GREEN}✅ Upload terminé!${NC}"
echo ""
echo "Fichiers disponibles à:"
echo "  ${UPDATE_SERVER_URL}"
echo ""
echo "Vérifiez avec:"
echo "  curl ${UPDATE_SERVER_URL}latest-mac.yml"
