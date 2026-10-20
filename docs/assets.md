# Assets, procedencia y licencias

## Fuente principal

Los retratos de Pokémon proceden de **PMDCollab/SpriteCollab**:

- Repositorio: https://github.com/PMDCollab/SpriteCollab
- Ruta usada: `portrait/{id con 4 dígitos}/Normal.png`
- URL base: https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/portrait
- Licencia declarada por la fuente: **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)**.
- Texto de licencia: https://creativecommons.org/licenses/by-nc/4.0/
- Copia local del aviso: `public/assets/PMDCOLLAB-LICENSE.md`
- SHA-256 del aviso registrado en el manifiesto: `284233a8bc62ac54d878552845ef66ab94b25112e6fc8f902fcdfa6149748c31`

## Qué se descargó

- **35 retratos estáticos** en PNG, uno por especie del catálogo.
- Archivos: `public/assets/pokemon/{id}.png`.
- Manifiesto: `public/assets/pokemon/manifest.json`.
- No se descargaron hojas de animación, audio, tilesets ni el catálogo completo de SpriteCollab.
- El juego no reproduce animaciones de SpriteCollab que no estén en los archivos descargados. Las animaciones de la interfaz son propias de CSS.

Cada entrada del manifiesto registra:

- `id` y `name` de la especie;
- `file` servido por la aplicación;
- `url` original;
- `bytes`;
- `sha256` del PNG;
- fuente, licencia y enlace al texto legal.

## Atribución

Texto mínimo que debe conservarse al distribuir el juego:

> Retratos de Pokémon: PMDCollab/SpriteCollab, disponibles bajo CC BY-NC 4.0. Proyecto fan no oficial, sin afiliación con Nintendo, The Pokémon Company ni los titulares de Catán.

La atribución aparece en el pie del menú principal y en este documento. El aviso legal completo se conserva en `public/assets/PMDCOLLAB-LICENSE.md`.

## Restricciones de uso

- Los retratos tienen licencia **no comercial**. No se debe usar este proyecto para publicidad, venta, suscripciones, donaciones con contraprestación ni otras formas de explotación comercial sin una licencia adicional.
- Se debe mantener la atribución y el aviso de licencia.
- Si se modifica un retrato, debe indicarse que fue modificado.
- Pokémon y los nombres de las especies son marcas de sus respectivos titulares. Este proyecto es una obra fan no oficial.
- El código del juego no se presenta como afiliado ni respaldado por Nintendo, The Pokémon Company, Game Freak, Creatures ni los titulares de Catán.

## Fuentes evaluadas y no incorporadas

- **JPTER78/pokesurvivor**: se usó como referencia de ambientación y estilo. No se incorporaron sus assets porque no se verificó una autorización de redistribución suficientemente clara para los archivos gráficos.
- **PokeAPI/sprites**: se evaluó como alternativa. No se incorporó en esta versión porque SpriteCollab cubre los 35 retratos necesarios con una procedencia y licencia documentadas. Si se usa en el futuro, debe revisarse la licencia de cada conjunto de sprites, no solo la del repositorio.

## Procedimiento de descarga y actualización

El script es `scripts/fetch-assets.mjs`. El proceso es idempotente:

```bash
npm run assets
```

Comportamiento:

1. Lee `POKEMON_CATALOG` de `src/engine/data.ts`.
2. Comprueba si cada `public/assets/pokemon/{id}.png` existe, no está vacío y tiene firma PNG válida.
3. Reutiliza los archivos válidos.
4. Descarga solo los que faltan.
5. Valida la firma PNG antes de escribir.
6. Calcula el SHA-256 de cada archivo.
7. Escribe el manifiesto con procedencia y metadatos.
8. Descarga el aviso de licencia si falta.

Para forzar una descarga completa:

```bash
npm run assets -- --force
```

Para añadir una especie:

1. Añádela a `POKEMON_CATALOG` con su ID nacional estable.
2. Ejecuta `npm run assets`.
3. Revisa `public/assets/pokemon/manifest.json`.
4. Ejecuta las pruebas y el build.

El proceso no requiere credenciales ni servicios de pago. La build no descarga assets: los PNG y el manifiesto ya están versionados en `public/`.

## Fallback visual

Si un retrato falta o falla al cargar, el componente `Sprite` muestra un cuadrado pixelado con la inicial de la especie, su nombre accesible y el tamaño solicitado. La partida no se bloquea por un asset ausente.

## Validaciones realizadas

- Los 35 archivos existen y son PNG válidos de más de 100 bytes.
- El manifiesto contiene una entrada por especie y conserva IDs únicos.
- El SHA-256 del aviso de licencia coincide con el descargado.
- Las rutas son locales y funcionan sin conexión después de cargar la aplicación.
- El favicon es local (`public/favicon.svg`) y no depende de un servicio externo.
