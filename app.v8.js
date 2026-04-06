const REPO_IMAGE_BASE = 'https://raw.githubusercontent.com/wes-s/ISSDisplay/main/Images';
const DEFAULT_USER_LAT = 35;
const HEIGHT = 500;
const WIDTH = HEIGHT * 2;
const CANVAS_HEIGHT = 550;
const PANEL_SIZE = 500;
const TOP_OFFSET = 25;
const MAP_RADIUS = PANEL_SIZE / 2;
const PROJECTION_SCALE = MAP_RADIUS / (Math.PI / 2);
const NORTH_CENTER_X = 250;
const SOUTH_CENTER_X = 750;
const CENTER_Y = TOP_OFFSET + PANEL_SIZE / 2;
const ISS_ID = 25544;
const ISS_INDEX = 6;
const AUTO_REFRESH_MS = 15 * 60 * 1000;

const IMAGE_URLS = {
  favicon: `${REPO_IMAGE_BASE}/favicon.ico`,
  corners: `${REPO_IMAGE_BASE}/corners.png`,
  iss: `${REPO_IMAGE_BASE}/iss.png`,
  hubble: `${REPO_IMAGE_BASE}/hubble.png`,
  usa224: `${REPO_IMAGE_BASE}/usa_224.png`,
  northDay: `${REPO_IMAGE_BASE}/north_day.png`,
  northNight: `${REPO_IMAGE_BASE}/north_night.png`,
  southDay: `${REPO_IMAGE_BASE}/south_day.png`,
  southNight: `${REPO_IMAGE_BASE}/south_night.png`,
  moonFull: `${REPO_IMAGE_BASE}/moon_full.png`,
  moonNew: `${REPO_IMAGE_BASE}/moon_new.png`,
  moonThirdQuarter: `${REPO_IMAGE_BASE}/moon_third_quarter.png`,
  moonWaningCrescent: `${REPO_IMAGE_BASE}/moon_waning_crescent.png`,
  moonWaningGibbous: `${REPO_IMAGE_BASE}/moon_waning_gibbous.png`,
  moonWaxingCrescent: `${REPO_IMAGE_BASE}/moon_waxing_crescent.png`,
  moonWaxingGibbous: `${REPO_IMAGE_BASE}/moon_waxing_gibbous.png`
};

const IMAGE_CACHE = new Map();
const params = new URLSearchParams(window.location.search);
const controls = document.getElementById('controls');
const keyInput = document.getElementById('key');
const satellitesInput = document.getElementById('satellites');
const proxyInput = document.getElementById('proxy');
const canvas = document.getElementById('display');
const ctx = canvas.getContext('2d');
const errorEl = document.getElementById('error');
const titleEl = document.getElementById('title');
let refreshTimer = null;

keyInput.value = params.get('key') || '';
satellitesInput.value = params.get('satellites') || '';
proxyInput.value = params.get('proxy') || '';

async function loadImage(url) {
  if (!IMAGE_CACHE.has(url)) {
    IMAGE_CACHE.set(url, new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      image.src = url;
    }));
  }
  return IMAGE_CACHE.get(url);
}

function proxiedUrl(url) {
  const proxy = (params.get('proxy') || '').trim();
  if (!proxy) return url;
  const normalized = proxy.replace(/\/$/, '');
  return `${normalized}/n2yo?url=${encodeURIComponent(url)}`;
}

