# ETH Analyzer Web

Aplicación web para monitorizar el precio de Ethereum y la evolución de tus inversiones en ETH,
partiendo de los datos de la hoja **Inversión Crypto** del Excel `Gastos Aplazados (2019_29).xlsx`.

- **Backend**: Node 22 + Express + TypeScript + SQLite (`better-sqlite3`).
- **Frontend**: React + Vite + TypeScript + Recharts, servido por Nginx.
- **Precios**: API pública de Kraken (ETH/EUR), cacheada en el backend.
- **Despliegue**: dos contenedores orquestados con Docker Compose y volumen persistente.
- **App Android**: la misma interfaz empaquetada con Capacitor, autónoma y sin servidor
  ([ver sección](#app-de-android-apk)).

## Puesta en marcha con Docker

```bash
cp .env.example .env          # opcional: ajusta puertos y parámetros
docker compose up --build -d
```

- Web: <http://localhost:8080>
- API: <http://localhost:4000/api/health>

> Si el puerto 8080 ya lo usa otro proyecto, cámbialo en el fichero `.env` de la raíz
> (`FRONTEND_PORT=8100`) y vuelve a lanzar `docker compose up -d`. Recuerda actualizar también la
> regla del firewall si accedes desde el móvil (ver más abajo).

### Reiniciar, parar y actualizar

```bash
docker compose stop           # parar sin perder nada
docker compose start          # volver a arrancar
docker compose restart        # reinicio rápido
```

Reiniciar Docker o los contenedores **no borra datos ni código**: las operaciones y alertas viven
en el volumen `eth-data` y la aplicación, dentro de las imágenes ya construidas.

Solo hace falta reconstruir cuando **cambia el código fuente**:

```bash
docker compose up -d --build
```

Si tras actualizar sigues viendo la versión anterior en el navegador, es caché del navegador:
recarga forzando (`Ctrl`+`F5`). El servidor ya envía `Cache-Control: no-cache` en el HTML para
evitarlo.

> Cuidado: `docker compose down -v` sí borra el volumen y, con él, todas las operaciones y alertas.
> Para parar los contenedores usa `docker compose stop` o `docker compose down` (sin `-v`).

### Acceder desde el móvil u otro equipo de la red

Por defecto **Windows bloquea las conexiones entrantes**, así que aunque los contenedores estén
en marcha, otros dispositivos de la wifi no podrán abrir la web ni importar datos desde la app.
Esto ocurre sobre todo si Windows ha clasificado tu wifi como red *Pública*.

Ejecuta una sola vez, en **PowerShell como administrador**:

```powershell
.\allow-lan-access.ps1
```

El script marca la wifi como red privada y crea una regla de firewall que abre los puertos 4000 y
8080 **solo para direcciones de tu propia red local**. Al terminar te muestra la URL exacta que
debes usar desde el móvil. Para revertirlo: `.\allow-lan-access.ps1 -Remove`.

Averigua la IP de tu PC con `ipconfig` (apartado *Wi-Fi*, `Dirección IPv4`) y desde el móvil abre
`http://TU_IP:8080`.

Si aun así no funciona, comprueba que:

- el móvil está en la **misma wifi** (no en datos móviles ni en la red de invitados);
- tu router no tiene activado el **aislamiento de clientes** (*AP isolation*), que impide que los
  dispositivos se vean entre sí;
- los contenedores están arriba: `docker compose ps`.

### Importar el Excel (solo la primera vez)

Con los contenedores en marcha, copia el `.xlsx` al contenedor y lanza el importador:

```bash
docker compose cp "data/Gastos Aplazados (2019_29).xlsx" backend:/tmp/import.xlsx
docker compose exec -e EXCEL_PATH=/tmp/import.xlsx backend npm run import:excel:dist -- --reset
```

Si el repositorio está en un disco local (no en una unidad virtual tipo Google Drive), la carpeta
`data/` se monta directamente en el contenedor como `/import` y basta con:

```bash
docker compose exec backend npm run import:excel:dist -- --reset
```

El importador lee la hoja *Inversión Crypto*, normaliza fechas (texto `dd/mm/aa`, `dd/mm/aaaa` y
serial de Excel) y cantidades con coma decimal, y vuelca las operaciones en SQLite.
Sin `--reset` no sobrescribe datos existentes. A partir de aquí, la fuente de verdad es la base de
datos y las operaciones se gestionan desde la web: el Excel no se modifica nunca.

## Desarrollo local (sin Docker)

```bash
# Backend
cd backend
npm install
npm run import:excel -- --reset   # siembra data/eth.db desde el Excel
npm run dev                       # http://localhost:4000

# Frontend (en otra terminal)
cd frontend
npm install
npm run dev                       # http://localhost:5173 (proxy /api -> :4000)
```

## Funcionalidades

### Dashboard
Precio actual de ETH y variación en 24 h, cantidad en cartera, valor actual, coste de la posición,
precio medio de compra, ganancia latente, coste de lo vendido, ganancia materializada, resultado
total y la antigüedad de la cartera (días desde la primera y desde la última operación). Gráfico de
precio con
rangos de 24 h a máximo histórico y marcadores de operaciones: triángulo verde hacia arriba justo
debajo del precio para las compras y triángulo rojo hacia abajo justo encima para las ventas, de
modo que no se tapan entre sí aunque coincidan en precio y hora. Al pasar el ratón por encima se
muestra el detalle de la operación.

Los datos se refrescan automáticamente **cada 30 segundos** y la cabecera muestra la hora de la
última actualización junto al tiempo transcurrido, con un botón *Actualizar ahora* que fuerza una
lectura nueva de Kraken saltándose la caché.

El gráfico prolonga la serie con el **precio en vivo**: su último punto (círculo azul) es la
cotización actual y se mueve cada 30 segundos, mientras que el histórico completo se vuelve a pedir
cada 5 minutos. Así el extremo derecho del gráfico siempre coincide con el precio de la tarjeta.

### Operaciones
Alta, edición y borrado de compras y ventas, con fecha y **hora** de cada movimiento (la hora es
opcional: las operaciones importadas del Excel no la traen). El formulario autocalcula el tercer
campo a partir de los otros dos (importe, precio y cantidad de ETH).

### Alertas
Umbrales de precio al alza o a la baja, repetibles o de un solo uso. El backend comprueba el precio
periódicamente, por lo que las alertas se evalúan aunque el navegador esté cerrado; el aviso visual
(toast + notificación del navegador) aparece cuando la web está abierta.

## API

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `GET` | `/api/health` | Estado del servicio |
| `GET` | `/api/transactions` | Lista de operaciones |
| `POST` | `/api/transactions` | Crear operación |
| `PUT` | `/api/transactions/:id` | Actualizar operación |
| `DELETE` | `/api/transactions/:id` | Eliminar operación |
| `GET` | `/api/portfolio/summary` | Resumen de cartera y resultados |
| `GET` | `/api/price/current` | Precio actual (añade `?refresh=true` para forzar) |
| `GET` | `/api/price/history?days=30` | Histórico (`1`, `7`, `30`, `90`, `180`, `365`, `max`) |
| `GET` | `/api/alerts` | Lista de alertas |
| `POST` | `/api/alerts` | Crear alerta |
| `PUT` | `/api/alerts/:id` | Actualizar alerta |
| `DELETE` | `/api/alerts/:id` | Eliminar alerta |
| `GET` | `/api/alerts/events` | Historial de disparos (`?unread=true`, `?limit=`) |
| `POST` | `/api/alerts/events/ack` | Marcar todos los avisos como leídos |
| `POST` | `/api/alerts/events/:id/ack` | Marcar un aviso como leído |

## App de Android (APK)

La misma interfaz se empaqueta con **Capacitor** en una APK **autónoma**: guarda los datos en el
propio móvil, consulta Kraken directamente y **no necesita el PC ni el backend** para funcionar.

### Cómo comparte código con la web

Toda la interfaz es común. El acceso a datos se resuelve en tiempo de ejecución:

| Módulo | Web | APK |
| --- | --- | --- |
| `lib/api.ts` | selector de plataforma | selector de plataforma |
| `lib/httpApi.ts` | backend por HTTP | — |
| `lib/local/*` | — | datos del dispositivo |

En la APK, cada responsabilidad del backend pasa al móvil: las operaciones y alertas se guardan con
`@capacitor/preferences`, los precios se piden con `CapacitorHttp` y el cálculo de cartera usa las
mismas fórmulas que el servidor.

### Compilar la APK

Requisitos: Android SDK, **JDK 17-21** (Gradle todavía no admite JDK 22+) y Node 22+.

La forma más cómoda es el script incluido, que compila la web, la sincroniza y firma la APK:

```powershell
.\build-apk.ps1                      # usa el JDK del sistema
.\build-apk.ps1 -JdkPath "C:\jdk21"  # o uno concreto, sin tocar la configuración global
```

O paso a paso:

```bash
cd frontend
npm install
npm run cap:sync                 # compila la web y la copia al proyecto Android
cd android
./gradlew assembleRelease        # en Windows: .\gradlew.bat assembleRelease
```

La APK firmada queda en `frontend/android/app/build/outputs/apk/release/app-release.apk`
(y también se incluye una compilada en `dist-apk/ETH-Analyzer.apk`).
Cópiala al móvil e instálala permitiendo «orígenes desconocidos».

> Si Gradle falla con `Unsupported class file major version`, tu JDK es demasiado nuevo:
> descarga un [Temurin 21](https://adoptium.net/temurin/releases/?version=21) e indícalo
> con `-JdkPath`.

> El `app/build.gradle` incluye una ruta `flatDir` adicional hacia
> `node_modules/@capacitor/background-runner/.../libs`. Es necesaria para resolver el AAR del
> motor JS que usa el plugin de segundo plano; si se regenera el proyecto Android desde cero,
> hay que volver a añadirla.

> El keystore `frontend/android/app/eth-analyzer.keystore` firma la app. Consérvalo: si se
> pierde, Android tratará las compilaciones nuevas como una app distinta y habrá que desinstalar
> la anterior. Las contraseñas se pueden sobrescribir con `ETH_KEYSTORE_PASSWORD` y
> `ETH_KEY_PASSWORD`.

### Primeros pasos en el móvil

1. Abre **Ajustes** en la barra inferior.
2. En *Importar desde el PC*, escribe la dirección del backend en tu wifi
   (por ejemplo `http://192.168.1.50:4000`) y pulsa **Importar del PC**.
   Esto **sustituye** los datos del móvil por los del ordenador.
3. Pulsa **Permitir notificaciones** para recibir las alertas de precio.

También puedes exportar e importar un fichero JSON como copia de seguridad.

### Diferencias respecto a la web

| | Web | APK |
| --- | --- | --- |
| Navegación | pestañas en la cabecera | barra inferior con iconos |
| Datos | SQLite en Docker | almacenamiento del móvil |
| Origen de precios | backend (caché compartida) | Kraken directo |
| Alertas | poller del servidor cada minuto | segundo plano cada ~15 min |
| Conexión necesaria | el PC encendido | solo internet |

Los datos de la web y los de la app son **independientes**: la importación es unidireccional
(PC → móvil) y no hay sincronización automática.

> Android agrupa las tareas en segundo plano y puede retrasarlas en modo Doze. Para que las alertas
> lleguen puntuales, excluye la app del ahorro de batería en los ajustes del sistema.

## Variables de entorno

| Variable | Por defecto | Descripción |
| --- | --- | --- |
| `PORT` | `4000` | Puerto del backend |
| `DB_PATH` | `/data/eth.db` | Fichero SQLite (volumen `eth-data` en Docker) |
| `EXCEL_PATH` | `/import/Gastos Aplazados (2019_29).xlsx` | Excel de origen para el importador |
| `EXCEL_SHEET` | `Inversión Crypto` | Hoja a importar |
| `KRAKEN_BASE_URL` | `https://api.kraken.com` | Endpoint de Kraken |
| `KRAKEN_PAIR` | `ETHEUR` | Par de cotización de Kraken |
| `BASE_CURRENCY` | `eur` | Moneda de referencia |
| `PRICE_CACHE_TTL_MS` | `30000` | Caché del precio actual |
| `HISTORY_CACHE_TTL_MS` | `300000` | Caché del histórico |
| `ALERT_POLL_INTERVAL_MS` | `60000` | Frecuencia de evaluación de alertas |
| `BACKEND_PORT` / `FRONTEND_PORT` | `4000` / `8080` | Puertos publicados por Compose |

## Notas

- La **ganancia latente** (P/L no realizado) usa **coste medio ponderado**: cada venta reduce
  cantidad y coste de forma proporcional, y la diferencia entre lo cobrado y el coste de lo vendido
  es la **ganancia materializada** (P/L realizado).
- El **resultado total** sigue el criterio de la hoja original (*Total Acumulado*):
  `valor actual de la cartera − invertido neto`, donde el invertido neto es el dinero realmente
  aportado (`total comprado − total vendido`). Así, reinvertir el importe de una venta en una nueva
  compra no se contabiliza como dinero nuevo.
- Registra cada operación con su importe real: si tras una venta recompras reinvirtiendo lo
  cobrado, el importe de la compra debe incluir ese dinero, no solo la aportación nueva. De lo
  contrario el coste de la posición y el precio medio de compra salen distorsionados.
- Cada tarjeta del dashboard indica debajo la fórmula con la que se calcula.
- Kraken no requiere credenciales para estas cotizaciones públicas. El backend cachea precio e
  histórico para que todos los clientes compartan una sola llamada. Si la API falla, se sirve el
  último valor conocido marcado como `stale`. El rango **Máx** muestra los últimos 720 días, que
  es el histórico máximo disponible en este endpoint público.
- La aplicación no tiene autenticación: está pensada para uso local o en red doméstica.
