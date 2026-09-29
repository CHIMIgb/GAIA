# PR

Un paso del ROADMAP por PR, como mucho. Si el PR toca un paso que ya no está
validado, se nota en el checklist.

## Qué cambia

<!-- 0.8.4 — templates de issue/PR -->

**Paso del ROADMAP:** `0.8.4`

## RF / RNF

<!-- RNF-01, RF-01… Si no aplica ninguna, "—" y ya está. -->

`—`

## Evidencia

<!--
Los comandos están en la guía de contribución §6; no los copies aquí, pon sus
salidas. Un criterio se da por cumplido con la salida del comando, no con una
descripción.
-->

```

```

## Checklist

<!-- El checklist completo, con cómo se verifica cada punto, está en la DoD §2-§3. -->

- [ ] El criterio del paso en el ROADMAP está cumplido, con la salida del comando pegada arriba.
- [ ] Hay un test que falla si el comportamiento se rompe, y la mutación que lo ata está hecha y deshecha.
- [ ] Los docs afectados subidos de versión con su fecha, y los valores nuevos citados desde su doc de origen, no escritos otra vez.
- [ ] Sin secretos ni `.env` en el índice.
- [ ] Los commits llevan prefijo semántico y uno por paso realizado.
- [ ] Prettier sin cambios pendientes.

## Si toca la API

- [ ] El sobre sigue siendo `{ success, data, error }` en las dos direcciones, con los códigos de `API_CONTRACT` §3.
- [ ] Los endpoints públicos no se renombran: `/api/fires`, `/api/earthquakes`, `/api/wind`, `/api/radiation`, `/api/history/*`, `/api/health`.
- [ ] `grep -r "api/quakes"` sale a 0. Los módulos de sismos pueden llamarse `quakes` por dentro; el endpoint no.

## Si toca datos con fecha

- [ ] Las fechas van en RFC 3339 (ISO 8601), como el `acq_date` de `TECH_STACK`.
