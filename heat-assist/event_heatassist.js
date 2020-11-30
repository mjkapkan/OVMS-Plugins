/**
 * /store/scripts/lib/event_heatassist.js
 * 
 * Module plugin:
 *  Heating assist module for controlling external heating element based on vehicle climate control metrics.
 *  This versionof the script is event based, meaning that you need to setup another script in events dir to run it repeatedley.
 * 
 * Version 0.9.5 (event based)   Jaunius Kapkan <jaunius@gmx.com>
 * 
 * Enable:
 *  - install at above path
 *  - add to /store/scripts/ovmsmain.js:
 *        evtHeatAssist = require("lib/event_heatassist")
 *  - add to /store/events/ticker.1/heatassist_hb.js (or /store/events/ticker.10/heatassist_hb.js) :
 *        evtHeatAssist.assistEngage()
 *  - script reload
 * 
 * Config:
 *  - assistOffset - sets the offset from the vehicel temperatarue setpoint at which to activate heating.
 *  - I recommend subscribing to ticker.1 or ticker.10 , this will in turn run the script each 1 or 10 seconds.
 * 
 * Usage:
 *  - Script will run automatically after boot each n seconds as configured above.
 *  - Heating activation offset can be set with assistOffset variable.
 *  - If your ext12v port is occupied you can change extPowerON to portON function to control egpio
 *    ports (additional hardware required to control 12V relays).
 */

var mainEventName = "usr.heatassist."
var assistOffset = 6
var min12BatV = 12.3

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
    OvmsCommand.Exec("config set vehicle heatasist.heating " + asistStatus)
    OvmsEvents.Raise(mainEventName + 'heating.' + asistStatus)

}

exports.assistEngage = function() {
    try {
        var assistOn = metricStatus('power ext12v status',/ on/g)
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
        // print("waiting...")
    }
    catch (jsError) {
        print(mainEventName + ": Error Detected!")
        print(jsError)
    }
}
