# Changelog

All notable changes, newest first. Versions follow [semantic versioning](docs/development.md#versioning); each release is tagged `vX.Y.Z` on `main`.

## v1.47.1 — 2026-10-03

### Fixed
- *Settings → Calendar & Home Assistant → MQTT broker*: ticking *Send to Home Assistant over MQTT* (or changing any field) no longer gets undone after a few seconds before you click *Save*; the page now only refreshes the connection status, not the form.

### Changed
- The broker status says *Connected — but nobody sends yet* until someone ticks *Send my notifications and task numbers to Home Assistant*, so it's clear why nothing shows up in Home Assistant yet.

## v1.47.0 — 2026-10-03

### Added
- **Home Assistant** (*Settings → Calendar & Home Assistant*, guide in [docs/home-assistant.md](docs/home-assistant.md)), two ways, usable together:
  - **Let Home Assistant fetch**: `GET /api/v1/summary/` (with an API token) gives unread notifications, overdue / due today / due soon with the tasks, and open tasks assigned to you — optionally for one workspace. Settings shows the ready-made REST sensor YAML for your server.
  - **Push over MQTT** (switch on/off in Settings): an admin enters the broker (e.g. the Mosquitto add-on); each user opts in, optionally for one workspace. Sensors and a notification event entity appear by themselves (MQTT Discovery) as the device *Project Manager (you)*; events for *assigned*, *mentioned*, *comment*, *ready to start*, and a daily deadline reminder at a set time. Test connection, connection status, the server's clock shown for the reminder; the broker password isn't shown again.
- Example automations: push to your phone, morning reminder, a lamp for overdue tasks, a dashboard card.

### Changed
- **Settings has a page per topic** instead of one long page: *Account*, *Workspaces*, *Labels & templates*, *Calendar & Home Assistant*, *Windows and Linux app*, *Backup & export*, *Updates & users*, *About* — a menu on the left, tabs to scroll on phones. Each page has its own address (`/settings/account`, …); `/settings` opens *Account* (in the Windows/Linux app: the app's own page).

### Under the hood
- `app/summary.py`, `app/mqtt.py` (background bridge, reconnects by itself; idle when off), routers `summary`, `homeassistant`; migration `0023`: `users.mqtt_enabled`, `users.mqtt_workspace_id`; new dependency `paho-mqtt`.
- 6 new backend tests (MQTT with a fake broker client; also checked once against a real broker), 2 new frontend tests, 2 new browser tests.

## v1.46.0 — 2026-10-02

### Added
- **Quick entry understands repeats and start dates**: *every monday*, *every mon and thu*, *every workday*, *daily*, *weekly*, *every 2 weeks* (German *jeden Montag*, *montags*, *werktags*, *alle 2 Wochen* …) set the repeat rule — without a date, the first deadline is the next of those days; *from 5.10. to 9.10.*, *5.10.–9.10.*, *ab morgen* (German *von … bis …*) set the start. *Monthly report* stays a title; *Pay rent monthly* repeats.
- **Quick entry per line in "Several (one per line)"**: each line can set its own date, repeat, priority, labels and assignee; the preview shows what each line sets. A checkbox switches it off.
- **Notifications across workspaces**: while one workspace is shown, the bell marks what's elsewhere (*in Work*), sums it up at the top (*3 new in Work*), and opening such an item switches to its workspace first.
- API: `POST /tasks/bulk` items take their own `priority`, `deadline`, `start_date`, `assignee_id`, `label_ids` and repeat rule; everyone assigned is notified once.

### Changed
- Quick-entry chips show the year for dates that aren't in this year (*5.10.* after October 5th is next year's).

### Under the hood
- 2 new backend tests, 4 new frontend tests (incl. offline bulk in the app), 2 new browser tests.

## v1.45.0 — 2026-10-02

### Added
- **Quick entry**: a new task's title can set its details — *"Call supplier tomorrow !high #hardware @anna"* gives the deadline, priority, label and assignee; English and German (*morgen*, *Freitag*, *in 3 Tagen*, *5.10.*, *!hoch* …). Chips under the title show what was recognized; × keeps a word as plain text.
- **Two-factor login** (*Settings → Two-factor login*): a code from an authenticator app after the password, set up with a QR code; 10 one-time recovery codes; turning it off needs the password; admins can switch it off for someone who lost their phone (*User Management → Turn off 2FA*). The login page and the Windows/Linux app's *Connect* ask for the code. API tokens, connected apps and the calendar feed keep working.
- **Repeated wrong passwords are slowed down**: after 5 failed logins for an account from one address within 15 minutes (20 for any accounts), logins from there wait the 15 minutes out (`429`); logging in elsewhere still works.
- **Calendar feed per workspace**: *Settings → Calendar feed → Workspace* gives a link with just that workspace's tasks (`&workspace=<id>`).

### Changed
- The login page's fields are labelled for screen readers.

### Under the hood
- Migration `0022`: `login_failures`, `users.totp_*`; `app/two_factor.py` (TOTP per RFC 6238, tested against its test vectors), new dependency `segno` (QR codes, pure Python); `frontend/src/quickEntry.js` (tested).
- 7 new backend tests, 7 new frontend tests, 3 new browser tests.

## v1.44.0 — 2026-10-02

### Added
- **Workspaces**: keep work and private (or any other areas) apart. A switch in the top bar shows one workspace at a time — My day, the Tasks page with all views, search and filters, the Projects page, the weekly review and the project choices follow it — or **All workspaces**.
  - Set them up under **Settings → Workspaces**: your own names and colors, reorder, delete (projects stay).
  - Sort all projects in one place under *Settings → Workspaces → Your projects* (a workspace choice next to each, *only those in no workspace* to find the rest), or in the project form; new projects go into the workspace being shown, and under *All workspaces* the Projects page shows each project's workspace.
  - **Projects in no workspace**: shown in every workspace or only under *All workspaces* — your choice in Settings.
  - Personal: everyone files projects into their own workspaces; the one shown is remembered per device. **W** switches to the next one.
- API: `/api/v1/workspaces/…`.

### Changed
- On phones the top bar shows just the app icon instead of its name once you have workspaces, to make room for the switch.

### Under the hood
- Migration `0021`: `workspaces`, `project_workspaces`, `users.workspace_unassigned_everywhere`; `frontend/src/workspaces.js` (tested), `context/WorkspaceContext.js`.
- 4 new backend tests, 4 new frontend tests, 1 new browser test.

## v1.43.4 — 2026-09-29

### Added
- **Easy to find app downloads**: the release GitHub shows as *Latest* now always carries the Windows and Linux app (fixed file names like `ProjectManager-Windows-x64-setup.exe`) with a download table, and the links `…/releases/latest/download/…` always get the newest version.
- **Settings → Windows and Linux app** in the web app: the download links, with the one for your computer marked.
- README: a *Download the app* section right at the top.

### Under the hood
- `scripts/attach-apps.sh`, run by the new workflow `release-apps.yml` on every server release and by `desktop.yml` on every app release.

## v1.43.3 — 2026-09-29

### Added
- **Linux app** ([desktop v0.7.0](desktop/CHANGELOG.md)): the offline app now also runs on Linux, for **x86_64 and ARM64** (e.g. Raspberry Pi 4/5), as an **AppImage** (updates itself) or a **.deb** package. Install instructions per system in [desktop/README.md](desktop/README.md#installing).

### Changed
- *Settings* shows *Linux app* instead of *Windows app* in the Linux app; its API token is named *Linux app (date)*. The web app is unchanged.
- [DEPLOYMENT.md](DEPLOYMENT.md#trusting-the-certificate-on-your-devices-once-per-device): how to trust the server's certificate on Linux.

### Under the hood
- Workflow *Desktop apps* (was *Windows app*): frontend built once, then Windows plus Linux x86_64/ARM64 builds with a start check; one release with all five files and an update feed for three platforms.

## v1.43.2 — 2026-09-29

### Fixed
- **The Tasks page no longer jumps to the top** after you create, edit or move a task (also several subtasks in a row, bulk entry, templates, reordering, moving to another project, ticking off a repeating task, the board). The list used to show "Loading tasks…" for a moment after every change, which reset the scroll position; now it refreshes in the background and you stay where you are.

## v1.43.1 — 2026-09-29

### Changed
- **New tasks open where you add them**: the **+** on a project or category header now opens the form right under that header (and scrolls it into view) instead of jumping to the top of the page. The task is created in that project or category. *+ New Task* at the top and the **n** key still open it at the top; Edit and Add subtask already open below their task.

## v1.43.0 — 2026-09-29

### Added
- **Timeline view (Gantt chart)**: a fourth view next to List, Board and Calendar.
  - Each task with dates is a **bar from its start to its deadline**, or a **◆ on the deadline** when it has no start; grouped by project, subtasks indented under their parent.
  - **Arrows** show what a task waits for; an arrow drawn backwards in red dashes means the order doesn't fit the dates.
  - Late tasks are outlined in red, done ones faded, weekends shaded, today a red line; zoom *Days / Weeks / Months*, *Today* scrolls back.
  - **Drag a bar** to move a task (start and deadline together), **drag its ends** to change just the start or the deadline, with **Undo**; click to open it in the list.
  - Task names stay in view while scrolling sideways, the dates while scrolling down; works on phones (horizontal scrolling).
- **Start date** for tasks (optional), next to the deadline in the form; the list, the share page and the calendar feed show the range (*Oct 5 – Oct 9*). It can't be after the deadline; repeating tasks move it along; it's in the history, the CSV export (*Start*) and export/import.

### Changed
- The view buttons are a bit tighter on phones so all four fit on one line.

### Fixed
- Repeating tasks now carry their subtasks' time estimates over to the next occurrence.

### Under the hood
- Migration `0020`: `tasks.start_date`; `frontend/src/timeline.js` (tested), `components/TaskTimeline.js`.
- 3 new backend tests, 4 new frontend tests, 1 new browser test.

## v1.42.2 — 2026-09-29

### Changed
- **Tasks in a category are indented** under the category's header (like a project's own tasks under the project), so it's clear at a glance which category a task belongs to. Also on phones (a smaller step) and on the shared project page.

## v1.42.1 — 2026-09-28

### Changed
- **Categories stand out more** on the Tasks page: each category header is a light band in its project's color with a colored bar on the left, and the name is larger and bold (14px capitals — between a task title and the project name, never larger than the project). Categories on the Projects page and the shared page use the same, larger name.

## v1.42.0 — 2026-09-28

### Added
- **@mentions in comments**: type `@` and a few letters and a list suggests people (↑/↓, Enter or Tab to pick). The person gets **"… mentioned you"** in the bell and under *Recent comments* on My day — even if the task isn't theirs, as long as they can see it. Editing a comment only notifies people newly mentioned; someone who'd get a normal comment notification gets just the mention. Mentions are highlighted in comments.
- **Pinned tasks** at the top of **My day**: pin a task with the pin on its My day row, *Pin to My day* in its ⋯ menu, or **p** on the keyboard. Pins are per user; pinned tasks show a pin in the list. When pinned tasks are done, *Unpin them* clears them.

### Under the hood
- Migration `0019`: table `task_pins`; `routers/pins.py` (`/api/v1/pins/`); `notify.commented` handles mentions; `components/MentionTextarea.js`, `usePins.js`.
- 5 new backend tests, 1 new frontend test, 2 new browser tests.

## v1.41.0 — 2026-09-28

### Added
- **Formatting in descriptions and comments** (a Markdown subset): `**bold**`, `*italic*`, `~~struck~~`, `` `code` ``, lists, checklists (`- [x]`), headings, quotes and code blocks. **Links are clickable** — `[text](https://…)` or a pasted `https://…`; only web and mail links, anything else stays text. Line breaks stay as typed, search still highlights matches, and the form says what works. In the Windows app, links open in the browser.
- **Archive finished projects**: the box button on a project (Projects page). Archived projects leave the Tasks page, all project choices, My day, deadline reminders, the review's open work and the calendar feed — but search still finds their tasks, the *Project* filter lists them under *Archived*, and **Restore** at the bottom of the Projects page brings one back.
- **Share a project read-only**: the link button on a project creates a link (`/share/…`) that shows its categories, tasks and subtasks — titles, descriptions, status, priorities, deadlines, estimates, labels, progress — to anyone, **without an account**, and without changing anything. Comments, history and names stay private. **Stop sharing** makes the link dead.

### Under the hood
- Migration `0018`: `projects.archived_at`, `projects.share_token`; `routers/shared.py` (`GET /api/v1/share/{token}`, no login), `POST/DELETE /api/v1/projects/{id}/share`; `frontend/src/markdown.js` (renders to React elements, no HTML), `components/Markdown.js`, `SharedProject.js`, `ProjectShare.js`.
- Windows app: Tauri's opener plugin for links.
- 4 new backend tests, 6 new frontend tests, 3 new browser tests.

## v1.40.0 — 2026-09-28

### Added
- **Windows app: warning when app and server don't match.** The app knows which server version its interface was built from and compares it with the server while syncing:
  - the server has features the app doesn't show yet, and there's no app update to bring them: **⚠ App older than the server** in the top bar (if an app update is out, the **⬆ Update** pill covers it);
  - the app is newer than the server: **⚠ Server older than the app** — some features won't work until the server is updated;
  - *Settings → Windows app* shows the server's version, the app's interface version and what to do. Only feature releases count (1.40 → 1.41), not fix or docs releases.
- **Web app: reload after a server update.** A tab left open while the server was updated shows *Project Manager was updated to version … · Reload*, instead of silently running the old interface.

### Changed
- The Windows app's **⬆ Update** pill is now white with blue text, readable on the blue bar.

### Under the hood
- `npm run build` stamps the version into the interface (`frontend/.env.production`, `src/version.js`); the Windows app's sync looks up `/api/v1/health` at most every 10 minutes.

## v1.39.3 — 2026-09-28

### Documentation
- **New [user guide](docs/user-guide.md)**: using the app page by page — My day, adding and editing tasks, subtasks, priorities, estimates, labels, dependencies, repeating tasks, Undo, the list/board/calendar, search and saved filters, changing several tasks at once, templates, keyboard shortcuts, comments and history, projects and private projects, notifications, the weekly review, the calendar feed, settings, phones and admin tasks — with screenshots.
- **Shorter README**: an overview with highlights, screenshots, the install commands and a table of all documentation.
- **[docs/development.md](docs/development.md)**: setup, tests (backend, frontend, browser), translations, CI, architecture, branches and versioning, moved out of the README.
- On GitHub: repository description, topics, and badges for the latest release, the Windows app and the license; the unused wiki is switched off.

## v1.39.2 — 2026-09-28

### Fixed
- **Task descriptions line up with the title**: the text under a task now starts below the first letter of its title, whatever comes before it (drag handle, ▶ for subtasks, the selection box) — also for subtasks and on phones. Before, it started at a fixed distance and looked out of place.

## v1.39.1 — 2026-09-28

### Fixed
- **Shift+click in select mode** now picks the whole range between two tasks; it only picked the one clicked (unless they were next to each other).

### Under the hood
- **Browser tests** (`e2e/`, Playwright + Chromium): the real app with its production build — logging in, creating and editing tasks, estimates, Undo, keyboard shortcuts, search, saved filters, changing several tasks at once, templates, My day, the weekly review, German and the phone layout. They run in CI on every push (they found the Shift+click bug on their first run); screenshots of failures are kept.
- **The Tasks page split up**: `TaskList.js` went from about 1,450 to 700 lines. Its parts are in `components/tasklist/` — loading the data, the filter bar, the project/category groups, select mode, delete with Undo, saved filters, keyboard shortcuts and their help — and the logic without React in `taskOps.js` (subtrees, changes to several tasks, reordering) with its own tests. No change in behavior: the browser tests pass unchanged before and after.

## v1.39.0 — 2026-09-28

### Added
- **Change several tasks at once**: **☑ Select** next to *Assigned to me* on the Tasks page.
  - Click tasks to pick them (the checkbox becomes a selection box, the row turns blue); **Shift+click** picks a range, *Select all shown* picks everything in view, *Clear* and *Stop selecting* (or **Esc**) end it. With the keyboard: **Space** picks the task selected with j/k.
  - The bar above the list (it stays in view while scrolling) sets **status, priority, project/category, assignee, deadline** (or *No deadline*), adds or removes a **label**, or **deletes** the selected tasks — as soon as you pick a value.
  - Every change shows *Changed n tasks · Undo*; Undo puts back what **each** task had (e.g. their own earlier statuses). Deleting several works like deleting one: gone at once, *Undo* for a few seconds.
  - All or nothing: if one task can't take the change — say, an assignee who isn't a member of a private project — nothing changes and the reason is shown. Someone who gets several tasks assigned gets one notification.
  - Tasks that leave the view (e.g. marked done while showing only open ones) drop out of the selection; Undo brings them back selected.

### Under the hood
- `POST /api/v1/tasks/bulk-update` (per task its own fields, like `PUT /tasks/{id}`; all or nothing); `routers/tasks.apply_update` shared by both. The Windows app applies it to its local copy and sends one update per task.
- `components/BulkEditBar.js`; 3 new backend tests, 1 new Windows-app test.

## v1.38.0 — 2026-09-28

### Added
- **Weekly review** (◷ *Review* in the menu): pick a week (‹ *This week* ›) and see
  - how many tasks got **done** and how many are **new**, what's **overdue** and what's **due the week after**, each as a list (titles open the task);
  - **open work per project**: done this week, open, overdue and estimated hours, with a total;
  - *Everyone* or *Only mine*; **Copy as text** gives a plain-text summary for a status mail, **Print** prints just the review.
- **Task templates**: ⋯ → **Save as template…** saves a task with its subtasks under a name. In the task form, **From template** creates it again: pick the template, optionally a new title, and the project, deadline and assignee for this round (also as subtasks of a task). Titles, descriptions, priorities, estimates and labels come along; everything starts as *To Do*. Templates are shared by everyone; Settings → **Task templates** lists them, and the one who saved one (or an admin) can delete it.
- **Undo** instead of "Are you sure?":
  - Deleting a task shows *Deleted “…” (and n subtasks) · Undo* for a few seconds; the task is only really deleted when that time is up (or right away when you leave the page).
  - Ticking a task off — checkbox, board, **x** key, My day — shows *Marked “…” done · Undo*, which puts it back to the status it had.
  - Reopening a completed repeating task (Undo, or unticking it) now takes back the next occurrence it created, if nobody has worked on that one yet (no changes, comments or ticked subtasks); ticking it again creates a fresh one.

### Fixed
- *Copy* for the calendar feed link now also works on servers without HTTPS.
- Saved-filter chips and keyboard hints used a text color that doesn't exist (fell back to the default by luck).

### Under the hood
- Migration `0017`: table `task_templates`; `routers/templates.py` (`/api/v1/templates/`), `recurrence.take_back_next`; `frontend/src/review.js`, `clipboard.js`, `components/WeeklyReview.js`, `UndoToast.js`, `TemplateSettings.js`.
- 4 new backend tests, 2 new frontend tests.

## v1.37.0 — 2026-09-28

### Added
- **Time estimates**: tasks get an optional **Estimate** (next to Status and Priority). Type it the way you'd say it: `2h`, `1.5h` or `1,5`, `45m`, `1h 30m`, `1:30`; a plain number means hours.
  - Shown on the task and on board cards (⏱ 1h 30min). A task without its own estimate shows what its open subtasks add up to (⏱ Σ …).
  - Each **project and category header** shows the open work, estimated. Done tasks count nothing, and a task's own estimate covers its subtasks, so nothing is counted twice.
  - In the task history, carried over to the next occurrence of repeating tasks, in the export/import file and in the CSV export (*Estimate (hours)*, a number spreadsheets can add up).
- **Saved filters**: set up filters, search, sort and view on the Tasks page, then **☆ Save filter** and give it a name. It appears as a ★ chip above the filters; one click brings it back. The active one has a trash can to delete it; saving under an existing name replaces it. Saved per user on the server, so they're on every device.
- **Keyboard shortcuts** on the Tasks page — **?** shows them all:
  - **n** new task, **/** search;
  - **j / k** move through the list (the picked task is outlined), then **e** edit, **x** done / not done, **a** add subtask, **c** comments & history, **o** open/close subtasks, **Del** delete; **Esc** clears the selection.
  - Keys are ignored while typing in a field.

### Under the hood
- Migration `0016`: `tasks.estimate_minutes`, table `saved_filters`; `routers/saved_filters.py` (`/api/v1/saved-filters/`), `frontend/src/estimate.js`.
- 4 new backend tests, 3 new frontend tests.

## v1.36.1 — 2026-09-28

### Changed
- **Delete buttons show a trash can** instead of ✕ — on tasks, in the ⋯ menu, on projects/categories and on labels (gray, red on hover like before). The ✕ that removes a dependency from a task stays, since it removes a link rather than deleting anything.

## v1.36.0 — 2026-09-28

### Changed
- **Priority is picked by name**: the task form (single and *Several*) has a **Low / Medium / High / Critical** list instead of a number field. Existing tasks keep their priority; a task with an older value above *Critical* keeps it until you change it.

## v1.35.0 — 2026-09-28

### Added
- **Calendar feed**: Settings → **Calendar feed** gives you a private link (`/api/v1/calendar/<secret>.ics`) that calendar apps subscribe to.
  - Your **open tasks with a deadline** as all-day entries (marked *free*, not busy), with project/category, parent task, priority, assignee, labels, description and a link back to the task; tasks *in progress* start with ▶.
  - **Repeating tasks appear as series**, so upcoming dates show up too — weekdays, last day / last or first workday, *2nd Tuesday*, *last Friday*; not for rules *counted from completion*.
  - Choose **Mine and unassigned** or **Everything I can see** (private projects stay private); texts follow your language.
  - **New link** replaces the secret; the old link stops working (so does a deactivated user's).
  - Works with apps that fetch the feed on the device — classic Outlook, Apple Calendar (iPhone/Mac), Thunderbird, **ICSx⁵** on Android. Google Calendar, Outlook.com and the new Outlook fetch from their own servers, which can't reach a server on a private network or VPN.

### Under the hood
- Migration `0015`: `users.calendar_token`; `backend/app/calendar_feed.py` (iCalendar with line folding and escaping, RRULEs), `routers/calendar.py`.
- 5 new backend tests.

## v1.34.0 — 2026-09-28

### Changed
- **Editing happens where the task is**: in the list, *Edit* and *Add subtask* (buttons, ⋯ menu) open the form **right below that task** instead of at the top of the page, and scroll it into view only as far as needed. *+ New Task* and edits started from the board still use the top.
- The title field has the cursor when editing, too (Enter saves, Esc cancels right away).
- While a form is open in the list, drag-and-drop reordering pauses, so text in the form can be selected with the mouse.

## v1.33.0 — 2026-09-27

### Changed
- **Create / Save and Cancel are at the top** of the task and project forms, in a bar that stays in view while the form scrolls — no more scrolling down to find the button on smaller screens.
- **Quicker entry**: *+ New Task* puts the cursor in the title field, so *type → Enter* creates the task. **Ctrl+Enter** (⌘+Enter) saves from any field, also the description and the bulk list; **Esc** cancels (a first Esc only closes an open label box or task search). A hint next to the buttons says so.

## v1.32.0 — 2026-09-27

### Added
- **Better repeat rules** in the task form (*Repeat*):
  - **Every workday (Mon–Fri)** as a choice of its own, and **weekday buttons** for weekly repeats: *every Mon + Thu*, *every 2 weeks on Friday*.
  - For monthly and yearly repeats, **On**: the same day (as before), **the last day**, **the last workday**, **the first workday**, **the same weekday** as the deadline (*the 2nd Tuesday*; a 5th weekday becomes the last one in shorter months) or **the last such weekday** (*the last Friday*).
  - **Next date**: *follows the schedule* (as before) or **counts from when it was ticked off** (*3 days after completion*).
  - Badges and tooltips say it (*↻ Mon, Thu*, *↻ last workday*, *↻ 3 d after done*), in English and German; the task history, export/import and the API carry the new settings.

### Under the hood
- Migration `0014`: `tasks.recurrence_weekdays`, `recurrence_monthly`, `recurrence_from`; `backend/app/recurrence.py` computes dates with a `Rule`.
- 18 new backend tests (date cases checked against the calendar), frontend tests for the new texts.

## v1.31.0 — 2026-09-27

### Added
- **Sync endpoint** `GET /api/v1/sync/` for clients that keep their own copy (a future offline Windows app): without parameters a full snapshot of everything the user can see (flat tasks, projects, labels, comments, users) and a **cursor**; with `?since=<cursor>` only what changed since, plus deletions. Always includes the **ids** of everything currently visible, so clients drop what was deleted or became invisible; getting access to a private project sends its tasks along. A small overlap window makes sure nothing committed during a sync is missed.
- **Conflict detection**: `PUT /tasks/{id}` accepts **`expected`** — the values an offline edit was based on; if one of those fields changed on the server meanwhile, nothing is saved and the answer is **409** with the conflicting fields and the current task. Without it, updates stay *last write wins per field* (only the fields sent change).
- [docs/API.md](docs/API.md) → *Syncing* and *Conflicts* describe the client loop.

### Under the hood
- `backend/app/routers/sync.py`; changing a private project's members or privacy marks the project and its tasks as changed.
- 3 new backend tests.

## v1.30.1 — 2026-09-27

### Changed
- **HTTPS is opt-in**: new installs and updates serve plain HTTP unless `/etc/project-manager/https` exists (`install.sh --https`, `PM_HTTPS=1` for the Proxmox helper, or the commands in [DEPLOYMENT.md → HTTPS](DEPLOYMENT.md#https)). Plain HTTP is fine on a private network or behind a VPN such as ZeroTier; HTTPS with the local CA from v1.29.0 is still one command away. The old `no-https` marker isn't needed any more.

### Fixed
- The HTTP → HTTPS redirect is now temporary (302) instead of permanent (301). Browsers remember permanent redirects, so after HTTPS was switched off again they kept sending some requests to `https://` and failed (*Failed to load data: Failed to fetch*). If you see that after turning HTTPS off, clear the browser's cached files once.

## v1.30.0 — 2026-09-27

### Added
- **UUIDs**: tasks, projects, labels and comments have a `uid` (existing ones got one during the migration). Clients can send their own `uid` when creating something — **sending the same create again returns the existing object** instead of a duplicate (safe retries for offline apps). New tasks can refer to their parent and project by uid (`parent_task_uid`, `project_uid`).
- **Deletion records**: deleting a task (with its subtasks and their comments), a comment, a project (with its categories) or a label leaves a record; **`GET /api/v1/deletions/?since=…`** lists them (entity, id, uid, time).
- **Reliable `updated_at`**: a task's `updated_at` now also changes when its labels or dependencies change, and when a label or project it belongs to, or a task it waits for, is deleted. Labels have an `updated_at` too.
- [docs/API.md](docs/API.md) → *Keeping a copy* explains how a client uses these.

### Under the hood
- Migration `0013`: `uid` columns (filled with `gen_random_uuid()`), `deletions` table, `labels.updated_at`; `backend/app/tombstones.py`.
- 5 new backend tests.

## v1.29.0 — 2026-09-27

### Added
- **HTTPS with a local certificate authority.** [`scripts/setup-https.sh`](scripts/setup-https.sh) creates a CA on the server (once, 10 years) and a server certificate for its IP addresses, hostname, `<hostname>.local` and `localhost`, re-issued automatically when it's due within 30 days or the IP changes (the CA stays, so devices never re-import it).
  - Nginx serves the app on **port 443**; port 80 redirects to HTTPS and hands out the CA certificate at **`/ca.crt`** (plus the health check for local scripts).
  - Import the CA once per device to get rid of the browser warning — step-by-step for Windows, macOS, Android and iOS in [DEPLOYMENT.md → HTTPS](DEPLOYMENT.md#https).
  - **Settings → About** shows the connection (🔒 HTTPS / ⚠ HTTP) with a download link for the CA certificate.
  - `install.sh` sets it up (`--no-https` to skip), and **the next update turns it on for existing installs**; `touch /etc/project-manager/no-https` keeps plain HTTP.
- The Proxmox helper script prints the `https://` address and the CA link.

### Under the hood
- `deploy/nginx-https.conf` next to the HTTP-only `deploy/nginx.conf`; `scripts/nginx-site.sh` prints the right one for install and updates. Both send `X-Forwarded-Proto`.
- 3 new tests for the certificate script and config selection.

## v1.28.0 — 2026-09-27

### Added
- **Personal API tokens** (Settings → **API tokens**): create a token for a script or another app (name, expiry: never / 30 / 90 days / 1 year), shown once with a copy button; the list shows prefix, created, last used and expiry; **Revoke** takes effect immediately. Send it as `Authorization: Bearer pm_…`.
  - A token acts as its user (same projects, same admin rights), but can't manage tokens or change the password — that needs a password login.
  - Only a SHA-256 hash is stored; deactivating a user blocks their tokens at once.
- **Versioned API**: every endpoint is also available under **`/api/v1/…`** — the stable prefix for other clients (the unversioned `/api/…` paths stay for the web app).
- **API documentation**: interactive docs at **`/api/docs`** (Swagger UI) and `/api/redoc`, the spec at `/api/openapi.json`; a guide with curl/Python examples in [docs/API.md](docs/API.md).

### Under the hood
- Migration `0012`: `api_tokens`; `backend/app/routers/tokens.py`; `auth.get_session_user` for password-login-only endpoints.
- 5 new backend tests (129 in total).

## v1.27.0 — 2026-09-26

### Added
- **German interface.** Everything can be shown in German: navigation, all pages, forms, menus, messages and confirmations, the task history (*anna hat die Priorität von Hoch auf Kritisch geändert*), notifications, repeat texts (*wöchentlich*, *alle 3 Tage*), the board, calendar and My day. Dates and weekdays follow the language (*29. Sept.*, *Mo … So*); the CSV export's headers, statuses and priorities too.
- **Language per user**: Settings → *Your account* → **Language**: *Automatic (browser language)*, *English* or *Deutsch*; stored on the server, so it follows you to other devices. The login page uses the browser's language.

### Under the hood
- Migration `0011`: `users.language`; `PUT /api/auth/me/preferences`.
- `frontend/src/i18n.js` (`t`, `tn`, language detection) and `src/locales/de.js` (≈475 texts, keyed by the English text); `src/names.js` for status/priority names.
- `i18n.test.js` scans the code and fails on texts without a German translation or with mismatched placeholders.
- Messages coming from the server (e.g. validation errors) stay in English.

## v1.26.0 — 2026-09-26

### Added
- **My day** (☀ in the navigation, `/today`): a start page with a greeting, four counters (**overdue**, **due today**, **this week**, **in progress** — each jumps to its list) and sections:
  - *Overdue*, *Due today*, *This week* (next 7 days), *In progress* and, when there are any, *⏳ Waiting for others* — your open tasks and subtasks, with project/category (and parent task), labels, priority, ⏳ and deadline;
  - *Recently assigned to you* and *Recent comments* (last 7 days, from your notifications).
  - Tick tasks off right on the page (repeating tasks and *Ready to start* notifications work as usual); titles open the task in the list, comments open with the thread.
  - **Include unassigned tasks** (on by default) and **Open My day when I start the app** (off by default; only when the app is opened plainly, not from a link to a task) — both remembered in the browser.
- The phone navigation has four tabs now: My day, Tasks, Projects, Settings.

## v1.25.0 — 2026-09-26

### Added
- **Task dependencies.** *Waits for* in the task form: search other tasks by title and add them (project shown next to each; ✓ for done ones).
  - A task with open dependencies shows **⏳ waiting** (with the count, and their titles in the tooltip) in the list and on board cards, until they're all done.
  - When the last one is done, the waiting task's assignee gets a **Ready to start** notification (*Done: …*), unless they finished it themselves.
  - Status filter **⏳ Waiting for other tasks**.
  - Circles are refused (*That would make the tasks wait for each other*), as are tasks you can't see; deleting a task removes it from what others wait for.
  - The history records changes (*made it wait for “Get quote”*).

### Under the hood
- Migration `0010`: `task_dependencies`; tasks take and return `blocked_by_ids`; logic in `backend/app/dependencies.py`.
- 4 new backend tests (123 in total), frontend tests for the dependency helpers and the *waiting* filter.
- Dependencies aren't part of project export/import.

## v1.24.0 — 2026-09-26

### Added
- **Labels.** Colored tags for tasks across all projects (e.g. *urgent*, *waiting for supplier*), shared by everyone.
  - Task form: a *Labels* row to toggle labels, with **+ New label** to create one on the spot (a free palette color is picked).
  - **Settings → Labels**: all labels with how many tasks use them; rename, recolor, delete (deleting only takes the label off its tasks), add.
  - Labels show as chips on list rows and board cards; **clicking a chip shows all tasks with that label** (a note above the list says which, with *Show all*).
  - A **Label** filter next to the others, and the search also matches label names — in the list, board and calendar.
  - Bulk entry applies the chosen labels to every new task; repeating tasks pass their labels on to the next occurrence and its checklist.
  - The task history records label changes; the CSV export has a *Labels* column; project export/import carries labels by name (matched ignoring case, missing ones created with their exported color).

### Under the hood
- Migration `0009`: `labels`, `task_labels`; `/api/labels/` (list with usage counts, create, update, delete); tasks take and return `label_ids`.
- 4 new backend tests (119 in total), frontend tests for labels and the CSV column.

## v1.23.1 — 2026-09-26

### Fixed
- **Only one update at a time.** `scripts/update.sh` now holds a lock (`.update/update.lock`, `flock`) for the whole run, so an update started by hand and one started from Settings can no longer run at the same time. A second attempt is refused — *Update now* reports *An update is already in progress*, the script exits with code 75 — and the running update's status and log are left alone. The lock is released automatically when a run ends or is killed.

## v1.23.0 — 2026-09-26

### Added
- **Private projects.** In the project form, *Visibility*: **Everyone** (default, as before) or **🔒 Private — only members and admins**, with a member picker. A private project, its categories, tasks, subtasks, comments and history are visible only to its members and to admins; for everyone else they don't exist (lists leave them out, direct links answer *not found*, comment search skips them).
- The Projects page shows a **🔒 Private** badge and the members; the Tasks page a 🔒 next to the project name.
- Tasks in a private project can only be **assigned to members** (the assignee list only offers them); a task assigned to a non-member can't be moved into the project.
- The creator of a private project is a member; members can change the members and the visibility, and non-admins stay members of projects they manage (so nobody locks themselves out). Categories always follow their project.
- Notifications about tasks you can no longer see are hidden, and comments don't notify people who can't see the task.
- Export only includes projects you can see; the *private* flag is exported, and an imported private project gets the importing user as its member.

### Under the hood
- Migration `0008`: `projects.is_private`, `project_members` table; all checks in `backend/app/access.py`.
- 8 new backend tests (115 in total), frontend test for the project-index helpers.

### Fixed
- Two database backups started within the same second (e.g. *Back up now* while the nightly one runs) no longer overwrite each other; the second gets a `_2` suffix.

## v1.22.0 — 2026-09-26

### Added
- **Board view** (Tasks → *Board*): To Do / In Progress / Blocked / Done columns of the top-level tasks. Drag cards between columns, or use ◀ ▶ on a card (touch). Cards show project/category, priority, deadline (red when overdue), repeat, subtask progress, comments and assignee; ✎ edits, the title opens the task in the list. Done shows the 15 most recently completed (*Show n more*). On phones the columns scroll sideways.
- **Calendar view** (Tasks → *Calendar*): month grid (Monday first) of all deadlines, subtasks included, colored by project; overdue in red, done struck through. Click a day to list its tasks below the grid; **drag a task onto another day to move its deadline**. ◀ ▶ and *Today* to navigate; a note counts open tasks without a deadline. On phones days show colored dots.
- The view is part of the URL (`?view=board`) and search, filters and *Assigned to me* apply to all views.

### Changed
- Next-deadline dates on the Projects page use the same format as the task list (*Sep 29*).

## v1.21.0 — 2026-09-26

### Added
- **Progress overview on the Projects page.** Every project shows a progress bar in its color, **% done** and *x of y done* (its categories included), plus **open**, **overdue** and **due this week** counts — each a link to the Tasks page with that filter set — and the **next deadline** (a link to the task).
- Categories get their own mini progress bar, *done/total* and an overdue count.
- Counts are top-level tasks (subtasks are a task's checklist); archived done tasks count as done.

## v1.20.0 — 2026-09-26

### Added
- **Nightly database backup** at 03:15 (`/etc/cron.d/project-manager`, installed by `install.sh` and by the next update). **Settings → Backup & export → Back up automatically every night** turns it off and on (on by default); output in `/var/log/project-manager-backup.log`.
- **Link to the source on GitHub** in the footer.

### Changed
- Backup retention counts **nightly and other backups separately** (newest N of each), so nightly dumps never push out the backup taken before an update.
- `install.sh` also installs `cron`.

## v1.19.0 — 2026-09-26

### Added
- **Task history.** The 💬 panel shows what happened to a task, interleaved with the comments: who created it, and who changed its status, assignee, project/category, title, description, deadline, priority or repeat setting — e.g. *anna changed priority from High to Critical*, *preview took it on*, *bob completed it*. Repeating tasks note when the next occurrence was created.
- **Hide history / Show history (n)** in the panel to see only the comments; the choice is remembered in the browser.
- The history refreshes while the panel is open when the task changes.
- Names are stored as they were at the time, so the history stays readable after users or projects are renamed or deleted; it's removed together with the task. Saving the form without changes adds nothing.

### Under the hood
- Migration `0007`: `task_activity` table; logging in `backend/app/activity.py`; `GET /api/tasks/{id}/activity`.
- 3 new backend tests (105 in total), frontend test for the history sentences.
- Not part of project export/import (comments still are).

## v1.18.0 — 2026-09-26

### Added
- **Recurring tasks.** *Repeat* in the task form: every N days, weeks, months or years. Ticking a repeating task off creates the next occurrence — same title, description, project, assignee and priority — with the deadline moved forward **on its schedule** (a weekly Monday task stays on Mondays; if it's finished very late the next date is the first one not in the past). Month steps clamp to the month's end (31 Jan → 28/29 Feb). Subtasks are copied as a fresh, unticked checklist. Without a deadline, the next one is due one interval after today.
- A **↻ badge** ("weekly", "3 d") on repeating tasks.
- Unticking and re-ticking doesn't create a second occurrence; if the next one was deleted, ticking again creates a new one.
- Export/import keeps the repeat settings.

### Under the hood
- Migration `0006`: `tasks.recurrence_unit`, `recurrence_interval`, `recurrence_next_id`; logic in `backend/app/recurrence.py`.
- 11 new backend tests (102 in total), frontend test for the repeat labels.

## v1.17.0 — 2026-09-26

### Added
- **"⋯" menu on every task**: Add subtask, Edit, Move to…, Move up, Move down, Delete. On phones it opens as a bottom sheet with large touch targets.
- **Move up / Move down** — reordering that works on touchscreens (manual sort order; disabled with a hint otherwise). Moves stay within the task's list: same parent, and for top-level tasks the same project and open/completed section.
- **Move to…** another project or category, straight from the menu. Subtasks that followed the old project (or had none) move along; ones deliberately put elsewhere keep theirs. The task is scrolled to and highlighted in its new place.

### Changed
- On phones a task row shows only 💬 and ⋯ (add subtask / edit / delete are in the menu), so rows no longer wrap on narrow screens.
- Changing a task's project to one that doesn't exist is rejected (400).

## v1.16.0 — 2026-09-26

### Added
- **Notifications** in the bell: you're notified when someone **assigns you a task** (on create, edit or bulk add — a bulk add is one notification, "and 4 more tasks") and when someone **comments** on a task assigned to you or one you've commented on. Your own actions never notify you; deactivated users aren't notified. Unread items are highlighted and counted on the badge; opening the bell marks them read.
- **Jump to the task** from a notification or deadline: its project, category and parent tasks open, it scrolls into view and flashes briefly; comment notifications open the thread.
- **Assigned to me** switch next to the search, with the number of your open tasks.

### Changed
- The bell's deadline list only shows tasks assigned to you or to nobody (it showed everyone's before).
- On phones the bell dropdown sits right under the top bar.

### Under the hood
- Migration `0005`: `notifications` table (removed with its task or user; read ones are cleaned up after 60 days).
- New API: `GET /api/notifications/`, `POST /api/notifications/read`.
- 8 new backend tests (87 in total).

## v1.15.0 — 2026-09-26

### Changed
- **Dependencies updated** to current versions: FastAPI 0.141, SQLAlchemy 2.0.54, Pydantic 2.13, Alembic 1.20, Uvicorn 0.54 and friends (SQLAlchemy 2.1 needs Python 3.11; Ubuntu 22.04 installs have 3.10 — CI checks both). The PostgreSQL driver is now **psycopg 3**, named explicitly; connections always use UTF-8.
- **passlib → bcrypt** and **python-jose → PyJWT**: both old libraries are unmaintained, and passlib printed a bcrypt error on every start. Existing password hashes and login sessions keep working (covered by tests using credentials created with the old libraries), including passwords longer than bcrypt's 72-byte limit.
- **Frontend dependencies are locked** in `package-lock.json` (React 18.3, React Router 6.30); CI installs them with `npm ci`.
- Code uses current APIs (no more deprecated `class Config`, `datetime.utcnow()` or `declarative_base` import); the test suite now fails on any warning.

### Added
- **`scripts/fix-db-encoding.sh`**: converts databases created as `SQL_ASCII` (older hand-made installs) to UTF-8 — validates the text first, keeps the old database as a fallback, rolls back on any failure. `install.sh` runs it on re-installs; a no-op on UTF-8 databases.

### Removed
- `psycopg2-binary`, `passlib`, `python-jose` dependencies.

## v1.14.0 — 2026-09-26

### Added
- **Bulk entry — one task per line.** The task form has a new *Several (one per line)* mode: type or paste a list; indented lines (Tab or two spaces) become subtasks of the line above, at any depth. Bullets (`-`, `*`, `•`, `1.`) are stripped and Markdown checkboxes create done tasks (`- [x] …`). A live preview shows the tree and count; project/category, status, priority, deadline and assignee apply to every task. Available from *+ New Task*, a section's **+** (preset to that project/category) and a task's **+** (all lines become its subtasks). Tab / Shift+Tab indent and outdent the current line.
- New tasks appear expanded after a bulk add.

### Under the hood
- `POST /api/tasks/bulk`: creates the whole tree in one transaction (all or nothing), up to 500 tasks, appended after existing siblings; validates parent, project and assignee.
- `frontend/src/bulkParse.js` with Jest tests; 6 new backend tests (72 in total).

## v1.13.0 — 2026-09-26

### Changed
- **Registration is closed once an admin exists.** Only the very first account can sign up on its own (and becomes admin); after that the login page hides *Register* and says to ask an admin. Admins can re-open it with **Allow new registrations** in Settings → User Management. Existing installs are closed after updating.
- New passwords (registration, admin-set, change) need at least **8 characters**; existing passwords keep working. Usernames can't contain spaces (new accounts only).

### Added
- **Admins add users** (username, email, initial password, optional admin) and **set a new password** for any user, in Settings → User Management.
- **Change your own password** in Settings → *Your account*.
- Registration errors from the server are shown as readable messages.

### Fixed
- On phones the login page no longer shows the app header twice.

### Under the hood
- New API: `GET /api/auth/registration`, `POST /api/auth/change-password`, `POST /api/users/` (admin), `PUT /api/users/{id}/password` (admin); `allow_registration` in `/api/settings`.
- 9 new backend tests (66 in total).

## v1.12.1 — 2026-09-25

### Fixed
- **Deactivated users were not locked out**: they could still log in and keep using existing sessions. Login now refuses deactivated accounts ("This account has been deactivated") and their tokens stop working immediately.

### Added
- **Backend test suite** (`backend/tests/`, pytest against a real PostgreSQL — starts a throwaway server automatically): auth and users, projects/categories, tasks, comments, settings, export/import, backup endpoints, migrations, and the backup/restore scripts including rollback.
- **GitHub Actions CI**: backend tests on Python 3.10 and 3.12 with PostgreSQL 16, frontend tests and production build, shellcheck — on every push to `main`/`dev` and on pull requests.
- `PM_ENV_FILE` for `scripts/backup-db.sh` / `restore-db.sh` to read connection settings from a file other than `backend/.env`.

### Changed
- The two long-standing ESLint warnings in the frontend build are resolved.

## v1.12.0 — 2026-09-25

### Added
- **Comments on tasks**: a 💬 button on every task and subtask (with the comment count) opens its comment thread — author, time, *edited* marker; Ctrl+Enter to send. Authors can edit and delete their own comments, admins can delete any.
- Task search also finds tasks by the text of their comments.
- Project export/import includes comments; on another installation the original author's name is kept as text.

### Changed
- On phones the task row's action buttons are a little narrower so the comment button fits on the same line.

### Under the hood
- Migration `0004`: `task_comments` table (deleted together with its task).
- New API: `GET/POST /api/tasks/{id}/comments`, `PUT/DELETE /api/comments/{id}`, `GET /api/comments/search?q=`; tasks in `GET /api/tasks/` carry `comment_count`.

## v1.11.0 — 2026-09-25

Everything since v1.5.0 ships in this release (v1.6.0 – v1.10.0 were development versions on `dev`).

### Tasks
- **Tasks grouped by project**: collapsible sections per project, with sub-sections per category and *No project* last; tasks carry their project's color. "+" on a section creates a task pre-set to that project/category.
- **Done checkbox** on every task and subtask.
- **Completed rows**: ticked tasks move into a collapsed *✓ Completed (n)* row at the end of their project/category, most recent first.
- **Archiving**: tasks completed more than N days ago (Settings, default 30) are hidden from the list but still found by search or the *Done* filter. Nothing is deleted.
- **Subtask progress** (*1/2*) on parent tasks; when all subtasks are ticked the parent is highlighted as ready (*✓ 2/2*) but stays open until it's ticked itself.
- Collapsible categories; collapse state remembered per browser.
- Drag-to-reorder stays within a project.

### Projects
- **Categories** (one level of sub-projects, e.g. *6GHub → General, Ordering, Documentation*).
- **Project colors**, auto-assigned from a palette and editable; categories use their parent's color.
- Projects page shows a tree with task counts and *+ Category*.
- **Export/import as JSON**: one project or everything, into any account or installation.

### Backups & restore
- **Automatic database backup before every update** (and before migrations on `install.sh` re-runs); a failed backup stops the update.
- Settings → *Backup & export*: *Back up now*, keep the newest N (default 3), download, upload, delete and **restore** backups. Restores take a safety backup first and roll back automatically on failure; older backups are migrated to the current schema.
- **Move to a new server**: `PM_RESTORE_FILE=…` for the Proxmox helper, `install.sh --restore FILE`, or upload + restore in Settings.
- **CSV export** of all tasks for Excel.

### Phone & UI
- **Phone layout**: bottom tab bar, compact header, folding filters, two-line task rows with large touch targets, no input zoom on iOS.
- **Add to Home Screen**: web app manifest and icons; runs full-screen.
- Darker header in dark mode; disabled buttons look disabled.

### Under the hood
- Migrations `0002` (project color, categories) and `0003` (`tasks.completed_at`, `app_settings`).
- New API: `/api/settings`, `/api/transfer/export|import`, `/api/system/backups` (list, create, upload, download, restore, delete).
- `scripts/backup-db.sh`, `scripts/restore-db.sh`.
- README screenshots under `docs/screenshots/`.

## v1.5.0 — 2026-09-25
- `install.sh` for Debian 12 / Ubuntu 22.04+ LXCs or VMs, and `proxmox/project-manager-lxc.sh` to create a ready-to-use LXC from the Proxmox host (no Docker).
- In-app updater keeps the Nginx config in sync; backend listens on 127.0.0.1 only; `backend/.env` restricted to root.

## v1.4.0 — 2026-09-25
- Task search (titles and descriptions, subtasks included), filters for status, project, assignee and deadline, sorting; filters kept in the URL.

## v1.3.0 — 2026-09-25
- Production frontend build served by Nginx instead of the React dev server; updater builds into a staging directory and swaps only on success.

## v1.2.2 — 2026-09-25
- Update check offers switching to a branch that points at the same commit.

## v1.2.1 — 2026-09-25
- In-app update check, branch selection and update button (Settings → Updates).
- Alembic database migrations.
- "Project Manager" naming throughout.

## v1.0.0 — 2026-09-18
- First release: JWT authentication and user management, projects, hierarchical tasks with drag-to-reorder, extended statuses, deadlines with notification bell, dark mode.
