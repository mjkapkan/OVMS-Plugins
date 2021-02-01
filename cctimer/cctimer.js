/**
 * /store/scripts/lib/cctimer.js
 * 
 * Module plugin:
 *  Climate Control Timer module with Web Plugin for controlling the preheat function in addition to OEM timer.
 * 
 * Version 1.6.3   Jaunius Kapkan <jaunius@gmx.com>
 * 
 * Enable:
 *  - install at above path
 *  - add to /store/scripts/ovmsmain.js:
 *        ccTimer = require("lib/cctimer")
 *        ccTimer.ccTimerOn()
 *  - script reload
 * 
 * Config:
 *  - To be able to add/remove timers from GUI you need to install the fronted as plugin.
 * 
 * Usage:
 *  - Timers can be added in GUI or with a command in shell. For example, the following command will add a new 
 *    timer in enabled state that will be active from 7AM to 8AM on Monday and Wednesday:
 *      "config set vehicle.cctimer 1-0700-0800-13"
 *    timer in disabled state that will activate automatically depending on 
 *    environment and cabin temperature to be ready by 5:30PM every day:
 *      "config set vehicle.cctimer 1-auto-1730"
 * Behavior:
 *  - Script will check metrics for matching timers each 10 seconds as specified in checkIntervalMs variable 
 *    and then will activate the remote heating/cooling using climatecontrol command. 
 * NOTE: Never remove an active timer as the script will keep turning on the CC until you reboot the unit or reload js engine.
 */

