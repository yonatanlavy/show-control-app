# iPhone music helper

Android uses a bundled, checksum-verified on-device yt-dlp runtime. iPhone uses this optional computer helper. Completed audio is transferred to the phone and passes the normal local import/probe/hash checks. Playback then works offline without the computer.

Install Python 3.10+, yt-dlp and FFmpeg on your computer. Install yt-dlp with:

    python -m pip install -U "yt-dlp[default]"

On Windows, launch with your installed executable paths:

    .\Start-MusicHelper.ps1 -ListenAddress 192.168.1.20 -PythonPath C:\Python313\python.exe -FfmpegPath C:\path\to\ffmpeg.exe

Replace the listen address with your computer's private LAN address. The default binds only to loopback. Keep both devices on the same trusted private network. If Windows prompts, allow Python for that private network. In **More → Downloads → iPhone download helper**, enter **http://192.168.1.20:8765** and the pairing code printed in your terminal. Save, then test the connection. HTTPS is supported with the server's --cert and --key flags and a certificate trusted by your phone.

The code is kept in the helper's per-user application-data directory and the phone's device-only secure storage. It is excluded from backups. HTTP pairing is intended for a trusted private network; use trusted HTTPS for other network arrangements. Re-pair after moving to another phone or restoring a backup. Do not publicly port-forward this listener.

The API requires the pairing bearer, rejects browser-origin requests, uses fixed UUID directories, one preparation job, a 500 MB job limit and a 20-minute deadline. It accepts public HTTPS sources only. A loopback HTTPS proxy checks all extractor connections/redirect destinations and connects to the exact validated public addresses. No shell, executable provider output, arbitrary output paths, cookies, DRM removal or account-login interface is exposed.

Cancel kills the preparation process tree. Completed but unassigned phone files remain available to attach or remove. Computer job files remain until acknowledged/deleted; stop the helper when finished and review its per-user storage if the phone was reset before acknowledgement.

Run the offline tests with **python test_server.py**. Physical iPhone transfer/background validation still requires an iOS build.
