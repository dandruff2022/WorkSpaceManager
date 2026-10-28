# README media

Recorded from the real extension with Claude in Chrome's GIF recorder. These demos use real ChatGPT/Gemini chats, not mock answers.

- `projects.gif` — create a Chicago student trip project, plan, run two tasks, combine and read the final answer.
- `picker.gif` — in an unsent ChatGPT temporary chat, open `;;`, switch from Prompts to Styles and apply Short. A send guard blocks conversation requests.
- `notes.gif` — write a messy psychology note, ask Tweak to tidy it into a checklist, review the diff and apply.

Capture an initial frame after starting, frames around each action and a final frame before stopping. Export with a meaningful filename and move it from `~/Downloads` here. Keep each GIF below 5 MB.

For a manager recording from `test/harness/panel.html`, crop the gray area to the 380px iframe. If needed, reduce frame rate or scale with ffmpeg:

```sh
ffmpeg -i input.gif -vf 'crop=380:ih:0:0,fps=6,split[a][b];[a]palettegen[p];[b][p]paletteuse' -loop 0 projects.gif
```

For a full-width chat recording, omit the crop and use `scale=900:-1:flags=lanczos` before the palette filters. Older `prompt-popup.gif` and `send.gif` are not used by the v0.7.0 README.

Recording note: the recorder retained action/wait frames, not every requested screenshot. Projects starts at Plan (creation was performed but not retained); Notes shows the running edit, diff and applied checklist, without the New/Done/Tweak-selection frames. No extra AI runs were made to replace missing frames. Manager captures use the 380px iframe at `test/harness/panel.html`, cropped from a 1440×678 capture; the picker uses a 520×698 chat viewport.