async function fetchJson(url, errorPrefix) {
  let response;
  try {
    response = await fetch(url.includes('api.n2yo.com') ? proxiedUrl(url) : url);
  } catch (error) {
    throw new Error(`${errorPrefix}: network request failed. This may be a CORS restriction or a connectivity issue.`);
  }

  if (!response.ok) {
    throw new Error(`${errorPrefix}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function parseSatelliteIds(value) {
  if (typeof value !== 'string' || value.trim() === '') return [];
  return [...new Set(
    value
      .split(',')
      .map((part) => Number.parseInt(part.trim(), 10))
      .filter(Number.isFinite)
  )];
}

async function getIssPositions() {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const start = nowSeconds - (nowSeconds % 60) - 1080;
  const timestamps = Array.from({ length: 35 }, (_, index) => start + (180 * index));
  const url = `https://api.wheretheiss.at/v1/satellites/${ISS_ID}/positions?timestamps=${timestamps.join(',')}&units=miles`;
  const data = await fetchJson(url, 'ISS request failed');
  return data.map((row) => ({
    lat: row.latitude,
    lon: row.longitude,
    altitude: row.altitude,
    velocity: row.velocity,
    footprint: row.footprint,
    units: row.units,
    timestamp: row.timestamp
  }));
}

async function getN2yoSatellitePath(satelliteId, apiKey) {
  const url = `https://api.n2yo.com/rest/v1/satellite/positions/${satelliteId}/0/0/0/1000/&apiKey=${encodeURIComponent(apiKey)}`;
  const data = await fetchJson(url, `N2YO request failed for ${satelliteId}`);
  return (data.positions || [])
    .filter((_, index) => index % 100 === 0)
    .map((position) => ({
      lat: position.satlatitude,
      lon: position.satlongitude,
      satName: data.info?.satname || `Satellite ${satelliteId}`
    }));
}

async function getMoonState() {
  const phaseName = getMoonPhaseName(new Date());

  const jd = (Date.now() / 86400000) + 2440587.5;
  const d = jd - 2451543.5;
  const n = normalizeDegrees(125.1228 - 0.0529538083 * d);
  const i = 5.1454;
  const w = normalizeDegrees(318.0634 + 0.1643573223 * d);
  const a = 60.2666;
  const e = 0.0549;
  const m = normalizeDegrees(115.3654 + 13.0649929509 * d);

  const e0 = m + radiansToDegrees(e * Math.sin(toRadians(m)) * (1 + e * Math.cos(toRadians(m))));
  const xv = a * (Math.cos(toRadians(e0)) - e);
  const yv = a * (Math.sqrt(1 - e * e) * Math.sin(toRadians(e0)));
  const v = radiansToDegrees(Math.atan2(yv, xv));
  const r = Math.sqrt(xv * xv + yv * yv);

  const xh = r * (Math.cos(toRadians(n)) * Math.cos(toRadians(v + w)) - Math.sin(toRadians(n)) * Math.sin(toRadians(v + w)) * Math.cos(toRadians(i)));
  const yh = r * (Math.sin(toRadians(n)) * Math.cos(toRadians(v + w)) + Math.cos(toRadians(n)) * Math.sin(toRadians(v + w)) * Math.cos(toRadians(i)));
  const zh = r * (Math.sin(toRadians(v + w)) * Math.sin(toRadians(i)));

  const eps = 23.4393 - 3.563e-7 * d;
  const xe = xh;
  const ye = yh * Math.cos(toRadians(eps)) - zh * Math.sin(toRadians(eps));
  const ze = yh * Math.sin(toRadians(eps)) + zh * Math.cos(toRadians(eps));

  const ra = normalizeDegrees(radiansToDegrees(Math.atan2(ye, xe)));
  const dec = radiansToDegrees(Math.atan2(ze, Math.sqrt(xe * xe + ye * ye)));
  const gmst = normalizeDegrees(280.46061837 + 360.98564736629 * (jd - 2451545.0));

  return {
    phaseName,
    subLat: dec,
    subLon: normalizeLongitude(ra - gmst)
  };
}

function getMoonPath(subLat, subLon) {
  return getCircleBoundary(subLat, subLon, 10001, 73);
}

function getSunPosition() {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const diff = now.getTime() - start;
  const dayOfYear = Math.floor(diff / 86400000);
  const minutesOfDay = now.getUTCHours() * 60 + now.getUTCMinutes();
  const declination = 23.45 * Math.sin(toRadians((360 / 365) * (284.99 + dayOfYear)));
  const subLon = -1 * (360 * (minutesOfDay - 720) / 1440);
  return { lat: declination, lon: subLon };
}

function projectPath(rows, userLat, height) {
  const projected = rows.map((row) => projectSingle(row, userLat, height));

  for (let index = 0; index < projected.length; index += 1) {
    const current = projected[index];
    const next = projected[index + 1];

    current.visible = Number.isFinite(current.x) && Number.isFinite(current.y) && Math.hypot(current.x, current.y) <= MAP_RADIUS;
    if (!current.visible) {
      current.x = Number.NaN;
      current.y = Number.NaN;
      current.bearingToNext = Number.NaN;
      continue;
    }

    if (next) {
      const nextProjected = projectSingle(next, userLat, height);
      const nextVisible = Number.isFinite(nextProjected.x) && Number.isFinite(nextProjected.y) && Math.hypot(nextProjected.x, nextProjected.y) <= MAP_RADIUS;
      if (nextVisible) {
        current.bearingToNext = Math.atan2(nextProjected.y - current.y, nextProjected.x - current.x) - 1.5708;
      } else {
        current.bearingToNext = Number.NaN;
      }
    } else {
      current.bearingToNext = Number.NaN;
    }
  }

  return projected;
}

function projectSingle(row, userLat, height) {
  const radLat = toRadians(row.lat);
  const radLon = toRadians(row.lon);
  const northern = userLat >= 0;
  const colat = northern ? (Math.PI / 2 - radLat) : (Math.PI / 2 + radLat);
  const rho = PROJECTION_SCALE * colat;

  return {
    ...row,
    x: rho * Math.sin(radLon),
    y: northern ? (-rho * Math.cos(radLon)) : (rho * Math.cos(radLon))
  };
}

function getCircleBoundary(lat, lon, distanceKm, points) {
  const lat1 = toRadians(lat);
  const lon1 = toRadians(lon);
  const earthRadiusKm = 6371;

  return Array.from({ length: points }, (_, index) => {
    const bearing = toRadians(index * 5);
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(distanceKm / earthRadiusKm) +
      Math.cos(lat1) * Math.sin(distanceKm / earthRadiusKm) * Math.cos(bearing)
    );
    let lon2 = lon1 + Math.atan2(
      Math.sin(bearing) * Math.sin(distanceKm / earthRadiusKm) * Math.cos(lat1),
      Math.cos(distanceKm / earthRadiusKm) - Math.sin(lat1) * Math.sin(lat2)
    );
    lon2 = normalizeLongitude(radiansToDegrees(lon2));
    return { lat: radiansToDegrees(lat2), lon: lon2 };
  });
}

function computeFootprintRadius(footprint) {
  return Math.max(8, Math.round(2 * Math.sqrt(((Math.abs(footprint) * WIDTH) / HEIGHT) / Math.PI)));
}

function toCanvasPoint(point, centerX) {
  return { x: centerX + point.x, y: CENTER_Y - point.y };
}

function inverseProject(x, y, hemisphereLat) {
  const rho = Math.hypot(x, y);
  if (rho > MAP_RADIUS) return null;
  if (rho === 0) return { lat: hemisphereLat >= 0 ? 90 : -90, lon: 0 };

  const c = rho / PROJECTION_SCALE;
  const t1 = hemisphereLat >= 0 ? Math.PI / 2 : -Math.PI / 2;
  const lat = Math.asin(Math.cos(c) * Math.sin(t1) + (y * Math.sin(c) * Math.cos(t1) / rho));
  const lon = Math.atan2(x * Math.sin(c), rho * Math.cos(t1) * Math.cos(c) - y * Math.sin(t1) * Math.sin(c));
  return { lat: radiansToDegrees(lat), lon: normalizeLongitude(radiansToDegrees(lon)) };
}

function angularDistanceDegrees(lat1, lon1, lat2, lon2) {
  const a1 = toRadians(lat1);
  const b1 = toRadians(lon1);
  const a2 = toRadians(lat2);
  const b2 = toRadians(lon2);
  const cosD = Math.sin(a1) * Math.sin(a2) + Math.cos(a1) * Math.cos(a2) * Math.cos(b1 - b2);
  return radiansToDegrees(Math.acos(Math.max(-1, Math.min(1, cosD))));
}

function getMoonImageUrl(phaseName) {
  const map = {
    'New': IMAGE_URLS.moonNew,
    'Waxing Crescent': IMAGE_URLS.moonWaxingCrescent,
    'First Quarter': IMAGE_URLS.moonWaxingGibbous,
    'Waxing Gibbous': IMAGE_URLS.moonWaxingGibbous,
    'Full': IMAGE_URLS.moonFull,
    'Waning Gibbous': IMAGE_URLS.moonWaningGibbous,
    'Third Quarter': IMAGE_URLS.moonThirdQuarter,
    'Waning Crescent': IMAGE_URLS.moonWaningCrescent
  };
  return map[phaseName] || IMAGE_URLS.moonFull;
}


function getMoonPhaseName(now = new Date()) {
  const synodicMonth = 29.530588853;
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14, 0);
  const daysSince = (now.getTime() - knownNewMoon) / 86400000;
  const age = ((daysSince % synodicMonth) + synodicMonth) % synodicMonth;

  if (age < 1.84566) return "New";
  if (age < 5.53699) return "Waxing Crescent";
  if (age < 9.22831) return "First Quarter";
  if (age < 12.91963) return "Waxing Gibbous";
  if (age < 16.61096) return "Full";
  if (age < 20.30228) return "Waning Gibbous";
  if (age < 23.99361) return "Third Quarter";
  if (age < 27.68493) return "Waning Crescent";
  return "New";
}

