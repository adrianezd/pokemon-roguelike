# Pokémon Roguelike (proyecto de fan no oficial)

Roguelike de combates por turnos hecho enteramente en HTML/CSS/JS vanilla (sin
frameworks, sin paso de build en tiempo de ejecución), jugable gratis y sin
descargar, en el móvil o en el navegador.

**Juega aquí:** https://adrianezd.github.io/pokemon-roguelike/

## Aviso legal / disclaimer

> Proyecto de fan no oficial. No afiliado a Nintendo, Game Freak ni The
> Pokémon Company. Datos de PokeAPI (pokeapi.co), sin usar sprites ni
> artwork oficiales.

Este proyecto usa nombres, tipos, estadísticas base y movimientos **reales**
de Pokémon como datos de texto plano, obtenidos de [PokeAPI](https://pokeapi.co)
(una API pública y gratuita pensada explícitamente para proyectos de fans y
desarrolladores). **No se usa, incrusta ni enlaza ningún sprite, artwork o
logo oficial** — todos los elementos visuales (avatares de Pokémon, insignias
de tipo, iconos de nodo del mapa) son formas geométricas y colores originales
generados con CSS/SVG.

## Cómo se obtuvieron y procesaron los datos

`build/fetch-pokedata.js` es un script de Node.js de un solo uso (no se
ejecuta en producción) que:

1. Consulta `/type/{nombre}` para los 18 tipos reales y construye la tabla de
   eficacia completa (18×18) a partir de `damage_relations`, incluyendo el
   nombre oficial en español de cada tipo.
2. Consulta `/pokemon/{id}` para los Pokémon #1–151 (Generación I), extrayendo
   tipos y estadísticas base (PS, Ataque, Defensa, Ataque Especial, Defensa
   Especial y Velocidad — Ataque/Defensa se promedian con su contraparte
   especial para un único par Ataque/Defensa por sencillez del motor de
   combate).
3. Para cada Pokémon, selecciona 4 movimientos reales de nivel de su
   repertorio (`red-blue`, con alternativas si hace falta): prioriza sus
   mejores movimientos de su propio tipo (STAB) y garantiza al menos un
   movimiento de cobertura de otro tipo cuando el repertorio lo permite.
4. Consulta `/move/{nombre}` una sola vez por movimiento distinto (con caché)
   para obtener tipo, potencia, precisión, clase de daño y el nombre oficial
   en español.
5. Escribe los resultados minimizados en `pokedex-data.json`,
   `moves-data.json` y `type-chart.json` — el juego en vivo **solo lee estos
   tres archivos estáticos** y nunca llama a PokeAPI en tiempo de ejecución.

Resultado: **151 Pokémon**, **150 movimientos distintos** y los **18 tipos**
reales con su tabla de eficacia completa. Se validó la integridad de estos
tres archivos con un script de un solo uso (tipos válidos, estadísticas en
rango razonable, todo movimiento referenciado existe en `moves-data.json`,
tabla de tipos completa) antes de construir el juego sobre ellos.

## Diseño del juego

- Mazmorra ramificada de 20 nodos: encuentros salvajes (con captura),
  combates de entrenador, curación, tienda y un jefe cada 5 nodos.
- Equipo de hasta 3 Pokémon, combate por turnos con 4 movimientos, orden de
  turno por Velocidad y cambio de Pokémon activo.
- Permadeath por partida (el equipo debilitado por completo termina la
  partida), con una moneda meta (**Créditos**) y Pokémon iniciales
  desbloqueables permanentes entre partidas vía `localStorage`.
- **La dificultad del rival está ligada al nivel medio real del equipo del
  jugador** (no al índice de nodo en bruto), y solo un desplazamiento de
  nivel modesto y sin acumular (entrenador +1, jefe +2) se añade sobre eso —
  la escalada real de dificultad viene del tamaño de equipo rival, no de
  bonificaciones de nivel apiladas. Esto evita a propósito el problema de
  "morir siempre" observado y corregido en un proyecto hermano de este lote
  (`critter-tactics-roguelike`), donde el rival escalaba con el nodo mientras
  el jugador solo mejoraba ganando combates.

### Simulación de balance

`build/simulate-balance.js` (script de un solo uso, ya eliminado del
repositorio) reimplementó las fórmulas reales del juego y jugó 800 partidas
con una estrategia razonable (curar cuando conviene, capturar para completar
el equipo, usar pociones a la defensiva, elegir el mejor movimiento
disponible). Resultado final tras el ajuste:

- Tasa de victoria: **11.3%**
- Piso medio alcanzado: **13.98 / 20**
- Distribución de piso alcanzado: 5.8% piso 0-4, 26.6% piso 5-9, 25.0% piso
  10-14, 31.4% piso 15-19, 11.3% victoria completa.

Antes de ajustar el desplazamiento de nivel del rival y el ritmo de
crecimiento del tamaño de equipo, la primera pasada (desplazamiento de nivel
neutro/+1 para jefes) daba un piso medio de 15.13/20 con solo 16% de
victorias pero más de la mitad de las partidas llegando casi al final — una
curva demasiado suave. Subir el desplazamiento de nivel de entrenador/jefe y
adelantar el segundo miembro de equipo rival produjo la curva final: la
mayoría de partidas llega a un punto medio sólido sin ser trivial, y solo una
fracción modesta consigue la victoria completa.

## Estructura de archivos

```
index.html          Página principal + SEO + JSON-LD
style.css            Estilos (mobile-first, identidad visual original)
script.js            Lógica del juego (vanilla JS)
pokedex-data.json     151 Pokémon procesados
moves-data.json       150 movimientos procesados
type-chart.json       Tabla de eficacia de los 18 tipos reales
favicon.svg           Icono original (círculo abstracto, no es un Poké Ball oficial)
manifest.json         Manifest tipo PWA
robots.txt / sitemap.xml
build/fetch-pokedata.js  Script de un solo uso (build-time) que generó los JSON desde PokeAPI
```

## Créditos

- Datos: [PokeAPI](https://pokeapi.co) (pokeapi.co), API pública y gratuita.
- Código, diseño visual y motor de juego: adrianezd.
