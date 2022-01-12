/**
 * /store/scripts/lib/heatassist.js
 * 
 * Module plugin:
 *  Heating assist module for controlling external heating element based on vehicle climate control metrics.
 *  This versionof the script is event based, meaning that you need to setup another script in events dir to run it repeatedley.
 * 
 * Version 1.1.2   Jaunius Kapkan <jaunius@gmx.com>
 * 
 * Enable:
 *  - install at above path
 *  - add to /store/scripts/ovmsmain.js:
 *        heatAssist = require("lib/heatassist")
 *        heatAssist.startAssist()
 *  - As a percaution I recommend adding additional control to turn off heating when vehicle is turned off (use revelvant egpio on/off comamnd if you don't use ext12v):
 *      - add to /store/events/vehicle.off/ext12v
 *            power ext12v off
 *  - script reload
 * 
 * Config:
 *  - assistOffset - sets the offset from the vehicel temperatarue setpoint at which to activate heating.
 *  - I recommend subscribing to ticker.1 (default) or ticker.10 , this will in turn run the script each 1 or 10 seconds.
 * 
 * Usage:
 *  - Script will run automatically after boot each n seconds as configured above. (Use ticker 1 or 10 for now, due to Duktape issue: 474)
 *  - Heating activation offset can be set with assistOffset variable.
 *  - If your ext12v port is occupied you can change extPowerON to portON function to control egpio
 *    ports (additional hardware required to control 12V relays).
 */


