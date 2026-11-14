# Flame Intelligence — Análisis inicial (fase 0)

> NASA Space Apps Challenge 2026 · Reto *Flame in Freefall*
> Fecha del análisis: 14 nov 2026 · Estado: **pendiente de revisión por el equipo** (todavía no hay código)

Todo lo que aparece aquí se ha comprobado directamente en las fuentes: el enunciado y los recursos oficiales, la API pública del PSI y los CSV y PDF descargados. Lo que **no** se ha podido verificar lo indico como *pendiente*.

---

## 0. Datos críticos de contexto

| Hecho | Implicación |
|---|---|
| El hackathon se celebra el **14 y 15 de noviembre de 2026**. La entrega cierra el **domingo 15 a las 23:59 (hora del evento local)**. | Queda **aproximadamente día y medio**. El plan debe reducirse a lo esencial. |
| Para optar a la evaluación global es obligatorio presentar una **demo: 7 diapositivas como máximo o un vídeo de 30 s como máximo**, con enlace público, y todo **en inglés**. | Hay que reservar entre 3 y 4 horas para la demo. No es opcional. |
| Es obligatorio **declarar el uso de IA** (el reto la llama «SI», *super intelligence*): el código y los datos generados con IA deben indicarlo en el texto descriptivo y en los metadatos; las imágenes y los vídeos, con marca de agua. | Hay que incluir una sección «AI usage disclosure» en el README y en la entrega. |
| El contenido generado **no puede usar logotipos ni elementos de marca de NASA**. | Nada de logotipos de NASA en la UI ni en las diapositivas. |
| Para optar a premio global es obligatorio usar al menos un dato o recurso de NASA. | Se cumple de sobra: el núcleo del producto son los datos del PSI. |
| Entorno local: **directorio vacío**, Python 3.12, **Node.js no instalado**, sin pandas ni PyMuPDF. | Hay que instalar Node 20+ y las dependencias de Python antes de empezar. |

---

## 1. Resumen del reto oficial

**Título:** *Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data*. Nivel: intermedio/avanzado.

**Problema:** NASA lleva décadas estudiando el fuego en microgravedad. Los resultados se publican en el repositorio **Physical Sciences Informatics (PSI)**, pero hay tantos que resultan «difíciles de encontrar, más difíciles de comparar y aún más difíciles de interpretar». Esto pesa cada vez más ante las misiones Artemis, la Moon Base y Marte.

**Lo que se pide:** un **dashboard web impulsado por IA** que **resuma, clasifique (*rank*) e interprete** las investigaciones de combustión para obtener conclusiones sobre seguridad contra incendios. El enunciado sugiere permitir al usuario:
1. Identificar las investigaciones más relevantes para cada entorno habitable: nave, estación, bases lunares o marcianas y rovers presurizados.
2. Extraer datos que sirvan para el **modelado predictivo** de inflamabilidad.
3. Destacar la investigación útil para la próxima generación de sistemas de seguridad: prevención, detección y extinción.
4. Opcionalmente, aplicaciones en la Tierra (extintores de agua nebulizada, detectores de humo, equipamiento de bomberos).

**Consideraciones sugeridas por NASA**, todas opcionales pero muy reveladoras de lo que valorará el jurado:
- Público: profesores, estudiantes de grado y posgrado, e investigadores e ingenieros aeroespaciales.
- Atributos a mostrar: objetivos, combustible (forma y tamaño de las muestras o quemadores), condiciones (O₂, velocidad del flujo), **en qué se diferencian y en qué coinciden los tests de una misma investigación**, sensores y tipos de medida.
- **Similitudes y diferencias entre investigaciones.**
- Agrupación por hardware: ACME (6 experimentos, CIR, llamas de gas), MDCA (FLEX, FLEX-2 y CFI, con gotas de combustible líquido) y la cámara de flujo de SPICE en el MSG (BASS, BASS-II, SPICE y SLICE).
- **Atmósferas de exploración:** el traje espacial usa O₂ al 100 % a 4,3 psi, la Tierra 14,7 psi, y la Moon Base y los rovers tendrán **≥30 % de O₂ a ≤10,2 psi**: «más del 40 % de aumento de O₂, lo que hace los materiales mucho más inflamables». La concentración de O₂ más alta probada en microgravedad es la de ACME CFI-G (hasta el 85 %).
- **Gravedad parcial:** el PSI **no contiene datos de gravedad parcial**. Habrá más adelante (LUCI, FM2). Los datos de microgravedad y de 1 g *acotan* el comportamiento a gravedades intermedias.
- **Fuera de alcance:** cohetes y propulsantes.

