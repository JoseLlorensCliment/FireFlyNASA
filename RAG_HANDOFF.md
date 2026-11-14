# RAG_HANDOFF — Estado y reconstrucción del RAG

> **Proyecto:** Flame Intelligence (NASA Space Apps 2026 · *Flame in Freefall*)
> **Última actualización:** 14 nov 2026 (tarde) — **el índice RAG ya está construido y en el repositorio.**
> **Configuración vigente (decisión del equipo):**
> - **Respuestas:** Groq `openai/gpt-oss-120b` (API, plan gratuito).
> - **Búsqueda:** fastembed `BAAI/bge-small-en-v1.5`, ejecutado **en el ordenador que corre el backend**. Solo
>   convierte cada pregunta (una frase); los documentos ya están convertidos e incluidos en el repositorio.
>
> **Para la IA que continúe:** este documento recoge lo que se ha hecho, verificado y decidido. Lo que **no** está
> verificado aparece marcado como ⚠️. Las secciones §7.0 bis a §7.3 (Google) y §8 (reconstrucción) solo hacen falta
> para **reconstruir** el índice o para cambiar a los embeddings de Google.

---

## 0. Resumen

1. **El índice RAG está hecho y versionado en git:** `data/processed/rag/{index.faiss, chunks.jsonl, manifest.json}`.
   - 4 392 fragmentos, 384 dimensiones, `BAAI/bge-small-en-v1.5`, construido por un compañero el 14 nov (commit
     `93d4044`).
   - Cubre 69 de los 71 PDF previstos más los registros y tablas del PSI. Los 2 que faltan son pósteres de ACME que
     son solo imagen (0 palabras): es correcto que no se indexen.
2. **Los 79 PDF** (70 del PSI y 9 de nasa.gov) y **`flame.db`** también están en git (commit `460f04c`). Coinciden con
   los SHA-256 de `data/metadata/psi_documents_inventory.csv` (verificado el 14 nov).
3. **Claves necesarias:** solo `GROQ_API_KEY`, para redactar las respuestas. `GEMINI_API_KEY` solo hace falta si se
   cambia a los embeddings de Google.
4. **Al primer uso del chatbot,** fastembed descarga el modelo (unos 65 MB, necesita internet una vez) en
   `data/processed/models/`, que está fuera de git. Después, cada pregunta solo se convierte en un vector (trabajo
   mínimo de CPU).
5. **La API comprueba al arrancar** que el índice coincide con la configuración (`EMBEDDING_PROVIDER=local`, el modelo y
   384 dimensiones). Si alguien cambia a `google` sin reconstruir el índice, la API lo rechaza con un mensaje claro
   (§11 bis).
6. **Código probado** con 32 tests sin red (clientes simulados).
7. ⚠️ **Aún no probado de principio a fin:** una pregunta real con fastembed y Groq. En el equipo de desarrollo (poco
   potente) solo se ha verificado la estructura del índice, sin cargar el modelo. Es el primer paso pendiente (§12).

---

## 1. Estado actual del RAG

| Elemento | Estado | Ubicación |
|---|---|---|
| Metadatos PSI (24 investigaciones) y 22 CSV | ✅ En git | `data/raw/psi/investigations/`, `data/raw/psi/experimental_tables/` |
| Base SQLite normalizada | ✅ En git; se puede regenerar con `pipeline/build_dataset.py` | `data/processed/flame.db` |
| PDF del PSI (70) y de nasa.gov (9) | ✅ En git; hashes verificados | `data/raw/psi/documents/PSI-*/`, `data/raw/nasa_docs/` |
| Inventario con SHA-256 de los 79 PDF | ✅ En git | `data/metadata/psi_documents_inventory.csv` |
| Chunks | ✅ 4 392: 4 021 de PDF del PSI, 220 de nasa.gov, 101 de registros PSI y 50 de tablas | `data/processed/rag/chunks.jsonl` |
| Índice FAISS | ✅ `IndexFlatIP`, 4 392 × 384, vectores normalizados; 0 errores en `rag_smoke_test.check_index()` | `data/processed/rag/index.faiss` |
| Manifest | ✅ `embedding = {local, BAAI/bge-small-en-v1.5, 384}`; chunking 1 400 / 250 / 200 | `data/processed/rag/manifest.json` |
| Caché de lotes de embeddings | Fuera de git (temporal) | `data/processed/rag/embed_cache/` |
| Modelo fastembed | Se descarga al primer uso; fuera de git | `data/processed/models/` |
| Código de construcción (3 etapas) y de servicio | ✅ Probado con tests | `pipeline/build_rag_index.py`, `backend/app/ai/` |
| Pregunta real de principio a fin (fastembed + Groq) | ⚠️ **No probada** | §12, paso 1 |

**Historial:**
- Un primer índice parcial de 1 742 fragmentos y 27 PDF quedó **sustituido** por el actual de 4 392.
- La caché de Google a medias (17 de 35 lotes) ya no se usa.

---

## 2. Arquitectura del RAG

