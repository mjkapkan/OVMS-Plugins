/**
 * How to set up:
 * 1. Save this file as: 
 * 2. /store/scripts/lib/test.js
 * 3. Add below two lines to: /store/scripts/ovmsmain.js
 *     testPubSub = require("lib/test")
 *     testPubSub.startTest()
 * 6. run "script reload" in console or reboot module
 * 
 * Sample Script to test triggering fuctions each n miliseconds as specified in runIntervalMs
 */

exports.startTest = function() {

    var testCount = 0
    var mainEventName = "testevent."
    var runIntervalMs = 1000

    function keepRunning() {
        OvmsEvents.Raise(mainEventName + 'status.enabled')
        var assistOn = false
    
        function triggerTest() {
            try {
                OvmsEvents.Raise(mainEventName + "heartbeat", runIntervalMs)
                testCount += 1
                print(mainEventName + ": " + testCount)
            }
            catch (err) {print("ERROR: TestCrash Failed! " + testCount)
                print("ERROR: TestCrash Failed! " + testCount)
                OvmsCommand.Exec("script reload")
            }
        }
    
        PubSub.subscribe(mainEventName + "heartbeat", triggerTest)
        OvmsEvents.Raise(mainEventName + "heartbeat", runIntervalMs)
            
    }
    print("TEST Crash Script Loaded!")
    keepRunning()
}
