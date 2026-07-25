---
name: make-interfaces-feel-better
description: Design engineering principles for making interfaces feel polished. Use when building UI components, reviewing frontend code, implementing animations, hover states, shadows, borders, typography, micro-interactions.
---

# Details that make interfaces feel better

Great interfaces rarely come from a single thing. It's a collection of small details that compound.

## Core Principles

1. **Concentric Border Radius**: Outer = inner + padding
2. **Optical Over Geometric Alignment**: Manually adjust icons/play buttons
3. **Shadows Over Borders**: Layer multiple transparent `box-shadow` values
4. **Interruptible Animations**: CSS transitions for interactive states, keyframes for one-shot
5. **Split & Stagger Enter Animations**: Break into chunks, ~100ms delay each
6. **Subtle Exit Animations**: Small fixed `translateY`, softer than enters
7. **Contextual Icon Animations**: scale 0.25→1, opacity 0→1, blur 4px→0px
8. **Font Smoothing**: `-webkit-font-smoothing: antialiased` on root
9. **Tabular Numbers**: `font-variant-numeric: tabular-nums` for dynamic numbers
10. **Text Wrapping**: `text-wrap: balance` on headings, `pretty` for body
11. **Image Outlines**: `1px` outline, `rgba(0,0,0,0.1)` light / `rgba(255,255,255,0.1)` dark
12. **Scale on Press**: `scale(0.96)` on click, never below `0.95`
13. **Skip Animation on Page Load**: `initial={false}` on `AnimatePresence`
14. **Never `transition: all`**: Specify exact properties
15. **`will-change` Sparingly**: Only `transform`, `opacity`, `filter`
16. **Minimum Hit Area**: 40×40px for interactive elements

## Common Mistakes

| Mistake | Fix |
|---|---|
| Same border radius parent/child | `outerRadius = innerRadius + padding` |
| Icons look off-center | Adjust optically |
| Hard borders | Use layered `box-shadow` |
| Jarring enter/exit | Split, stagger, subtle exits |
| Numbers shift layout | `tabular-nums` |
| Heavy macOS text | `antialiased` on root |
| Animation on page load | `initial={false}` |
| `transition: all` | Specify exact properties |

## Review Checklist

- [ ] Nested rounded elements use concentric border radius
- [ ] Icons optically centered
- [ ] Shadows instead of borders where appropriate
- [ ] Enter animations split and staggered
- [ ] Exit animations subtle
- [ ] Dynamic numbers use tabular-nums
- [ ] Font smoothing applied
- [ ] Headings use text-wrap: balance
- [ ] Images have subtle outlines
- [ ] Buttons use scale on press
- [ ] No `transition: all`
- [ ] Interactive elements ≥ 40×40px hit area
