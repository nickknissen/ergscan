# Private sync

[← Back to README](../README.md)

Private sync keeps the same workout history on your phone, tablet and
computer. History is end-to-end encrypted on your device before it is sent,
so the server only stores data it cannot read.

Sync is available on deployments that run the sync server. If **Settings**
has no **Private sync** section, the deployment you use does not offer it. To
run your own, see [Self-hosting](self-hosting.md).

## Turn on sync

1. On the device that has your workout history, open **Settings → Private
   sync** and choose **Enable sync**.
2. Save the **recovery key** it shows, or choose **Download recovery key**.
   You need it if you lose access to all your linked devices. Anyone with the
   key can access your synced history, so keep it private.

## Link another device

1. On the new device, open **Settings → Private sync** and choose **Link this
   device**. It shows a QR code and a pairing code, valid for five minutes.
2. On a device that already syncs, open **Settings → Private sync**. Paste
   the pairing code, or choose **Photograph or choose a pairing QR code** and
   take a picture of the QR code.
3. Choose **Approve new device**. The new device finishes linking on its own.

Choose **Show linked devices** to see every linked device and remove ones you
no longer use.

## Recover your history

If you have lost every linked device, open **Settings → Private sync** on a
new device, enter your recovery key and choose **Recover history**. Recovery
only works with the same sync deployment.

## Disconnect or delete

- **Disconnect this device** stops syncing on this device. Its workouts stay
  here, and the synced history stays available on your other devices.
- **Delete synced history** permanently removes the history from the sync
  server and disconnects all devices. Each device keeps its local copy.

## What is synced

Sync sends an encrypted snapshot of saved history, including workout notes,
splits, and heart rate when recorded. Photos, raw OCR output, drafts, and
settings stay local. The server handles device credentials and can observe
request timing and encrypted payload size. Browser storage and the app code
served by the deployment are trusted by linked devices.

## When sync runs

Workouts always save locally first. Sync runs when the device is online and
the app is open; the sync status in Settings shows any changes still waiting.
If two devices edit the same workout before syncing, both versions are kept
and the copy is marked in the history list.

The server accepts encrypted history of up to 8 MiB. Past this limit, ErgScan
keeps saving locally and shows the pending sync state.
