#!/bin/sh
# Wraps mulligan.html (the page source) in a full HTML document at site/index.html.
set -e
cd "$(dirname "$0")"
mkdir -p site
{
  printf '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="description" content="Mulligan is a little remote-control robot that fetches short shots at the driving range, with an app to drive it, play target games, book a bay and buy balls.">\n<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%%}[hidden]{display:none!important}</style>\n'
  cat mulligan.html
  printf '\n</body>\n</html>\n'
} > site/index.html
echo "Built site/index.html"
