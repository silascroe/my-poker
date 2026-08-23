# Turn on ProxyPoker accounts

The account feature is deliberately optional. Until both public Supabase values are configured, ProxyPoker hides every account control and continues working as a Guest-only game.

## 1. Create the Supabase project

1. Create a free project at [supabase.com](https://supabase.com/).
2. Give it any internal name you like, such as `proxypoker`.
3. Save the database password somewhere private. ProxyPoker does not need that password, but the Supabase dashboard may ask for it later.
4. Wait for the project to finish provisioning.

## 2. Create the tables and security rules

1. Open **SQL Editor** in the Supabase project.
2. Choose **New query**.
3. Copy the entire contents of [`supabase/schema.sql`](../supabase/schema.sql) into the editor.
4. Click **Run** once.

That script creates:

- `profiles`, for a player's display name and guided-hand count;
- `poker_hands`, for saved results and recent history;
- Row Level Security policies that restrict every player to their own rows;
- the small trigger and function needed to create profiles and count guided hands.

Do not disable Row Level Security. The browser receives a public Supabase key, so those policies are the actual lock on the filing cabinet.

## 3. Allow ProxyPoker's return URLs

Open **Authentication → URL Configuration** in Supabase.

- Set **Site URL** to `https://proxypoker.lol/`.
- Add `https://proxypoker.lol/` to the redirect allow list.
- For local testing, also add `http://localhost:3000/`.

Magic-link emails return to one of those exact URLs after sign-in.

## 4. Copy the two public project values

Open the project's **Connect** dialog or **Project Settings → API** and locate:

- the Project URL;
- the publishable key (older dashboards call this the `anon` public key).

Never copy the `service_role` or secret key into ProxyPoker. It is unnecessary and must remain private.

## 5. Add the values to Render

In the `silas-poker` Render web service, open **Environment** and add:

```text
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
```

Save the changes. Render should redeploy automatically. If it does not, use **Manual Deploy → Deploy latest commit** after the account branch has been merged into `master`.

## 6. Verify the feature

1. Open ProxyPoker in a private/incognito window.
2. Confirm **Save progress** appears in the header.
3. Enter your email and request a sign-in link.
4. Follow the email link back to ProxyPoker.
5. Complete one solo hand and one guided hand.
6. Open **My progress** and confirm the saved totals and recent hand appear.
7. Sign out and confirm Guest play still works.

Supabase's built-in email service is intended for testing and currently has a very low project-wide sending limit. That is enough to prove the system works. If other people eventually use accounts, configure a custom SMTP provider in Supabase rather than debugging mysteriously missing emails for sport.

## What is public and what is private

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are intentionally public browser configuration. Security comes from Row Level Security, not from hiding the anon key.

The database password, service-role key, email-provider credentials, and any other Supabase secret must never appear in GitHub or client-side JavaScript.

Saved statistics are personal history, not a tamper-proof competitive record. They are written by the browser and protected from other users by Row Level Security, but a determined player can falsify their own rows. If ProxyPoker ever grows public leaderboards or prizes, hand results should instead be written by the trusted game server.
