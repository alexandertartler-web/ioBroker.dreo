# Dreo VIS Template

This folder contains importable ioBroker VIS widgets for the Dreo adapter.

## Import

1. Open `vis/dreo-heater-widget.json`.
2. Replace every occurrence of:

   ```text
   __DREO_DEVICE__
   ```

   with your device path, for example:

   ```text
   dreo.0.devices.1750440073669701634-91c0b924c154490b_001_0000000000b
   ```

3. Open VIS editor.
4. Select the target view.
5. Use **Widgets importieren** and paste the JSON content.

The template uses only the built-in `basic` HTML widget.
