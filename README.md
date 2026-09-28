
# SYNORA COKE — Web Calculator

A pixel-loving, browser-based recreation of the SYNORA COKE scientific calculator. Pure HTML, CSS, and JavaScript — no frameworks, no build step, no dependencies.

🔗 **Live demo:** https://synoracoke-bysuhail.netlify.app/

## Features

- **Natural-style expression input** with SHIFT / ALPHA modes, cursor navigation, and DEL/AC handling
- **Scientific functions** — trig (sin/cos/tan + inverse + hyperbolic), log, ln, √, ∛, powers, factorial, and more
- **Angle modes** — DEG / RAD / GRAD, cycled via the DRG key
- **Memory operations** — M+, M-, MR, MC
- **Calculation history** — slide-out drawer, persisted to `localStorage`, with a "Clear History" option
- **Copy result** — one-tap copy of the last answer
- **Key sounds** — synthesized in real time with the Web Audio API (toggleable, no audio files)
- **4 visual themes** — Classic Silver, Obsidian Stealth, Cyberpunk Neon, Vintage 80s
- **Keyboard shortcuts** — full desktop keyboard support (digits, operators, Enter/`=`, Backspace/Delete, Escape, arrow keys) — see the in-app Shortcuts modal
- **Responsive layout** — works on both desktop and mobile screens

## Getting Started

No build tools required — it's a static site.

```bash
git clone <your-repo-url>
cd fx991es-calculator
```

Then just open `index.html` in a browser, or serve it locally:

```bash
python3 -m http.server 8000
# visit http://localhost:8000
```

## Project Structure

```
SYNORA COKE/
├── index.html   # Markup — calculator chassis, keypad, history drawer, shortcuts modal
├── style.css    # All visual styling, including the 4 themes
└── script.js    # Calculator engine — parsing, evaluation, state, UI wiring
```

## Keyboard Shortcuts

| Key(s) | Action |
|---|---|
| `0`–`9` | Input digits |
| `+` `-` `*` `/` | Arithmetic operations |
| `^` | Power exponent (xʸ) |
| `(` `)` | Parentheses |
| `Enter` / `=` | Calculate result |
| `Backspace` | Delete previous token |
| `Delete` | Delete forward |
| `Escape` | All Clear (AC) |
| `▲` `▼` | Browse calculation history |
| `◀` `▶` | Move cursor |

## Tech Notes

- Expression evaluation is handled by a hand-written tokenizer/parser in `script.js` (no `eval()`).
- History and theme/sound preferences persist across sessions via `localStorage`.
- Key click sounds are generated on the fly with the Web Audio API — nothing to download.

## Disclaimer

This is a fan-made, unofficial tribute UI inspired by the CASIO fx-991ES PLUS.
```
