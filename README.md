# Контрольная работа 4

## Описание

В рамках контрольной работы реализовано backend-приложение на Node.js и Express для управления пользователями с подключением MongoDB, кэшированием через Redis и балансировкой нагрузки между несколькими backend-серверами через Nginx.

Итоговый вариант разворачивается через Docker Compose: каждый компонент системы запускается в отдельном контейнере.

## Состав проекта

- `index.js` - Express-приложение с API, подключением MongoDB, Redis-кэшем и служебными маршрутами.
- `Dockerfile` - инструкция сборки Docker-образа backend-сервиса.
- `docker-compose.yml` - описание всех контейнеров приложения.
- `configs/nginx.docker.conf` - конфигурация Nginx для балансировки нагрузки в Docker.
- `configs/nginx.conf` - пример Nginx-конфигурации для локального запуска backend-серверов на разных портах.
- `configs/haproxy.cfg` - альтернативный пример балансировки через HAProxy.
- `scripts/test-balancing.ps1` - PowerShell-скрипт для проверки распределения запросов.
- `.env` - локальные переменные окружения для запуска без Docker.

## Используемые технологии

- Node.js
- Express
- MongoDB
- Mongoose
- Redis
- Nginx
- HAProxy
- Docker
- Docker Compose

## Реализованные возможности

### API пользователей

Реализована сущность `User` со следующими полями:

- `id` - числовой уникальный идентификатор пользователя.
- `first_name` - имя пользователя.
- `last_name` - фамилия пользователя.
- `age` - возраст пользователя.
- `created_at` - время создания в Unix timestamp.
- `updated_at` - время обновления в Unix timestamp.

Доступные маршруты:

| Метод | Маршрут | Описание |
| --- | --- | --- |
| `POST` | `/api/users` | Создание пользователя |
| `GET` | `/api/users` | Получение списка пользователей |
| `GET` | `/api/users/:id` | Получение пользователя по ID |
| `PATCH` | `/api/users/:id` | Обновление пользователя |
| `DELETE` | `/api/users/:id` | Удаление пользователя |

### API товаров

Для проверки кэширования также добавлены маршруты товаров:

| Метод | Маршрут | Время кэша | Описание |
| --- | --- | --- | --- |
| `GET` | `/api/products` | 10 минут | Получение списка товаров |
| `GET` | `/api/products/:id` | 10 минут | Получение товара по ID |

### Redis-кэширование

Добавлено кэширование GET-запросов через Redis:

| Метод | Маршрут | Время кэша |
| --- | --- | --- |
| `GET` | `/api/users` | 1 минута |
| `GET` | `/api/users/:id` | 1 минута |
| `GET` | `/api/products` | 10 минут |
| `GET` | `/api/products/:id` | 10 минут |

При создании, обновлении и удалении пользователя соответствующий кэш пользователей очищается.

Для проверки кэша в ответ добавляется заголовок:

- `X-Cache: MISS` - данные получены из MongoDB и записаны в Redis.
- `X-Cache: HIT` - данные получены из Redis.

### Балансировка нагрузки

Реализована балансировка между двумя backend-сервисами:

- `backend-1`
- `backend-2`

Каждый backend-сервис запускает один и тот же Express-код, но получает свой идентификатор через переменную окружения `INSTANCE_NAME`.

Маршрут:

```http
GET /
```

возвращает идентификатор сервера:

```json
{ "server": "backend-1" }
```

или:

```json
{ "server": "backend-2" }
```

В Nginx добавлены настройки отказоустойчивости:

```nginx
max_fails=3 fail_timeout=30s
```

Если один backend-контейнер остановлен, Nginx перестает направлять на него запросы и продолжает обслуживать трафик через оставшийся сервер.

### Docker Compose

В `docker-compose.yml` описаны контейнеры:

- `backend-1` - первый backend-сервер.
- `backend-2` - второй backend-сервер.
- `nginx` - балансировщик нагрузки.
- `mongo` - база данных MongoDB.
- `redis` - хранилище кэша Redis.

Все сервисы объединены в одну Docker-сеть `app-network`.

## Запуск проекта

Открыть PowerShell и перейти в папку проекта:

```powershell
cd C:\Users\dd2sa\Desktop\Front-Practici-2sem\19practic\Mango
```

Запустить все контейнеры:

```powershell
docker compose up --build
```

После запуска приложение доступно по адресу:

```text
http://localhost/
```

## Проверка работы

### Проверка балансировки

Открыть второе окно PowerShell и выполнить несколько запросов:

```powershell
curl http://localhost/
curl http://localhost/
curl http://localhost/
```

Ожидаемый результат: ответы должны приходить от разных backend-серверов:

```json
{ "server": "backend-1" }
```

```json
{ "server": "backend-2" }
```

### Проверка служебного маршрута

```powershell
curl http://localhost/api/health
```

Ожидаемый ответ содержит статус, имя backend-сервера, порт, PID процесса и uptime.

### Проверка API пользователей

Создать пользователя:

```powershell
curl -Method POST http://localhost/api/users -ContentType "application/json" -Body '{"first_name":"Ivan","last_name":"Ivanov","age":20}'
```

Получить список пользователей:

```powershell
curl http://localhost/api/users
```

Получить пользователя по ID:

```powershell
curl http://localhost/api/users/1
```

Обновить пользователя:

```powershell
curl -Method PATCH http://localhost/api/users/1 -ContentType "application/json" -Body '{"age":21}'
```

Удалить пользователя:

```powershell
curl -Method DELETE http://localhost/api/users/1
```

### Проверка кэширования

Выполнить один и тот же GET-запрос несколько раз:

```powershell
curl -i http://localhost/api/users
curl -i http://localhost/api/users
```

При первом запросе в заголовках должен быть `X-Cache: MISS`, при повторном - `X-Cache: HIT`.

### Проверка отказоустойчивости

Остановить один backend-контейнер:

```powershell
docker compose stop backend-1
```

Проверить, что приложение продолжает отвечать:

```powershell
curl http://localhost/
curl http://localhost/api/health
```

Ожидаемый результат: запросы продолжают обслуживаться через `backend-2`.

Вернуть остановленный контейнер:

```powershell
docker compose start backend-1
```

## Остановка проекта

Остановить и удалить контейнеры:

```powershell
docker compose down
```

Остановить и удалить контейнеры вместе с volume MongoDB:

```powershell
docker compose down -v
```

## Итог

В результате контрольной работы реализовано веб-приложение с:

- REST API для управления пользователями.
- Подключением к NoSQL базе данных MongoDB.
- Кэшированием GET-запросов через Redis.
- Двумя backend-серверами.
- Балансировкой нагрузки через Nginx.
- Настройками отказоустойчивости.
- Альтернативным примером балансировки через HAProxy.
- Полным запуском инфраструктуры через Docker Compose.