**Criterios del jurado** (puntuación de 1 a 5 cada uno): **Impact, Creativity, Validity** (base científica, viabilidad y usabilidad), **Relevance** (*los datos de NASA deben ser el núcleo, no un añadido*) y **Presentation** (la guía insiste en dedicarle tanto esfuerzo como al resto).

---

## 2. Recursos NASA disponibles (pestaña *Resources*)

| Recurso | Tipo | Valor para nosotros | Estado |
|---|---|---|---|
| **PSI Data Repository – Combustion Science** (psi.nasa.gov) | Repositorio de datos (SPA en Angular con API JSON interna) | **Fuente principal.** Metadatos, tablas experimentales (CSV), documentos, publicaciones y datos en bruto | ✅ Accesible **sin cuenta**; licencia **CC0-1.0**; DOI por investigación |
| NASA Combustion Science (GRC) | Web con 8 fichas PDF (ACME, BASS, DAFT, FLEX, SAME, SPICE, SAFFIRE, SLICE) | Contexto y descripciones para el RAG | ✅ Descargadas (46 páginas en total) |
| *A Researcher's Guide to ISS Combustion Science* (2015) | PDF de 56 páginas, unas 15 000 palabras | Visión general y apartado *Highlights & Lessons Learned*; ideal para el RAG | ✅ Descargado; el texto se extrae bien |
| ScienceCast (vídeo de YouTube, 3,6 min) | Vídeo | Contexto o enlace en la UI | Sin descargar (no hace falta) |
| Apollo 1, Apollo 13, incendio de la Mir | Páginas web (lecciones aprendidas) | Contexto narrativo para la presentación o una sección «Why it matters» | Sin descargar |
| 3 artículos de NASA Spinoff (bomberos, detector de humo) | Páginas web | Ángulo de «beneficios en la Tierra» | Sin descargar |

Fuentes complementarias recomendadas (gratuitas y oficiales): **NTRS** (ntrs.nasa.gov, con API pública y PDF completos de NASA) y los **DOI de las publicaciones** listadas en el PSI, cuyos resúmenes pueden obtenerse vía Crossref u OpenAlex. *No verificado todavía en detalle; lo propongo como mejora de la prioridad 2.*

---

## 3. Análisis de los datasets (inspeccionados)

### 3.1 Cómo se accede al PSI (ingeniería inversa de su web)

La web del PSI es una SPA y no tiene API documentada. He identificado estos endpoints públicos (sin autenticación):

| Endpoint | Devuelve |
|---|---|
| `GET /geode-py/ws/repo/search?ffield=Research Area&fvalue=combustion science&size=200` | Índice tipo Elasticsearch con **24 investigaciones** de *Combustion Science* |
| `GET /geode-py/ws/repo/investigations/PSI-{n}` | Ficha completa: objetivos, enfoque, hipótesis, impacto, contactos, **publicaciones con DOI**, hardware, licencia, DOI, lista de ficheros y tabla experimental |
| `GET /geode-py/ws/studies/PSI-{n}/download?file=…&version=…&redirect=false` | URL prefirmada de S3 para descargar cualquier fichero |

⚠️ **El servidor es lento e inestable**: entre 1 y 90 s por ficha. Algunas fichas grandes (ACME) tardan más de 5 minutos o se cortan. **Decisión: no consultar el PSI en vivo desde la app.** Se hace una ingesta una sola vez y la instantánea se versiona en `data/` (ya está hecho en parte: `data/raw/`).

### 3.2 Las 24 investigaciones de combustión del PSI

**Microgravedad (ISS o Cygnus), 18 investigaciones:**

