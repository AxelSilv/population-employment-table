// script.js
// Rakentaa sivun sisällön, hakee väestö- ja työllisyysdatan, täyttää taulukon ja tekee ehdollisen värjäyksen.

// PxWeb-päätepisteet:
const POPULATION_API =
  "https://pxdata.stat.fi/PxWeb/api/v1/fi/StatFin/vaerak/statfin_vaerak_pxt_11ra.px";
const EMPLOYMENT_API =
  "https://pxdata.stat.fi/PxWeb/api/v1/fi/StatFin/tyokay/statfin_tyokay_pxt_115b.px";

// Paikalliset kyselytiedostot (huom. käyttäjän pyytämä tiedostonimi "emlployment_query.json"):
const POPULATION_QUERY_FILE = "population_query.json";
const EMPLOYMENT_QUERY_FILE = "employment_query.json";

// Apu: luo elementti helpolla API:lla
const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else node.setAttribute(k, v);
  });
  children.forEach((c) => node.appendChild(c));
  return node;
};

// Apu: lataa paikallinen JSON-tiedosto
async function loadLocalJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

// Apu: POST PxWebille
async function postPxweb(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`POST ${url} failed: ${res.status} ${t}`);
  }
  return res.json();
}

// Apu: Parsii json-stat2-rakenteesta aluekoodit ja -nimet sekä arvot
function parseJsonStat2(dataset) {
  // Odotetaan: dataset.dimension.Alue.category.index/label ja dataset.value
  const dim = dataset?.dimension;
  const alue = dim?.Alue;
  if (!alue?.category?.index || !dataset?.value) {
    throw new Error("Unexpected JSON-Stat2 format for 'Alue' or 'value'.");
    }
  // category.index: { "KU091": 0, "KU049": 1, ... }  -> järjestys
  // category.label: { "KU091": "Helsinki", ... }
  const index = alue.category.index;   // object: code -> order
  const labels = alue.category.label;  // object: code -> name

  // Käännetään: order -> code
  const orderToCode = Object.entries(index)
    .sort((a, b) => a[1] - b[1])
    .map(([code]) => code);

  // dataset.value on arvojen lista samassa järjestyksessä
  const values = dataset.value;

  if (orderToCode.length !== values.length) {
    // Joissain PxWeb-tauluissa muilla dimensioilla voi olla pituutta >1 — tällöin tarvitaan monidimensioinen lukutapa.
    // Tässä tehtävässä kyselyissä rajataan yksittäiseen vuoteen ja yhteen "Tiedot"-arvoon, joten pituuksien tulisi täsmätä.
    throw new Error("Length mismatch between 'Alue' items and 'value' array.");
  }

  // Luodaan lista { code, name, value }
  const rows = orderToCode.map((code, i) => ({
    code,
    name: labels[code] ?? code,
    value: values[i],
  }));
  return rows;
}

// Apu: Numeroiden muotoilu
const fmtInt = (n) => Number(n).toLocaleString("fi-FI");
const fmtPct = (n) => `${n.toFixed(2)}%`;

// Ehdollinen värjäys: >45% vihreä, <25% punainen, muuten zebra-tyyli CSS:stä
function applyRowHighlight(tr, employmentPct) {
  if (employmentPct > 45) {
    tr.style.backgroundColor = "#abffbd"; // rgb(171,255,189)
  } else if (employmentPct < 25) {
    tr.style.backgroundColor = "#ff9e9e"; // rgb(255,158,158)
  } else {
    // jätä zebra-tyylitys CSS:lle
  }
}

async function build() {
  // Rakenna perus-runko
  const container = el("div", { class: "center" });
  const heading = el("h1", { text: "Municipality employment statistics in Finland" });
  const table = el("table", { id: "populationTable" });

  // THEAD
  const thead = el("thead");
  const headerRow = el("tr");
  ["Municipality", "Population", "Employment amount", "Employment-%"].forEach((h) =>
    headerRow.appendChild(el("th", { text: h }))
  );
  thead.appendChild(headerRow);

  // TBODY
  const tbody = el("tbody");

  table.append(thead, tbody);
  container.append(heading, table);
  document.body.appendChild(container);

  // Ladataan kyselyt ja haetaan data
  try {
    const [popQuery, empQuery] = await Promise.all([
      loadLocalJSON(POPULATION_QUERY_FILE),
      loadLocalJSON(EMPLOYMENT_QUERY_FILE),
    ]);

    const [popData, empData] = await Promise.all([
      postPxweb(POPULATION_API, popQuery),
      postPxweb(EMPLOYMENT_API, empQuery),
    ]);

    // Parsitaan molemmat
    const popRows = parseJsonStat2(popData);
    const empRows = parseJsonStat2(empData);

    // Tehdään map työllisyysmäärille koodin mukaan
    const empByCode = new Map(empRows.map((r) => [r.code, Number(r.value)]));

    // Käydään väestörivit järjestyksessä läpi (näin säilytetään PxWebin järjestys)
    popRows.forEach((p, idx) => {
      const population = Number(p.value);
      const employment = empByCode.get(p.code);
      // Jos työllisyys puuttuu tältä koodilta, asetetaan null
      const employmentNum = employment != null ? Number(employment) : null;
      const employmentPct =
        employmentNum != null && population > 0 ? (employmentNum / population) * 100 : 0;

      const tr = el("tr");
      // Solut
      const tdMunicipality = el("td", { text: p.name });
      const tdPopulation = el("td", { text: fmtInt(population) });
      const tdEmployment = el("td", {
        text: employmentNum != null ? fmtInt(employmentNum) : "—",
      });
      const tdPct = el("td", {
        text:
          employmentNum != null && population > 0 ? fmtPct(employmentPct) : "—",
      });

      tr.append(tdMunicipality, tdPopulation, tdEmployment, tdPct);

      // Ehdollinen värjäys riville
      if (employmentNum != null && population > 0) {
        applyRowHighlight(tr, employmentPct);
      }
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
    // Näytetään yksinkertainen virheilmoitus taulukon tilalla
    const errorBox = el("div", {
      class: "error",
      text:
        "Error loading data. Please check your JSON query files and network connection.",
    });
    container.replaceChildren(heading, errorBox);
  }
}

// Käynnistys
document.addEventListener("DOMContentLoaded", build);
