# Nora — CMR Fork

My personal fork of [Nora](https://github.com/Sandakan/Nora).

It started as a one-line fix for a crash and grew from there. The fork is based on Nora `v3.1.0`, but by now it has a proper set of additions on top: a built-in tier-list maker, a smart shuffle that actually uses your rankings, portable listening stats with an activity calendar, ELO song duels, a Rediscover playlist for music you forgot you loved, and a handful of fixes I wanted out of the player.

---

## The crash that started this

If Nora ever died with "An error occurred" on a high-quality FLAC (or some MP3s), this was it:

![Chromium Demuxer Error](error_screenshot.png)

Nora reads album art out of the file's tags. Some files have an embedded picture with an **empty MIME type** usually from bad tag editors or weird encoders. When Chromium tries to demux a track whose cover has no MIME type, it throws `DEMUXER_ERROR_COULD_NOT_OPEN` and kills playback.

The fix: before playing, if a picture's MIME type is blank, set it to `image/jpeg` and write it back.

```typescript
// Fixes Chromium DEMUXER_ERROR_COULD_NOT_OPEN
if (file.tag?.pictures?.length > 0) {
  let needsSave = false;
  for (const pic of file.tag.pictures) {
    if (!pic.mimeType || pic.mimeType.trim() === '') {
      pic.mimeType = 'image/jpeg';
      needsSave = true;
    }
  }
  if (needsSave) file.save();
}
```

It runs in the song parser (`src/main/parseSong/`), so a file gets healed on first scan and the repair is saved to disk - fixed once, then fine.

Stock `v3.1.0` can't edit FLAC tags (it only reads them with `music-metadata` and edits MP3s with `node-id3`). I'd written this for the unreleased `v4` alpha, but that branch was too unstable to use, so I pulled `node-taglib-sharp` into `v3.1.0` by hand and backported the fix here.

---

## Tierlists

I used to rank my music in a separate web app and got tired of it living outside the player, so I built a tier-list maker into Nora, new tab next to Genres.

- The **image pool comes from your playlists, live**. Pick one or more playlists as the source; their tracks show up as cards, covers and all. Add a song to the playlist, it appears in the pool.
- **S / A / B / C / D / E / F** tiers in the original tiermaker colors. Rename / add / remove rows.
- Drag and drop, auto-scroll near the edges, right-click for play / song info / artist.
- Hover **play button** on cards to audition while ranking.
- Captions show **track** or **artist - track**.
- **Export to PNG.**
- Handles thousands of tracks fine - covers are cached thumbnails and off-screen cards aren't decoded.

Tier lists are stored in their own `tierlists.json`, separate from everything else, so updates won't touch your library or lose your rankings.

---

## Smart Shuffle (Tierlist Value Shuffle)

A second shuffle mode (the magic-wand button by the normal one) that weights the order toward music you actually rate:

- Higher-ranked tracks come up more (S over F).
- Artists get a boost from how high **and** how many of their tracks you've ranked - so a song that isn't in any tier list can still surface because it's by someone you clearly love.
- Listening counts nudge it a bit.
- Recently played tracks get pushed back, so it doesn't loop the same handful at you.

It's about **60% smart / 40% random** - leans, doesn't rig. Only tier lists you mark as "influencing" count, and it won't turn on if none are. Like the normal shuffle, it reorders your current queue and keeps the playing track, so you stay in the same context. The two shuffles are mutually exclusive.

---

## Volume that actually sounds smooth

The stock volume slider is **linear** - it just sets the audio gain to `value / 100`. Problem is, your ears aren't linear, they hear loudness on a logarithmic (decibel) scale. So on the old slider almost all the audible change was crammed into the bottom, and the top half sounded basically the same. It felt like the volume jumped in chunks instead of gliding.

Now it uses a proper **perceptual (dB) curve**, the same kind of taper the Windows volume mixer uses, so loudness rises evenly across the whole slider. The number is still 0-100; only how it maps to real gain changed (50% now sits around -16 dB instead of a flat half). The slider is also wider, so you can actually land on the value you want.

---

## Stats, finally

A new **Stats** tab with your listening numbers: total listens, full listens, skips, approximate listening time, switchable all-time / last-12-month / last-30-day views, a monthly or daily activity graph, top songs / artists / albums / genres, most skipped, and your ELO standings.

The tile row has a **listening calendar** too - a GitHub-style heatmap of your last 53 weeks (it took the place of the Favorites counter I never used), with your current and longest streaks and your most active day underneath. Dates follow the app language, and the heatmap always stays anchored to the current week.

It also does **portable stats** - and then some. One JSON file carries your listening history, ELO ratings, **playlists**, **tier lists** (rankings and shuffle influence included) and your **Smart Shuffle intensity**. Song ids and folder paths can be different between installs, so the importer recognizes tracks by metadata fingerprints (file name, title + artists, duration) and merges day by day, never by raw ids or timestamps.

There are two merge modes: **add the numbers together** for devices used separately, or **take the maximum** when the data originally came from the same library so nothing gets double-counted. A backup of your current stats files is written before every import, malformed exports are rejected before anything is changed, and importing the same additive export twice won't duplicate it.

Playlists merge by name (missing songs get added, nothing is replaced). Tier lists import whole - a tier list whose folder sources don't exist on the new machine gets an "Imported: ..." fallback playlist built from its ranked tracks, so the board renders right away. A same-named tier list is skipped rather than merged. The old app-data export in Settings is gone - this one file is the way to move your setup between machines.

## Rediscover

A third system playlist, next to History and Favorites - with its own icon and the same "it cannot be deleted or renamed" rules.

It collects tracks you clearly love - placed high in your tier lists, rated in ELO duels, or played through often - that you have not heard in a while (or never, in-app). It refreshes itself on every startup, and you can rebuild it by hand from the playlist page with a 30 / 60 / 90-day "forgotten" threshold. Every refresh fully regenerates it, so do not get attached to its contents - it is a rotating snapshot, not a collection.

Being derived data, it does not travel in the portable stats export - it is rebuilt from your own library wherever you are.

## ELO duels

The **Duel** button above Settings is always there when you want it: two eligible library songs side by side, pick the one you like more, and the next duel follows automatically. Standard ELO math - everyone starts at 1200, K=32. Early ratings are confidence-adjusted until a song has five results, so a single lucky win does not distort Smart Shuffle or Rediscover. Cards have hover preview buttons that play a snippet without touching your queue or the main player.

Nora can also build up a small duel backlog as you listen. Only full 90%+ listens count; after 2 / 5 / 10 full listens (frequent / normal / rare), the most useful recent track becomes an anchor ticket. Its opponent is generated only when the duel opens, using current ELO confidence, recent match history, playlist / tier-list / genre context, and skip feedback. The persistent queue is capped at 30 unique anchors. The duel window can be minimized without losing the current comparison or the rest of the batch.

If a comparison is not a clean win, use **Too close**, **Too different**, or **Can't decide**. Too close records an ELO draw; the other two leave ratings unchanged. Each reason gives that pair an appropriate cooldown, and Too different also teaches Smart Shuffle not to place those tracks next to each other.

Your top-rated songs and recent duels live on the Stats tab from the very first result. And once you've done ten or so duels, the Smart Shuffle starts using your ratings as a fourth signal - songs that have never dueled stay neutral, so not playing along never hurts a track.

## SongGuessr

I put **SongGuessr** above **Duel** so I can press it and get a track from my own library. It starts with the first 0.1 seconds and an autocomplete over the library. A wrong guess or a skip costs one of six attempts and unlocks a longer snippet - 0.1 / 0.5 / 1 / 3 / 6 / 12 seconds, always from the start. Guess the right track and the round is yours; use all six attempts and the answer is revealed either way with its cover art. I can copy a spoiler-free emoji result or play the track in Nora.

Plenty of my files open with a few seconds of nothing - room tone, tape hiss, a slow fade-in - and on a 0.1 second snippet that is the whole clue wasted. So the snippet starts where the music does. The track is measured against its own loudness rather than a fixed threshold, which is what catches the quiet-but-not-empty openings, and a lone click or crackle at 0:00 is not mistaken for the song starting.

I can choose the whole library, a playlist, or a genre as the pool. Pools need at least 10 eligible songs, and tracks shorter than 15 seconds never appear. It keeps games played, win rate, current and best streak, plus a distribution of how many attempts my wins took. Recently used answers are avoided when there are enough alternatives, so rounds do not repeat quite so often.

It is a local game over my own files - no daily puzzle, no server, and nothing leaves the machine.

## Search

Search is one thing now, and it finds tracks. Type a title, an artist, or both in whichever order they come to mind - "halo beyonce" and "beyonce halo" both land on the same song. Mistype it and it still works: a wrong letter, a missing one, or two letters swapped ("niravna") are all forgiven. Everything is ranked in a single pass, so an exact hit sits above a title that merely starts with your words, which sits above the ones where all your words appear somewhere. Among equally good matches, the tracks you actually play come first.

The part I built it for is text nobody can type as written. Names full of stylised glyphs get folded back to letters: "hiraeth" finds `hiræth`, "oneheart" finds `Øneheart`, "aster" finds `ΔS†ΞЯ`, and "little dark age" finds it even when the tags spell it `𝓛𝓲𝓽𝓽𝓵𝓮 𝓓𝓪𝓻𝓴 𝓐𝓰𝓮`. Anything in another script is also searchable by how it sounds - "hikari" finds `ひかり`, "ellada" finds `Ελλάδα`, "tupaya diana" finds `тупая диана` - across every script Unicode knows, with kana, hangul and pinyin handled by dedicated readers. A digit standing in for a word is spelled out both ways, so "1heart" finds `Øneheart`. And if you started typing before switching layouts, "negfz Lbfyf" still finds `тупая диана`.

None of that turns the results into a pile, because none of it is free. Every one of those readings costs the match a little rank, so a plain hit always wins. Guesswork is a fallback rather than an addition: if anything matched cleanly, the typo and letters-in-order results are dropped entirely instead of padding the list. Digits are never read as letters, so `1979` and `24K Magic` stay numbers. Short words get no typo budget at all, because one edit away from "car" is "cat", a different word rather than a mistake.

What this replaced: a **predictive search** toggle, and behind it an edit distance measured across whole titles - which is how "aster" came back with `wasted` and `aether`. Worse, the three strategies in there were mutually exclusive: predictive answered first, and if it found anything at all the better matching never ran. So the toggle really chose between two bad searches. It is gone, along with its setting, and the same engine now powers the SongGuessr guess box.

## Sticky selection

Multi-select no longer evaporates when you switch tabs or finish an action. Select songs, wander around the app, then do the thing. It clears with **Esc**, the **Unselect** button in the top bar, or actions that actually remove the selected items - and it never mixes songs with playlists.

---

## Credits

Built on [Nora](https://github.com/Sandakan/Nora) by [Sandakan](https://github.com/Sandakan).

Built for my own daily use. Auto-updates pull from this fork's own GitHub releases, not upstream, so they only ever ship my changes.