| Acc. | Acrónimo | Tema | Relevancia directa para la seguridad contra incendios |
|---|---|---|---|
| PSI-26 | BASS | Inflamabilidad y extinción de sólidos (SIBAL, PMMA, Nomex, Ultem) | ★★★ |
| PSI-25 | BASS-II | Ídem, con más materiales, O₂ y CO/CO₂ medidos | ★★★ |
| PSI-98 / 99 / 100 | SAFFIRE-I / II / III | Fuego a gran escala en el Cygnus (muestras de hasta 0,4 × 1 m) | ★★★ |
| PSI-69 | FLEX | Extinción de gotas (supresión con CO₂ y He, límites de O₂) | ★★★ |
| PSI-68 | FLEX-2 | Gotas: efecto de la presión, el O₂ y el flujo | ★★ |
| PSI-39 | CFI | Llamas frías (gotas) | ★ |
| PSI-102 / 101 | SAME / SAME-R | **Detección**: humo de materiales pirolizados | ★★★ (detección) |
| PSI-47 | DAFT / DAFT-2 | Polvo frente a humo (falsas alarmas) | ★★ (detección) |
| PSI-107 | SPICE | Punto de humo en co-flujo (hollín) | ★★ |
| PSI-106 | SLICE | Estructura y despegue de llamas de gas | ★ |
| PSI-20 | ACME BRE | **Emulador de tasa de combustión**: inflamabilidad de materiales en atmósfera quieta | ★★★ |
| PSI-10 / 21 / 22 / 23 / 159 | ACME Flame Design / CLD / E-FIELD / s-Flame / CFI-G | Llamas laminares de gas. CFI-G llega al 85 % de O₂; E-FIELD simula la gravedad parcial | ★–★★ |

**Tierra (proyectos de reanálisis financiados por el PSI), 6 investigaciones:** PSI-60 (SPICE CFD), PSI-62 (modelado de propagación con *flamelets*), PSI-115 (modelado con los datos de SAME), PSI-117 (CFD de llamas frías con datos de FLEX), PSI-142 (transiciones de llamas frías) y PSI-119 (aparece por palabra clave; es de *Fluid Physics*, así que queda excluida).

Todas tienen **licencia CC0-1.0** y **DOI**. En las fichas descargadas hay **256 publicaciones (158 DOI únicos)**, y el índice de búsqueda lista unas 350 en total.

### 3.3 Formatos de datos

Ejemplo representativo: BASS ocupa 152 GB en total.

| Categoría en el PSI | Formatos | ¿Útil en el hackathon? |
|---|---|---|
| **Experimental table** | **CSV** (uno por investigación) | ✅ **Sí: es el dato estructurado clave** |
| Metadatos de la ficha | JSON (API) | ✅ Sí |
| Science / Engineering Documents, Reports, Presentations | PDF, DOCX, PPT/PPTX, XLSX | ✅ PDF para el RAG (selección) |
| Analyzed Data | XLS/XLSX, CSV, DAT | ⚠️ Parcial (SAME, SAME-R, PSI-117) |
| Raw Data | **ZIP de varios GB, MP4/AVI de vídeo** | ❌ No: hablamos de terabytes (las fichas de ACME declaran unos 2 TB) |

### 3.4 Contenido real de las tablas experimentales (22 CSV descargados, unas 2 000 filas útiles)

