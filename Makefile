PORT ?= 3500
URL  := http://localhost:$(PORT)
OPEN ?= open

.DEFAULT_GOAL := start
.PHONY: start stop install

## start: cierra lo que ocupe el puerto, instala si hace falta, arranca la app y abre el navegador
start: stop install
	@echo "→ Arrancando en $(URL)"
	@( for i in $$(seq 1 120); do \
	     curl -s -o /dev/null --max-time 2 "$(URL)" && { $(OPEN) "$(URL)"; exit 0; }; \
	     sleep 1; \
	   done; echo "⚠ La app no ha respondido en 2 minutos; no abro el navegador." ) &
	@pnpm dev --port $(PORT)

## stop: cierra cualquier proceso que escuche en el puerto y el servidor de Next que lo abrió
stop:
	@pids="$$(lsof -ti tcp:$(PORT) -sTCP:LISTEN 2>/dev/null) $$(pgrep -f '[n]ext dev --port $(PORT)' 2>/dev/null)"; \
	pids="$$(echo $$pids | xargs -n1 2>/dev/null | sort -u | xargs)"; \
	if [ -n "$$pids" ]; then \
	  echo "→ Cerrando el puerto $(PORT) (PID $$pids)"; \
	  kill $$pids 2>/dev/null || true; \
	  for i in $$(seq 1 10); do lsof -ti tcp:$(PORT) -sTCP:LISTEN >/dev/null 2>&1 || break; sleep 1; done; \
	  left="$$(lsof -ti tcp:$(PORT) -sTCP:LISTEN 2>/dev/null)"; \
	  if [ -n "$$left" ]; then echo "→ Forzando el cierre (PID $$left)"; kill -9 $$left 2>/dev/null || true; sleep 1; fi; \
	fi; \
	if lsof -ti tcp:$(PORT) -sTCP:LISTEN >/dev/null 2>&1; then echo "✗ El puerto $(PORT) sigue ocupado"; exit 1; fi

## install: instala las dependencias si faltan o si el lockfile ha cambiado
install:
	@if [ ! -d node_modules ] || [ pnpm-lock.yaml -nt node_modules/.modules.yaml ]; then \
	  echo "→ Instalando dependencias"; pnpm install; \
	fi