function normalizePhaseName(value) {
  const lookup = {
    'New Moon': 'New',
    'Waxing Crescent': 'Waxing Crescent',
    'First Quarter': 'First Quarter',
    'Waxing Gibbous': 'Waxing Gibbous',
    'Full Moon': 'Full',
    'Full': 'Full',
    'Waning Gibbous': 'Waning Gibbous',
    'Last Quarter': 'Third Quarter',
    'Third Quarter': 'Third Quarter',
    'Waning Crescent': 'Waning Crescent'
  };
  return lookup[value] || 'Full';
}

function pickColor(index, total) {
  const hue = Math.round((index / Math.max(1, total)) * 300);
  return `hsl(${hue}, 85%, 60%)`;
}

function drawPath(points, centerX, color, lineWidth, alpha) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.globalAlpha = alpha;
  ctx.beginPath();

  let started = false;
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      started = false;
      continue;
    }
    const canvasPoint = toCanvasPoint(point, centerX);
    if (!started) {
      ctx.moveTo(canvasPoint.x, canvasPoint.y);
      started = true;
    } else {
      ctx.lineTo(canvasPoint.x, canvasPoint.y);
    }
  }

  ctx.stroke();
  ctx.restore();
}

function drawArrows(points, centerX, color, size, alpha) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;

  points.forEach((point) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.bearingToNext)) return;
    const canvasPoint = toCanvasPoint(point, centerX);
    const x = canvasPoint.x;
    const y = canvasPoint.y;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-point.bearingToNext);
    ctx.beginPath();
    ctx.moveTo(0, -size / 2);
    ctx.lineTo(size / 2.2, size / 2);
    ctx.lineTo(-size / 2.2, size / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });

  ctx.restore();
}

