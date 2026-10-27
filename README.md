# Workspace Manager

A Chrome extension for people who use several AI chat sites at once (ChatGPT, Gemini, Claude, Copilot).

- **Saved prompts on any chat site.** Type `;;` in the message box and pick one of your saved prompts.
- **Ask several AIs at once.** Write a prompt once and send it to every chat tab you choose.
- **See who is done.** A live list shows each tab as *Empty*, *Working…* or *Done*, and you get a notification when
  an answer is ready.

No API keys, no accounts. The extension works with the chat pages you already have open, by typing and clicking for
you just like you would.

<!-- Media: record and save as doc/media/prompt-popup.gif and doc/media/send.gif (see doc/media/README.md) -->
| Saved prompts with `;;` | Send to several AIs |
|---|---|
| ![Prompt pop-up on a chat site](doc/media/prompt-popup.gif) | ![Sending one prompt to ChatGPT and Gemini](doc/media/send.gif) |

## Install

The extension is not in the Chrome Web Store yet. To install it:

1. Download `workspace-manager-v0.6.0.zip` from the [latest release](https://github.com/dandruff2022/WorkSpaceManager/releases/latest)
   and unzip it (or clone this repository).
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the unzipped folder (the one that contains `manifest.json`).
4. Click the puzzle icon in the toolbar and pin **Workspace Manager**.
5. Reload any chat tabs that were already open.

## How to use

**Saved prompts.** On ChatGPT or Gemini, type `;;` in the message box. A small menu shows your saved prompts; use the
arrow keys and Enter (or click) to insert one. Edit, add or delete prompts on the **Prompts** page. Built-in prompts:

| Prompt | What it does |
|---|---|
| `@redo` | Try the last request again, more carefully |
| `@continue` | Go back to the earlier topic after a side question |
| `@shorten` | Shorten the last answer to a quick summary |
| `@check` | Ask the AI to check and correct its last answer |

**Projects (new in 0.7, trial).** A project keeps one piece of work on your side. Write what you want to get done
in one sentence, then follow the steps; the current one is highlighted:
**Plan** (the main AI splits the work into up to 2 tasks, or skip it and do the work in one chat), **Run tasks** (each
task can go to a different AI), **Combine** (the main AI merges the results into the final answer, in a chat you can
keep talking in) and **Continue** (a new chat on ChatGPT or Gemini that starts from the memory). Each step shows the
message before it is sent, so you can edit it. The project memory (goal, decisions, current state) is updated by
itself after Combine, as a chore in a temporary chat; open **Memory** to see what changed or undo it. Pick the AI for
chores in Settings. Chat tabs opened for a step close once the answer is saved; reopen them from **History**.

**Send to several AIs.** Click the toolbar icon to open the manager. The **Send** page lists your open chat tabs.
Tick the ones you want, type a prompt (`;;` works here too), and press **Send** or ⌘/Ctrl + Enter. Each tab's status
updates live; click a tab's name to jump to it.

**Settings.** Change the pop-up key, turn notifications off, or open the manager in Chrome's side panel instead of a
separate window.

## Supported sites

| Site | Status in v0.6.0 |
|---|---|
| ChatGPT (chatgpt.com) | Tested |
| Gemini (gemini.google.com) | Tested |
| Claude (claude.ai) | Should work, not re-tested for this release |
| Copilot (copilot.com) | Should work, not re-tested for this release |

## Limits

- Chat sites change their pages often. When they do, sending or status detection on that site can break until the
  extension's selectors are updated.
- To type into a tab, the extension briefly brings that tab to the front, then switches back.
- Status updates and notifications on the Send page only work while the manager is open (Projects steps run in the
  background).
- Projects: while a step runs, its chat tab is brought to the front for a moment to type, and Gemini tabs are briefly
  shown while it answers (Gemini does not draw answers in hidden tabs).
- Firefox support exists in the code but is not tested in this release.

## Roadmap

This is an early demo. Ideas being explored next:

- Compare the latest answers from several AIs side by side in the manager.
- Move a conversation to another AI with a short summary instead of copying the whole chat.
- Simple prompt chains: send A, wait until it is done, then send B.

Earlier designs (full conversation transfer, a multi-tab task-tree orchestrator) are on hold; see
[`doc/roadmap.md`](doc/roadmap.md). The project was planned and built with AI coding agents; the specification,
plans and engineering logs are in [`doc/`](doc/).

## Privacy

Everything stays in your browser. The extension stores your prompts and settings in Chrome's local extension
storage, does not collect data, and does not send anything anywhere except the prompts you choose to send to the chat
sites.