```
                OFFLINE (otro ordenador, una sola vez)                                ONLINE (API FastAPI)
┌───────────────────────────────────────────────────────────────────┐   ┌────────────────────────────────────────────┐
│ data/raw/psi/documents/*.pdf ─┐                                   │   │ POST /api/assistant/ask {question}         │
│ data/raw/nasa_docs/*.pdf ─────┼─ PyMuPDF ─ limpieza ─ chunking ─┐ │   │   │                                        │
│ data/processed/flame.db ──────┘  (registros PSI + resúmenes     │ │   │   ├─ embed_query (Google embeddings)       │
│                                   deterministas de tablas)      │ │   │   ├─ FAISS top-k + reglas de diversidad    │
│                       [etapa chunks] → rag/chunks.jsonl ◄───────┘ │   │   ├─ prompt con fuentes [S1..Sk]           │
│                       [etapa embed]  → rag/embed_cache/…/*.npy    │   │   ├─ Groq gpt-oss-120b → JSON              │
│                          (Google embeddings, por lotes, reanudable)│  │   └─ validación de citas → respuesta      │
│                       [etapa index]  → rag/index.faiss            │   │        + fuentes (PDF#page / PSI URL)     │
│                                       rag/manifest.json           │   └────────────────────────────────────────────┘
└───────────────────────────────────────────────────────────────────┘
```

**Cambios de arquitectura respecto al prototipo anterior** (mínimos, ya aplicados):

1. **Proveedor de embeddings configurable** (`EMBEDDING_PROVIDER=google|local`). Antes solo había fastembed local.
2. **Proveedor del LLM configurable** (`LLM_PROVIDER=groq|gemini`). **Groq es el predeterminado** (decisión del equipo:
   es gratuito). Gemini queda como alternativa opcional.
3. **Construcción por etapas reanudables.** Antes era un único paso en memoria, y por eso se perdía todo al
   interrumpirse.
4. **El `manifest.json` registra el modelo y la dimensión de los embeddings.** La API **se niega** a usar un índice
   construido con otra configuración: los vectores de consulta y de documento deben estar en el mismo espacio.
5. **Lectura y escritura en UTF-8 explícita y rutas POSIX en los metadatos**, para que funcione igual en Windows.

---

## 3. Estructura de carpetas relevante

```
flame-intelligence/
├── .env.example                      plantilla de configuración (copiar a .env)
├── RAG_HANDOFF.md                    este documento
├── backend/
│   ├── requirements.txt              dependencias Python fijadas
│   ├── app/core/config.py            todas las variables de entorno y sus valores por defecto
│   ├── app/ai/embeddings.py          embeddings Google / local + normalización + reintentos
│   ├── app/ai/retriever.py           carga de FAISS, comprobación del manifest, búsqueda
│   ├── app/ai/llm.py                 adaptador del LLM: Groq (predeterminado) o Gemini
│   ├── app/ai/assistant.py           prompt, ensamblado de fuentes y validación de citas
│   ├── app/api/assistant.py          endpoints /api/assistant/* y /api/documents/{chunk_id}
│   └── tests/                        29 tests (test_rag_pipeline.py cubre el RAG)
├── pipeline/
│   ├── fetch_psi.py                  descarga desde el PSI (metadatos, CSV, PDF con --docs)
│   ├── parsing.py, build_dataset.py  normalización → data/processed/flame.db
│   ├── build_rag_index.py            RAG: etapas chunks / embed / index
│   └── rag_smoke_test.py             validación del índice y de una respuesta con citas
└── data/
    ├── raw/psi/{investigations,experimental_tables}/   en git
    ├── raw/psi/documents/PSI-*/*.pdf                    NO en git (~175 MB)
    ├── raw/nasa_docs/*.pdf                              en git (3,2 MB)
    ├── metadata/curation.json                           clasificación curada
    ├── metadata/psi_documents_inventory.csv             inventario y SHA-256 de los 79 PDF
    └── processed/                                       se genera; NO en git (flame.db, rag/, models/)
```

---

## 4. Inventario de documentos y fuentes NASA

El inventario completo, con ruta, tamaño, SHA-256 y si se indexa o no, está en
`data/metadata/psi_documents_inventory.csv`.

| Fuente | Qué es | Nº | Tamaño | Licencia | ¿En git? | ¿Se indexa? |
|---|---|---|---|---|---|---|
| NASA PSI, https://psi.nasa.gov/physci/repo (API `geode-py/ws`) | *Reports*, *Science Documents* y *Presentations* en PDF (<25 MB cada uno) de 14 investigaciones de combustión | 70 | ~175 MB | CC0-1.0 | No | 62 sí, 8 no (filtro) |
| nasa.gov (NASA GRC) | Fichas de experimentos: ACME, BASS, DAFT, FLEX, SAME, SPICE, Saffire, SLICE | 8 | ~1,7 MB | NASA, dominio público | Sí | Sí |
| nasa.gov | *A Researcher's Guide to: Combustion Science* (ISS, 2015), 56 páginas | 1 | 1,5 MB | NASA, dominio público | Sí | Sí |
| `data/processed/flame.db` (derivado de los CSV y JSON del PSI) | 101 chunks de registros PSI (objetivos, enfoque, hipótesis, impacto) y 50 de resúmenes y filas de tablas | — | — | CC0-1.0 | Se regenera | Sí (151 chunks, contados) |

