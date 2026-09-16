# Question only - do not perform any UI action, do not touch the browser

Context: earlier today you tried to fill a YouTube Studio upload dialog in the user's open Brave window using
Computer Use. That takes over the screen and mouse while the user is working, so it was stopped. The user
wants the task done in the BACKGROUND, without stealing the foreground or the pointer.

Answer precisely, from your actual tool inventory in this session (list the tools you have that touch a
browser or the screen):

1. Do you have a browser tool (e.g. browser_use / browser_use_external / CDP access) that can drive a page
   through the DOM or DevTools protocol instead of screenshots + mouse? If yes, name it and say what it needs:
   does it attach to the user's EXISTING Brave session (which tab? via a remote-debugging port? which port /
   env var / config key?), or does it launch its own browser instance (which would not be signed in to the
   user's YouTube account)?
2. If it attaches to an existing browser, what exact command-line flag or config must Brave be started with,
   and can it target a specific tab by URL without bringing that window to the front?
3. If it can only launch its own browser, can it reuse the user's Brave profile directory so the YouTube
   session is signed in, and would that be safe while the user's Brave is running?
4. Given the answer, what is the least-intrusive route you recommend to finish that upload dialog without
   touching the user's mouse or foreground window? One recommendation.

Be concrete and honest; if a capability needs a Brave restart, say so. Write nothing to disk. Reply in
under 250 words.
