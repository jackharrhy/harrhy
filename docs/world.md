# World

World connects a Burger-style overview, Maps-authored rooms with Gurgur movement, and activities such as Pool in one player session. Identity, location, permissions, and possessions remain coherent when controls or camera modes change.

The first integrated slice is a walkable overview, one authored room, and a playable pool table. Enter, play, and return without switching accounts or products. Use the slice to settle stable location and object IDs, live versus built edits, and which system owns persistent state. Keep the existing products and their data usable; a common engine or wire format is not a prerequisite.

Author the overview in Burger’s Atlas and interiors in Worldview’s Valve 220 editor. Keep the formats separate and give their outputs stable connections. Improve room-authoring ergonomics where they block the slice.

## Optional cinema room

Let eligible players browse a bounded Jellyfin catalogue in an authored room or an accessible search view. Playback stays in Jellyfin; World remembers the return location. Jellyfin retains its own sign-in and playback rights. Preserve item IDs, keep library credentials server-side, and don’t copy videos or create a second catalogue database.

A World login alone does not grant cinema access. Check an explicit, reviewable media entitlement on the server for room admission, catalogue, artwork, and connections. Deny missing or inactive grants and settle revocation with the Auth owner before implementation. Cinema is optional and does not change the overview–room–pool slice.
