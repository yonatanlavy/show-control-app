# Remote setup and compatibility

The Controllers hub is under **More → Controllers**. Local control is free and offline. Pair generic remotes in the phone's Bluetooth settings, choose the correct mode, learn custom buttons, and run the silent ten-press test. Flic pairs inside Show Control; its first pairing may require internet.

Compatibility follows the input protocol, not the product's Bluetooth logo. These are researched setup examples, **not certified hardware**. No named remote has passed physical-device verification in this workspace.

| Input path | Examples and official source | Setup and limits |
| --- | --- | --- |
| System media / AVRCP | [Satechi R2 manual](https://support.satechi.com/hc/en-us/articles/53357895713179-User-Manual-R2-Bluetooth-Multimedia-Remote-Control-ST-BTMR2M), standard media buttons on remotes and headphones | Use multimedia mode; R2 uses M. Next → contextual GO, play/pause → pause/resume, previous → silent selection, stop → immediate stop. Supported system media controls use the native media session when locked/backgrounded. The OS exposes a shared media identity, so overrides apply across media remotes/headphones. Volume stays with the OS. |
| Keyboard pedal / HID | [AirTurn manuals](https://www.airturn.com/blogs/support/airturn-manuals), [PageFlip Firefly](https://www.pageflip.com/products/firefly) | Use keyboard modes: arrows, Page Up/Down or Space/Enter. Learn each button; keep Show Control open. AirDirect, MIDI and mouse modes are separate protocols. AirTurn's [iOS notice](https://www.airturn.com/pages/ios-26-status) recommends iOS 26.4 for its BT200 issue; recheck exact device/OS/firmware before a show. |
| Bluetooth presenter / HID | [Logitech R500 mobile compatibility](https://www.logitech.com/content/dam/logitech/en/business/pdf/r500-laser-presentation-remote-data-sheet.pdf), [Spotlight Plus basic mobile navigation](https://www.logitech.com/assets/65212/spotlight-plus-b2b-datasheet.ENG.pdf) | Use Bluetooth keyboard/navigation mode and learn Next/Back. Desktop pointer effects, laser functionality and USB-only receivers do not become show commands. Keyboard delivery requires the app in the foreground. |
| Native Flic 2 | [Official Flic developer assets](https://github.com/50ButtonsEach/flic2-documentation/blob/master/README.md) | Pair in the hub; assign separate buttons for GO and panic. Android has its native SDK adapter and service lifecycle. iOS requires the licensed XCFramework described in the module's Vendor README. Real buttons, battery/range/reconnect and background delivery remain unverified. Flic Duo/Twist are not certified by a Flic 2 implementation. |
| Custom Bluetooth remote | Bluetooth HID keyboard or standard media/AVRCP commands | Send a single distinct key-down and key-up per button, or a supported media command. The app learns adapter/device/input identity. On iOS keyboards are coalesced into one system identity. USB HID also requires a compatible OS/device adapter. Proprietary BLE characteristics, serial/SPP, camera-volume clickers, mouse-only inputs and MIDI require other integrations. |

Sources checked on 14 October 2026. Vendor mobile compatibility is evidence of a protocol/setup option, not evidence that Show Control passed that hardware's lifecycle matrix.

## Learning, testing and recovery

Generic keyboard shortcuts pause while a native text editor is focused, including search and sensitive fields. Finish editing and release held keys before using ordinary show shortcuts again. A held typing key cannot become GO merely because focus leaves the field. Assigned panic/stop remain eligible; supported media and Flic controls retain separate native paths. Explicit silent diagnostics can still learn/test a fresh key. Suppressed typed keys do not enter controller history. [Evidence and limits](keyboard-text-safety-2026-10-25.md) distinguish native policy/callback fixtures from installed tests, iOS compilation and exact physical HID delivery.

Choose an action, press a button and explicitly save it. A replacement warning appears before overwriting another action. Mapping removal requires confirmation. Profiles are scoped to a show, support up to 256 bindings and require distinct GO/panic inputs before being attached as a complete controller profile. Media defaults remain available without a custom profile.

Learning and testing use a native, silent media session and cannot begin with an armed snapshot. Tests count only fresh mapped presses, show each resolved action and identify unmapped buttons. A receipt confirms input reached this app; it does not confirm remote-side feedback, audible playback, range or every action's coverage. A native buffer bounds diagnostic history to 128 presses; restart testing for a fresh sample.

Release events, held repeats, bounce within 80 ms, queued reconnect events, expired setup sessions and duplicate event delivery do not count. Setup ends on background, navigation away, preparation or bridge teardown. Panic/stop invalidate pending controller commands; a new native preparation cannot receive a previous run's queued button action. Touch panic and immediate stop remain available during an armed show.

If no signal arrives, check the battery, pairing and selected mode. Keep the app open for keyboard delivery. Another active player can own media controls; close it and retry. Grant nearby-device permission for Flic on Android; generic HID/media remotes pair through the system menu. Rehearse on the exact phone/OS/remote/firmware/output route, including disconnect/reconnect, locks, distance and RF load. Force-quit/relaunch never promises continued playback or automatic audible recovery.

[Capture lifecycle evidence](controller-capture-lifecycle-2026-10-25.md) tracks rapid stop/background/foreground capture changes separately from pairing. A queued old cleanup must not remove a newer capture, and listening health is reported only after attachment. This guard does not expand foreground keyboard support into locked/background HID support; media and Flic retain their independent contracts and hardware gates.

## Release evidence required

Android's system pairing/permission activity may temporarily pause Show Control. That pause ends silent diagnostics but does not abort an ongoing Flic scan. Pairing is cancelled explicitly, on leaving the hub or module teardown, or after its 90-second timeout. A cancelled permission request cannot later start a scan after navigation away.

Both physical Android and iOS matrices remain required. Verify wired/Bluetooth audio routes, named remotes, Flic firmware/SDK, permission denial, lock/background behavior, battery/range, held/rapid input, interruptions and manual fallback. Windows cannot run Xcode/iOS device validation. See [remote verification](remote-control-verification.md) for the actual automated and emulator evidence.
