# next-steps

After each turn, three kinds of buttons show above the input box:

- **Suggestions** (`1`-`3`): up to three short next prompts that a fork of the session guesses.
- **Templates** (from `4`): your own messages with a blank, `[目标]`, that the same fork fills from the conversation.
- **Phrases** (after the templates): your own fixed messages.

```
next:  1: run the tests you just wrote  2: do the same for the settings page
3: /code-review high  0: dismiss
4: 问题在哪  5: 提交合并  6: 做完发版  7: 全部推送
```

## Pressing

Press a button's digit from an empty prompt box, or click it.

- **A suggestion or a template** is written into the box as a draft. Edit it, then press Enter yourself. A template's `[目标]` is filled with the guessed goal; with no goal guessed yet, the blank is left in for you to fill.
- **A phrase** is sent at once as your own message. A phrase that starts with `/` runs that slash command instead.
- **`0`** dismisses the band.

Digits run from `4` to `9` across templates and then phrases, in the order you list them. Buttons past `9` have no digit. A digit typed alone into an empty prompt presses its button, so typing `5` alone sends the fifth button's phrase.

From the keyboard, `ctrl+x tab` also moves focus into the band; the arrow keys pick a button and Enter presses it.

## When it shows

Like the original next-steps, the band is hidden until a turn ends. It hides again when the next turn starts, on `0`, and on any press. After an answer too short to guess from, or when the fork guesses nothing, only the templates and phrases show.

The template button shows the guessed goal, as `继续推进：<goal>`. When a later fork finds no goal, the old one is cleared rather than kept, so a goal from an earlier topic is never used.

## Layout

Each kind runs left to right and wraps at the band's width, suggestions on top and phrases nearest the prompt. Wide characters count as two cells.

When the band is short of rows, suggestions give way first, from the last one up, leaving `0: dismiss`. With no room for one suggestion, none are drawn, and the top one is still offered as ghost text. Templates give way next, and phrases last. The band never draws more rows than it has, because a band that scrolls stops answering digit hotkeys.

## How it works

It is a function-hooks plugin (`hooks/register.tsx`):

- `turn.complete`: forks the session with `$.model.fork` to ask for likely next prompts and, when there are templates, the phrase that fills their `[目标]`. The fork shares the session's prompt cache, so it costs about one short reply.
- `$.command.list`: the session's skills and slash commands (plugin, user and MCP ones with their descriptions) go into the fork's question, so a suggestion can be `/skill arguments`. A suggestion that names a command the session does not have is dropped.
- `ui.render` on `AbovePrompt`: draws the suggestions, templates and phrases as rows of buttons.
- A suggestion or template press calls `$.prompt.fill`; the top suggestion goes to `$.prompt.suggest`.
- A phrase press calls `$.prompt.submit` with `asUser`, so the model reads the text as yours. The transcript still marks it as sent from the plugin. A `/` phrase calls `$.command.run`.
- `turn.start`: hides the band.

The band draws in the terminal and in the desktop app.

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `minAnswerChars` | `80` | Skip suggestions after answers shorter than this |
| `suggestSkills` | `true` | Tell the suggester which skills and slash commands the session has |
| `templates` | none | The template buttons, one entry each, as `label\|text` with `[目标]` in the text |
| `phrases` | `问题在哪`, `提交合并`, `做完发版`, and `全部推送`, a long instruction | The fixed buttons, one entry each, as `label\|text` or the text alone |

`templates` and `phrases` are lists, so `/config` does not show them. Set them in `settings.json` under `pluginConfigs`, or with `claude plugin configure`.

## Install

This version lives on the `main` branch of the fork `xuxu777xu/claude-plugins-community`, whose marketplace is named `xuxu-community`:

```bash
claude plugin marketplace add xuxu777xu/claude-plugins-community --sparse .claude-plugin next-steps
claude plugin install next-steps@xuxu-community
claude plugin disable next-steps@claude-community
```

`--sparse` checks out only the marketplace file and this plugin. The last line turns off the upstream next-steps, if it is installed, so the suggestions do not draw twice. Run `/reload-plugins` in an open session to load the change.

To take a later push, raise `version` in `.claude-plugin/plugin.json` first, then run:

```bash
claude plugin marketplace update xuxu-community
claude plugin update next-steps@xuxu-community
```

To try local edits without pushing, run `claude --plugin-dir ./next-steps`.

## Tests

```bash
claude plugin test ./next-steps
```
