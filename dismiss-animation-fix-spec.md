# Dismiss Animation Fix — AlbumGallery

**Date:** 2026-06-30  
**Status:** Spec (не реализовано)  
**Scope:** `frontend/src/components/AlbumGallery.jsx`  
**Related:** `frontend/src/pages/Dashboard.jsx` (page depth zoom)

---

## 1. Problem Summary

### Current Behavior (баг)

При свайпе фото вниз для закрытия галереи:

1. **Во время drag:** фото плавно следует за пальцем вниз ← работает ✓
2. **В момент отпускания пальца:** происходит **микро-прыжок** — фото смещается на несколько пикселей, прежде чем продолжить анимацию закрытия ← БАГ ✗
3. **Page depth zoom (dragProgressMV):** зум страницы не продолжает анимацию **с того же места**, на котором остановился палец. Создаётся ощущение дёрганости — как будто запускается «статическое фиксированное воспроизведение» вместо плавного продолжения ← БАГ ✗

### User Quote (оригинал)

> «если я потянул изображение вниз, то система должна запомнить позицию, в котором я держу фото. запомнить положение эффекта зума в этот момент. и при отпускании пальца С ЭТОЙ ЖЕ ТОЧКИ уменьшить фото и отменить зум. а сейчас при отпускании какое-то статическое фиксированное воспроизведение анимации, из-за чего она выглядит дерганой.»

### Desired Behavior

1. Палец тянет фото вниз → фото следует за пальцем (уже работает)
2. Палец отпущен → с **того же самого места** и с **той же скоростью**:
   - Фото продолжает движение вниз и уменьшается
   - Страница (Dashboard) продолжает возвращаться к масштабу 1.0
   - Фон (backdrop) продолжает терять непрозрачность
3. В конце: фото shrink'ается в карточку альбома через shared element transition (`layoutId`)
4. **Никакого рывка, замирания или скачка.**

---

## 2. Root Cause Analysis

### Как устроено сейчас

```
┌─────────────────────────────────────────────────────────────────┐
│  Dashboard                                                      │
│  dragProgressMV = useMotionValue(0)  ← владеет Dashboard        │
│  pageScaleMV = useTransform([baseScaleMV, dragProgressMV], ...) │
│  pageScaleMV применяется к контенту страницы                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ prop: dragProgressMV
┌──────────────────────────▼──────────────────────────────────────┐
│  AlbumGallery                                                    │
│                                                                  │
│  Во время drag (onWrapperTouchMove):                             │
│    dragY.set(dy)                          // raw px              │
│    dragProgressMV.set(clamp(dy/(vh*0.9))) // derived, clamped    │
│                                                                  │
│  При отпускании (onWrapperTouchEnd) — dismiss:                   │
│    animate(dragY, vh*1.15, {velocity, spring})    // анимация 1  │
│    animate(dragProgressMV, 1, {progressVel, spring}) // анимация 2│
│                                                                  │
│  При отпускании (onWrapperTouchEnd) — snap-back:                 │
│    animate(dragY, 0, {spring})                                  │
│    animate(dragProgressMV, 0, {duration, ease})                 │
└──────────────────────────────────────────────────────────────────┘
```

### Почему происходит рывок

**Проблема №1 — Две независимые анимации с разными скоростями**

`dragY` и `dragProgressMV` анимируются **отдельно**, каждая со своей `getVelocity()`. Но `dragProgressMV.getVelocity()` может быть неточным, потому что:

- Значение вычисляется как `clamp(dy/(vh*0.9), 0, 1)` — это производная величина
- Если палец двигался быстро, `dragProgressMV` мог упереться в clamp (1.0) ещё во время drag — тогда его velocity = 0
- Даже без clamp: скорость изменения `dy` и скорость изменения `dy/(vh*0.9)` физически разные — spring-анимации с разными velocity производят разные кривые, создавая визуальный mismatch

**Проблема №2 — Возможный разрыв между set() и animate()**

Переход от прямого `set()` (во время touch-событий) к `animate()` (spring) может создать зазор в один кадр, где motion value «застывает» на последнем set-значении до того, как spring начнёт производить новые значения.

**Почему snap-back работает плавно**

Snap-back использует `duration`/`ease` для `dragProgressMV`, что создаёт предсказуемую кривую без привязки к velocity. Плюс, направление возврата (к нулю) менее чувствительно к микро-отклонениям.

---

## 3. Proposed Solution

### Ключевой принцип

> **Одна анимация — один источник истины.**
>
> Вместо двух отдельных `animate()` для `dragY` и `dragProgressMV`, анимировать ТОЛЬКО `dragY`, а `dragProgressMV` вычислять из него в реальном времени через `onUpdate`.

### Implementation Plan

#### Шаг 1: Убрать отдельную анимацию `dragProgressMV` при dismiss

**Было (проблемный код):**
```js
// onWrapperTouchEnd — dismiss case
dragYAnimRef.current = animate(dragY, vh * 1.15, {
    type: "spring",
    stiffness: 200,
    damping: 25,
    velocity: velocity,
    onComplete: () => { onClose(); },
});
if (dragProgressMV) {
    const progressVelocity = dragProgressMV.getVelocity();
    animate(dragProgressMV, 1, {
        type: "spring",
        stiffness: 200,
        damping: 25,
        velocity: progressVelocity,
    });
}
```

