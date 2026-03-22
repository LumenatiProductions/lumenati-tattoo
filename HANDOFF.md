# Lumenati Tattoo — Y2K Redesign Handoff

## What's Live
- **Homepage**: Hero (VHS camcorder, bubbly pink logo, visitor counter, stickers, marquee), Artists (Win98 windows, now-playing marquees, lightbox gallery, room links), Kool Aid (poster section), Footer (AIM away message on XP desktop)
- **Contact/Booking pages**: XP desktop with info windows and map
- **JD Pruitt's room**: Full bedroom — draggable windows/posters/stickers, skate game with SFX, skate video popup, polaroids, portfolio lightbox, wall posters with tape
- **5 other artist rooms**: Bedroom pages with under construction overlay (Elaine, ShorTy, Kalypso, Sam, Moonie)
- **404 page**: Blue Screen of Death with tattoo-themed errors
- **Code Injection Footer**: Winamp (7-track shuffle, per-room start), Clippy, AOL dial-up loading screen, AIM door sounds, VHS page transitions, Konami code ($50 discount), audio unlock for mobile

## What Needs Work

### Artist Bedrooms (Priority)
Each room needs the same treatment as JD's:
- Draggable windows, posters, stickers, polaroids
- Portfolio lightbox
- Personal posters on the wall (need images from Scott)
- Polaroids with personal photos (need images)
- Unique desktop icons
- Boot sequence overlay (built but not integrated — boot-sequence.html)
- Save desk positions (built but not integrated — save-desk-positions.html)
- Remove under construction overlay when done