function drawMarker(point, centerX, color, radius, alpha) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
  const canvasPoint = toCanvasPoint(point, centerX);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(canvasPoint.x, canvasPoint.y, Math.max(4, radius / 2), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

async function drawIcon(point, centerX, url, size) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
  const image = await loadImage(url);
  const canvasPoint = toCanvasPoint(point, centerX);
  ctx.drawImage(image, canvasPoint.x - size / 2, canvasPoint.y - size / 2, size, size);
}

function drawHemisphereComposite(nightImage, dayImage, centerX, hemisphereLat, sunPosition) {
  const left = centerX - PANEL_SIZE / 2;
  const top = TOP_OFFSET;
  ctx.drawImage(nightImage, left, top, PANEL_SIZE, PANEL_SIZE);

  const offscreen = document.createElement('canvas');
  offscreen.width = PANEL_SIZE;
  offscreen.height = PANEL_SIZE;
  const octx = offscreen.getContext('2d');
  octx.drawImage(dayImage, 0, 0, PANEL_SIZE, PANEL_SIZE);

  const imageData = octx.getImageData(0, 0, PANEL_SIZE, PANEL_SIZE);
  const pixels = imageData.data;
  const feather = 7.5;
  for (let py = 0; py < PANEL_SIZE; py += 1) {
    for (let px = 0; px < PANEL_SIZE; px += 1) {
      const x = px - PANEL_SIZE / 2;
      const y = PANEL_SIZE / 2 - py;
      const ll = inverseProject(x, y, hemisphereLat);
      const index = (py * PANEL_SIZE + px) * 4;
      if (!ll) {
        pixels[index + 3] = 0;
        continue;
      }
      const delta = 90 - angularDistanceDegrees(ll.lat, ll.lon, sunPosition.lat, sunPosition.lon);
      const alpha = Math.max(0, Math.min(1, (delta + feather) / (feather * 2)));
      pixels[index + 3] = Math.round(pixels[index + 3] * alpha);
    }
  }
  octx.putImageData(imageData, 0, 0);
  ctx.drawImage(offscreen, left, top, PANEL_SIZE, PANEL_SIZE);
}

