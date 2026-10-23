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
| **No personal data** (guest names, emails, phone numbers) in any content file. | — |

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
| `kid_friendly` | `true` / `false` | no | Defaults to `false`. |
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
