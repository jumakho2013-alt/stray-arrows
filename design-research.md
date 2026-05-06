# Stray Arrows v2 — Design Research

> Цель: довести визуал до уровня премиальных minimalist puzzle apps. Не выглядеть как «HTML-обёртка». Решение: solid minimalism + 3-4 точечных эффекта которые делают каждое касание приятным. Не редизайн палитры, а добавление weight, depth и polish.

## 5 эталонов и что от каждого взять

### 1. Monument Valley (ustwo) — Apple Game of the Year 2014, ADA 2014
- **Палитра**: тёплые пастели, ОЧЕНЬ ограниченное число цветов на экран (3-5 максимум)
- **Тени**: длинные, мягкие, изометрические — добавляют 3D без 3D-движка
- **Анимация камеры**: всегда subtle parallax при движении руки/наклоне устройства
- **Что взять для нас:**
  - Парность палитры (background ↔ accent ↔ text), не разводить лишних цветов
  - Тонкая длинная тень от стрелы под арроухедом (не drop-shadow по контуру, а в одну сторону — даёт «свет сверху»)
  - Очень subtle parallax background при touch movement (DeviceMotion на phone уже не нужен)

### 2. Mini Metro (Dinosaur Polo Club)
- **Геометрия как UI**: метро-карта = чистые круги, линии, прямые углы. UI не разделяет «игровое поле» и «контролы» — они одного языка
- **Цвета линий**: высоконасыщенные (BBC Tube colors), но фон stark white. Контраст за счёт фона, не glow
- **Звук**: каждое действие имеет короткий пианино-нот. Нет «click», есть «нота»
- **Что взять:**
  - Унифицированный «язык формы» — наши стрелы и кнопки должны быть из одной системы (та же толщина stroke, тот же радиус скругления)
  - Звук как нота, а не click — заменить current click sound на короткий piano hit (C4)
  - Контраст через background contrast, а не через лишние shadows

### 3. Threes! (Sirvo / Asher Vollmer)
- **Типографика как dominant element** — большие, sans-serif, веселые цифры. UI почти отсутствует, числа сами и есть UI
- **Tactile feel**: каждый swipe имеет вес — анимация card движения 250ms ease-out, не linear
- **Подача игры**: «sliding tile» эстетика, deep but tutorial-light
- **Что взять:**
  - Press scale 1→0.96 на кнопках 80ms ease-out (мы об этом уже писали в плане)
  - Веса шрифтов: title 700, button 600, body 400. Меньше — менее 4 уровней важности

### 4. Art of Fauna (Klemens Strasser) — Apple Design Award 2025 (puzzle category)
- **Vintage illustration style** + full VoiceOver + reduce-motion поддержка
- **Высокий contrast mode** доступен из коробки — accessibility как design feature
- **Что взять:**
  - Контраст dark mode усилить (rgba .08 → .12 как мы и планировали)
  - reducedMotion уже учтён, но по audit-рекомендации добавить «silent variant» для confetti
  - High contrast option в Settings (toggle: light/dark/high-contrast)

### 5. Puffies (Lykke Studios) — ADA 2025 finalist
- **'80s nostalgia + Reduce Motion** — премиум через ностальгический визуал и accessibility
- **Что взять:**
  - Тонкие grain/noise эффекты (1% noise overlay) добавляют «материальность», не выглядят digital

## Сводка: 8 правок которые сделают max-impact на v2

| # | Правка | Источник | Сложность | Эффект |
|---|---|---|---|---|
| 1 | Press scale 1→0.96 на кнопках 80ms ease-out | Threes! | низкая | каждое касание ощущается |
| 2 | Subtle long-shadow на arrow head (не drop, а offset) | Monument Valley | низкая | стрелы становятся «вещью» |
| 3 | Усилить dark mode контраст rgba .08→.12 | Art of Fauna a11y | низкая | читаемость |
| 4 | Hint pulse: shadowBlur → alpha-fade | (audit Phase 1) | низкая | iOS perf |
| 5 | Title gradient flow (золото→тёмное золото→золото, цикл 8с) | (план) | средняя | premium feel |
| 6 | High Contrast theme option в Settings | Art of Fauna | средняя | a11y + design focus |
| 7 | Click sound → piano hit (короткий C4 mp3) | Mini Metro | низкая | tactile feedback |
| 8 | Splash → menu cross-fade 200ms | (план) | низкая | smoothness |

**Решение по палитре:** оставляем существующую Bakery (#f5f2ed / #15152a). Она уже хороша, в направлении Monument Valley теплоты. Усиливаем только контраст dark mode и расширяем токены (radii, shadows, motion durations).

## Что НЕ делать

- Не добавлять 3D через CSS transform-3d (тяжело на iOS WebKit, выглядит как Material Design hack)
- Не тащить кастомные шрифты как файлы (текущие Google Fonts Nunito + Poppins хороши, не раздуваем bundle)
- Не делать parallax на DeviceMotion на phone (battery cost, перебор)
- Не менять основную игровую механику (правила игры — отдельная история)

## Sources

- [Monument Valley — Game Design Inspiration (Krasamo)](https://www.krasamo.com/game-design-inspiration-monument-valley-i-and-ii/)
- [Monument Valley: The Art of Minimalistic Game Design](https://xperia-games.com/blog/mobile-gaming-arena/monument-valley-the-art-of-minimalistic-game-design)
- [Apple Design Awards 2025 — Apple Newsroom](https://www.apple.com/newsroom/2025/06/apple-unveils-winners-and-finalists-of-the-2025-apple-design-awards/)
- [Apple Design Awards 2025 (CultOfMac)](https://www.cultofmac.com/news/apple-design-awards-winning-apps-and-games)
- [Mobile Puzzle Games That Sharpen the Mind (gmrzone)](https://gmrzone.com/articles/mobile/10-mobile-puzzle-games-that-will-sharpen-your-mind/)
