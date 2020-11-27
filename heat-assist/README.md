# Heat Assist Plugin for OVMS V3
Nissan Leaf Heating Assist Plugin for OVMS V3.

This plugin allows for an external heating element to be controlled by using metrics from vehicle climate control system.

By default the script runs every 5 seconds and if the cabin temperature - 6 degrees celcius is lower than the climate control setpoint temperature, it will turn on the ext12v power. The state is stored in RAM so it will not send the command ON command if it's already sent and vice-versa.

Both the check time and refresh time can be easily changed as described in the comment section in the script.
