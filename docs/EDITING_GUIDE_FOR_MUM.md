# Editing the birthday website

You don't need to learn any code. You type what you want in plain English, an assistant changes the website for you, and you check the result. If you ever feel unsure, stop and message Jacques. Nothing here is urgent.

---

## Part 1: Setting up (once, about 45 minutes)

Do this with Jacques on a call. He'll help with anything that looks different on your screen.

**1. Install three free programs.** Download each one, open it, and click "Next" or "Install" through the questions (the usual answers are fine).
- **VS Code** (the program you'll type in): https://code.visualstudio.com, then "Download for Windows".
- **Git** (it keeps a safe history of every change): https://git-scm.com/download/win
- **Node.js** (it lets the website check itself): https://nodejs.org, then the "LTS" button.

**2. Make a free GitHub account** at https://github.com (this is where the website's files live). Send Jacques your username. He'll send you an invitation by email. Open it and click "Accept invitation".

**3. Keep your email private on GitHub.** Sign in to GitHub, click your picture, then Settings, then Emails. Tick "Keep my email addresses private". Then, in the same page, copy the long address that ends in `@users.noreply.github.com`. You'll use it in step 6.

**4. Add the assistant to VS Code.** Open VS Code. On the left, click the square icon (Extensions). Search for **Claude Code** and click Install. Then follow the sign-in button that appears, using your Claude account.

**5. Bring the website onto your computer.**
1. In VS Code, press `Ctrl` + `Shift` + `P` together, type `Git: Clone` and press Enter.
2. Paste this address and press Enter: `https://github.com/jchrysoc-dev/chypre-60ans`
3. Choose your Documents folder, then click "Open" when it asks.
4. A browser window may ask you to sign in to GitHub. Do that and click "Authorize".
5. Click "Yes, I trust the authors" if VS Code asks.

**6. Tell Git who you are.** In VS Code, open the terminal: press `Ctrl` + `` ` `` (the key left of the number 1). Type these two lines, one at a time, pressing Enter after each. Put your own name, and the address from step 3:
```
git config --global user.name "Your Name"
git config --global user.email "the-long-address@users.noreply.github.com"
```

**7. Turn on the safety settings.** In the same terminal, copy and paste this whole block and press Enter:
```
New-Item -ItemType Directory -Force .claude
Copy-Item docs\mum-claude-settings.json .claude\settings.local.json
```
These settings keep the assistant to the website's words and photos. If it ever says it "can't" do something, that's why.

**8. Get everything ready.** Open the assistant: click the Claude icon at the top right of VS Code (or press `Ctrl` + `Esc`). Type:

> Get everything ready so I can edit the website.

It will install what it needs. This takes a minute or two.

*If a red message says "running scripts is disabled on this system":* in the terminal, type `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, press Enter, type `Y` and Enter, then ask the assistant again.

**9. Try a question first.** Type: *What activities are on the website right now?* It should list them. You haven't changed anything. You're ready.

---

## Part 2: Making changes

Open VS Code (it remembers the website folder), open the assistant, and type what you want, like you'd ask a helpful person. Write one request at a time.

The assistant will tell you what it changed, then ask **"Shall I publish this now?"** Say **yes** when you're happy. About a minute or two later, refresh the website to see it. The first time you publish, a window may ask you to sign in to GitHub. Sign in and click "Authorize".

### Things you can ask

**1. Change the party time.**
> Change the party start time to 7pm, and the end time to midnight.

**2. Add an activity.**
> Add a sunset cruise on 30 May at 18:00. Maximum 20 people, 35 euros each, meeting at Limassol Marina. Children are welcome.

**3. Add a place to stay.**
> Add the Harbour View Hotel in Old Town, between 80 and 140 euros a night, 3 km from the party. The booking page is https://www.example.com/book

**4. Add a photo of your own.**
First put the picture in the website's photo folder: in VS Code, on the left, open `content`, then `photos`, then `originals`. Drag your picture from your computer into that folder. Then ask:
> I put harbour.jpg in the originals folder. Show it on the Accommodation page with the caption "The harbour at sunset".

If the photo shows people, especially children, the assistant will ask whether you are happy for it to be public. The website's files can be seen by anyone on the internet, even though the website itself needs a login.

**5. Change some wording.**
> On the Welcome page, replace the first paragraph with: "We can't wait to celebrate with you in Cyprus."

**6. Cancel an activity.**
> Cancel the wine tasting.

The activity stays on the website, marked "Cancelled", and nobody can sign up any more. On the **Organisers** page, under **Activities**, you still see who had signed up, so you can let them know.

**7. See who has signed up.**
> Who has signed up for the boat trip?

The assistant can't see guests' information, on purpose. It will tell you to open the website's **Organisers** page (you'll find the link at the bottom of any page). There you'll find three tabs:
- **Guest list**: add guests, change their details, or remove them.
- **Replies**: who is coming to the party, arrival dates, flights and dietary needs.
- **Activities**: who is going to each activity and who is waiting for a place. You can sign someone up yourself (for example when they phone you), give someone a place even when it's full, or take someone off.

Each of the last two has a **Download (CSV)** button that opens in Excel or Google Sheets.

### Taking back a change
> Undo the last change and publish it.

---

## If something looks wrong

1. **The website looks wrong after you published.** Type: *Undo the last change and publish it.* Wait two minutes and refresh the website.
2. **It's still wrong, or the website didn't change after five minutes.** Message Jacques. Tell him what you asked for and what you see. You can copy the assistant's last message into your message.
3. **The assistant says a problem has to be fixed first.** Good, that's the safety check working. Ask it to explain in simple words, or just message Jacques.
4. **A red or scary message appears.** Don't worry. Nothing breaks the website until you say "yes" to publishing. Message Jacques.

## What the assistant won't do

It looks after the website's words and photos only. For anything else, it will tell you to ask Jacques. That includes changing how the website works or looks, logging in, and anything private. It will never ask you for a password. It also won't remove anything without asking you first, and it won't put guests' names, emails or phone numbers into the website's files.