| PSI | Investigación | Filas (aprox.) | Variables reales | Calidad |
|---|---|---|---|---|
| **69** | **FLEX** | **274 tests** | combustible (metanol 157, heptano 117), **presión (mmHg)**, **fracciones molares de O₂/N₂/CO₂/He**, diámetro inicial de gota, **diámetro de extinción**, **tasa de combustión**, **tiempo de combustión**, **resultado** (Extinction 186 / Disruption 61 / Completion 27) | ⭐ **La mejor tabla**: cuantitativa y por test. Codificación cp1252 |
| **25** | **BASS-II** | **129 tests** | PI, material (PMMA en barra o lámina, SIBAL, Nomex…), restrictor y ventilador (*valores de pantalla, no cm/s*), **O₂ inicial y final (% vol)**, **CO₂ y CO** iniciales y finales | ⭐ Buena. El flujo no está en unidades físicas |
| **107** | **SPICE** | **469 filas** | gas combustible (propileno, propano, etileno, metano; mezclas), tobera (mm), caudal de combustible (sccm, mg/s), **velocidad del aire (cm/s)** | ⭐ Buena y cuantitativa. Hay filas duplicadas |
| 26 | BASS | 122 | fecha, nº de test, nº de muestra, material y tamaño | Solo inventario (sin O₂ ni flujo) |
| 99 | SAFFIRE-II | 9 muestras y notas | material, espesor, **flujo de 20 cm/s**, **O₂ ≈ 21,5–22,1 %**, potencia y tiempo de ignición, tiempo de combustión, dirección del flujo, **longitud quemada y velocidad de propagación en µg frente a 1 g** | ⭐ Muy valiosa para comparar µg con 1 g. Texto libre: «~ 0», «Complete», «Acceleratory», notas |
| 98 | SAFFIRE-I | 2 | SIBAL, 0,37 cm, 20 cm/s, O₂ 21,5 %, combustión de 420 s y de 70 s (concurrente frente a opuesto) | Pocas filas pero cuantitativas |
| 100 | SAFFIRE-III | 2 | SIBAL, 30 cm/s, concurrente u opuesto | Sin O₂ |
| 68 | FLEX-2 | 8 | combustible, rango de diámetros, mezcla O₂/N₂ u O₂/He, **listas de O₂ (0,17–0,30) y de P (0,5–3 atm)**, flujo de 0,1–5 cm/s | Matriz de condiciones (rangos, no tests) |
| 20 | ACME BRE | 18 | quemador (mm), combustible, **O₂ (listas: 21; 26,5; 34; 40 %)**, llamas encendidas | Según las notas, «la presión varió pero no se recoge aquí» |
| 21 / 22 | ACME CLD / E-FIELD | 32 / 32 | día de test, combustible, rango de concentración, polaridad de la malla, llamas encendidas | Notas en texto libre |
| 106 | SLICE | 12 | fecha y combustible | Mínima |
| 101 / 102 | SAME-R / SAME | 109 / 8 | material (Kapton, Teflon…), velocidad de entrada, envejecimiento, pérdida de masa | Detección |
| 47 | DAFT | 2 | sesión, hardware y muestra | Mínima |
| 142 | (Tierra) | 8 | índice de datos con enlace a la figura del artículo | Referencial |
| **159** | **ACME CFI-G** | **154 (inversas) + 179 (normales)** | combustible (etano…), fracción del combustible, **presión aproximada (bar)**, **XO₂ (0,12–0,85)**, tasa de combustión, Tad, Zst, ignición, tiempo de combustión, autoextinción o fin de flujo, temperatura del quemador | ⭐ Muy rica y cuantitativa. **Es el único dato con O₂ muy alto** |
| **10** | **ACME Flame Design** | **120 (inversas) + 207 (normales)** | XO₂ (0,20–0,85), caudales másicos, fracción de C₂H₄, **presión (atm)**, Zst, Tad | ⭐ Cuantitativa. Algunos valores «RAMPED» |
| 23 | ACME s-Flame | 18 | atmósfera (~21 % O₂, ~1 atm), combustible, llamas encendidas | Resumen |
| 39 | CFI | 87 | presión (atm), fracciones de O₂/N₂/He, fibra, combustible (n-dodecano e isododecano) | Cuantitativa (recuperada en la ingesta) |

**Problemas de calidad detectados**, que el ETL tiene que resolver y la UI dejar a la vista:
- Codificaciones mezcladas (UTF-8 con BOM y cp1252) y el símbolo «µ» perdido («?-g»).
- Unidades dentro del valor («20 cm/s», «0.27 mm») y cabeceras con erratas («Samle Thickness»).
- Valores aproximados o rangos («~ 21.5», «21.5 - 21.7», «0.17; 0.21; 0.25»), texto («Insignificant», «Complete», «n/a») y notas incrustadas como filas.
- Unidades distintas para lo mismo: presión en mmHg o atm; O₂ en fracción molar o en % vol.
- **Cada investigación tiene un esquema propio**: no hay un esquema común.

### 3.5 Qué se puede construir **de verdad** con estos datos

| Funcionalidad pedida | Viabilidad | Base de datos real |
|---|---|---|
| Explorador de 24 investigaciones con ficha, filtros y referencias | ✅ Total | Metadatos del PSI, publicaciones y DOI |
| Vista de «tests» dentro de cada investigación | ✅ Para unas 10 investigaciones | CSV |
| Comparador de condiciones (O₂, presión, flujo, combustible, fase) | ✅ Con armonización explícita | FLEX, FLEX-2, BASS-II, SAFFIRE, SPICE, BRE |
| Gráficos cuantitativos reales | ✅ FLEX (burning rate, extinción frente a O₂/diluyente/presión), SPICE, BASS-II (consumo de O₂), SAFFIRE-II (µg frente a 1 g) | CSV |
| RAG con citas | ✅ | Unos 40 PDF ligeros (fichas, guía, Science Docs y Reports) y los textos del PSI |
| «Ranking» de investigaciones | ✅ Si es un **ranking de relevancia transparente**, no de riesgo | Atributos verificables |
| Puntuación de riesgo de materiales | ❌ **No viable con rigor**: muy pocos materiales con condiciones comparables y ningún índice validado | Lo sustituye el análisis descriptivo |
| Datos de gravedad parcial y Moon Base | ❌ No existen en el PSI (lo dice el propio reto) | Mostrar el **hueco** como hallazgo |