**Стало:**
```js
// onWrapperTouchEnd — dismiss case
// Только ОДНА анимация: dragY
// dragProgressMV обновляется в onUpdate — всегда синхронно с dragY
dragYAnimRef.current = animate(dragY, vh * 1.15, {
    type: "spring",
    stiffness: 200,
    damping: 25,
    velocity: velocity,
    onUpdate: (latestDragY) => {
        // Непрерывно вычисляем progress из текущего dragY
        const progress = Math.max(0, Math.min(1, latestDragY / (vh * 0.9)));
        dragProgressMV?.set(progress);
    },
    onComplete: () => {
        // Гарантируем финальное значение
        dragProgressMV?.set(1);
        onClose();
    },
});
```

#### Шаг 2: Snap-back — тоже синхронизировать (хотя там и так ок)

Для консистентности, применить тот же подход:

**Было:**
```js
dragYAnimRef.current = animate(dragY, 0, {
    type: "spring", stiffness: 400, damping: 30,
});
if (dragProgressMV) {
    animate(dragProgressMV, 0, { duration: 0.32, ease: [0.32, 0.72, 0, 1] });
}
```

**Стало:**
```js
dragYAnimRef.current = animate(dragY, 0, {
    type: "spring", stiffness: 400, damping: 30,
    onUpdate: (latestDragY) => {
        const progress = Math.max(0, Math.min(1, latestDragY / (vh * 0.9)));
        dragProgressMV?.set(progress);
    },
    onComplete: () => {
        dragProgressMV?.set(0);
    },
});
```

#### Шаг 3: Убрать ручное вычисление progress из onWrapperTouchMove

Сейчас в `onWrapperTouchMove` progress вычисляется вручную (дублирование логики). Можно оставить как есть (для обратной совместимости), но в идеале вынести в хелпер:

```js
const computeProgress = (dy) => Math.max(0, Math.min(1, dy / (vh * 0.9)));
```

И использовать его и в `onWrapperTouchMove`, и в `onUpdate`.

---

## 4. What Must NOT Change

- **Порог dismiss:** 100px / velocity 500 — оставить
- **Spring-параметры dragY при dismiss:** stiffness: 200, damping: 25 — оставить (если не выявятся проблемы после фикса)
- **Горизонтальный свайп (карусель):** не трогать — работает
- **layoutId / shared element transition:** не трогать — это правильный подход, проблема не в нём
- **bgOpacity / photoDragScale:** не трогать — они уже привязаны к dragY через `useTransform`, поэтому при smooth dragY они будут smooth автоматически
- **Dashboard pageScaleMV:** не трогать — он уже привязан к `dragProgressMV` через `useTransform`, и при smooth dragProgressMV будет smooth
- **Открытие галереи:** depth-эффект при открытии (1.0→0.94) не трогать — работает

---

## 5. Edge Cases

| Случай | Ожидаемое поведение |
|--------|---------------------|
| Медленный drag, отпускание до порога | Snap-back: фото + page scale плавно возвращаются |
| Быстрый flick вниз | Dismiss: всё продолжается с той же скоростью, без рывка |
| Drag за пределы vh*0.9 (progress уже = 1.0) | `onUpdate` продолжает держать progress = 1.0 (clamp), photo продолжает shrink, backdrop уже прозрачный |
| Отпускание при progress ≈ 0.5 | progress плавно идёт с 0.5 → 1.0 синхронно с движением фото |
| Повторный touch во время анимации dismiss | `dragYAnimRef.current?.stop()` уже есть в `onWrapperTouchStart` |
| BottomSheet открыт во время dismiss | Не должен происходить — dismiss только когда sheet закрыт |

---

## 6. Success Criteria

1. ✅ При свайпе вниз и отпускании пальца — **нет микро-прыжка**
2. ✅ Page zoom продолжает анимацию **ровно с той точки**, где остановился палец
3. ✅ Фото + page scale двигаются **как единое целое** — синхронно, без рассогласования
4. ✅ Snap-back при отпускании до порога — без регрессии (должно остаться плавным)
5. ✅ Горизонтальный свайп карусели — без регрессии
6. ✅ Открытие галереи (depth 1.0→0.94) — без регрессии
7. ✅ Shared element transition при закрытии (layoutId) — без регрессии

---

## 7. Implementation Checklist

- [ ] Создать хелпер `computeProgress(dy)` для избежания дублирования
- [ ] Переписать dismiss-ветку `onWrapperTouchEnd`: убрать отдельный `animate(dragProgressMV, ...)`, добавить `onUpdate` в `animate(dragY, ...)`
- [ ] Переписать snap-back ветку `onWrapperTouchEnd`: аналогично синхронизировать через `onUpdate`
- [ ] Убедиться, что `onWrapperTouchMove` продолжает корректно устанавливать `dragProgressMV` во время drag
- [ ] Проверить очистку: `dragYAnimRef.current?.stop()` в `onWrapperTouchStart` и cleanup
- [ ] Протестировать на реальном устройстве (тач-жесты)
