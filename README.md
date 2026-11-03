# AI Drone Construction

Визитка и магазин услуг: дроны + ИИ для контроля качества строительства.  
Ойрат Арман Талгатович.

## Постоянная ссылка

**https://ai-drone-construction.netlify.app/**

Если сайт Private — открой https://app.netlify.com/projects/ai-drone-construction  
и нажми **Make public**.

## Обновить после правок

```powershell
cd C:\Users\Arman\Desktop\projects\arman-vizitka
npm run build
npx --yes netlify-cli deploy --prod
```

## Docker

Сайт и API в одном контейнере. База и новые фото лежат в томах и переживают перезапуск контейнера.

```powershell
cd C:\Users\Arman\Desktop\projects\arman-vizitka
docker compose up --build
```

Сайт: http://127.0.0.1:8080/  
Админка: http://127.0.0.1:8080/admin

Пароли берутся из `.env`, файл в образ не копируется. Подробности — в `ОТЧЕТ-ДОКЕР.md`.

## Админка

```powershell
powershell -ExecutionPolicy Bypass -File .\server.ps1
```

- http://127.0.0.1:5173/admin
- пароль берётся из `.env`: `ADMIN_PASSWORD` для каталога, `MANAGER_PASSWORD` для заказов

Те же переменные нужно задать в панели Netlify до первого входа. Старый пароль из репозитория больше не принимается.

## CRM заказов

Когда клиент нажимает **Заказать**, сервер берёт цены из каталога, сохраняет заявку в `data/site.sqlite` (на Netlify — в Blobs) и только после этого открывается WhatsApp.

В админке вкладка **Заказы**: статусы, заметки и переход в WhatsApp клиента.