- **Filtro de exclusión** (`SKIP_DOCS` en `build_rag_index.py`): *crew training*, *image directory nomenclature*,
  *researchers guide* (duplicado de la copia de nasa.gov) y *pubslist*.
- **Volumen que hay que indexar:** 71 PDF con **2 323 páginas** (contadas con `pdfinfo`) más 151 chunks de la base de
  datos. El número final de chunks **no se conoce todavía**: se sabrá al ejecutar la etapa `chunks`.
- **Las URL de cita** de cada documento PSI apuntan a la página de su investigación
  (`https://psi.nasa.gov/physci/repo/data/investigations/PSI-n`); las de los documentos de nasa.gov, al PDF original.
  Además, la API sirve la copia local en `/api/documents/{chunk_id}#page=N`.

### Cómo obtener los PDF del PSI

- **Ya están en git** desde el commit `460f04c`: basta con `git clone` o `git pull`.
- Si alguna vez se quitan del repositorio:** volver a descargarlos con `python pipeline/fetch_psi.py --docs`. El script es idempotente y se salta lo
  que ya existe. El servidor del PSI es **muy lento**: entre 1 y 300 s por ficha y a veces corta respuestas grandes.
  Puede tardar entre 30 y 90 minutos. Las URL de descarga son URL prefirmadas de S3 que el script obtiene él mismo.

---

## 5. Scripts disponibles

| Script | Función | Pesado | Estado |
|---|---|---|---|
| `pipeline/fetch_psi.py [--docs] [--force]` | Descarga metadatos, CSV y (con `--docs`) los PDF del PSI | Red (lento) | ✅ Usado en este equipo |
| `pipeline/build_dataset.py` | CSV y JSON → `data/processed/flame.db` | No (segundos) | ✅ Usado |
| `pipeline/build_rag_index.py --stage chunks` | Extracción de texto (PyMuPDF), limpieza y chunking → `chunks.jsonl` | CPU medio (~2 300 páginas) | ✅ Probado con tests (sin PDF); ⚠️ no ejecutado con todo el corpus |
| `pipeline/build_rag_index.py --stage embed` | Embeddings por lotes con reintentos y puntos de control | Red / API | ✅ Probado con cliente simulado; ⚠️ no con la API real |
| `pipeline/build_rag_index.py --stage index` | Vectores → FAISS `IndexFlatIP` y `manifest.json` | No | ✅ Probado con tests |
| `pipeline/build_rag_index.py --limit N --out <dir>` | Construcción mínima de prueba (los N primeros chunks) | Muy ligero | ✅ Probado con tests |
| `pipeline/rag_smoke_test.py [--answer]` | Valida el índice, la recuperación y una respuesta con citas | Ligero (1 llamada LLM) | ✅ Probado con un índice simulado (sin `--answer`) |
| `python -m pytest -q backend/tests` | 29 tests unitarios y de API, sin red | Ligero | ✅ 29/29 pasan |

**Detalle de la limpieza y el chunking** (`clean`, `split`, `pdf_chunks`):
- Se quitan los guiones suaves, se sustituyen las ligaduras (ﬁ → fi, ﬂ → fl), se unen las palabras partidas con guion
  al final de línea, se compactan los espacios y se limitan los saltos de línea a dos.
- Se trabaja página a página. Se descartan las páginas con menos de 200 caracteres (portadas, figuras).
- Las ventanas son de **1 400 caracteres** con **250 de solape**, y se corta preferentemente en un fin de frase o de
  línea situado en la segunda mitad de la ventana.
- Se descartan los fragmentos de menos de 80 caracteres.

---

## 6. Dependencias

- **Python 3.12** (usado aquí). `google-genai` exige Python ≥3.11.
- `backend/requirements.txt` (fijado). Las piezas del RAG son:

| Paquete | Versión | Uso |
|---|---|---|
| `google-genai` | **2.34.0** (29 oct 2026) | API de embeddings de Google (y LLM Gemini opcional) |
| `groq` | 0.13.0 | LLM: respuestas del chatbot y de los informes |
| `pydantic` | **2.14.1** | `google-genai` 2.34.0 exige ≥2.12.5. Corregido: antes estaba en 2.10.2, que era incompatible |
| `faiss-cpu` | 1.9.0.post1 | Índice vectorial (tiene wheel `win_amd64`) |
| `pymupdf` | 1.24.14 | Extracción de texto de los PDF |
| `numpy` | 2.1.3 | Vectores |
| `fastembed` | 0.4.2 | Solo si `EMBEDDING_PROVIDER=local` (opcional) |

- Comprobado en este equipo: `uv pip check` dice «All installed packages are compatible», y
  `uv pip compile --python-platform windows --python-version 3.12` resuelve 69 paquetes sin conflictos.
- Frontend (no hace falta para construir el RAG): Node 20 o superior (aquí 22.11.0); `npm install` en `frontend/`.

---

## 7. Configuración de la IA: Groq (respuestas) + fastembed (búsqueda)

