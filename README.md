# Kilometerregistratie

Een lichtgewicht PWA voor het registreren van zakelijke ritten met de privéauto
(€/km-aftrek). Twee handelingen per rit:

1. **Vertrek** — scroll de kilometerteller naar de huidige stand (start altijd op de
   laatst genoteerde stand), locatie wordt automatisch via GPS bepaald. ±5 seconden.
2. **Aankomst** — scroll naar de eindstand, tik het ritdoel aan. De app rekent de
   kilometers uit en schrijft de complete rit als rij naar een Google Sheet, met per
   jaar een eigen tabblad. Dat Sheet is meteen het jaaroverzicht voor de belasting.

Kilometers die tussen twee zakelijke ritten privé zijn gereden worden automatisch
gesignaleerd en in een aparte kolom vastgelegd, zodat de administratie sluitend is.

## Eenmalige installatie

### 1. Google Sheet + Apps Script (de "backend")

1. Maak op [sheets.google.com](https://sheets.google.com) een nieuw, leeg Sheet
   (bijv. "Kilometerregistratie").
2. Ga naar **Extensies → Apps Script**, verwijder de voorbeeldcode en plak de inhoud
   van [`apps-script/Code.gs`](apps-script/Code.gs).
3. Verander bovenin de regel `const TOKEN = "verander-dit-token"` in een eigen
   willekeurig wachtwoord.
4. Klik **Implementeren → Nieuwe implementatie → type: Web-app** met:
   - *Uitvoeren als*: **Ik**
   - *Wie heeft toegang*: **Iedereen**
5. Autoriseer het script en kopieer de web-app-URL (eindigt op `/exec`).

> Bij latere wijzigingen aan Code.gs: **Implementeren → Implementaties beheren →
> potloodje → Nieuwe versie**, anders blijft de oude code draaien.

### 2. De app hosten

De app is een statische pagina; GitHub Pages is gratis en voldoende:

```sh
git init && git add -A && git commit -m "Kilometerregistratie"
gh repo create kilometerregistratie --public --source=. --push
gh api repos/{owner}/kilometerregistratie/pages -X POST \
  -f 'source[branch]=main' -f 'source[path]=/'
```

De app staat dan op `https://<gebruikersnaam>.github.io/kilometerregistratie/`
(deze instantie: https://lucasdevries.github.io/kilometerregistratie/).
(HTTPS is verplicht voor GPS; lokaal testen kan via `python3 -m http.server` op
`http://localhost:8000`.)

### 3. Op de telefoon

1. Open de URL in Safari (iPhone) of Chrome (Android).
2. **Deel → Zet op beginscherm** — de app werkt daarna als losse app.
3. Tik op ⚙︎ en vul in:
   - de web-app-URL uit stap 1,
   - het token,
   - je auto's, één per regel: `naam, kenteken, brandstof, huidige km-stand`,
     met een `*` voor de standaardauto (bijv. `*Volvo V40 D2, 0-XXX-00, diesel, 123456`),
   - de vaste ritdoelen (één per regel; "Anders…" komt er altijd automatisch bij).
4. Geef bij de eerste rit toestemming voor locatie.

## Delen met vrienden

Stuur ze gewoon de app-URL. Iedereen koppelt zijn eigen Google Sheet: in de app
onder ⚙︎ staat een stap-voor-stap-uitleg ("Zo koppel je je eigen Google Sheet")
inclusief een knop die de benodigde scriptcode naar het klembord kopieert.
Niemand hoeft hiervoor naar GitHub of deze README.

## Hoe het werkt

- **Auto's**: de standaardauto (★) staat bij vertrek voorgeselecteerd. Op het
  vertrekscherm kun je met "＋ Nieuwe auto" direct een auto toevoegen (naam,
  kenteken, brandstof, beginstand) en elke geselecteerde auto tot standaard maken.
- **Kilometerteller**: zes scrollwieltjes (iOS-picker-stijl), vooringevuld met de
  laatst bekende stand van de gekozen auto. Bij aankomst start het wiel op de
  vertrekstand.
- **Locatie**: GPS-coördinaten worden via OpenStreetMap (Nominatim) omgezet naar
  straat + postcode + plaats. Zonder bereik of toestemming blijft het veld leeg of
  bevat het de kale coördinaten — de rit gaat gewoon door.
- **Offline**: afgeronde ritten die niet verstuurd kunnen worden (parkeergarage)
  blijven in een lokale wachtrij staan en worden bij de volgende start van de app
  alsnog verstuurd.
- **Meerdere apparaten**: de app haalt bij het openen de laatst bekende km-stand per
  auto op uit het Sheet, zodat handmatig in het Sheet toegevoegde ritten meetellen.

## Jaaroverzicht voor de belasting

Elk jaar krijgt automatisch een eigen tabblad met de kolommen: datum, vertrek- en
aankomsttijd, auto, kenteken, brandstof, km-stand vertrek/aankomst, zakelijke km,
privé km sinds vorige rit, beide locaties en het doel. Nieuwe ritten worden altijd
onderaan toegevoegd — zet totaalformules daarom rechts náást de tabel (niet
eronder), bijvoorbeeld:

```
O1: Totaal zakelijk     P1: =SUM(I2:I)
O2: Aftrek €0,23/km     P2: =SUM(I2:I)*0,23
```

Exporteren voor de belasting: **Bestand → Downloaden → Microsoft Excel (.xlsx)**.
