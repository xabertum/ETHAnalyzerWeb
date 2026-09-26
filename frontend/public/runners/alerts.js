/**
 * Tarea de segundo plano que comprueba el precio de ETH y avisa si se cruza un umbral.
 *
 * Se ejecuta en un contexto JS aislado, sin DOM ni acceso al almacenamiento de la app,
 * por lo que la aplicación le sincroniza las alertas mediante el evento `syncAlerts`
 * y aquí se conservan en CapacitorKV junto con su estado de disparo.
 */

const ALERTS_KEY = 'alerts';
const STATE_KEY = 'alertState';
const PRICE_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=eur';

function readJson(key, fallback) {
  try {
    const raw = CapacitorKV.get(key);
    const value = raw && typeof raw === 'object' ? raw.value : raw;
    if (!value) return fallback;
    return JSON.parse(value);
  } catch (error) {
    console.error('No se pudo leer ' + key + ': ' + error);
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    CapacitorKV.set(key, JSON.stringify(value));
  } catch (error) {
    console.error('No se pudo guardar ' + key + ': ' + error);
  }
}

function formatEur(value) {
  return value.toFixed(2).replace('.', ',') + ' €';
}

function conditionMet(alert, price) {
  return alert.direction === 'ABOVE' ? price >= alert.thresholdEur : price <= alert.thresholdEur;
}

addEventListener('syncAlerts', (resolve, reject, args) => {
  try {
    const alerts = (args && args.alerts) || [];
    writeJson(ALERTS_KEY, alerts);
    resolve();
  } catch (error) {
    reject(error);
  }
});

addEventListener('checkAlerts', async (resolve, reject) => {
  try {
    const alerts = readJson(ALERTS_KEY, []).filter((alert) => alert && alert.enabled);
    if (alerts.length === 0) {
      resolve();
      return;
    }

    const response = await fetch(PRICE_URL);
    if (!response.ok) throw new Error('CoinGecko respondió ' + response.status);

    const payload = await response.json();
    const price = payload && payload.ethereum && payload.ethereum.eur;
    if (typeof price !== 'number') throw new Error('Respuesta sin precio válido');

    const state = readJson(STATE_KEY, {});
    const notifications = [];

    for (const alert of alerts) {
      const key = String(alert.id);
      const met = conditionMet(alert, price);

      if (!met) {
        // El precio ha vuelto al otro lado del umbral: la alerta queda rearmada.
        if (state[key]) delete state[key];
        continue;
      }

      if (state[key]) continue;

      state[key] = new Date().toISOString();
      notifications.push({
        id: 200000 + alert.id,
        title: '🔔 ' + alert.label,
        body:
          'ETH ' +
          (alert.direction === 'ABOVE' ? 'ha superado' : 'ha bajado de') +
          ' ' +
          formatEur(alert.thresholdEur) +
          ' · precio actual ' +
          formatEur(price),
      });
    }

    writeJson(STATE_KEY, state);

    if (notifications.length > 0) {
      CapacitorNotifications.schedule(notifications);
    }

    resolve();
  } catch (error) {
    console.error('checkAlerts falló: ' + error);
    reject(error);
  }
});
