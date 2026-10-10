# Install Storm Intelligence 2.4.1

This download contains the current 2.4.1 plugin for an existing Signal K Server:
radar acquisition, vessel-relative storm inference, chart overlays and the
read-only operational WebApp. EUMETSAT/RDT research is excluded. The plugin is
disabled until you enable it.

## Requirements

- A working Signal K Server and access to its Admin UI.
- Node.js 20 or newer and npm on the machine running Signal K.
- Internet access to install npm dependencies and acquire weather data. This
  package is not a fully offline installer.
- A writable Signal K configuration directory and space for weather caches.
- Own-vessel position for vessel-relative results; SOG and true COG improve
  approach estimates. Provider coverage and freshness still matter.

Freeboard-SK is optional and recommended for map overlays; install it separately
through Signal K's Appstore. Default inference needs no API key. Experimental
DNN and remote LLM algorithms are disabled by default.

The `sharp` image dependency contains native code. Install on the target device
so npm selects platform-specific dependencies; do not copy `node_modules` from
another computer.

## Install the downloaded tarball

1. Copy `signalk-storm-intelligence-2.4.1.tgz` to the computer running Signal K.
   Unzip the sharing ZIP first, if used. On Linux, verify from that folder:

   ```bash
   sha256sum -c SHA256SUMS
   ```

2. Open a terminal as the operating-system user running Signal K. Locate its
   configuration directory: usually `~/.signalk`, but service/container setups
   can use another directory. Back up existing configuration before upgrading.

3. Install locally into that directory. For the usual default:

   ```bash
   node --version
   npm --version
   cd ~/.signalk
   npm install --save --omit=dev /absolute/path/signalk-storm-intelligence-2.4.1.tgz
   npm ls signalk-storm-intelligence --depth=0
   ```

   Replace `/absolute/path/` with the download location. The final command should
   show `signalk-storm-intelligence@2.4.1`. Do not use `-g`. Use the configuration
   directory owner's permissions. For Docker, run inside the container against
   its persisted configuration directory; mount the download so it is visible.

4. Restart Signal K through the Admin UI or normal service/container controls.
5. Open **Server → Plugin Config → Storm Intelligence**, enable it, review
   settings and save. Restart again if requested.

See Signal K's [server guide](https://github.com/SignalK/signalk-server/blob/master/README.md)
for plugin configuration and restarts. This tarball installs directly without
requiring a new npm/Appstore publication.

## First configuration and checks

Choose radar providers/products for your operating area. Review display layers,
acquisition targets and ordered storm sources together in Plugin Config. A
visible layer does not by itself establish storm-inference support. Keep the
deterministic inference defaults initially; review warning/alarm thresholds and
archive/prefetch retention. Large prefetch areas/high zooms consume bandwidth
and storage. Remote LLM credentials, if later enabled, use environment variables.

- Open **Storm Intelligence** from Signal K's Webapps list. Check runtime health,
  provider status and observation timestamps after an acquisition cycle.
- Confirm current own-vessel position and inspect SOG/COG availability.
- In Freeboard-SK, look for Storm Intelligence chart layers and Plotter Extension.
  Inspect timestamps and coverage as well as the rendered map.
- Check **Server → Server Log** if the plugin is missing or reports errors.

The installed package includes `docs/configuration.md`, `docs/freeboard-sk.md`
and `docs/operational-webapp.md`. No detected cells does not prove safe weather;
assess unavailable/stale evidence through provider/runtime status.

This is decision-support software, not an official warning service or marine
radar replacement. Risk scores are heuristics, not calibrated probabilities.
The plugin does not steer the vessel or control autopilot.

## Upgrade, rollback and removal

Repeat the tarball install with the intended version and restart. Keep the
previous tarball and configuration backup for rollback; reinstall it and restore
compatible settings if necessary. Existing settings remain in Signal K's
configuration directory.

To stop the plugin, disable it in Plugin Config. To remove it, run from the same
configuration directory and restart afterwards:

```bash
npm uninstall signalk-storm-intelligence
```

Retained settings and archives may remain. Inspect configured storage locations
before deleting data.

## Sharing

Share the ZIP, or the tarball with `INSTALL.md`, `SHA256SUMS` and `RELEASE.json`.
The plugin includes its Apache-2.0 licence. Dependencies and upstream weather
data retain their own terms. The bundle contains no vessel settings, credentials
or acquired weather archives.