function drawLegend(issImage, adhocImage, adhoc) {
  ctx.save();
  ctx.font = '12px Arial';
  ctx.fillStyle = '#fff';
  ctx.globalAlpha = 1;

  ctx.fillStyle = 'rgba(128, 0, 128, 0.7)';
  ctx.beginPath();
  ctx.arc(40, 32, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(issImage, 20, 12, 40, 40);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText('ISS', 58, 32);

  adhoc.forEach((sat, index) => {
    const x = 130 + (index * 170);
    ctx.fillStyle = sat.color;
    ctx.beginPath();
    ctx.arc(x + 20, 20, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(adhocImage, x, 0, 40, 40);
    ctx.fillStyle = '#fff';
    ctx.fillText(sat.name, x + 50, 25);
  });

  ctx.restore();
}

async function buildDisplayData() {
  const key = keyInput.value.trim();
  const satellites = parseSatelliteIds(satellitesInput.value);

  const [issPositions, moonState] = await Promise.all([
    getIssPositions(),
    getMoonState()
  ]);

  const sunPosition = getSunPosition();

  const northIss = projectPath(issPositions, DEFAULT_USER_LAT, HEIGHT);
  const southIss = projectPath(issPositions, -DEFAULT_USER_LAT, HEIGHT);

  const moonPath = getMoonPath(moonState.subLat, moonState.subLon);
  const northMoonPath = projectPath(moonPath, DEFAULT_USER_LAT, HEIGHT);
  const southMoonPath = projectPath(moonPath, -DEFAULT_USER_LAT, HEIGHT);

  const northMoonPosition = projectSingle({ lat: moonState.subLat, lon: moonState.subLon }, DEFAULT_USER_LAT, HEIGHT);
  northMoonPosition.visible = Number.isFinite(northMoonPosition.x) && Number.isFinite(northMoonPosition.y) && Math.hypot(northMoonPosition.x, northMoonPosition.y) <= MAP_RADIUS;
  const southMoonPosition = projectSingle({ lat: moonState.subLat, lon: moonState.subLon }, -DEFAULT_USER_LAT, HEIGHT);
  southMoonPosition.visible = Number.isFinite(southMoonPosition.x) && Number.isFinite(southMoonPosition.y) && Math.hypot(southMoonPosition.x, southMoonPosition.y) <= MAP_RADIUS;

  let adhoc = [];
  if (key && satellites.length > 0) {
    adhoc = await Promise.all(
      satellites.map(async (satelliteId, index) => {
        const path = await getN2yoSatellitePath(satelliteId, key);
        return {
          satelliteId,
          color: pickColor(index, satellites.length),
          name: path[0]?.satName || `Satellite ${satelliteId}`,
          north: projectPath(path, DEFAULT_USER_LAT, HEIGHT),
          south: projectPath(path, -DEFAULT_USER_LAT, HEIGHT)
        };
      })
    );
  }

  const currentIss = issPositions[ISS_INDEX] || issPositions[issPositions.length - 1] || null;

  const title = currentIss
    ? `Lat:${round(currentIss.lat, 2)}  Lon:${round(currentIss.lon, 2)}  Altitude:${round(currentIss.altitude, 2)} ${currentIss.units}  Speed:${round(currentIss.velocity, 2)} ${currentIss.units} per hour`
    : '';

  return {
    meta: {
      keyProvided: Boolean(key),
      satelliteIds: satellites,
      userLat: DEFAULT_USER_LAT,
      width: WIDTH,
      height: HEIGHT,
      canvasHeight: CANVAS_HEIGHT,
      issIndex: ISS_INDEX,
      footprint: computeFootprintRadius(issPositions[ISS_INDEX]?.footprint || 0),
      title
    },
    images: {
      ...IMAGE_URLS,
      moon: getMoonImageUrl(moonState.phaseName)
    },
    layers: {
      sunPosition,
      northIss,
      southIss,
      northMoonPath,
      southMoonPath,
      northMoonPosition,
      southMoonPosition,
      adhoc
    },
    moon: moonState
  };
}

async function render() {
  errorEl.textContent = '';

  const nextParams = new URLSearchParams();
  if (keyInput.value.trim()) nextParams.set('key', keyInput.value.trim());
  if (satellitesInput.value.trim()) nextParams.set('satellites', satellitesInput.value.trim());
  if (proxyInput.value.trim()) nextParams.set('proxy', proxyInput.value.trim());
  const newUrl = window.location.pathname + (nextParams.toString() ? `?${nextParams.toString()}` : '');
  history.replaceState(null, '', newUrl);

  const data = await buildDisplayData();
  titleEl.textContent = data.meta.title || '';

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const [northNight, northDay, southNight, southDay, corners, moon, iss, hubble] = await Promise.all([
    loadImage(data.images.northNight),
    loadImage(data.images.northDay),
    loadImage(data.images.southNight),
    loadImage(data.images.southDay),
    loadImage(data.images.corners),
    loadImage(data.images.moon),
    loadImage(data.images.iss),
    loadImage(data.images.hubble)
  ]);

  drawHemisphereComposite(northNight, northDay, NORTH_CENTER_X, DEFAULT_USER_LAT, data.layers.sunPosition);
  ctx.drawImage(corners, 0, TOP_OFFSET, PANEL_SIZE, PANEL_SIZE);

  drawHemisphereComposite(southNight, southDay, SOUTH_CENTER_X, -DEFAULT_USER_LAT, data.layers.sunPosition);
  ctx.drawImage(corners, PANEL_SIZE, TOP_OFFSET, PANEL_SIZE, PANEL_SIZE);

  drawPath(data.layers.northIss, NORTH_CENTER_X, 'purple', 1, 0.8);
  drawArrows(data.layers.northIss, NORTH_CENTER_X, 'purple', 10, 0.8);
  drawMarker(data.layers.northIss[data.meta.issIndex], NORTH_CENTER_X, 'purple', data.meta.footprint, 0.5);
  await drawIcon(data.layers.northIss[data.meta.issIndex], NORTH_CENTER_X, data.images.iss, 40);

  drawPath(data.layers.southIss, SOUTH_CENTER_X, 'purple', 1, 0.8);
  drawArrows(data.layers.southIss, SOUTH_CENTER_X, 'purple', 10, 0.8);
  drawMarker(data.layers.southIss[data.meta.issIndex], SOUTH_CENTER_X, 'purple', data.meta.footprint, 0.5);
  await drawIcon(data.layers.southIss[data.meta.issIndex], SOUTH_CENTER_X, data.images.iss, 40);

  drawPath(data.layers.northMoonPath, NORTH_CENTER_X, 'rgba(220,220,220,0.35)', 1, 0.45);
  drawArrows(data.layers.northMoonPath, NORTH_CENTER_X, 'rgba(220,220,220,0.55)', 6, 0.55);
  drawPath(data.layers.southMoonPath, SOUTH_CENTER_X, 'rgba(220,220,220,0.35)', 1, 0.45);
  drawArrows(data.layers.southMoonPath, SOUTH_CENTER_X, 'rgba(220,220,220,0.55)', 6, 0.55);

  if (data.layers.northMoonPosition.visible) {
    const p = toCanvasPoint(data.layers.northMoonPosition, NORTH_CENTER_X);
    ctx.drawImage(moon, p.x - 37, p.y - 37, 74, 74);
  }
  if (data.layers.southMoonPosition.visible) {
    const p = toCanvasPoint(data.layers.southMoonPosition, SOUTH_CENTER_X);
    ctx.drawImage(moon, p.x - 37, p.y - 37, 74, 74);
  }

  for (const sat of data.layers.adhoc) {
    drawPath(sat.north, NORTH_CENTER_X, sat.color, 1, 0.9);
    drawArrows(sat.north, NORTH_CENTER_X, sat.color, 8, 0.9);
    drawMarker(sat.north[0], NORTH_CENTER_X, sat.color, 12, 0.9);
    await drawIcon(sat.north[0], NORTH_CENTER_X, data.images.hubble, 40);

    drawPath(sat.south, SOUTH_CENTER_X, sat.color, 1, 0.9);
    drawArrows(sat.south, SOUTH_CENTER_X, sat.color, 8, 0.9);
    drawMarker(sat.south[0], SOUTH_CENTER_X, sat.color, 12, 0.9);
    await drawIcon(sat.south[0], SOUTH_CENTER_X, data.images.hubble, 40);
  }

  drawLegend(iss, hubble, data.layers.adhoc);
}

controls.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await render();
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => window.location.reload(), AUTO_REFRESH_MS);
  } catch (error) {
    errorEl.textContent = formatError(error);
  }
});

render().then(() => {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => window.location.reload(), AUTO_REFRESH_MS);
}).catch((error) => {
  errorEl.textContent = formatError(error);
});

function formatError(error) {
  const text = error instanceof Error ? error.message : String(error);
  if (text.includes('CORS')) {
    return `${text}\n\nThis static build depends on the browser being allowed to call the upstream APIs directly.`;
  }
  return text;
}

function toRadians(value) { return (value * Math.PI) / 180; }
function radiansToDegrees(value) { return (value * 180) / Math.PI; }
function round(value, digits) { return Number.parseFloat(value.toFixed(digits)); }
function normalizeDegrees(value) { return ((value % 360) + 360) % 360; }
function normalizeLongitude(value) {
  let lon = value;
  while (lon < -180) lon += 360;
  while (lon > 180) lon -= 360;
  return lon;
}