exports.ccTimerOn = function() {
    // Now loaded from config:
    // var ccTimers = {
    //     'Evening1': {
    //         'Start': '16:45',
    //         'End': '17:00',
    //         'Enabled': true,
    //         'Weekdays': [6,7],
    //         'Charge': false
    //     },
    //     'Evening2': {
    //         'Start': 'auto',
    //         'End': '17:20',
    //         'Enabled': false,
    //         'Weekdays': [],
    //         'Charge': false
    //     } 
    // }

    var mainEventName = "usr.cctimer."
    var checkIntervalMs = 20000
    var chargingBefore = false
    var lastActivated = new Date()
    var forceRecirc = true     /* Forces Recirculation only if activated while charging (saves energy) */
    var minutesUntilFresh = 10 /* Time until car switches ventilation to fresh air mode (10 minutes on Nissan Leaf) */
    var heaterPower = 4000      /* Heater power available for pre-heat */
    var acPower = 2000         /* AC power available for pre-cool */
    var minCcDuration = 5      /* Minimum Precondition time duration in minutes */
    var maxCcDuration = 180    /* Maximum Precondition time duration in minutes */
    
    
    function contains(item,string) {
        if (item.indexOf(string) > -1) {
            return true
        }
        else {
            return false
        }
    }

    function removeFromList(itemList,item) {
        var updatedList = itemList.filter(function(e) { return e !== item })
        return updatedList
    }

    function loadConfig(cmd) {
        var cmdResponse = OvmsCommand.Exec(cmd)
        var configList = cmdResponse.split("\n")
        return configList
    }

    function metricStatus(cmd) {
        var metricResponse = loadConfig(cmd)
        var metricValue = metricResponse[0].match(/ yes/g)
        if (metricValue) {
            return true
        }
        else {
            return false
        }
    }

    function loadTimers() {
        var timerDict = {}
        // var timerList = loadConfig("config list vehicle") // old method
        // for (var config in timerList) {
          // var timerText = timerList[config].trim()
        var timerConfDict = OvmsConfig.GetValues('vehicle')
        for (var timerName in timerConfDict) {
          var timerText = timerName + ": " + timerConfDict[timerName].trim()
          var timerParsed = parseTimer(timerText,timerDict)
            // if (timerParsed) {
            //     print("Timer Loaded")
            // }
        }
        return timerDict
    }

    function checkTime(hh,mm,before) {
        var d = new Date() // current datetime
        var hours = parseInt(d.getHours())
        var mins = parseInt(d.getMinutes())
        if (before) {
            if (parseInt(hh) < parseInt(hours)) {
                return true
            }
            else {
                if (parseInt(hh) == parseInt(hours) && parseInt(mm) <= parseInt(mins)) {
                    return true
                }
            } 
        }
        else {
            if (parseInt(hh) > parseInt(hours)) {
                return true
            }
            else {
                if (parseInt(hh) == parseInt(hours) && parseInt(mm) > parseInt(mins)) {
                    return true
                }
            } 
        }
        return false
    }

    function addMinutes(date, minutes) {
        return new Date(date.getTime() + minutes*60000);
    }

    function timeBetween(start_time,end_time) {
        var StartHour = start_time.split(':')[0]
        var StartMinute = start_time.split(':')[1]
        var StopHour = end_time.split(':')[0]
        var StopMinute = end_time.split(':')[1]
        return ((checkTime(StartHour,StartMinute,true) || parseInt(StartHour) > parseInt(StopHour)) && checkTime(StopHour,StopMinute)) || (checkTime(StartHour,StartMinute,true) && parseInt(StartHour) > parseInt(StopHour)) || (checkTime(StopHour,StopMinute) && checkTime(StartHour,StartMinute,true))
    }


    function checkWeekday(weekday_list) {
        var d = new Date() // current datetime
        var current_day = parseInt(d.getDay()).toString()
        if (contains(weekday_list,current_day) || weekday_list.length == 0) {
            return true
        }
        else {
            return false
        }
    
      }

    function calcClimateDuration (heaterPower,acPower,minDuration,maxDuration) {
        var ccPower = heaterPower
        var heatLoss = 30000
        var heaterCoef = 25
        var setPoint = OvmsMetrics.AsFloat("v.e.cabinsetpoint")
        var envTemp = OvmsMetrics.AsFloat("v.e.temp")
        var cabinTemp = OvmsMetrics.AsFloat("v.e.cabintemp")
        var defaultSetpoint = 21 // In case no metric available
        if (setPoint == 0) {
            setPoint = defaultSetpoint
        }

        if (setPoint < cabinTemp) {
            ccPower = acPower
        }

        preconditionMinutes = Math.sqrt(1 + Math.abs(envTemp - setPoint)) * Math.abs((cabinTemp - setPoint) / heaterCoef / ccPower * heatLoss)

        if (preconditionMinutes < minDuration) {
            preconditionMinutes = minDuration
        }
        else if (preconditionMinutes > maxDuration) {
            preconditionMinutes = maxDuration
        }

        return preconditionMinutes
    }

    function calcClimateStart (departureHour,departureMinute) {
        timerEnd = new Date()
        timerEnd.setHours(departureHour)
        timerEnd.setMinutes(departureMinute)
        timerStartDate = addMinutes(timerEnd, -calcClimateDuration(heaterPower,acPower,minCcDuration,maxCcDuration))
        timerStartHours = timerStartDate.getHours()
        timerStartMinutes = timerStartDate.getMinutes()
        timerStartTime = timerStartHours + ":" + timerStartMinutes
        return timerStartTime


    }

    function parseTimer(timerText,timerDict) {
        if (contains(timerText,'cctimer.')) {
            var timerParams = timerText.split(':')
            var timerLabel = timerParams[0].split('.')[1]
            var timePeriodText = timerParams[1].trim()
            var timerFieldArray = timePeriodText.split('-')
            if (timerFieldArray[0] == 1) {
                var timerEnabled = true
            }
            else {
                var timerEnabled = false
            }
            var startTime = timerFieldArray[1]
            var endTime = timerFieldArray[2]
            if (timerFieldArray.length > 3) {
                var weekDays = timerFieldArray[3].split("")
            }
            else {
                var weekDays = []
            }
            if (timerFieldArray.length > 4 && timerFieldArray[4] == "1") {
                var chargeUp = true
            }
            else {
                var chargeUp = false
            }
            var endHours = endTime.split('').slice(0,2).join('')
            var endMinutes = endTime.split('').slice(2,4).join('')
            var endTimeParsed = endHours + ":" + endMinutes

            if (startTime == "auto") {
                startTimeParsed = calcClimateStart(endHours,endMinutes)
            }
            else {
                var startHours = startTime.split('').slice(0,2).join('')
                var startMinutes = startTime.split('').slice(2,4).join('')
                var startTimeParsed = startHours + ":" + startMinutes
            }
            
            
            timerDict[timerLabel] = {
                'Start': startTimeParsed,
                'End': endTimeParsed,
                'Enabled': timerEnabled,
                'Weekdays': weekDays,
                'Charge': chargeUp
            }
            return timerDict
    
        }
        else {
            return false
        }
    }

    function setTimerStatus(timer_label) {
        OvmsCommand.Exec("config set vehicle cctimer-active " + timer_label)
        if (timer_label != "no") {
            lastActivated = new Date()
        }
    }
    
    function airCon(state) {
        if (state) {
            cmdStatus = loadConfig("climatecontrol on")
            if (cmdStatus) {
                print("Success! CC ON")
                return true
            }
            else {
                print("CC ON Command Failed")
                return false
            }
        }
        else {
            cmdStatus = loadConfig("climatecontrol off")
            if (cmdStatus) {
                print('Success! CC OFF')
                return true
            }
            else {
                print('CC OFF Command Failed')
                return false
            }
        }
      }
    
    function timerWaiter() {
        OvmsEvents.Raise(mainEventName + 'status.enabled')
        setTimerStatus("no")
        var ccTimers = {}
        var activeTimers = []
        
    
        function timerTrigger() {
            try {
                OvmsEvents.Raise(mainEventName + 'heartbeat')
            
            ccTimers = loadTimers()
            if (activeTimers.length == 0) {
                chargingBefore = true // metricStatus("metric list v.c.charging")
            }
            for (var currentTimer in ccTimers) {
                // print('Checking Timer: ' + currentTimer)
                if (ccTimers[currentTimer].Enabled) {

                    if (!contains(activeTimers,currentTimer)) {
                        if (timeBetween(ccTimers[currentTimer].Start,ccTimers[currentTimer].End) && checkWeekday(ccTimers[currentTimer].Weekdays)) {
                            if (airCon(true)) {
                                setTimerStatus(currentTimer)
                                activeTimers.push(currentTimer)
                                OvmsEvents.Raise(mainEventName + currentTimer + ".started")
                                OvmsNotify.Raise('info',mainEventName,'Climate Control Started by Timer: ' + currentTimer)
                            }
                        }
                    }

                    else {
                        if (!timeBetween(ccTimers[currentTimer].Start,ccTimers[currentTimer].End) || !checkWeekday(ccTimers[currentTimer].Weekdays)) {
                            OvmsEvents.Raise(mainEventName + currentTimer + ".stopped")
                            OvmsNotify.Raise('info',mainEventName,'Climate Control Stopped by Timer: ' + currentTimer)
                            activeTimers = removeFromList(activeTimers,currentTimer)
                            if (airCon(false)) {
                                setTimerStatus("no")
                            }
                        }

                        else {
                            if (!metricStatus("metrics list v.e.heating") && !metricStatus("metrics list v.e.cooling")) {
                                if (airCon(true)) {
                                    setTimerStatus(currentTimer)
                                    OvmsEvents.Raise(mainEventName + currentTimer + ".re-started")
                                }
                            }
                            else if (forceRecirc && chargingBefore) {
                                var timeNow = new Date()
                                if (addMinutes(lastActivated,minutesUntilFresh) < timeNow)
                                    airCon(false)
                            }
                        }
                    }
                }
                else {
                    if (contains(activeTimers,currentTimer)) {
                        if (airCon(false)) {
                            setTimerStatus("no")
                            OvmsEvents.Raise(mainEventName + currentTimer + ".disabled")
                            OvmsNotify.Raise('info',mainEventName,'Climate Control Stopped as Timer has been disabled: ' + currentTimer)
                            activeTimers = removeFromList(activeTimers,currentTimer)
                        }
                    }
                }
                
            }
            
            // print("waiting...")
            }
            catch (jsError) {
                print(jsError)
            }
            
        }
        PubSub.subscribe("ticker.10", timerTrigger)
        //PubSub.subscribe(mainEventName + "heartbeat", timerTrigger)
        //OvmsEvents.Raise(mainEventName + "heartbeat", checkIntervalMs)
            
    }
    print("Timer Script Loaded!")
    timerWaiter()
}