enablePlugin = exports.startAssist = function() {

    var mainEventName = "usr.heatassist."
    var assistOffset = 3
    var min12BatV = 12.3
    var heartbeatLogInterval = 10
    var customWarmUpInterval = 30
    var customResumeInterval = 60

    function contains(item,string) {
        if (item.indexOf(string) > -1) {
            return true
        }
        else {
            return false
        }
    }

    function loadConfig(cmd) {
        var cmdResponse = OvmsCommand.Exec(cmd)
        var configList = cmdResponse.split("\n")
        return configList
    }

    function metricStatus(cmd,customMatch) {
        var metricResponse = loadConfig(cmd)
        if (customMatch != undefined) {
            var matchstring = customMatch
        }
        else {
            var matchstring = / yes/g
        }
        var metricValue = metricResponse[0].match(matchstring)
        if (metricValue) {
            return true
        }
        else {
            return false
        }
    }

    function checkTempDiff(realMetric,setpointMetric,offsetDeg) {
        var setfloat = OvmsMetrics.AsFloat(setpointMetric)
        var defaultSetfloat = 21 // In case no metric available
        if (setfloat == 0) {
            setfloat = defaultSetfloat
        }
        var realfloat = OvmsMetrics.AsFloat(realMetric)
        var cutofffloat = setfloat - offsetDeg
        if (cutofffloat > realfloat) {
            return true
        }
        else {
            return false
        }
    }

    function portON(state) {
        if (state) {
            cmdStatus = loadConfig("egpio output 1 1")
            if (contains(cmdStatus[0],"EGPIO")) {
                print("Success! Port ON")
                return true
            }
            else {
                print("Port ON Command Failed")
                return false
            }
        }
        else {
            cmdStatus = loadConfig("egpio output 1 0")
            if (contains(cmdStatus[0],"EGPIO")) {
                print("Success! Port OFF")
                return true
            }
            else {
                print("Port OFF Command Failed")
                return false
            }
        }
        }

    function extPowerON(state) {
    if (state) {
        cmdStatus = loadConfig("power ext12v on")
        if (contains(cmdStatus[0],"now")) {
            print("Success! 12V Power ON")
            return true
        }
        else {
            print("12V Power ON Command Failed")
            return false
        }
    }
    else {
        cmdStatus = loadConfig("power ext12v off")
        if (contains(cmdStatus[0],"now")) {
            print("Success! 12V Power OFF")
            return true
        }
        else {
            print("12V Power OFF Command Failed")
            return false
        }
    }
    }

    function setAssistStatus(state) {
        var asistStatus = "off"
        if (state) {
            asistStatus = "on"
        }
        OvmsConfig.Set("vehicle", "heatassist.heating", asistStatus)
        OvmsEvents.Raise(mainEventName + 'heating.' + asistStatus)

    }

    function assistKeeper() {
        OvmsEvents.Raise(mainEventName + 'status.enabled')
        var heartbeatCounter = 0
        var warmUpCounter = 0
        var resumeCounter = 0
        var chargingBefore = false
        function assistEngage() {
            heartbeatCounter += 1

            if (OvmsConfig.Get("vehicle", "heatassist.warmupfix") == "on" &&
                OvmsMetrics.Value('v.c.charging') &&
                chargingBefore
            ) {
                if (OvmsMetrics.Value('v.e.heating')) {
                    warmUpCounter += 1
                }
                if (!OvmsMetrics.Value('v.e.heating')) {
                    resumeCounter += 1
                }
            }
            
            try {
                if (heartbeatCounter >= heartbeatLogInterval) {
                    OvmsEvents.Raise(mainEventName + 'heartbeat.x' + heartbeatLogInterval)
                    heartbeatCounter = 0
                    if (!OvmsMetrics.Value('v.e.heating') &&
                        OvmsMetrics.Value('v.c.charging') 
                    ) {
                      chargingBefore = true
                    }
                    else if (!OvmsMetrics.Value('v.e.heating') &&
                            !OvmsMetrics.Value('v.c.charging') 
                            ) {
                              chargingBefore = false
                            }
                }

                if (OvmsConfig.Get("vehicle", "heatassist.warmupfix") == "on" &&
                    OvmsMetrics.Value('v.c.charging')  &&
                    chargingBefore
                ) {
                    if (warmUpCounter >= customWarmUpInterval && 
                        OvmsMetrics.Value('v.e.heating')
                        ) {
                            OvmsCommand.Exec("climatecontrol off")
                            warmUpCounter = 0
                    }
                    if (resumeCounter >= customResumeInterval && 
                        !OvmsMetrics.Value('v.e.heating')
                        ) {
                            OvmsCommand.Exec("climatecontrol on")
                            resumeCounter = 0
                    }
                }
                
                
                var assistOn = metricStatus('power ext12v status',/ on/g)

                if (
                    OvmsMetrics.Value('v.c.charging') &&
                    OvmsConfig.Get("vehicle", "heatassist.warmupfix") == "on" &&
                    OvmsMetrics.AsFloat('v.b.12v.voltage') > min12BatV &&
                    checkTempDiff("v.e.cabintemp","v.e.cabinsetpoint",assistOffset)
                ) {
                    if (!assistOn) {
                        var switchStatus = extPowerON(true)
                        if (switchStatus) {
                            assistOn = true
                            setAssistStatus(assistOn)
                        }
                    }
                }
                else if (
                    OvmsMetrics.Value('v.e.charging12v') &&
                    OvmsConfig.Get("vehicle", "heatassist.forced") == "on" &&
                    checkTempDiff("v.e.cabintemp","v.e.cabinsetpoint",assistOffset)
                ) {
                    if (!assistOn) {
                        var switchStatus = extPowerON(true)
                        if (switchStatus) {
                            assistOn = true
                            setAssistStatus(assistOn)
                        }
                    }
                }
                else {
                    if ((OvmsMetrics.AsFloat('v.b.12v.voltage') > min12BatV) && OvmsMetrics.Value('v.e.heating') && (checkTempDiff("v.e.cabintemp","v.e.cabinsetpoint",assistOffset))) {
                        if (!assistOn) {
                            var switchStatus = extPowerON(true)
                            if (switchStatus) {
                                assistOn = true
                                setAssistStatus(assistOn)
                            }
                        }
                        
                    }
                    else if (assistOn) {
                        var switchStatus = extPowerON(false)
                        if (switchStatus) {
                            assistOn = false
                            setAssistStatus(assistOn)
                        }
                    }
                }
                
                // print("waiting...")
            }
            catch (jsError) {
                print(mainEventName + ": Error Detected!")
                print(jsError)
            }
        }
        
        PubSub.subscribe("ticker.1", assistEngage)
        // PubSub.subscribe(mainEventName + "heartbeat", assistEngage) // swithced to ticker subscription due to OVMS Issue: 474
        // OvmsEvents.Raise(mainEventName + "heartbeat", checkIntervalMs)

    }
    print("Heat Assist Script Loaded!")
    assistKeeper()
}

enablePlugin()