### 7.0 Qué hace cada modelo (decisión del equipo, 14 nov 2026)

| Pieza | Qué hace | Servicio | Clave |
|---|---|---|---|
| **LLM** | Redacta las respuestas del chatbot y la discusión de los informes, a partir de los fragmentos encontrados y con citas `[S#]` | **Groq**, `openai/gpt-oss-120b` | `GROQ_API_KEY` |
| **Embeddings** | Convierte cada fragmento de los PDF (ya hecho) y cada pregunta en un vector para **buscar** en FAISS | **fastembed** `BAAI/bge-small-en-v1.5` (384 dimensiones), ejecutado en el ordenador del backend | Ninguna |
| Embeddings (alternativa) | Igual, mediante API | Google `gemini-embedding-001` (§7.0 bis); exige **reconstruir** el índice | `GEMINI_API_KEY` |

- **Groq no ofrece modelos de embeddings.** La lista de modelos de Groq (https://console.groq.com/docs/models,
  consultada el 14 nov 2026) solo contiene modelos de texto, voz (Whisper, Orpheus) y moderación (Prompt Guard).
  Primero se planteó usar la API de Google para la búsqueda. El equipo construyó el índice con **fastembed** (sin cuota
  ni clave) y lo subió a git, así que **la configuración por defecto pasa a ser `EMBEDDING_PROVIDER=local`**. El coste
  en uso es vectorizar cada pregunta (una frase) en el ordenador del backend.
