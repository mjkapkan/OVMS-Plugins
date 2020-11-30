/**
 * /store/scripts/lib/heatassist.js
 * 
 * Module plugin:
 *  Heating assist module for controlling external heating element based on vehicle climate control metrics.
 * 
 * Version 0.9.1   Jaunius Kapkan <jaunius@gmx.com>
 * 
 * Enable:
 *  - install at above path
 *  - add to /store/scripts/ovmsmain.js:
 *        heatAssist = require("lib/heatassist")
 *        heatAssist.startAssist()
 *  - As a percaution I recommend adding additional control to turn off heating when vehicle is turned off (use revelvant egpio on/off comamnd if you don't use ext12v):
 *      - add to /store/events/vehicle.on/ext12v
 *            power ext12v on
 *      - add to /store/events/vehicle.off/ext12v
 *            power ext12v off
 *  - script reload
 * 
 * Config:
 *  - assistOffset - sets the offset from the vehicel temperatarue setpoint at which to activate heating.
 *  - checkIntervalMs - sets the interval at which the vehicle metrics are checked and acted upon.
 * 
 * Usage:
 *  - Script will run automatically after boot each n seconds as specified in assistHbInterval variable.
 *  - Heating activation offset can be set with assistOffset variable.
 *  - If your ext12v port is occupied you can change extPowerON to portON function to control egpio
 *    ports (additional hardware required to control 12V relays).
 */

exports.startAssist = function() {

    var mainEventName = "usr.heatassist."
    var checkIntervalMs = 5000
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

    function getNumMetric(metricCmd) {
        var metricStr = loadConfig(metricCmd)[0].split(" ").slice(-1)[0]
        return parseFloat(metricStr)
    }

    function checkTempDiff(realMetric,setpointMetric,offsetDeg) {
        var setstr = loadConfig(setpointMetric)[0].split("°")[0].split(" ").slice(-1)[0]
        var realstr = loadConfig(realMetric)[0].split("°")[0].split(" ").slice(-1)[0]
        var setfloat = parseFloat(setstr)
        var realfloat = parseFloat(realstr)
        var cutofffloat = setfloat - offsetDeg
        if (cutofffloat > realfloat) {
            return true
        }
        else {
            return false
        }
    }

    function getNumMetric(metricCmd) {
        var metricStr = loadConfig(metricCmd)[0].split(" ").slice(-1)[0]
        return parseFloat(metricStr)
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
    
    function assistKeeper() {
        OvmsEvents.Raise(mainEventName + 'status.enabled')
        var assistOn = false
    
        function assistEngage() {
            OvmsEvents.Raise(mainEventName + "heartbeat", checkIntervalMs)

            if ((getNumMetric("metric list v.b.12v.voltage") > min12BatV) && metricStatus("metrics list v.e.heating") && (checkTempDiff("metrics list v.e.cabintemp","metrics list v.e.cabinsetpoint",assistOffset) || (metricStatus("me li v.e.cabinvent",/ screen/g) && !metricStatus("me li v.e.cabinvent",/feet/g)))) {
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
    
        PubSub.subscribe(mainEventName + "heartbeat", assistEngage)
        OvmsEvents.Raise(mainEventName + "heartbeat", checkIntervalMs)
            
    }
    print("Heat Assist Script Loaded!")
    assistKeeper()
}
