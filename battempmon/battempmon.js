/**
 * Author: Jaunius Kapkan
 * - What is this: OVMS Script to notify if battery temperature drops below certain thershold
 * - How to set up:
 *   1. Save this file as: 
 *   2. /store/scripts/lib/battempmon.js
 *   3. Add below two lines to: /store/scripts/ovmsmain.js
 *       batTempMon = require("lib/battempmon")
 *   4. run "script reload" in console or reboot module
 *   5. (Optional) Temperature thersholds can be ajusted by changing bellow config:
 *            OVMS# config list usr
 *                battempmon.lower: -15
 *                battempmon.upper: 35
 *      For Example to set lowe threshold to -10 run:
 *            config set usr battempmon.lower -10
 * - How it works: Each 10 seoconds the Script measures if temperature for lower/upper thresholds 
 *                 has changed since last measure and if thersholds are breached sends a notification.
 */



var mainEventName = "usr.battempmon."

var defaultTempUpper = 35
var defaultTempLower = -15

var lastlowerBatTemp = 999
var lastupperBatTemp = lastlowerBatTemp

if (OvmsConfig.Get('usr','battempmon.upper','none') == 'none') {
    OvmsConfig.Set('usr','battempmon.upper',defaultTempUpper)
}

if (OvmsConfig.Get('usr','battempmon.lower','none') == 'none') {
    OvmsConfig.Set('usr','battempmon.lower',defaultTempLower)
}

function startRunning() {
    OvmsEvents.Raise(mainEventName + 'status.enabled')

    function triggerCheck() {
        try {
            OvmsEvents.Raise(mainEventName + 'heartbeat')
            
            var currentBatTemp = OvmsMetrics.AsFloat('v.b.temp')
            var upperLimit = parseFloat(OvmsConfig.Get('usr','battempmon.upper'))
            var lowerLimit = parseFloat(OvmsConfig.Get('usr','battempmon.lower'))

            if (OvmsMetrics.AsFloat('v.b.temp') >= upperLimit && lastupperBatTemp != currentBatTemp) {
                OvmsNotify.Raise('info',mainEventName,'Battery Temp. Above Threshold (' + upperLimit + '). Now: ' + currentBatTemp)
                lastupperBatTemp = currentBatTemp

            }

            if (OvmsMetrics.AsFloat('v.b.temp') <= lowerLimit && lastlowerBatTemp != currentBatTemp) {
                OvmsNotify.Raise('info',mainEventName,'Battery Temp. Below Threshold (' + lowerLimit + '). Now: ' + currentBatTemp)
                lastlowerBatTemp = currentBatTemp
            }

        }
        catch (err) {
            print("ERROR: Script " + mainEventName + " Failed! ")
        }
    }

    PubSub.subscribe("ticker.10", triggerCheck)
        
}
print(mainEventName + " Script Loaded!")
startRunning()