---

## 4. Propuesta de arquitectura

```
flame-intelligence/
├── frontend/                 React + TS + Vite + Tailwind + shadcn/ui + Plotly
│   └── src/{pages,components,services,hooks,types,lib}
├── backend/
│   ├── app/
│   │   ├── api/              routers FastAPI (investigations, tests, compare, chat, insights, reports)
│   │   ├── core/             config (pydantic-settings, .env), logging
│   │   ├── models/           SQLModel/SQLAlchemy (SQLite)
│   │   ├── schemas/          Pydantic I/O
│   │   ├── services/         lógica: comparación, armonización, insights, informes
│   │   ├── ai/               rag/ (chunking, embeddings, FAISS, retriever), llm/ (adaptador de proveedor), prompts/
│   │   └── main.py
│   ├── tests/
│   └── requirements.txt
├── pipeline/                 ETL offline, separado de la API
│   ├── fetch_psi.py          descarga de metadatos, CSV y PDF seleccionados → data/raw
│   ├── normalize_tables.py   CSV heterogéneos → tabla larga armonizada → data/processed
│   ├── build_corpus.py       PDF y textos → chunks con metadatos de fuente
│   └── build_index.py        embeddings → FAISS → data/processed/index
├── data/{raw,processed,metadata}   metadata/variable_dictionary.yaml (mapeo de columnas, unidades y notas)
├── docs/                     análisis, arquitectura, guion para el jurado, uso de IA
├── .env.example
└── README.md
```

**Decisiones técnicas recomendadas:**

| Capa | Elección | Motivo |
|---|---|---|
| BD | **SQLite** (fichero versionado o regenerable con un comando) | Se trata de unos 24 registros y unas 2 000 filas. PostgreSQL no aporta nada en 36 horas |
| Modelo de datos | `Investigation` · `Publication` · `Document` · `Test` (fila original en JSON **+** campos armonizados opcionales) · `VariableDef` (nombre canónico, unidad SI y mapeo por investigación) | Respeta que cada experimento tenga su esquema propio y, aun así, permite comparar |
| Armonización | Diccionario YAML **escrito a mano y revisado**, con conversión de unidades (mmHg o atm → kPa; fracción → %) y marcas `approx`, `range`, `not_reported` y `derived` | Es la base del rigor científico: cada valor comparado conserva su procedencia |
| Embeddings | **`fastembed`** (ONNX, sin PyTorch) con `BAAI/bge-small-en-v1.5`, en local | Gratis, offline, ligero y sin claves |
| Vector store | **FAISS** (`faiss-cpu`) con los metadatos en SQLite | Es lo que se pedía y basta para unos pocos miles de chunks |
| PDF | **PyMuPDF**, con *chunking* por página o sección (unos 800 tokens con solape) que conserva `doc_id`, página y URL | Permite citar la página exacta |
| LLM | **Groq** (plan gratuito; decidido por el equipo), detrás de un adaptador (`LLM_PROVIDER`, `GROQ_API_KEY`, `GROQ_MODEL` en `.env`) | Gratis y rápido; el adaptador permite cambiar de modelo sin tocar el código |
| Frontend | Vite + React + TS, Tailwind, **shadcn/ui** (Radix), **react-plotly.js**, TanStack Query y React Router | Moderno, ligero y profesional |
| Despliegue | Opcional: frontend en Vercel o Netlify y backend en Render (planes gratuitos) | El jurado puede abrir la app; lo obligatorio es la demo |

**Flujo del RAG:** pregunta → embedding → top-k de FAISS (más un filtro opcional por investigación) → *re-ranking* simple → contexto con IDs `[S1]…[Sn]` → prompt de sistema estricto («responde solo con las fuentes; marca **Evidence** frente a **Interpretation**; si falta información, dilo») → respuesta en JSON estructurado → la UI muestra las citas enlazadas a la página del PDF o la ficha del PSI. Además, el asistente puede consultar **datos tabulares** con herramientas como `get_tests(investigation, filters)`, de forma que las cifras salgan de los CSV y no del modelo.

