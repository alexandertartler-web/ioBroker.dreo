"use strict";

if (vis.editMode) {
    $.extend(true, systemDictionary, {
        "oid": { en: "Dreo object", de: "Dreo Objekt" },
        "title": { en: "Title", de: "Titel" },
        "unit": { en: "Temperature unit", de: "Temperatureinheit" },
        "showControls": { en: "Show controls", de: "Steuerung anzeigen" },
        "accent": { en: "Accent color", de: "Akzentfarbe" }
    });
}

vis.binds.dreo = {
    version: "0.0.12",

    heater: function (widgetID, view, data) {
        var $widget = $("#" + widgetID);
        if (!$widget.length) {
            return setTimeout(function () {
                vis.binds.dreo.heater(widgetID, view, data);
            }, 100);
        }

        var base = vis.binds.dreo.getDeviceBase(data.oid);
        var fields = {
            name: base + ".info.name",
            model: base + ".info.model",
            online: base + ".info.online",
            power: base + ".status.power",
            currentTemperature: base + ".status.currentTemperature",
            targetTemperature: base + ".status.targetTemperature",
            mode: base + ".status.mode",
            fanSpeed: base + ".status.fanSpeed",
            timer: base + ".status.timer"
        };

        function value(oid) {
            return vis.states && vis.states[oid + ".val"];
        }

        function setField(name, val) {
            if (val === null || val === undefined || val === "") {
                val = "-";
            }
            $widget.find('[data-dreo-field="' + name + '"]').text(String(val));
        }

        function update() {
            setField("name", value(fields.name));
            setField("model", value(fields.model));
            setField("online", value(fields.online));
            setField("power", value(fields.power));
            setField("currentTemperature", value(fields.currentTemperature));
            setField("targetTemperature", value(fields.targetTemperature));
            setField("mode", value(fields.mode));
            setField("fanSpeed", value(fields.fanSpeed));
            setField("timer", value(fields.timer));
        }

        Object.keys(fields).forEach(function (key) {
            var oid = fields[key];
            if (oid && vis.states && vis.states.bind) {
                vis.states.bind(oid + ".val", update);
            }
        });

        $widget.off("click.dreo").on("click.dreo", "[data-dreo-action]", function () {
            if (!base) return;
            var action = $(this).attr("data-dreo-action");
            var currentTarget = parseFloat(value(base + ".control.targetTemperature"));
            if (!isFinite(currentTarget)) {
                currentTarget = parseFloat(value(fields.targetTemperature));
            }

            if (action === "power-on") return vis.setValue(base + ".control.power", true);
            if (action === "power-off") return vis.setValue(base + ".control.power", false);
            if (action === "mode-hotair") return vis.setValue(base + ".control.mode", "hotair");
            if (action === "mode-eco") return vis.setValue(base + ".control.mode", "eco");
            if (action === "level-1") return vis.setValue(base + ".control.fanSpeed", 1);
            if (action === "level-2") return vis.setValue(base + ".control.fanSpeed", 2);
            if (action === "level-3") return vis.setValue(base + ".control.fanSpeed", 3);
            if (action === "oscillation") return vis.setValue(base + ".control.oscillation", true);
            if (action === "temp-down" && isFinite(currentTarget)) return vis.setValue(base + ".control.targetTemperature", Math.round((currentTarget - 1) * 10) / 10);
            if (action === "temp-up" && isFinite(currentTarget)) return vis.setValue(base + ".control.targetTemperature", Math.round((currentTarget + 1) * 10) / 10);
        });

        update();
    },

    getDeviceBase: function (oid) {
        if (!oid) return "";
        var match = String(oid).match(/^(dreo\.\d+\.devices\.[^.]+)(?:\..*)?$/);
        return match ? match[1] : String(oid).replace(/\.(info|status|control)\..*$/, "");
    }
};