**Artist details that need updating:**
- **Electric Elaine** (gold #FFD700): No Doubt — Just a Girl. Need personal photos, poster images, bio details
- **ShorTy** (lime #7FFF00): A Day to Remember — You Should Have Killed Me. Need personal photos, poster images, bio details
- **King Kalypso** (blue #1493FF): Outkast — Ms. Jackson. Need personal photos, poster images, bio details
- **Sam Durbin-Clark** (purple #9b59b6): Blink-182 — Mutt. Need personal photos, poster images, bio details
- **Moonie B. Jones** (coral #FF6347): Marilyn Manson — The Dope Show. Need personal photos, poster images, bio details

### Built But Not Yet Integrated
- `boot-sequence.html` — DOS loading screen for bedrooms. Add to each artist page, set data-artist attribute
- `save-desk-positions.html` — localStorage persistence for dragged items. Add after drag script on each artist page
- `buddy-list.html` — AIM buddy list sidebar for homepage. Paste into Code Injection Footer or homepage code block
- `flash-wall-y2k.html` — Flash sheet corkboard page. Needs real flash images from Scott. Create /flash-wall page
- `cd-collection.html` — Jewel case component. Needs real album art. Drop into artist bedrooms as a window
- `wallpaper-picker.html` — Desktop color picker for bedrooms. Drop into artist pages
- `custom-cursor.css` — Needs redesign, current cursor doesn't look like a tattoo needle

### Known Issues
- Hero stickers could be bigger on desktop
- Footer AIM links needed !important to override Squarespace global CSS
- Some mobile overflow issues on artist pages (mostly fixed with overflow:hidden and max-width:100vw)
- Visitor counter uses localStorage (not real cross-visitor tracking)
- Cursor sparkle may not work in Squarespace (browser.js loading issue)
- Game speed is fixed at 4 — DO NOT add speed increases, Scott hates that

### File Structure
```
lumenati-tattoo/
├── hero-y2k.html              # Homepage hero block
├── artists-y2k.html           # Homepage artists block (with lightbox + now-playing)
├── kool-aid-y2k.html          # Homepage kool aid block
├── footer-y2k.html            # Homepage footer block (AIM on XP desktop)
├── contact-y2k.html           # Contact/booking page
├── 404-bsod.html              # 404 error page
├── custom-css-y2k.css         # Global custom CSS
├── code-injection-footer.html # Everything in Code Injection Footer
│
├── artist-page-y2k.html       # JD Pruitt bedroom (TEMPLATE for others)
├── artist-elaine-y2k.html     # Electric Elaine (under construction)
├── artist-shorty-y2k.html     # ShorTy (under construction)
├── artist-kalypso-y2k.html    # King Kalypso (under construction)
├── artist-sam-y2k.html        # Sam Durbin-Clark (under construction)
├── artist-moonie-y2k.html     # Moonie B. Jones (under construction)
├── construction-overlay.html  # Under construction banner (prepended to above)
│
├── boot-sequence.html         # DOS boot overlay (not yet integrated)
├── save-desk-positions.html   # localStorage desk save (not yet integrated)
├── buddy-list.html            # AIM buddy list widget (not yet integrated)
├── flash-wall-y2k.html        # Flash sheet corkboard page (needs images)
├── cd-collection.html         # CD jewel case component (needs album art)
├── wallpaper-picker.html      # Desktop color picker (not yet integrated)
├── custom-cursor.css          # Custom cursor (needs redesign)
├── konami-easter-egg.html     # Konami code sticker rain + $50 discount
├── vhs-transition.html        # VHS static page transitions
├── aim-door-sounds.html       # AIM sounds on artist card expand/collapse
├── clippy-y2k.html            # Clippy easter egg
├── aol-dialup-overlay.html    # AOL loading screen
├── winamp-player.html         # Winamp player (standalone, now in footer bundle)
├── context-menu-y2k.html      # Right-click menu (not used, Scott didn't want it)
├── skate-game-snippet.html    # Skate game (integrated into JD's page)
├── stickers.txt               # All sticker image URLs
│
├── hero.html                  # Original Squarespace blocks (pre-Y2K)
├── artists.html               #
├── kool-aid.html              #
├── custom-css.css             #
│
├── kids-arent-alright.m4a     # Audio files
├── goldfinger-superman.m4a    #
├── no-doubt-just-a-girl.m4a   #
├── shorty-track.m4a           #
├── outkast-ms-jackson.m4a     #
├── blink182-mutt.m4a          #
├── manson-dope-show.m4a       #
├── aol-dialup.mp3             #
├── aol-welcome.mp3            #
├── aim-open.mp3               #
├── aim-close.mp3              #
│
└── preview-*.html             # Local preview files (not for production)
```

### Squarespace Page Structure
- `/` — Homepage (hero, artists, kool aid, footer blocks)
- `/book` — Booking page (contact-y2k.html)
- `/contact` — Contact page (contact-y2k.html, same block)
- `/jd-pruitt` — JD's bedroom
- `/electric-elaine` — Elaine's bedroom (under construction)
- `/shorty` — ShorTy's bedroom (under construction)
- `/king-kalypso` — Kalypso's bedroom (under construction)
- `/sam-durbin-clark` — Sam's bedroom (under construction)
- `/moonie-b-jones` — Moonie's bedroom (under construction)
- 404 page set to BSOD

### How to Add a Song to the Playlist
1. Get the M4A/MP3 file
2. Copy to lumenati-tattoo/ folder
3. `git add [file] && git commit && git push`
4. Add entry to playlist array in code-injection-footer.html
5. Update pageTrackMap if it's an artist's primary song
6. Replace Code Injection Footer in Squarespace

### Color Reference
- JD Pruitt: #FF1493 (hot pink)
- Electric Elaine: #FFD700 (gold)
- ShorTy: #7FFF00 (lime green)
- King Kalypso: #1493FF (electric blue)
- Sam Durbin-Clark: #9b59b6 (purple)
- Moonie B. Jones: #FF6347 (coral)

### Song Assignments
- JD: Goldfinger — Superman (index 1)
- Elaine: No Doubt — Just a Girl (index 2)
- ShorTy: A Day to Remember — You Should Have Killed Me When You Had the Chance (index 3)
- Kalypso: Outkast — Ms. Jackson (index 4)
- Sam: Blink-182 — Mutt (index 5)
- Moonie: Marilyn Manson — The Dope Show (index 6)
- Global: The Offspring — The Kids Aren't Alright (index 0)

### Scott's Preferences
- NO EMOJIS in the code — use text smileys :) and // separators
- Stickers should be BIG (150-200px on desktop)
- Game speed must be CONSTANT — never increase
- Don't go on research tangents
- Be concise, don't overthink
- When Scott says a specific thing, use his exact words