---

## 5. Diseño de los módulos

**Nav:** Dashboard · Experiments · Compare · AI Assistant · Safety Insights · Reports. Estética de «consola de misión»: oscura, sobria, tipografía técnica y acento en un naranja llama. Sin logotipos de NASA.

1. **Dashboard:** cifras reales (24 investigaciones, unas 2 000 filas tabuladas, nº de publicaciones y de variables armonizadas), distribución por plataforma (ISS o Cygnus) y tipo de combustible (sólido, líquido o gas), *timeline* de las campañas, buscador rápido, «recently viewed» (localStorage) y una tarjeta «Why it matters» (Apollo 1 y 13, Mir).
2. **Experiments:** lista con filtros (fase del combustible, hardware, plataforma, área de seguridad: prevención, detección o extinción; ¿tiene datos tabulares?), orden y búsqueda de texto. La **ficha** incluye objetivos, hipótesis, enfoque, hardware, **tabla de tests con resumen de qué varía y qué es constante**, publicaciones con DOI, DOI y licencia del dataset, y enlace al PSI.
3. **Compare (2 a 4 investigaciones):** matriz de variables con estados *común*, *diferente*, *no comparable* o *no reportado*; avisos automáticos («FLEX: gotas líquidas; BASS: sólidos; las tasas de combustión no son comparables»); gráficos Plotly de las **envolventes de condiciones** (O₂ frente a presión y flujo); y resultados descriptivos.
4. **AI Assistant (RAG):** chat con citas clicables, etiquetas **Evidence / Interpretation / Insufficient data**, filtro por investigación, preguntas de ejemplo y panel de «sources used».
5. **Safety Insights** (descriptivo, sin puntuaciones de riesgo):
   - **Exploration Atmosphere Coverage Map** ⭐: dispersión de O₂ frente a presión con todos los puntos o rangos probados, superpuestos a los *escenarios del reto*: ISS (21 %, 101 kPa), Moon Base o rover (≥30 %, ≤70 kPa) y traje espacial (100 %, 29,6 kPa). Muestra **dónde existe evidencia y dónde hay huecos**. Responde de forma directa a «identificar investigaciones relevantes para entornos habitables» y es una idea original y defendible.
   - FLEX: resultado (extinción, disrupción o combustión completa) frente a O₂ y diluyente (CO₂ o He) → *eficacia observada de los supresores*.
   - SAFFIRE-II: propagación en µg frente a 1 g por material.
   - BASS-II: consumo de O₂ y producción de CO/CO₂ por material.
   - **Ranking de relevancia por escenario** (en lugar de riesgo): criterios visibles (área de seguridad, fase del combustible, solapamiento con el rango de O₂ y presión del escenario, existencia de datos cuantitativos), pesos ajustables y justificación por fila.
6. **Reports:** el usuario fija la pregunta y las investigaciones; el sistema monta las secciones de **datos (deterministas, desde la BD)** y la IA redacta la discusión **solo con las fuentes recuperadas**. Exportación a Markdown, PDF (impresión del navegador) o HTML, con referencias completas (DOI, URL del PSI, página).

---

## 6. Plan de implementación priorizado (unas 34 horas)

| Bloque | Horas (aprox.) | Entregable comprobable |
|---|---|---|
| **P1-a** Scaffold e instalación (Node, venv, FastAPI y Vite en marcha) | 1 h | `GET /health` y la app vacía con la navegación |
| **P1-b** Ingesta del PSI: 24 fichas (reintentar las 4 pendientes), CSV y PDF seleccionados | 2 h | `data/raw` completo y script reproducible |
| **P1-c** Normalización y diccionario de variables (FLEX, BASS-II, SAFFIRE, SPICE, FLEX-2, BRE primero) | 4 h | `data/processed/*.parquet` y tests unitarios de los parsers |
| **P1-d** API de investigaciones y tests, más el Explorer y la ficha | 4 h | Búsqueda, filtros y ficha con la tabla de tests |
| **P1-e** Dashboard con cifras reales | 2 h | KPI y 2 gráficos |
| **P2-a** RAG: chunking, embeddings, FAISS, endpoint `/chat` con citas | 4 h | Las 5 preguntas de ejemplo se responden con citas reales |
| **P2-b** Comparador | 4 h | Matriz, avisos y gráfico de envolventes |
| **P3-a** Safety Insights (mapa de cobertura, FLEX y SAFFIRE-II) | 3 h | 3 visualizaciones con su metodología escrita |
| **P3-b** Reports | 2 h | Exportación a Markdown y PDF |
| **P4** README, guía para el jurado, divulgación del uso de IA, pruebas E2E y deploy | 3 h | Instalación en limpio en otro equipo |
| **Demo** 7 diapositivas o vídeo de 30 s, en inglés | 3–4 h | Enlace público |

