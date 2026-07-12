/**
 * Kilometerregistratie — Google Apps Script backend.
 *
 * Installatie: zie README.md in de repo. Kort:
 *  1. Maak een nieuw Google Sheet.
 *  2. Extensies → Apps Script, plak dit bestand, pas TOKEN aan.
 *  3. Implementeren → Nieuwe implementatie → Web-app,
 *     uitvoeren als "Ik", toegang "Iedereen".
 *  4. Zet de web-app-URL en het token in de app-instellingen (⚙︎).
 */

const TOKEN = "verander-dit-token";

const HEADER = [
  "Datum", "Vertrektijd", "Aankomsttijd", "Auto", "Kenteken", "Brandstof",
  "Km-stand vertrek", "Km-stand aankomst", "Zakelijke km",
  "Privé km sinds vorige rit", "Vertreklocatie", "Aankomstlocatie", "Doel",
];

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: "ongeldige JSON" });
  }
  if (data.token !== TOKEN) return json_({ ok: false, error: "ongeldig token" });

  const start = new Date(data.startTime);
  const end = new Date(data.endTime);
  const sheet = yearSheet_(start.getFullYear());

  sheet.appendRow([
    Utilities.formatDate(start, tz_(), "dd-MM-yyyy"),
    Utilities.formatDate(start, tz_(), "HH:mm"),
    Utilities.formatDate(end, tz_(), "HH:mm"),
    data.car,
    data.plate || "",
    data.fuel,
    data.startKm,
    data.endKm,
    data.distance,
    data.priveKm || 0,
    data.startLocation,
    data.endLocation,
    data.purpose,
  ]);

  return json_({ ok: true });
}

function doGet(e) {
  if (!e.parameter || e.parameter.token !== TOKEN) {
    return json_({ ok: false, error: "ongeldig token" });
  }
  return json_({ ok: true, lastKmByCar: lastKmByCar_() });
}

/** Laatste km-stand per auto over alle jaartabbladen, voor synchronisatie tussen apparaten. */
function lastKmByCar_() {
  const result = {};
  for (const sheet of SpreadsheetApp.getActiveSpreadsheet().getSheets()) {
    if (!/^\d{4}$/.test(sheet.getName()) || sheet.getLastRow() < 2) continue;
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADER.length).getValues();
    for (const row of rows) {
      const car = row[3];
      const endKm = Number(row[7]);
      if (car && endKm > (result[car] || 0)) result[car] = endKm;
    }
  }
  return result;
}

function yearSheet_(year) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(String(year));
  if (!sheet) {
    sheet = ss.insertSheet(String(year));
    sheet.appendRow(HEADER);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADER.length).setFontWeight("bold");
  }
  return sheet;
}

function tz_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || "Europe/Amsterdam";
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
