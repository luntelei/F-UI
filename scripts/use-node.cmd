@echo off
REM 优先使用 Node.js LTS（C:\Program Files\nodejs），避免旧版 Node 14 被先命中
set "PATH=C:\Program Files\nodejs;%PATH%"
echo Node: & node -v
echo npm:  & npm -v
