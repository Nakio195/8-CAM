@echo off
rem Lance 8-CAM : construit l'application puis la sert en local et ouvre le navigateur.
rem Double-cliquer sur ce fichier. Fermer cette fenetre arrete 8-CAM.
rem Option --no-open : ne pas ouvrir le navigateur (tests).

chcp 65001 >nul
title 8-CAM
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
    echo Node.js n'est pas installé : téléchargez la version LTS sur https://nodejs.org puis relancez ce fichier.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo Première utilisation : installation des dépendances, quelques minutes...
    call npm install
    if errorlevel 1 (
        echo L'installation a échoué : vérifiez la connexion internet puis relancez ce fichier.
        pause
        exit /b 1
    )
)

echo Construction de 8-CAM...
call npm run build --silent
if errorlevel 1 (
    echo La construction a échoué : le message ci-dessus indique pourquoi.
    pause
    exit /b 1
)

echo.
echo 8-CAM est prêt. Laissez cette fenêtre ouverte pendant l'utilisation ; la fermer arrête 8-CAM.
echo.
if /i "%~1"=="--no-open" (
    call npm run preview -- --port 4173
) else (
    call npm run preview -- --port 4173 --open
)
pause