**Corte de seguridad:** si el sábado por la noche P1 y P2-a no funcionan, se descartan Reports y el ranking, y se pasa a pulir y preparar la demo.

---

## 7. Riesgos técnicos

| Riesgo | Prob. | Mitigación |
|---|---|---|
| PSI lento, cortes y API no documentada que puede cambiar | Alta | Instantánea versionada en `data/`; la app nunca depende del PSI en vivo |
| CSV heterogéneos y sucios | Alta | Diccionario manual, parsers con tests y marcas `approx` o `not_reported` visibles |
| Comparaciones científicamente incorrectas | Media | Comparar solo variables armonizadas; avisos por fase del combustible o geometría; mostrar siempre el valor original |
| Alucinaciones del LLM | Media | Prompt estricto, salida estructurada, citas obligatorias, cifras sacadas de herramientas de datos, respuesta «insufficient data» |
| Límites del plan gratuito del LLM | Media | Adaptador de proveedor, caché de respuestas, preguntas de demo precalculadas como *fallback* (marcadas como tales) |
| Tiempo (unas 34 h) | **Alta** | Alcance recortable, trabajo en paralelo y congelar funcionalidades el domingo a mediodía |
| Entorno (Node ausente; FAISS o PyMuPDF en otras máquinas) | Baja | `requirements.txt` fijado, `make setup` y, como opción, Docker Compose |
| Incumplir las normas de entrega (logotipos de NASA, declaración de IA, inglés) | Media | Checklist de entrega en `docs/` |
| Subestimar la presentación (un 20 % de la nota) | Media | Una persona dedicada desde el sábado por la tarde |

---

## 8. Reparto de tareas recomendado (equipo de 4 a 6 personas)

| Rol | Responsable de |
|---|---|
| **Data engineer / científico** | Ingesta del PSI, diccionario de variables, normalización y revisión del rigor de comparaciones e insights |
| **Backend** | FastAPI, modelos, endpoints, comparador y servicio de informes |
| **AI engineer** | Corpus, chunking, embeddings, FAISS, prompts, evaluación con las preguntas de ejemplo |
| **Frontend (1–2)** | Diseño del sistema, Dashboard, Explorer, Compare, Plotly, chat y responsive |
| **Storytelling / PM** | Guion, diapositivas o vídeo, README para el jurado, checklist de entrega, pruebas de usuario |

Con menos personas: un perfil de datos y backend, otro de IA y backend, y otro de frontend y presentación.

---

## 9. Decisiones que necesitamos que toméis

- ~~**D1. Proveedor del LLM.**~~ ✅ **Decidido: Groq** (plan gratuito). Embeddings locales con fastembed, así que no hace falta una segunda clave.
- **D2. Alcance de los datos.** *Recomendación:* metadatos de las 24 investigaciones, todos los CSV, las fichas, la guía y una selección de unos 30–40 PDF ligeros (*Science Documents* y *Reports*). **Excluir** vídeo y ZIP en bruto (terabytes).
- **D3. Tamaño y perfiles del equipo**, y hora exacta de cierre de vuestro evento local.
- **D4. ¿Desplegar públicamente** la app (gratis, unas 2 h) o solo demo en vídeo o diapositivas?
- **D5. Nombre de la sección:** «Safety Insights» (descriptiva) en lugar de «Safety Analysis», para no sugerir una evaluación de riesgos que los datos no permiten.

---

## Anexo: datos ya descargados (instantánea de verificación)

- `data/raw/psi/combustion_investigations_search.json`: índice de las 24 investigaciones (API del PSI).
- `data/raw/psi/experimental_tables/PSI-*.csv`: 22 tablas experimentales originales (CC0) de 21 investigaciones.
- `data/raw/nasa_docs/*.pdf`: 8 fichas de experimentos de NASA GRC y la *Researcher's Guide* (2015).

Todo procede de NASA y no se ha modificado. No hay datos ficticios.
