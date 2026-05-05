# Docker Compose load balancing

## Run

```powershell
docker compose up --build
```

The Nginx load balancer is available at `http://localhost/`.

## Check balancing

```powershell
curl http://localhost/
curl http://localhost/
curl http://localhost/
```

Responses should alternate between backend containers:

```json
{ "server": "backend-1" }
{ "server": "backend-2" }
```

## Check failover

```powershell
docker compose stop backend-1
curl http://localhost/
```

Nginx should stop sending requests to the stopped container and continue serving traffic through the remaining backend.
