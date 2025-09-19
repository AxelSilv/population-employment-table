async function build() {
    const tbody = document.getElementById("tableBody");
    const errorBox = document.getElementById("error");
    if (!tbody) return;
  
    // Apuja
    const loadLocalJSON = async (p) => (await fetch(p, { cache: "no-store" })).json();
    const normalizeAgg = (body) => {
      const c = JSON.parse(JSON.stringify(body));
      (c.query || []).forEach(q => {
        if (q?.selection?.filter?.startsWith?.("agg:")) q.selection.filter = "item";
      });
      return c;
    };
    const parseJsonStat2 = (dataset) => {
      const alue = dataset?.dimension?.Alue;
      const order = Object.entries(alue.category.index).sort((a,b)=>a[1]-b[1]).map(([code])=>code);
      const labels = alue.category.label;
      const values = dataset.value;
      return order.map((code, i) => ({ code, name: labels[code] ?? code, value: Number(values[i]) }));
    };
    const fmtInt = (n) => Number(n).toLocaleString("fi-FI");
    const fmtPct = (n) => `${n.toFixed(2)}%`;
  
    try {
      // 1) Lataa molemmat JSONit MUTTA täytä ensin PELKKÄ VÄESTÖ
      const [qa, qb] = await Promise.all([
        loadLocalJSON("population_query.json"),
        loadLocalJSON("employment_query.json")
      ]);
  
      const A = normalizeAgg(qa), B = normalizeAgg(qb);
      const isPop = (q) => q?.query?.some?.(d => d.code === "Tiedot" && d.selection?.values?.includes?.("vaesto"));
      const POP_API = "https://pxdata.stat.fi/PxWeb/api/v1/fi/StatFin/vaerak/statfin_vaerak_pxt_11ra.px";
      const EMP_API = "https://pxdata.stat.fi/PxWeb/api/v1/fi/StatFin/tyokay/statfin_tyokay_pxt_115b.px";
  
      // Valitse väestöbody riippumatta tiedostonimestä
      const popBody = isPop(A) ? A : isPop(B) ? B : null;
      if (!popBody) throw new Error("Population query not detected.");
  
      // Hae väestö ja RENDEROI HETI
      const popData = await fetch(POP_API, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(popBody)
      }).then(r => r.json());
  
      const popRows = parseJsonStat2(popData);
  
      // Tyhjennä mahdollinen edellinen sisältö
      tbody.innerHTML = "";
  
      // Luo rivit kahdella sarakkeella (Task 1–3 varmistuu)
      const frag = document.createDocumentFragment();
      for (const p of popRows) {
        const tr = document.createElement("tr");
        const td1 = document.createElement("td"); td1.textContent = p.name;
        const td2 = document.createElement("td"); td2.textContent = fmtInt(p.value);
        tr.append(td1, td2);
        frag.appendChild(tr);
      }
      tbody.appendChild(frag);
  
      // 2) Yritä työllisyys (älä kaada jos epäonnistuu)
      try {
        // Emp-body on se toinen
        const empBody = isPop(A) ? B : A;
        // Jos toisessa ei ole työllisyyden dimensioita, älä yritä
        const hasEmpDims = (q) => {
          const s = new Set((q?.query || []).map(d => d.code));
          return s.has("Pääasiallinen toiminta") && s.has("Sukupuoli") && s.has("Ikä");
        };
        if (!hasEmpDims(empBody)) throw new Error("Employment query not detected.");
  
        const empData = await fetch(EMP_API, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(empBody)
        }).then(r => r.json());
  
        const empRows = parseJsonStat2(empData);
        const empByCode = new Map(empRows.map(r => [r.code, r.value]));
  
        // Lisää kolmas sarake headeriin jos puuttuu
        const theadRow = document.querySelector("#populationTable thead tr");
        if (theadRow && theadRow.children.length === 2) {
          const th3 = document.createElement("th"); th3.textContent = "Employment amount";
          theadRow.appendChild(th3);
        }
  
        // Lisää kolmas solusarake joka riville
        [...tbody.rows].forEach((tr, i) => {
          const code = popRows[i].code;
          const employed = empByCode.get(code);
          const td3 = document.createElement("td");
          td3.textContent = employed != null ? fmtInt(employed) : "—";
          tr.appendChild(td3);
        });
  
        // Lisää neljäs sarake (Employment-%) ja värjäys
        if (theadRow && theadRow.children.length === 3) {
          const th4 = document.createElement("th"); th4.textContent = "Employment-%";
          theadRow.appendChild(th4);
        }
        [...tbody.rows].forEach((tr, i) => {
          const population = popRows[i].value;
          const employed = empByCode.get(popRows[i].code);
          const pct = (employed != null && population > 0) ? (employed / population) * 100 : null;
  
          const td4 = document.createElement("td");
          td4.textContent = pct != null ? fmtPct(pct) : "—";
          tr.appendChild(td4);
  
          if (pct != null) {
            if (pct > 45) tr.style.backgroundColor = "#abffbd";
            else if (pct < 25) tr.style.backgroundColor = "#ff9e9e";
          }
        });
  
      } catch (empErr) {
        // Ei kaadeta mitään: väestörivit riittävät Task 1–3:een
        console.warn("Employment enrichment skipped:", empErr.message);
      }
  
      if (errorBox) { errorBox.style.display = "none"; errorBox.textContent = ""; }
    } catch (e) {
      console.error(e);
      if (errorBox) {
        errorBox.style.display = "block";
        errorBox.textContent = "Error loading data. Please try again later.";
      }
    }
  }
  
  // Varmista, että DOM on valmis; defer + tämä on ok
  document.addEventListener("DOMContentLoaded", build);
  