- **Modelos de Groq verificados** (https://console.groq.com/docs/rate-limits y `/docs/structured-outputs`):

| Modelo Groq | Plan gratuito (RPM / RPD / TPM / TPD) | Salida JSON |
|---|---|---|
| `openai/gpt-oss-120b` (**elegido**) | 30 / 1K / **8K** / 200K | Sí |
| `openai/gpt-oss-20b` | 30 / 1K / 8K / 200K | Sí |
| `qwen/qwen3.8-27b` | 30 / 1K / 8K / 200K | Sí |
| `llama-3.3-70b-versatile` (el del prototipo) | **No** está en el plan gratuito (marcado «Enterprise») | — |

- **Ajustes para el plan gratuito:**
  - `GROQ_REASONING_EFFORT=low` y `GROQ_MAX_TOKENS=2048`.
  - Una respuesta con k=8 fragmentos ocupa unos 3 000 tokens de contexto, 700 de instrucciones y hasta 2 048 de salida,
    así que cabe en los 8 000 tokens por minuto. En la demo, **como mucho 1 o 2 preguntas por minuto**.
  - Las respuestas ya generadas se guardan en caché en memoria.
  - Si Groq devuelve un 429, el asistente pasa a modo de solo recuperación y lo indica.
- **Llamada en el código** (`backend/app/ai/llm.py`):
  `Groq(api_key).chat.completions.create(model=GROQ_MODEL, messages=[system, user], response_format={"type": "json_object"}, max_tokens=..., extra_body={"reasoning_effort": "low"})`.
  - `reasoning_effort` va en `extra_body` porque el SDK `groq==0.13.0` no lo expone como parámetro.
  - Probado con un cliente simulado; ⚠️ falta probarlo contra la API real.

### 7.0 bis Configuración de Google (solo embeddings; la generación con Gemini es opcional)

### 7.1 Modelos (verificados en la documentación oficial el 14 nov 2026)

Fuentes: https://aistudio.google.com/docs/models, `/docs/models/gemini-3.8-flash`, `/docs/embeddings`,
`/docs/models/gemini-embedding-001` y `/docs/models/gemini-embedding-2`.

| Rol | Identificador exacto | Datos verificados |
|---|---|---|
| Generación (**opcional**, no se usa por defecto) | `gemini-3.8-flash` | Estable. Entrada: texto, imagen, vídeo, audio y PDF. Salida: texto. Contexto de 1 048 576 tokens y 65 536 de salida. Admite *structured outputs*. *Thinking* `low`/`medium`/`high` (por defecto `medium`; `minimal` devuelve error). Actualizado en septiembre de 2026. La lista de modelos lo llama *previous-generation Flash* porque ya existe la familia Gemini 4 (`gemini-4-hydrogen`, `gemini-4-argon`, `gemini-4-carbon`). |
| **Embeddings (recomendado)** | `gemini-embedding-001` | Estable. Solo texto. Entrada máxima de **2 048 tokens**. Dimensión configurable de 128 a 3072 (se recomiendan 768, 1536 o 3072; por defecto 3072). Admite `task_type` (`RETRIEVAL_DOCUMENT`, `RETRIEVAL_QUERY`, `QUESTION_ANSWERING`…). Una lista de textos devuelve un embedding por texto. **Solo viene normalizado a 3072 dimensiones**: con menos hay que normalizar a mano (el código ya lo hace). |
| Embeddings (alternativa) | `gemini-embedding-2` | Estable (abril de 2026). Multimodal. Entrada máxima de **8 192 tokens**. Sin campo `task_type`: la tarea va en el texto (`task: question answering \| query: …` y `title: … \| text: …`). Varias entradas en un solo `contents` producen **un único embedding agregado**: hay que envolver cada texto en su propio `types.Content` para obtener uno por texto (el código ya lo hace). Normaliza solo en dimensiones reducidas. |

> **No confundir:** `gemini-3.8-flash` **no genera embeddings**. Los vectores los produce **un modelo de
> embeddings** (`gemini-embedding-001` o `-2`). Ese mismo modelo y la misma dimensión deben usarse para indexar y para
> las consultas.

**Por qué se recomienda `gemini-embedding-001`:** el corpus es solo texto; sus chunks (unos 1 400 caracteres más el
título, muy por debajo de 2 048 tokens) caben sin problema; admite `task_type` nativo y el envío por lotes de varias
cadenas está documentado. `gemini-embedding-2` es más reciente y está soportado en el código, pero exige el formato de
prompt descrito arriba. Si se usa, hay que reconstruir el índice entero y no mezclarlo.

**Dimensión recomendada: 768.** Según la tabla MTEB de la documentación, 768 da 67,99 frente a 68,17 con 1536, y ocupa
4 veces menos que 3072.

### 7.2 Variables de entorno (en `.env`, nunca en el código)

| Variable | Valor recomendado | Notas |
|---|---|---|
| `GROQ_API_KEY` | *(tu clave)* | **Secreta.** Para las respuestas (LLM). Se crea en https://console.groq.com/keys |
| `LLM_PROVIDER` | `groq` | `gemini` es opcional |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Alternativas gratuitas: `openai/gpt-oss-20b`, `qwen/qwen3.8-27b` |
| `GROQ_REASONING_EFFORT` | `low` | `low`, `medium` o `high` |
| `GROQ_MAX_TOKENS` | `2048` | Tope de salida, por los 8 000 tokens por minuto del plan gratuito |
| `GEMINI_API_KEY` | *(vacía)* | Solo si `EMBEDDING_PROVIDER=google` o `LLM_PROVIDER=gemini`. Se crea en https://aistudio.google.com/apikey |
| `EMBEDDING_PROVIDER` | **`local`** (predeterminado; coincide con el índice de git) | `google` exige reconstruir el índice |
| `EMBEDDING_MODEL` | `gemini-embedding-001` | Solo con `google`. Con `local` se usa `LOCAL_EMBEDDING_MODEL=BAAI/bge-small-en-v1.5` (384 dimensiones fijas) |
| `EMBEDDING_DIM` | `768` | Solo con `google`. **Debe ser idéntica al construir el índice y al servir consultas** |
| `EMBED_BATCH_SIZE` | `50` | ⚠️ El máximo de textos por petición **no se ha verificado** en la documentación. Si la API rechaza el lote, bajarlo (p. ej. a 20). Al cambiarlo se usa otra carpeta de caché |
| `EMBED_MAX_RETRIES` | `8` | Reintentos con espera exponencial ante 429, 500, 502, 503, 504 o RESOURCE_EXHAUSTED |

### 7.3 Cómo se llama a la API en el código

- **Embeddings** (`backend/app/ai/embeddings.py`):
  `client.models.embed_content(model=EMBEDDING_MODEL, contents=..., config=types.EmbedContentConfig(task_type=..., output_dimensionality=EMBEDDING_DIM))`.
  - Documentos con `RETRIEVAL_DOCUMENT`; consultas con `QUESTION_ANSWERING` (documentado para preguntas frente a
    documentos `RETRIEVAL_DOCUMENT`).
  - Todo vector se **normaliza (L2)** antes de entrar en FAISS: el producto interno equivale así al coseno.
- **Generación con Gemini (solo si `LLM_PROVIDER=gemini`)** (`backend/app/ai/llm.py`):
  `client.models.generate_content(model="gemini-3.8-flash", contents=user, config=types.GenerateContentConfig(system_instruction=..., response_mime_type="application/json", max_output_tokens=8192[, thinking_config=ThinkingConfig(thinking_level=...)]))`
  y después se lee `resp.text`.
  - ⚠️ La documentación actual de Google muestra la **Interactions API** (`client.interactions.create(...)`,
    `interaction.output_text`). El SDK 2.34.0 incluye **ambas**; se eligió `models.generate_content` porque sus campos
    (`system_instruction`, `response_mime_type`, `thinking_config.thinking_level`) se comprobaron en el código del SDK.
  - Si `generate_content` fallara con este modelo, se puede cambiar a
    `client.interactions.create(model=..., system_instruction=..., input=user, generation_config={"max_output_tokens": ..., "thinking_level": ...})`.
    Los nombres de esos campos existen en `google/genai/_gaos/types/interactions/` del SDK 2.34.0.
- **Límites y coste:** dependen del *tier* del proyecto en AI Studio; consultar https://aistudio.google.com/docs/rate-limits
  y la propia consola. Con unos 3 000–6 000 chunks estimados (ver §9) y lotes de 50, son unas 60–120 peticiones de
  embeddings. La caché por lotes permite parar y continuar si se agota la cuota.

---

## 8. Reconstrucción paso a paso (Windows PowerShell)

> **Ya no es necesaria para usar la app:** el índice está en git. Sigue estos pasos solo para **reconstruirlo**: al
> añadir o cambiar documentos, o para cambiar a los embeddings de Google (`EMBEDDING_PROVIDER=google`). Con
> fastembed, el paso 7a no hace llamadas a ninguna API y no necesita `GEMINI_API_KEY`.

> Todos los comandos se ejecutan **desde la raíz del repositorio**. Se usa `.\.venv\Scripts\python.exe` directamente,
> así que no hace falta activar el entorno virtual ni cambiar la política de ejecución de PowerShell.
> En Linux o macOS, cambiar `.\.venv\Scripts\python.exe` por `.venv/bin/python` y `\` por `/`.

**1. Clonar el repositorio**
```powershell
git clone <URL-DEL-REPOSITORIO> flame-intelligence
cd flame-intelligence
```

**2. Instalar las dependencias** (Python 3.12)
```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

**3. Configurar las variables de entorno**
```powershell
Copy-Item .env.example .env
notepad .env        # rellenar GROQ_API_KEY=... y GEMINI_API_KEY=...  (no subir .env a git; está en .gitignore)
```
Comprobar que se lee la configuración (no imprime la clave):
```powershell
.\.venv\Scripts\python.exe -c "import sys; sys.path.insert(0,'backend'); from app.core.config import get_settings as g; s=g(); print(s.llm_provider, s.groq_model, s.embedding_provider, s.embedding_model, s.embedding_dim, 'groq key:', bool(s.groq_api_key), 'gemini key:', bool(s.gemini_api_key))"
```

**4. Localizar los documentos originales**
```powershell
# Opción A: copiar la carpeta data\raw\psi\documents desde el equipo antiguo (zip, USB…), y después:
# Opción B: volver a descargarla (lento):
.\.venv\Scripts\python.exe pipeline\fetch_psi.py --docs
```
Verificar que están todos y sin alterar (79 filas; no debe imprimir nada):
```powershell
Import-Csv data\metadata\psi_documents_inventory.csv | ForEach-Object {
  if (-not (Test-Path $_.path)) { "MISSING  $($_.path)" }
  elseif ((Get-FileHash $_.path -Algorithm SHA256).Hash.ToLower() -ne $_.sha256) { "MISMATCH $($_.path)" }
}
```
> Si se usa la opción B, el PSI podría servir versiones más recientes de algún PDF (hash distinto). No es un error, pero
> conviene anotarlo.

**5. Generar la base de datos normalizada** (segundos)
```powershell
.\.venv\Scripts\python.exe pipeline\build_dataset.py
.\.venv\Scripts\python.exe -m pytest -q backend\tests      # deben pasar los 29 tests
```

**6. Extraer, limpiar y dividir en chunks**
```powershell
.\.venv\Scripts\python.exe pipeline\build_rag_index.py --stage chunks
```
Resultado: `data\processed\rag\chunks.jsonl`. Anotar el número de chunks que se imprime.

**7a. Prueba mínima contra la API** (recomendada antes del lote completo: unos 20 embeddings)
```powershell
.\.venv\Scripts\python.exe pipeline\build_rag_index.py --limit 20 --out data/processed/rag_smoke
Remove-Item -Recurse -Force data\processed\rag_smoke       # borrar la prueba después
```

**7b. Generar los embeddings con la API de Google** (reanudable: si se corta o se agota la cuota, repetir el mismo comando)
```powershell
.\.venv\Scripts\python.exe pipeline\build_rag_index.py --stage embed
```

**8. Construir el índice FAISS**
```powershell
.\.venv\Scripts\python.exe pipeline\build_rag_index.py --stage index
```
Resultado: `data\processed\rag\index.faiss` y `manifest.json` (con el modelo y la dimensión usados).

**9. Comprobar que el índice funciona** (integridad, PDF presentes y 4 consultas con fuentes esperadas)
```powershell
.\.venv\Scripts\python.exe pipeline\rag_smoke_test.py
```

**10. Consulta de prueba con respuesta y referencias** (1 llamada a Groq `openai/gpt-oss-120b`)
```powershell
.\.venv\Scripts\python.exe pipeline\rag_smoke_test.py --answer
```
El resultado debe terminar en `RESULT: PASS` y listar las fuentes citadas (`S#`: título, página y URL de PSI o NASA).

**11. (Opcional) Probar la aplicación completa**
```powershell
cd backend; ..\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000      # terminal 1
cd frontend; npm install; npm run dev                                            # terminal 2 → http://localhost:5173/assistant
```

---

## 9. Parámetros del RAG: existentes y recomendados

| Parámetro | **Configuración existente (en el código)** | Recomendación | Dónde |
|---|---|---|---|
| Modelo de embeddings | **`BAAI/bge-small-en-v1.5` con fastembed (predeterminado; es con el que está construido el índice de git)**. Alternativa: `gemini-embedding-001` | Mantener fastembed | `.env` / `config.py` |
| Modelo generativo | Groq `openai/gpt-oss-120b`, `reasoning_effort=low`, máximo 2 048 tokens de salida | Mantener (plan gratuito) | `.env` |
| Dimensión | **384** (fastembed); 768 si se usa Google | 384 | manifest / `EMBEDDING_DIM` |
| Normalización | L2 siempre, en el cliente | — | `embeddings.py` |
| Tamaño del chunk | **1 400 caracteres** | Mantener (muy por debajo de 2 048 tokens) | `CHUNK_CHARS` |
| Solapamiento | **250 caracteres** | Mantener | `OVERLAP` |
| Mínimo por página | 200 caracteres | — | `MIN_PAGE_CHARS` |
| Texto que se embebe | `"{title}\n{text}"` (001) · `"title: {title} \| text: {text}"` (embedding-2) | — | `embeddings._format_document` |
| Tipo de índice | FAISS `IndexFlatIP` (exacto, coseno) | Suficiente para menos de 100 000 vectores | `stage_index` |
| Recuperación | Top 400 candidatos → filtro por ámbito opcional → **cobertura garantizada** de cada investigación mencionada en la pregunta (p. ej. «FLEX vs BASS») → **máximo 3 chunks por documento** | — | `retriever.search` |
| Resultados que se recuperan (k) | **8** por defecto (la API admite de 3 a 14) | 8 | `AskRequest.k` |
| Validación de la respuesta | Se eliminan y se avisan las citas `[S#]` inexistentes; se marca la respuesta sin citas válidas | — | `assistant.py` |
| Nº total de chunks | **4 392** (verificado: 4 021 PSI, 220 NASA, 101 registros, 50 tablas) | — | `manifest.json` |

**Metadatos de cada chunk** (`chunks.jsonl`), necesarios para citar:

| Campo | Ejemplo | Uso |
|---|---|---|
| `id` | `1532` | Posición en FAISS = línea en `chunks.jsonl` (deben coincidir) |
| `doc_id` | `psi:PSI-26/PSI-26_Presentations_...pdf` · `PSI-69:record` · `PSI-69:table` · `nasa:flame-extinguishment-experiment-flex.pdf` | Agrupar y diversificar por documento |
| `title` | `BASS: Presentations — BASS Overview of Recent ISS Results` | Título mostrado en la cita |
| `accession` | `PSI-26` | Enlace a la investigación y filtros de ámbito |
| `source_type` | `psi_record` · `psi_table` · `psi_document` · `nasa_doc` | Tipo de fuente en la UI |
| `page` | `4` (o `null` en registros y tablas) | Cita con página y apertura del PDF en `#page=N` |
| `url` | Página del PSI o PDF de nasa.gov | Enlace verificable |
| `local_path` | `data/raw/psi/documents/PSI-26/...pdf` (POSIX, relativo) | Servir el PDF local |
| `text` | — | Contenido que se envía al LLM |

---

## 10. Pruebas de validación

1. `python -m pytest -q backend/tests` → **29 passed** (comprobado aquí). Incluye:
   - el formato de las peticiones a `gemini-embedding-001` y `-2`;
   - la normalización;
   - los reintentos ante 429;
   - la reanudación de `embed` tras un corte;
   - el `manifest` con la firma del modelo;
   - el rechazo de un índice construido con otra dimensión;
   - el rechazo de un índice incompleto o con `chunks.jsonl` regenerado después de indexar;
   - el informe con IA cuando no hay índice ni clave (se genera igualmente y lo indica);
   - el borrado de citas inventadas;
   - el modo de solo recuperación sin LLM.
2. `rag_smoke_test.py` → integridad (vectores = chunks, firma de embeddings = `.env`, PDF presentes) y recuperación con 4
   casos cuyas investigaciones esperadas se conocen por el catálogo PSI:
   - supresión en FLEX → PSI-69/68;
   - SIBAL en Saffire → PSI-98/99/100;
   - humo y detección → PSI-101/102/115;
   - llamas inversas con O₂ al 85 % → PSI-159/10.
3. `rag_smoke_test.py --answer` → la respuesta tiene citas `[S#]` que existen en las fuentes devueltas, y cada fuente
   citada tiene título y enlace.
4. Revisión manual recomendada: hacer en `/assistant` las 5 preguntas de ejemplo y abrir 2 o 3 citas para comprobar que
   el PDF y la página contienen lo que se afirma.

---

## 11. Problemas conocidos e incidencias

| # | Problema | Estado |
|---|---|---|
| 1 | La construcción con embeddings locales en CPU (fastembed) **se interrumpió dos veces** al cerrarse la sesión. No dejó ningún fichero porque el script antiguo lo hacía todo en memoria | Resuelto en el diseño: etapas reanudables con puntos de control. **Motivo del traslado** |
| 2 | El servidor del PSI es lento (1–300 s por petición) y corta respuestas JSON grandes (fichas de ACME) | Mitigado: tiempos de espera largos y reintentos en `fetch_psi.py`. Las 24 fichas se descargaron completas |
| 3 | `google-genai` 2.34.0 exige `pydantic>=2.12.5` (el requirements tenía 2.10.2) | Corregido: `pydantic==2.14.1`, `httpx==0.28.1` |
| 4 | Riesgo en Windows: lectura y escritura sin `encoding` (cp1252 por defecto) y rutas con `\` en los metadatos | Corregido: UTF-8 explícito y `as_posix()` |
| 5 | En este equipo falta `ensurepip` (no hay `pip` en el venv del sistema) | Se usó `uv`. En el otro equipo, `py -m venv` funciona normalmente |
| 6 | La compilación del frontend (`vite build`) es pesada en este equipo y una ejecución se interrumpió | `tsc` verificado sin errores; el build no se ha repetido aquí |
| 7 | ⚠️ No se ha hecho ninguna llamada real a Groq ni a Google (no había claves) | Pendiente: pasos 7a, 9 y 10 |
| 7 bis | El plan gratuito de Groq limita a 8 000 tokens por minuto con `gpt-oss-120b` | Unas 1–2 respuestas por minuto; caché en memoria; probar las preguntas de la demo de antemano |
| 8 | ⚠️ Máximo de textos por petición de `embed_content` no verificado | `EMBED_BATCH_SIZE` es configurable; bajarlo si la API lo rechaza |
| 9 | Con `EMBEDDING_PROVIDER=google`, la **recuperación** también necesita la clave (se embebe la consulta). Sin clave, el asistente devuelve un error 503 claro | Por diseño |
| 10 | El documento `PSI-23_Presentations_ISS Researchers Guide - Combustion In Reduced Gravity.pdf` es otra copia de la guía de nasa.gov | Excluido para no duplicar |

---

## 11 bis. Validaciones del índice al arrancar la API (`retriever._load`)

La API **no usa nunca** un índice dudoso. Devuelve un error 503 con el motivo exacto en estos casos:

| Comprobación | Mensaje / acción |
|---|---|
| Falta `index.faiss`, `chunks.jsonl` o `manifest.json` | «RAG index not found / incomplete»: ejecutar las etapas que falten |
| El manifest no tiene `n_chunks`, `dim`, `embedding` o `chunks_sha256_16` (builder antiguo) | Reconstruir |
| `manifest.embedding` ≠ configuración actual (`EMBEDDING_PROVIDER/MODEL/DIM`) | Usar la misma configuración o reconstruir |
| El SHA-256 de `chunks.jsonl` ≠ el del manifest (se regeneraron los chunks después de indexar) | `--stage embed` y `--stage index` |
| Nº de vectores ≠ nº de líneas de chunks ≠ `n_chunks` | Índice incompleto: reconstruir |
| Dimensión del índice ≠ `EMBEDDING_DIM` | Reconstruir |

`GET /api/assistant/status` muestra `index.ready` y, si falla, `index.error` con el mismo texto. Los módulos
**Reports** y **Assistant** siguen funcionando sin índice: el informe se genera y dice que falta la discusión con IA.

## 12. Tareas pendientes, en orden recomendado

1. **Probar una pregunta real de principio a fin**, en un ordenador con recursos normales. Pon `GROQ_API_KEY` en `.env`
   y ejecuta:
   ```powershell
   .\.venv\Scripts\python.exe pipeline\rag_smoke_test.py --answer
   ```
   Debe terminar en `RESULT: PASS`. La primera vez descarga el modelo fastembed (unos 65 MB).
2. Revisión manual de citas (§10, punto 4): hacer las 5 preguntas de ejemplo en `/assistant` y abrir 2 o 3 citas.
3. Comprobar en la demo el límite de Groq (8 000 tokens por minuto con `gpt-oss-120b`): como mucho 1 o 2 preguntas por
   minuto. Hacer antes las preguntas que se vayan a enseñar, para que queden en caché.
4. `cd frontend; npm run build` en un ordenador con memoria suficiente (aquí solo se ha ejecutado `tsc --noEmit`, sin
   errores).
5. Si se añaden documentos: §8, pasos 6 a 10, y volver a subir los 3 ficheros de `data/processed/rag/`.
6. Mantener `GROQ_API_KEY` (y `GEMINI_API_KEY`, si se usa) solo en `.env` o en las variables del servidor; nunca en el
   repositorio.

---

## 13. Repositorio GitHub

- **Ahora sí se suben:**
  - los 79 PDF (~186 MB);
  - `data/processed/flame.db`;
  - `data/processed/rag/{index.faiss, chunks.jsonl, manifest.json}` (~13 MB).

  Es una decisión del equipo para que la app funcione al clonar, sin reconstruir nada.
- **Siguen fuera de git:**
  - `.env` y `.env.*` (salvo `.env.example`), claves y credenciales;
  - `.venv/`, `node_modules/` y `frontend/dist/`;
  - `data/processed/models/` (modelo fastembed, se descarga solo) y `data/processed/rag/embed_cache/`;
  - `*.npy`, `*.zip` y `*.tsbuildinfo`;
  - `.claude/`.
- `.gitattributes` mantiene los saltos de línea LF en el repositorio, aunque se haga commit desde Windows, y trata
  como binarios los PDF, `.db`, `.faiss` y `.zip`.
- **No hay claves en el repositorio.** Las rutas son relativas a la raíz del repositorio (`Path(__file__)` y rutas
  POSIX en los metadatos).
