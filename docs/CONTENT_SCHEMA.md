# Content schema

Every editorial fact about the event lives in `/content`. The site only renders it.
The schemas are enforced in code by [`src/lib/content-schemas.ts`](../src/lib/content-schemas.ts). A file that breaks them **fails the build** with a plain-English message naming the file and field.

## Conventions (apply to every file)

| Rule | Example |
|---|---|
| A fact lives in **one** place. Event facts live only in `event.yaml`. Other files never repeat the date, venue or dress code. | — |
| `TBD` (exactly, in capitals) means "not decided yet". Pages show "To be confirmed". | `dress_code: TBD` |
| Date-times are ISO 8601 to the minute, **in quotes**, with the Cyprus offset. | `"2027-05-29T19:00+03:00"` |
| Calendar dates are `YYYY-MM-DD`. | `"2027-05-29"` |
| Money is a plain number in **euros** (EUR). `0` means free. | `cost_eur: 45` |
| Distances are in **kilometres**. | `distance_to_venue_km: 8.5` |
| Links are full addresses starting with `https://`. | — |
| A file's **name is its id** (lowercase, words joined by `-`). Ids of activities must never change once guests have signed up, because sign-ups are stored against them. | `activities/boat-trip.md` → id `boat-trip` |
| Markdown files: settings go between the `---` lines (YAML frontmatter), and the free text after them is the body. | — |
| **No personal data** (guest names, emails, phone numbers) in any content file. The website's files are **public**, and `npm run check` fails if it finds an email address or phone number. | — |
| **Only known fields.** A field the schema does not list is an error, with a "Did you mean…?" hint (so a typo like `captian` can never be silently ignored). | `"captian" is not a field this file knows. Did you mean "caption"?` |
| **Links must start with `https://`.** | — |
| **Text has a length limit** (100 letters for titles and names, 150 to 300 for sentences). The message says the limit. | — |
| **Templates:** each folder has a `_template` file to copy for a new item. Files starting with `_` are never published. A test keeps every template valid. | `content/activities/_template.md` |
| **Checks:** `npm run check` (also the first step of `npm run build`, so Vercel runs it too) checks every file and explains problems in plain English. It also checks file names (lowercase words joined by dashes), one photo per page, that photos have their web-sized copies, and that activities are in 2027 (and inside the party week once it is set). Things still to fill in (`[Placeholder…]`, `TBD`) are listed but never stop publishing. | — |

## `content/event.yaml`: canonical event facts

| Field | Type | Notes |
|---|---|---|
| `title` | text | Site name, e.g. "A 60th birthday in Cyprus". |
| `honoree_display_name` | text or `TBD` | How the birthday person is named on the site. |
| `timezone` | `Europe/Nicosia` | Fixed. |
| `currency` | `EUR` | Fixed. |
| `week.start_date`, `week.end_date` | date or `TBD` | First and last day of the celebration week. End must not be before start. |
| `party.date` | date | `2027-05-29`. |
| `party.start`, `party.end` | date-time or `TBD` | End must be after start. |
| `party.dress_code` | text or `TBD` | |
| `venue.name`, `venue.address`, `venue.town` | text or `TBD` | |
| `venue.country` | `Cyprus` | Fixed. |
| `venue.gps` | `{ lat, lng }` or `TBD` | Decimal degrees, must fall within Cyprus. |
| `venue.maps_url` | link or `TBD` | Google/Apple Maps link to the venue. |
| `contact_note` | text | How to reach the organisers, **without** phone numbers or emails. |

## `content/*.md`: standalone pages

Files: `welcome.md`, `thank-you.md`, `privacy.md`.

| Field | Type | Notes |
|---|---|---|
| `title` | text | Page heading. |
| `summary` | text | One sentence, used for `llms.txt` and page descriptions. |
| body | Markdown | The page text. |

## `content/activities/<id>.md`

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | text | yes | |
| `summary` | text | yes | One sentence. |
| `start` | date-time | yes | Activities are grouped by the Cyprus calendar day of `start`. |
| `end` | date-time | no | Must be after `start`. |
| `meeting_point` | text | yes | |
| `capacity` | whole number ≥ 1 | no | Leave out for unlimited. When full, new sign-ups join the waiting list. |
| `cost_eur` | number ≥ 0 | yes | Per person. `0` = free. Information only, no online payment. |
| `cost_note` | text | no | e.g. "Pay the boat company on the day." |
| `kid_friendly` | `true` / `false` | no | Defaults to `false`. When `false`, children can't be signed up (organisers can still add them in /admin). |
| `status` | `scheduled` / `cancelled` | no | Defaults to `scheduled`. `cancelled` shows the activity as cancelled and stops sign-ups; organisers still see who had signed up. **To stop an activity, set this. Never delete its file** once guests can sign up. |
| body | Markdown | no | Extra details (what to bring, etc.). |

## `content/accommodation/<id>.md`

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | text | yes | |
| `summary` | text | yes | One sentence. |
| `area` | text | yes | Neighbourhood or village. |
| `kind` | `hotel` \| `villa` \| `apartment` \| `guesthouse` \| `other` | yes | |
| `price_eur_per_night.min`, `.max` | number ≥ 0 | yes | Max must not be below min. |
| `booking_url` | link | no | Guests book directly. |
| `distance_to_venue_km` | number ≥ 0 | no | Used to sort the list (closest first). |
| body | Markdown | no | |

## `content/cyprus/<id>.md`: practical resources

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | text | yes | |
| `summary` | text | yes | One sentence, shown on the Cyprus overview page. |
| `order` | whole number | yes | Lower comes first. Use steps of 10 so items can be inserted between. |
| `links` | list of `{ label, url }` | no | Shown under "Useful links". |
| body | Markdown | yes | The article. |

## `content/photos/<id>.yaml`: one photo per file

A photo is either one of the family's own pictures or one from [Unsplash](https://unsplash.com) (free licence). The file name is the photo's id and names its image files. After adding or changing a photo, run `npm run photos`: it prepares the picture (downloads it from Unsplash, or reads your own from `content/photos/originals/`), crops it, and writes small compressed WebP copies (each under 200 KB, with no camera or location details) to `public/photos/`. The originals folder is never published.

| Field | Type | Required | Notes |
|---|---|---|---|
| `source_file` | file name | one of these two | Your own picture, like `harbour.jpg` (.jpg, .png or .webp), in `content/photos/originals/`. |
| `unsplash_id` | text | one of these two | A photo from Unsplash: the part of its image address after `images.unsplash.com/`, like `photo-1701121685501-03d44cca164c`. |
| `alt` | text | yes | What the photo shows, for people who cannot see it. Up to 250 letters. |
| `caption` | text | yes | Short line under the photo. Up to 100 letters. |
| `credit_name`, `credit_url` | text, link | Unsplash: yes. Own photo: no | Give both or neither. e.g. "Sergei Gussev on Unsplash". |
| `aspect` | `3:2` \| `4:3` \| `16:9` | yes | Shape the photo is cropped to. |
| `focus` | text like `75% 50%` | no | Part of the photo kept in view when cropped (left to right, top to bottom). Defaults to the centre. |
| `page` | text like `/activities` | no | The page the photo decorates. `/` is the big photo at the top of the Welcome page, any other page gets a postcard next to its title. Only one photo per page. |
