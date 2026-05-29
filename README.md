# ioBroker.dreo

Native ioBroker adapter for Dreo smart devices. The first supported device family is Dreo heaters / space heaters.

This adapter does **not** use Python, Home Assistant, or a subprocess bridge. The Dreo Cloud API logic was ported to TypeScript from the public Python projects `hass-dreo`, `pydreo-client`, and `hass-dreoverse`.

## Current Scope

- Login against Dreo Cloud with email/password
- MD5 password preparation as used by the Dreo Open API client
- Token region detection for US/EU API endpoints
- Device list retrieval
- Device state polling
- State writes mapped to Dreo Cloud control commands
- Retry/backoff for cloud and authentication errors
- Unknown devices remain visible with `info.rawData`
- No passwords or full access tokens are logged

## Dreo API Mapping

The current cloud implementation uses:

- Login: `POST https://open-api-us.dreo-tech.com/api/oauth/login`
- Devices: `GET /api/v2/device/list`
- State: `GET /api/v2/device/state?deviceSn=...`
- Control: `POST /api/v2/device/control`

Commands are sent as:

```json
{
  "devicesn": "DEVICE_SN",
  "desired": {
    "poweron": true
  }
}
```

Heater command keys ported from the Python projects:

- `poweron` for power
- `temperature` for current temperature
- `ecolevel` for target temperature
- `mode` for `coolair`, `hotair`, `eco`, `off`
- `htalevel` for heat level / exposed as `fanSpeed`
- `oscon`, `oscangle`, `oscmode` for oscillation variants
- `timeron`, `timeroff` for timer values

Where firmware behavior is unclear, the TypeScript code contains TODO comments and keeps debug/raw payloads available.

## ioBroker States

Devices are created under:

```text
dreo.0.devices.<deviceId>
```

Per device:

```text
info.name
info.model
info.deviceId
info.online
info.rawData
status.power
status.currentTemperature
status.targetTemperature
status.mode
status.fanSpeed
status.oscillation
status.timer
control.power
control.targetTemperature
control.mode
control.fanSpeed
control.oscillation
```

Unknown devices still get `info.*`, `status.power`, `control.power`, and complete `info.rawData`.

## Admin Config

- `email`: Dreo account email
- `password`: Dreo account password, stored via ioBroker encrypted native config
- `pollingInterval`: seconds between cloud polls, minimum 15
- `deviceFilter`: optional comma-separated device serial numbers, device IDs, names, or models
- `debugMode`: verbose adapter-side API/debug logging without secrets

## Installation in `/opt/iobroker`

Copy or clone this folder to the ioBroker host, then run:

```bash
cd /opt/iobroker
npm install /path/to/iobroker.dreo
iobroker upload dreo
iobroker add dreo
```

For local development directly from the adapter folder:

```bash
cd /path/to/iobroker.dreo
npm install
npm run build
cd /opt/iobroker
npm install /path/to/iobroker.dreo
iobroker upload dreo
iobroker add dreo
```

Then open the adapter instance config in ioBroker Admin, enter Dreo credentials, and start the instance.

## Custom ioBroker Repository

For update detection during development, add this custom repository URL in ioBroker Admin:

```text
https://raw.githubusercontent.com/alexandertartler-web/iobroker.dreo/main/repository.json
```

After every released version bump, ioBroker can compare the installed adapter version with the version from this custom repository. If the Admin page still shows the old version, reload the repository list or restart Admin.

## Test Anleitung

Build check:

```bash
npm install
npm test
```

ioBroker runtime test:

```bash
cd /opt/iobroker
iobroker logs dreo.0
iobroker start dreo.0
```

Expected results:

- `info.connection` becomes `true`
- device objects appear under `dreo.0.devices.*`
- `status.*` states update after each poll
- writing `control.power`, `control.targetTemperature`, `control.mode`, `control.fanSpeed`, or `control.oscillation` sends a cloud command and then refreshes state

## Debug Hints

Enable `debugMode` in the adapter config and set the instance log level to `debug`.

Useful checks:

```bash
iobroker logs dreo.0 --watch
iobroker object get dreo.0.devices.<id>.info.rawData
iobroker state get dreo.0.info.connection
```

If commands do not affect a device, inspect `info.rawData` and debug logs. Dreo firmware variants may expose oscillation as `oscon`, `oscangle`, or `oscmode`; the adapter chooses the visible property first and falls back to `oscon`.

## Project Structure

```text
admin/jsonConfig.json
io-package.json
package.json
README.md
src/main.ts
src/lib/DreoClient.ts
src/lib/DreoDevice.ts
src/lib/DreoHeater.ts
tsconfig.json
```

## Notes

Dreo does not provide a public official API. This adapter uses behavior discovered by community Python integrations and should be tested carefully with real devices.
