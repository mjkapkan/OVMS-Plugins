# Heat Assist Plugin for OVMS V3 V1.1
Nissan Leaf Heating Assist Plugin for OVMS V3.

This plugin allows for an external heating element to be controlled by using metrics from vehicle climate control system.
There are 2 versions, one is pure js, and the other one is based on ovms events.


By default the script runs every second and if the cabin temperature - 1.5 (configurable) degrees celcius is lower than the climate control setpoint temperature, it will turn on the ext12v power. The state is checked from metrics so it will not send the `ON` command if it's already sent and vice-versa.

For installation instructions check the comment section in the `heatassis.js`.
