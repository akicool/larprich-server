# Деплой

Прод живёт на VPS `45.12.70.241` (Ubuntu 24.04) и управляется через **Dokploy**.
Схема такая:

```
интернет ──443──> Traefik (Dokploy) ──> app:3001        wss:// и https://
         ──3478, 49152-49999/udp──────> coturn          TURN/STUN, мимо Traefik
```

TLS выдаёт Traefik из Dokploy (Let's Encrypt), поэтому в `docker-compose.prod.yml`
нет ни Caddy, ни своих сертификатов. coturn намеренно не подключён к
`dokploy-network` и не имеет домена — проксировать его нельзя, он должен быть
виден клиентам напрямую.

## Доступ к серверу

```bash
ssh larprich-server        # обычный вход, пользователь serkilov
ssh -N larprich-panel      # то же + туннель к панели -> http://localhost:3000
```

Вход только по ключу `~/.ssh/larprich-server`. Root-логин и парольная
аутентификация отключены, `AllowUsers serkilov`. Панель Dokploy **недоступна из
интернета**: порт 3000 отбрасывается на уровне ядра, открыть её можно только
через туннель.

## Как выкатить изменения

1. Запушить в `main` репозитория `github.com/akicool/larprich-server`.
2. Открыть туннель: `ssh -N larprich-panel`.
3. В панели → проект → сервис → **Deploy**.

Автодеплоя по push нет намеренно: у панели нет публичного URL, значит GitHub
некуда слать webhook. Если он понадобится — придётся выставить панель на
поддомен, и тогда же имеет смысл перейти с deploy key на GitHub App.

## Переменные окружения

Живут во вкладке Environment сервиса в Dokploy, не в файлах на сервере. Полный
список с пояснениями — в [.env.production.example](.env.production.example).
`TURN_SHARED_SECRET` задаётся ровно в одном месте: оттуда его берёт и приложение
(для выдачи временных TURN-креденшелов), и coturn (аргументом
`--static-auth-secret`). В репозиторий секрет не попадает.

## Порты

| Порт | Кто слушает | Доступ снаружи |
|---|---|---|
| 22/tcp | sshd | открыт, rate-limit + fail2ban |
| 80/tcp | Traefik | открыт (редирект + ACME) |
| 443/tcp+udp | Traefik | открыт (https, wss, HTTP/3) |
| 3478/tcp+udp | coturn | открыт |
| 49152-49999/udp | coturn | открыт (медиа-релей) |
| 3000/tcp | панель Dokploy | **закрыт**, только через SSH-туннель |
| 2377, 7946, 4789 | Docker Swarm | **закрыты** |

Важная деталь: UFW реально фильтрует только то, что слушает сам хост — sshd и
coturn (он на host-сети). Порты, опубликованные Docker'ом, идут мимо UFW, а порт
панели публикуется через Swarm, из-за чего его не закрывает и привычный приём с
цепочкой `DOCKER-USER` (она живёт в FORWARD и такой трафик не видит). Поэтому
3000 и swarm-порты режутся правилом в таблице `raw`, которое срабатывает раньше
conntrack и DNAT докера:

```
/usr/local/sbin/larprich-portblock.sh      # правила
larprich-portblock.service                 # применяет их при загрузке
```

Loopback правило не трогает — поэтому SSH-туннель работает.

## Диагностика

```bash
ssh larprich-server
sudo docker ps                                    # что запущено
sudo docker logs -f <имя контейнера app>          # логи сигналинга
sudo docker logs -f <имя контейнера coturn>       # логи TURN
sudo docker logs -f dokploy-traefik               # маршрутизация и сертификаты
sudo ufw status verbose
sudo fail2ban-client status sshd
sudo iptables -t raw -S PREROUTING | grep DROP    # блокировка панели на месте?
```

Проверка снаружи:

```bash
curl https://larprich.serkilov.com/health
wscat -c "wss://larprich.serkilov.com/signaling" -H "Authorization: Bearer test"
```

TURN сканом портов не проверяется — нужен реальный ICE-allocate: взять
`iceServers` из сообщения `matched` и прогнать через любой Trickle ICE тестер,
ожидая кандидата типа `relay`.

## Восстановление доступа

Если SSH окажется сломан — консоль/VNC в панели провайдера по root-паролю. Это
единственный путь обратно, поэтому root-пароль должен быть актуальным и лежать в
менеджере паролей.
