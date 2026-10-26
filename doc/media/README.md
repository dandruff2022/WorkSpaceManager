# README media

GIFs shown in the top-level README. Record with macOS ⌘⇧5 ("Record Selected Portion"), then convert:

```bash
ffmpeg -i input.mov -vf "fps=12,scale=900:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse" -loop 0 out.gif
```

Keep each GIF under ~5 MB (shorter clip or smaller `scale` if needed).

- `prompt-popup.gif` — on ChatGPT: type `;;`, pick `@shorten` from the menu, prompt text appears in the box.
- `send.gif` — manager window next to two chat tabs: type a question, Send, statuses go Working… → Done.
