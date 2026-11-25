# Quadre de seguiment de campanyes · Unitat de Mecenatge del VHIR

Demo navegable en català del seguiment de campanyes del VHIR. Respon tres preguntes en
pocs segons: **quant s’ha invertit**, **què s’ha aconseguit** i **com ha evolucionat**.

Dos tipus de campanya, amb dues fonts reals:

- **Campanyes de leads** → Meta Ads, en directe des de la Graph API del compte Vall d’Hebron,
  reutilitzant la connexió i l’arquitectura de `mcp-ads-persualia/trendtool`. Avui, Menopausa.
- **Campanyes de donatius i socis** → el fitxer de socis i donatius, agregat abans de
  servir-lo, més la taula de registres que el personal del VHIR manté a mà. Avui, Impulsa
  Talent.

L’abast és aquestes dues campanyes: la llista viu a `src/tracking/domain/campaigns.ts` i
afegir-n’hi una és el que la fa entrar al quadre.

## Posada en marxa

Cal Node 20+ i [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm data:impulsa "<ruta>/VAL ImpulsaTalent Socis i Donatius - 2026.csv"   # genera l'agregat i els registres
pnpm dev --port 3500                                                        # http://localhost:3500
```

No hi ha cap `index.html` estàtic: el token de Meta només pot viure al servidor, així que
l’app s’obre per URL.

| Variable | Per a què serveix |
| --- | --- |
| `META_ACCESS_TOKEN` | Token d’usuari de sistema amb `ads_read`. Obligatori. |
| `META_BUSINESS_ID` | Business Manager d’on llegir els comptes. Per defecte, Persualia. |
| `META_API_VERSION` | Versió de la Graph API. Per defecte, `v25.0`. |
| `VHIR_AD_ACCOUNT_ID` | Compte publicitari. Per defecte, `122669428442042` (Vall d’Hebron). |
| `VHIR_CREDENTIALS_DIR` | Carpeta del `.env` compartit. Per defecte, `../../mcp-ads-persualia`. |
| `VHIR_OVERRIDES_FILE` | On es desen les correccions manuals. Per defecte, `data/impulsa-overrides.json`. |

Les credencials **no es copien en aquest repositori**: `next.config.ts` les busca, per ordre,
a l’entorn del procés, al `.env` de l’arrel d’aquest repositori i al `.env` del repositori de
credencials compartides.

```bash
pnpm test      # 59 proves de domini
pnpm lint      # inclou la regla de dependències de l'arquitectura
```

## Què mostra

### Selector

A dalt hi ha el selector de **campanyes**, separades per allò que mesuren: campanyes de leads
i campanyes de donatius i socis. El filtre de dates i el canvi d’agrupació només surten quan
la font els pot aplicar, és a dir a les campanyes de leads; per defecte es mostra tot el
període.

### Campanyes de leads

Agrupa sota una mateixa campanya totes les de Meta que comparteixen la X de la convenció
interna **PER + X**. Mostra inversió, leads i cost per lead, amb el **CPL calculat com a
inversió total ÷ leads totals** de tot el grup, mai com la mitjana dels CPL de cada campanya;
sense leads en un període, el CPL queda com un guió.

Els gràfics de volum i de cost van separats, cadascun amb la seva escala, i a sota hi ha el de
la inversió: és el que permet veure de seguida si una pujada del CPL coincideix amb un canvi
de pressupost. Sota els gràfics hi ha una frase que ho diu amb paraules («els leads han baixat
un 46 % i el CPL ha baixat un 12 %, amb una inversió més baixa»).

### Campanyes de donatius i socis

Dues pestanyes.

**Resum.** Cinc xifres: inversió aproximada (**6.601 €**), facturació acumulada (**7.868 €**),
**ROAS actual** (**1,19×**), valor estimat el primer any (**18.213 €**) i **ROAS del primer
any** (**2,76×**), amb data de tall **12/11/2026**. A sota, el gràfic setmanal de donatius
puntuals i nous socis per data de registre, i el criteri de projecció del fitxer.

Els dos ROAS no mesuren el mateix:

- **ROAS actual** = el que s’ha facturat fins avui ÷ la inversió.
- **ROAS del primer any** = tot el que han generat els registres ÷ la inversió. Per a cada
  registre suma **tots els anys que ha estat en marxa fins a l’any en curs**: un soci donat
  d’alta el 2026, mirat el 2028, hi aporta el 2026, el 2027 i el 2028, mentre que un soci nou
  del 2028 hi aporta el seu primer any. Les quotes marcades com a impagades a la taula es
  resten de l’any que els toca.

Mentre tots els registres són d’enguany —ara mateix ho són, tots del 2026— la xifra coincideix
exactament amb la projecció a un any del fitxer, 18.213 €. A partir del 2027 anirà creixent
amb els anys que cada soci acumuli. L’etiqueta «del primer any» ve del criteri del fitxer; si
voleu, es pot reanomenar a «ROAS acumulat» quan passi el primer canvi d’any.

La inversió surt del fitxer, que és on hi ha el pressupost de Meta i de Google. **D’aquesta
campanya no es llegeix res de Meta Ads**, tot i que hi tingui campanya oberta.

**Donants i socis.** La taula de registres, que és la que mana: les xifres del resum es
recalculen a partir d’ella.

## La taula de donants i socis

Pensada perquè la persona del VHIR la mantingui sense poder trencar res, i perquè el que hi
toqui es vegi immediatament al quadre.

| Columna | Què hi passa |
| --- | --- |
| Referència, Data, Import base, Freqüència | Vénen del fitxer i no es toquen. |
| Donant, Correu | **Ocults en aquesta demo.** A la instància del VHIR porten les dades reals i la cerca també hi busca. |
| **Origen** | Editable: Meta, Google Ads, Newsletter o Altres. Una cel·la buida al fitxer **és Meta**. |
| **Estat** | Editable: Inclòs, Exclòs o Cancel·lada. Només «Inclòs» compta a les xifres. |
| Facturat | El del fitxer, menys les quotes marcades com a impagades d’un any que ja ha passat. |
| **Quota (per any)** | Editable: l’import d’una quota aquell any. Serveix per al cas «enguany aquesta quantitat i a partir de l’any vinent una altra». |
| **Impagats (per any)** | Editable: quantes quotes no s’han cobrat aquell any. Mai més de les que toquen. |
| Previst (per any) | Calculat: quota × (quotes − impagades). És el que alimenta el resum. |

Les columnes d’any **creixen soles**: hi ha des del primer registre fins un any més enllà del
darrer any tocat, de manera que **l’any vinent hi és sempre** per poder-hi anotar un canvi
abans que arribi. Un registre d’un sol pagament no té quotes els anys següents i la seva
cel·la queda inactiva.

La cerca va per referència, data, import, freqüència, origen i estat (i, a la instància del
VHIR, per nom i correu). Tot el que s’escriu es desa a `data/impulsa-overrides.json`, fora del
fitxer original, de manera que **regenerar l’agregat no perd cap correcció**. El servidor
només accepta els valors de les llistes i nombres positius; qualsevol altra cosa es rebutja.

## Correspondència de noms

El selector només mostra el nom llegible:

| Token a Meta | Nom a la demo | Tipus |
| --- | --- | --- |
| `PER Menopausa …` | Menopausa | Leads |
| (del fitxer de socis i donatius) | Impulsa Talent | Donatius i socis |

El prefix **`VAL`** de `VAL ImpulsaTalent …` es reconeix igual que `PER`, tot i que aquesta
campanya no llegeixi res de Meta. La resta de campanyes del compte queden fora de l’abast; el
peu de pàgina en diu quantes n’hi ha.

## Privacitat del fitxer d’Impulsa Talent

`scripts/build-impulsa-aggregate.mjs` llegeix l’exportació i n’escriu dos fitxers, que són
l’únic que l’app serveix:

- `src/tracking/data/impulsa-aggregate.json` — recomptes i sumes.
- `src/tracking/data/impulsa-records.json` — una fila per registre, identificada per una
  referència correlativa (`R-001`…).

Del detall només se’n llegeix la data, l’import, la freqüència, l’estat i el canal. **Els
noms, els correus i els identificadors no surten de l’script**, el CSV original no entra al
repositori (vegeu `.gitignore`) i no arriba mai al navegador. Les proves comproven que cap
dels dos fitxers conté una adreça de correu ni cap camp personal.

## Comprovació dels totals contra les fonts

L’script recalcula el fitxer i el compara amb el seu propi resum abans d’escriure res; si
alguna xifra no quadra, falla. Les nou comprovacions:

| Comprovació | Recalculat | Al fitxer |
| --- | --- | --- |
| Facturació acumulada | 7.868,00 € | 7.868,00 € |
| Valor estimat el primer any | 18.213,00 € | 18.213,00 € |
| Import base × criteri = columna del primer any | 18.213,00 € | 18.213,00 € |
| Ràtio sobre la projecció a un any | 2,76 | 2,76 |
| Ràtio sobre la facturació acumulada | 1,19 | 1,19 |
| ROAS de Google a un any | 0,372377 | 0,372377 |
| ROAS de Google acumulat | 0,083762 | 0,083762 |
| ROAS de Meta a un any | 3,745204 | 3,745204 |
| ROAS de Meta acumulat | 1,704925 | 1,704925 |

Les dues de Meta quadren perquè **una fila sense canal és de Meta**, que és el criteri de la
Unitat de Mecenatge i el que el full ja feia servir per calcular el seu ROAS de Meta.

Una comprovació creuada entre les dues fonts: la inversió de Meta que el fitxer declara,
**4.820,50 $**, és exactament la que la Graph API dona per a `VAL ImpulsaTalent HotLAL1Socis
CostCap Sales v1`.

I una comprovació dins l’app: amb la taula sense cap correcció, les xifres que surten dels
registres són exactament les del resum del fitxer (7.868 € i 18.213 €). Això és el que lliga
la taula editable amb la font.

Sobre les exclusions: de les 113 files de detall, 109 computen. Les 4 restants (3 marcades
`Exclòs` i 1 `Cancel·lada`) ja porten 0,00 € a les dues columnes d’import i no sumen res. La
columna «Quotes impagades» és buida a tot el fitxer, de manera que no resta res dels totals;
a partir d’ara els impagats s’anoten a la taula, any per any.

## Arquitectura

```
src/
├── tracking/
│   ├── domain/            # TypeScript pur: calendari, format català, campanyes, informe de
│   │                      # leads, donants (anys, impagats, cerca), agregat, mètriques
│   ├── application/       # Casos d'ús i ports
│   │   └── ports/         # AdAccountRepository, CampaignInsightsRepository,
│   │                      # ImpulsaRepository, DonorOverridesRepository
│   ├── data/              # Els fitxers generats (sense dades personals)
│   └── infrastructure/    # Adaptadors de sortida
│       ├── meta/          # Graph API i mapatge de les seves respostes
│       ├── impulsa/       # Lectura dels fitxers i escriptura de les correccions
│       ├── cache/         # Decorador en memòria del port d'insights (30 min)
│       └── container.ts   # Composició
├── app/                   # Adaptador d'entrada: pàgina, /api/board i /api/donors
└── components/
    ├── tracking/          # Adaptador d'entrada: quadre, vistes, taula i gràfics
    └── ui/                # shadcn
```

Les dependències només apunten cap endins, i `eslint.config.mjs` ho fa complir.

`/api/board` entrega un any de dades diàries i els registres en una sola lectura, i el domini
pur recalcula al navegador: per això canviar de campanya, de període o d’agrupació —i editar
una cel·la— és immediat. `/api/donors` desa una correcció i torna totes les correccions.

Incorporar StockCrowd és escriure un adaptador nou de `ImpulsaRepository` i
`DonorOverridesRepository`; la resta no canvia.

Els gràfics són SVG propi, sense cap llibreria: dos colors d’una paleta validada per a
daltonisme i contrast, volum i cost sempre en gràfics separats amb una sola escala cadascun, i
capa de hover.

## Lliurament

- **Enllaç de previsualització:** https://claude.ai/artifact/AUGVX1jFBcEeSwoDxudSRv
  Instantània estàtica del 25/11/2026 amb les mateixes xifres, el selector operatiu i la taula
  editable (els canvis s’hi veuen però no s’hi desen), per poder referenciar la demo a la
  memòria sense exposar el token de Meta. És privada: cal compartir-la des del menú Share de
  la pàgina perquè altres persones la puguin obrir.
- **Captures:** `docs/captures/01-campanya-de-leads.jpg`,
  `docs/captures/02-campanya-de-donatius.jpg` i
  `docs/captures/03-taula-de-donants-i-socis.jpg`.

Per regenerar la previsualització amb dades noves:

```bash
pnpm dev --port 3500                                   # en una altra terminal
node scripts/build-preview-data.mjs > preview/data.json
node scripts/build-preview.mjs                         # escriu preview/index.html
```
