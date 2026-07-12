"use strict";

/* ---------- opslag ---------- */

const DEFAULT_CFG = {
  endpoint: "",
  token: "",
  cars: [{ name: "Volvo V40 D2", plate: "0-XXX-00", fuel: "diesel", lastKm: 0 }],
  defaultCarIdx: 0,
  purposes: ["Woon-werk", "Congres", "Werkbezoek", "Overleg extern"],
};

function loadJSON(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
const saveJSON = (key, v) => localStorage.setItem(key, JSON.stringify(v));

let cfg = { ...DEFAULT_CFG, ...loadJSON("cfg", {}) };
let activeTrip = loadJSON("activeTrip", null);
let outbox = loadJSON("outbox", []);

/* ---------- elementen ---------- */

const $ = (id) => document.getElementById(id);
const screens = { home: $("screen-home"), form: $("screen-form"), settings: $("screen-settings") };

function show(name) {
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
}

/* ---------- kilometerteller-wielen ---------- */

const WHEEL_DIGITS = 6;
const ITEM_H = 48; // moet gelijk zijn aan --wheel-item in style.css

function buildOdometer(value) {
  const container = $("odometer");
  container.innerHTML = "";
  const digits = String(Math.max(0, Math.min(999999, value))).padStart(WHEEL_DIGITS, "0");

  for (let i = 0; i < WHEEL_DIGITS; i++) {
    const wheel = document.createElement("div");
    wheel.className = "wheel";
    wheel.appendChild(Object.assign(document.createElement("div"), { className: "pad" }));
    for (let d = 0; d <= 9; d++) {
      const item = document.createElement("div");
      item.textContent = d;
      wheel.appendChild(item);
    }
    wheel.appendChild(Object.assign(document.createElement("div"), { className: "pad" }));
    if (i === WHEEL_DIGITS - 4) wheel.classList.add("thousands-gap");
    container.appendChild(wheel);
    wheel.addEventListener("scroll", onWheelScroll, { passive: true });
    // scrollpositie pas zetten als layout bekend is
    requestAnimationFrame(() => { wheel.scrollTop = Number(digits[i]) * ITEM_H; });
  }
  requestAnimationFrame(updateReadout);
}

function readOdometer() {
  let value = 0;
  for (const wheel of $("odometer").children) {
    const digit = Math.max(0, Math.min(9, Math.round(wheel.scrollTop / ITEM_H)));
    value = value * 10 + digit;
  }
  return value;
}

let scrollDebounce;
function onWheelScroll() {
  clearTimeout(scrollDebounce);
  scrollDebounce = setTimeout(updateReadout, 80);
}

function updateReadout() {
  const km = readOdometer();
  $("km-readout").innerHTML = `Stand: <b>${km.toLocaleString("nl-NL")}</b> km`;

  const priveHint = $("prive-hint");
  const distHint = $("distance-hint");
  priveHint.hidden = distHint.hidden = true;

  if (formPhase === "vertrek") {
    const gap = km - selectedCar().lastKm;
    if (gap > 0 && selectedCar().lastKm > 0) {
      priveHint.hidden = false;
      priveHint.className = "hint";
      priveHint.textContent = `${gap} km privé gereden sinds vorige rit`;
    }
  } else if (formPhase === "aankomst" && activeTrip) {
    const dist = km - activeTrip.startKm;
    distHint.hidden = false;
    distHint.className = dist >= 0 ? "hint ok" : "hint warn";
    distHint.textContent = dist >= 0
      ? `Ritafstand: ${dist} km`
      : "Eindstand is lager dan beginstand";
  }
}

/* ---------- locatie ---------- */

let currentLocation = null; // { lat, lon, label }

function captureLocation() {
  currentLocation = null;
  const status = $("location-status");
  status.textContent = "📍 locatie bepalen…";

  if (!navigator.geolocation) {
    status.textContent = "⚠️ Geen GPS beschikbaar — locatie blijft leeg";
    return;
  }
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const { latitude: lat, longitude: lon } = pos.coords;
    currentLocation = { lat, lon, label: `${lat.toFixed(5)}, ${lon.toFixed(5)}` };
    status.textContent = `📍 ${currentLocation.label} (adres opzoeken…)`;
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=nl`
      );
      const a = (await r.json()).address ?? {};
      const street = [a.road, a.house_number].filter(Boolean).join(" ");
      const place = [a.postcode, a.village || a.town || a.city].filter(Boolean).join(" ");
      const label = [street, place].filter(Boolean).join(", ");
      if (label) currentLocation.label = label;
    } catch { /* coördinaten zijn de fallback */ }
    status.textContent = `📍 ${currentLocation.label}`;
  }, () => {
    status.textContent = "⚠️ Locatie geweigerd of niet gevonden — blijft leeg";
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
}

/* ---------- formulier ---------- */

let formPhase = null;      // "vertrek" | "aankomst"
let selectedCarIdx = cfg.defaultCarIdx ?? 0;
let selectedPurpose = null;

const selectedCar = () => cfg.cars[selectedCarIdx] ?? cfg.cars[0];

function renderChips(container, labels, selectedIdx, onSelect) {
  container.innerHTML = "";
  labels.forEach((label, i) => {
    const chip = document.createElement("button");
    chip.className = "chip" + (i === selectedIdx ? " selected" : "");
    chip.textContent = label;
    chip.onclick = () => onSelect(i);
    container.appendChild(chip);
  });
}

function openForm(phase) {
  formPhase = phase;
  selectedPurpose = null;
  show("form");
  captureLocation();

  const isVertrek = phase === "vertrek";
  $("form-title").textContent = isVertrek ? "Nieuwe rit" : "Aankomst";
  $("car-block").hidden = !isVertrek;
  $("purpose-block").hidden = isVertrek;
  $("purpose-other").hidden = true;
  const saveBtn = $("btn-save");
  saveBtn.textContent = isVertrek ? "Vertrek" : "Rit opslaan";
  saveBtn.classList.toggle("arrive", !isVertrek);

  if (isVertrek) {
    selectedCarIdx = Math.min(cfg.defaultCarIdx ?? 0, cfg.cars.length - 1);
    $("new-car-form").hidden = true;
    renderCarChips();
    buildOdometer(selectedCar().lastKm);
  } else {
    renderPurposeChips();
    buildOdometer(activeTrip.startKm);
  }
}

function renderCarChips() {
  const labels = cfg.cars.map((c, i) => (i === (cfg.defaultCarIdx ?? 0) ? "★ " : "") + c.name);
  renderChips($("car-chips"), [...labels, "＋ Nieuwe auto"], selectedCarIdx, (i) => {
    if (i === cfg.cars.length) {
      $("new-car-form").hidden = !$("new-car-form").hidden;
      return;
    }
    selectedCarIdx = i;
    $("new-car-form").hidden = true;
    renderCarChips();
    buildOdometer(selectedCar().lastKm);
  });
  $("btn-make-default").hidden = selectedCarIdx === (cfg.defaultCarIdx ?? 0);
}

function addCar() {
  const name = $("nc-name").value.trim();
  if (!name) { alert("Vul minimaal een naam in."); return; }
  cfg.cars.push({
    name,
    plate: $("nc-plate").value.trim(),
    fuel: $("nc-fuel").value.trim(),
    lastKm: Number($("nc-km").value) || 0,
  });
  saveJSON("cfg", cfg);
  for (const id of ["nc-name", "nc-plate", "nc-fuel", "nc-km"]) $(id).value = "";
  $("new-car-form").hidden = true;
  selectedCarIdx = cfg.cars.length - 1;
  renderCarChips();
  buildOdometer(selectedCar().lastKm);
}

function renderPurposeChips() {
  const labels = [...cfg.purposes, "Anders…"];
  const idx = selectedPurpose === null ? -1 : labels.indexOf(selectedPurpose);
  renderChips($("purpose-chips"), labels, idx, (i) => {
    selectedPurpose = labels[i];
    $("purpose-other").hidden = selectedPurpose !== "Anders…";
    if (selectedPurpose === "Anders…") $("purpose-other").focus();
    renderPurposeChips();
  });
}

function saveForm() {
  const km = readOdometer();

  if (formPhase === "vertrek") {
    const car = selectedCar();
    activeTrip = {
      car: car.name,
      plate: car.plate ?? "",
      fuel: car.fuel,
      startKm: km,
      priveKm: car.lastKm > 0 ? Math.max(0, km - car.lastKm) : 0,
      startTime: new Date().toISOString(),
      startLocation: currentLocation?.label ?? "",
    };
    saveJSON("activeTrip", activeTrip);
  } else {
    if (km < activeTrip.startKm) {
      alert("De eindstand kan niet lager zijn dan de beginstand.");
      return;
    }
    let purpose = selectedPurpose;
    if (purpose === "Anders…") purpose = $("purpose-other").value.trim();
    if (!purpose) {
      alert("Kies of omschrijf een doel voor de rit.");
      return;
    }
    const trip = {
      ...activeTrip,
      endKm: km,
      distance: km - activeTrip.startKm,
      endTime: new Date().toISOString(),
      endLocation: currentLocation?.label ?? "",
      purpose,
    };
    outbox.push(trip);
    saveJSON("outbox", outbox);

    const car = cfg.cars.find((c) => c.name === trip.car);
    if (car) { car.lastKm = km; saveJSON("cfg", cfg); }
    activeTrip = null;
    saveJSON("activeTrip", null);
    flushOutbox();
  }
  renderHome();
  show("home");
}

/* ---------- versturen naar Google Sheet ---------- */

async function flushOutbox() {
  if (!cfg.endpoint || outbox.length === 0) { renderHome(); return; }
  while (outbox.length > 0) {
    const trip = outbox[0];
    try {
      const r = await fetch(cfg.endpoint, {
        method: "POST",
        body: JSON.stringify({ ...trip, token: cfg.token }),
      });
      const res = await r.json();
      if (!res.ok) throw new Error(res.error ?? "onbekende fout");
      outbox.shift();
      saveJSON("outbox", outbox);
    } catch {
      break; // netwerk weg of server-fout: later opnieuw proberen
    }
  }
  renderHome();
}

async function syncLastKm() {
  if (!cfg.endpoint || activeTrip) return;
  try {
    const r = await fetch(`${cfg.endpoint}?token=${encodeURIComponent(cfg.token)}`);
    const res = await r.json();
    if (!res.ok || !res.lastKmByCar) return;
    let changed = false;
    for (const car of cfg.cars) {
      const remote = res.lastKmByCar[car.name];
      if (remote > car.lastKm) { car.lastKm = remote; changed = true; }
    }
    if (changed) { saveJSON("cfg", cfg); renderHome(); }
  } catch { /* offline is prima */ }
}

/* ---------- startscherm ---------- */

function renderHome() {
  const status = $("home-status");
  const actionBtn = $("btn-action");
  const cancelBtn = $("btn-cancel-trip");

  if (activeTrip) {
    const start = new Date(activeTrip.startTime);
    status.innerHTML =
      `<div class="sub">Actieve rit — ${activeTrip.car}</div>` +
      `<div class="big">${activeTrip.startKm} km</div>` +
      `<div class="sub">vertrokken ${start.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}` +
      (activeTrip.startLocation ? ` vanaf ${activeTrip.startLocation}` : "") + `</div>`;
    actionBtn.textContent = "Aankomst";
    actionBtn.classList.add("arrive");
    cancelBtn.hidden = false;
  } else {
    const rows = cfg.cars
      .map((c, i) => `<div class="sub">${i === (cfg.defaultCarIdx ?? 0) ? "★ " : ""}${c.name}` +
        `${c.plate ? ` (${c.plate})` : ""}: <b>${c.lastKm.toLocaleString("nl-NL")}</b> km</div>`)
      .join("");
    status.innerHTML = `<div class="sub">Laatst genoteerde stand</div>${rows}`;
    actionBtn.textContent = "Nieuwe rit";
    actionBtn.classList.remove("arrive");
    cancelBtn.hidden = true;
  }

  const notice = $("outbox-notice");
  notice.hidden = outbox.length === 0;
  if (outbox.length > 0) {
    notice.textContent = cfg.endpoint
      ? `⏳ ${outbox.length} rit(ten) wachten op verzending naar het Sheet`
      : `⚠️ ${outbox.length} rit(ten) lokaal opgeslagen — stel de web-app URL in bij ⚙︎`;
  }
}

/* ---------- instellingen ---------- */

function openSettings() {
  $("cfg-endpoint").value = cfg.endpoint;
  $("cfg-token").value = cfg.token;
  $("cfg-cars").value = cfg.cars
    .map((c, i) => `${i === (cfg.defaultCarIdx ?? 0) ? "*" : ""}${c.name}, ${c.plate ?? ""}, ${c.fuel}, ${c.lastKm}`)
    .join("\n");
  $("cfg-purposes").value = cfg.purposes.join("\n");
  show("settings");
}

function saveSettings() {
  cfg.endpoint = $("cfg-endpoint").value.trim();
  cfg.token = $("cfg-token").value.trim();

  let defaultIdx = 0;
  const cars = $("cfg-cars").value.split("\n").map((line) => {
    const isDefault = line.trim().startsWith("*");
    const [name, plate, fuel, lastKm] = line.replace(/^\s*\*/, "").split(",").map((s) => s.trim());
    if (!name) return null;
    return { name, plate: plate || "", fuel: fuel || "", lastKm: Number(lastKm) || 0, isDefault };
  }).filter(Boolean);
  if (cars.length > 0) {
    defaultIdx = Math.max(0, cars.findIndex((c) => c.isDefault));
    cars.forEach((c) => delete c.isDefault);
    cfg.cars = cars;
    cfg.defaultCarIdx = defaultIdx;
  }
  selectedCarIdx = cfg.defaultCarIdx ?? 0;

  const purposes = $("cfg-purposes").value.split("\n").map((s) => s.trim()).filter(Boolean);
  if (purposes.length > 0) cfg.purposes = purposes;

  saveJSON("cfg", cfg);
  renderHome();
  flushOutbox();
  show("home");
}

/* ---------- init ---------- */

$("btn-action").onclick = () => openForm(activeTrip ? "aankomst" : "vertrek");
$("btn-add-car").onclick = addCar;
$("btn-make-default").onclick = () => {
  cfg.defaultCarIdx = selectedCarIdx;
  saveJSON("cfg", cfg);
  renderCarChips();
};
$("btn-save").onclick = saveForm;
$("btn-back").onclick = () => show("home");
$("btn-settings").onclick = openSettings;
$("btn-save-settings").onclick = saveSettings;
$("btn-settings-back").onclick = () => show("home");
$("btn-cancel-trip").onclick = () => {
  if (confirm("Actieve rit verwijderen? De vertrekgegevens gaan verloren.")) {
    activeTrip = null;
    saveJSON("activeTrip", null);
    renderHome();
  }
};

renderHome();
flushOutbox();
syncLastKm();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
