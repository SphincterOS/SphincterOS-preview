// Define the service and characteristic UUIDs
const PRESSURE_SERVICE_UUID = '0000aaaa-0000-1000-8000-00805f9b34fb';
const PRESSURE_CHARACTERISTIC_UUID = '0000aaaa-0001-1000-8000-00805f9b34fb';

const USER_EVENTS_SERVICE_UUID = '0000aaaa-0003-1000-8000-00805f9b34fb';
const USER_EVENTS_CHARACTERISTIC_UUID = '0000aaaa-0004-1000-8000-00805f9b34fb';

const BATTERY_LEVEL_CHARACTERISTIC_UUID = '00002a19-0000-1000-8000-00805f9b34fb';

// Define the Bluetooth device and characteristic variables
let device;
let pressureCharacteristic;
let batteryLevelCharacteristic;
let userEventsCharacteristic;

// const timeWindow = 5 * 60 * 1000; // 5 minutes in milliseconds
const timeWindow = 10 * 1000;

// Define the user event protocol commands
const UserEventProtocolCommand = {
    CMD_START_SESSION: 0x01,
    CMD_STOP_SESSION: 0x02,
    CMD_SET_LOWER_LIMIT: 0x03,
    CMD_SET_UPPER_LIMIT: 0x04,
    CMD_RESET_LIMITS: 0x05,
    CMD_SET_SMOOTHING_ALGORITHM_NONE: 0x06,
    CMD_SET_SMOOTHING_ALGORITHM_MOVING_AVERAGE_5: 0x07,
    CMD_SET_SMOOTHING_ALGORITHM_MOVING_AVERAGE_10: 0x08,
    CMD_SET_SMOOTHING_ALGORITHM_MOVING_AVERAGE_20: 0x09,
    CMD_SET_SMOOTHING_ALGORITHM_MOVING_AVERAGE_50: 0x0A,
    CMD_SET_SMOOTHING_ALGORITHM_EXPONENTIAL_MOVING_AVERAGE_0_1: 0x0B,
    CMD_SET_SMOOTHING_ALGORITHM_EXPONENTIAL_MOVING_AVERAGE_0_2: 0x0C,
    CMD_SET_SMOOTHING_ALGORITHM_EXPONENTIAL_MOVING_AVERAGE_0_5: 0x0D,
    CMD_SET_SMOOTHING_ALGORITHM_EXPONENTIAL_MOVING_AVERAGE_0_8: 0x0E,
    CMD_CONNECT_PERIPHERAL: 0x0F,
    CMD_DISCONNECT_PERIPHERAL: 0x10,
    CMD_SETTINGS_SAVE: 0x11,
};

// Define the user settings keys
const UserSettingsKey = {
    WIFI_SSID: 1,
    WIFI_PASSWORD: 2,
    GIT_PUSHER_SERVER: 3,
    GIT_PUSHER_REPOSITORY: 4,
    GIT_PUSHER_HTTP_PASSWORD: 5,
    GIT_PUSHER_HTTP_USERNAME: 6,
    GIT_PUSHER_AUTHOR_NAME: 7,
    GIT_PUSHER_AUTHOR_EMAIL: 8,
    GIT_PUSHER_COMMIT_MESSAGE: 9,
};

// Function to start scanning for Bluetooth devices
async function startScan() {
    const container = document.querySelector('.container');

    try {
        device = await navigator.bluetooth.requestDevice({
            filters: [{ services: [PRESSURE_SERVICE_UUID] }],
        });
        console.log('Found device: ' + device.name);

        const server = await device.gatt.connect();
        console.log('Connected to GATT server');

        container.classList.add('connected');
        device.addEventListener('gattserverdisconnected', () => {
            console.log('Disconnected from GATT server');
            container.classList.remove('connected');
        });

        const pressureService = await server.getPrimaryService(PRESSURE_SERVICE_UUID);
        pressureCharacteristic = await pressureService.getCharacteristic(PRESSURE_CHARACTERISTIC_UUID);
        console.log('Found service: ' + pressureService.uuid);

        // Subscribe to pressure data notifications
        pressureCharacteristic.addEventListener('characteristicvaluechanged', handlePressureData);
        await pressureCharacteristic.startNotifications();

        // Subscribe to user events
        const userEventsService = await server.getPrimaryService(USER_EVENTS_SERVICE_UUID);
        const userEventsCharacteristic = await userEventsService.getCharacteristic(USER_EVENTS_CHARACTERISTIC_UUID);
        userEventsCharacteristic.addEventListener('characteristicvaluechanged', (args) => {
            console.log(args);
        });

        // Subscribe to battery level notifications
        // batteryLevelCharacteristic.addEventListener('characteristicvaluechanged', handleBatteryLevel);
        // await batteryLevelCharacteristic.startNotifications();
    } catch (error) {
        console.log('Error: ' + error);
    }
}

const ctx = document.getElementById('myChart').getContext('2d');
const chart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Pressure',
            data: [],
            borderWidth: 1,
            pointRadius: 0
        },{
            label: 'Raw Pressure',
            data: [],
            borderWidth: 1,
            pointRadius: 0
        },{
            label: 'Range',
            data: [],
            borderWidth: 1,
            pointRadius: 0
        },{
            label: 'Range adjusted pressure',
            data: [],
            borderWidth: 1,
            pointRadius: 0

        }]
    },
    options: {
        // normalized: true,
        // parsing: false,
        animation: false,
        plugins: {
            tooltip: {
                enabled: false
            }
        },
        // plugins: {
        //     decimation: {
        //         enabled: true,
        //         algorithm: 'lttb',
        //         samples: 500,
        //     },
        // },      
        scales: {
            y: {
                beginAtZero: true,
                max: 1,
                min: 0,
                suggestedMin: 0,
                suggestedMax: 1,
                ticks: {
                    precision: 2
                }
            },
            x: {
                type: 'timeseries',
                min: moment().subtract(timeWindow, 'millisecond').toDate(),
                max: moment().toDate(),
                time: {
                    unit: 'minute',

                },
                ticks: {
                    major: {
                        enabled: true
                    }
                }
            }
        },
        tooltips: {
            enabled: false
        },
        animation: {
            duration: 0
        }
    }
});

// Initialize the counter and the time interval
let updateRefreshRateCounter = 0;
let updateRefreshRateStartTime = Date.now();
const updateRefreshRateValue = document.getElementById('refreshRateValue');

function updateRefreshRate() {
    // Calculate the time difference
    const elapsedTime = (Date.now() - updateRefreshRateStartTime) / 1000;

    // Calculate the refresh rate
    const refreshRate = updateRefreshRateCounter / elapsedTime;
    updateRefreshRateValue.innerText = refreshRate.toFixed(2) + ' Hz';

    // Reset the counter and start time
    updateRefreshRateCounter = 0;
    updateRefreshRateStartTime = Date.now();
}

// Call the updateRefreshRate function every second
setInterval(updateRefreshRate, 1000);

const pressureValue = document.getElementById('pressureValue');

let lastRange = 0.0;

let updateRequest;

function handlePressureData(event) {
    performance.mark('handlePressureData-start');

    const dataView = event.target.value;
    const pressure = dataView.getFloat32(0, true);
    const pressure_raw = dataView.getFloat32(4, true);
    const sensor_output = dataView.getInt32(8, true);
    const timestamp_ms = dataView.getBigUint64(12, true);
    const range = dataView.getFloat32(20, true);

    if (range > lastRange) {
        for (let i = 0; i < chart.data.datasets[0].data.length; i++) {
            chart.data.datasets[3].data[i] = chart.data.datasets[0].data[i] / range;
        }
    }
    lastRange = range;

    // Update UI with pressure data
    chart.data.labels.push(Date.now());
    chart.data.datasets[0].data.push(pressure);
    chart.data.datasets[1].data.push(pressure_raw);
    chart.data.datasets[2].data.push(range);
    chart.data.datasets[3].data.push(pressure);

    // Update pressure value
    pressureValue.innerText = ((pressure * 100).toFixed(0)) + '%';

    // Call the updateChart() function directly
    updateChart();

    performance.mark('handlePressureData-end');
    performance.measure('handlePressureData', 'handlePressureData-start', 'handlePressureData-end');
}

function updateChart() {
    performance.mark('updateChart-start');

    const currentTime = Date.now();

    // Remove data points older than the time window
    console.log(currentTime, chart.data.labels[0], currentTime - chart.data.labels[0], timeWindow);

    if (!chart.data.labels[0]) {
        debugger
    }

    while (
        (
            chart.data.labels.length > 0 &&
            currentTime - chart.data.labels[0] > timeWindow
        )
    ) {
        chart.data.labels.shift(); // Remove the oldest label (timestamp)
        chart.data.datasets[0].data.shift();
        chart.data.datasets[1].data.shift();
        chart.data.datasets[2].data.shift();
        chart.data.datasets[3].data.shift();
        console.log('removed a datapoint')
    }

    console.log(chart.data.labels.length + ' datapoints');

    chart.options.scales.x.min = moment().subtract(timeWindow, 'millisecond').toDate();
    chart.options.scales.x.max = moment().toDate();

    // Update the chart using requestAnimationFrame
    if (!updateRequest) {
        updateRequest = requestAnimationFrame(() => {
            chart.update();
            updateRefreshRateCounter++;
            updateRequest = null; // Reset the requestAnimationFrame handle
        });
    }

    performance.mark('updateChart-end');
    performance.measure('updateChart', 'updateChart-start', 'updateChart-end');
}




const batteryLevelValue = document.getElementById('batteryValue');
// Function to handle incoming battery level notifications
function handleBatteryLevel(event) {
    const batteryLevel = event.target.value.getInt8();
    console.log('Received battery level: ' + batteryLevel);
    batteryLevelValue.innerText = batteryLevel + '%';
}

// Function to handle user event commands
async function handleUserEventCommandSimple(command) {
    handleUserEventCommand(new Uint8Array([command]));
}

async function handleUserEventCommand(command) {
    try {
        await userEventsCharacteristic.writeValue(command);
        console.log('Sent user event command: ' + command);
    } catch (error) {
        console.log('Error sending user event command: ' + error);
    }
}

// Function to set the smoothing algorithm to none
async function setSmoothingAlgorithmNone() {
    await handleUserEventCommandSimple(UserEventProtocolCommand.CMD_SET_SMOOTHING_ALGORITHM_NONE);
}

// Function to set the smoothing algorithm to moving average 5
async function setSmoothingAlgorithmMovingAverage5() {
    await handleUserEventCommandSimple(UserEventProtocolCommand.CMD_SET_SMOOTHING_ALGORITHM_MOVING_AVERAGE_5);
}

// Function to set the smoothing algorithm to moving average 10
async function setSmoothingAlgorithmMovingAverage10() {
    await handleUserEventCommandSimple(UserEventProtocolCommand.CMD_SET_SMOOTHING_ALGORITHM_MOVING_AVERAGE_10);
}

// Function to set the smoothing algorithm to moving average 20
async function setSmoothingAlgorithmMovingAverage20() {
    await handleUserEventCommandSimple(UserEventProtocolCommand.CMD_SET_SMOOTHING_ALGORITHM_MOVING_AVERAGE_20);
}

// Function to set the smoothing algorithm to moving average 50
async function setSmoothingAlgorithmMovingAverage50() {
    await handleUserEventCommandSimple(UserEventProtocolCommand.CMD_SET_SMOOTHING_ALGORITHM_MOVING_AVERAGE_50);
}

// Function to set the smoothing algorithm to exponential moving average 0.1
async function setSmoothingAlgorithmExponentialMovingAverage01() {
    await handleUserEventCommandSimple(UserEventProtocolCommand.CMD_SET_SMOOTHING_ALGORITHM_EXPONENTIAL_MOVING_AVERAGE_0_1);
}

// Function to set the smoothing algorithm to exponential moving average 0.2
async function setSmoothingAlgorithmExponentialMovingAverage02() {
    await handleUserEventCommandSimple(UserEventProtocolCommand.CMD_SET_SMOOTHING_ALGORITHM_EXPONENTIAL_MOVING_AVERAGE_0_2);
}

// Function to set the smoothing algorithm to exponential moving average 0.5
async function setSmoothingAlgorithmExponentialMovingAverage05() {
    await handleUserEventCommandSimple(UserEventProtocolCommand.CMD_SET_SMOOTHING_ALGORITHM_EXPONENTIAL_MOVING_AVERAGE_0_5);
}

// Function to set the smoothing algorithm to exponential moving average 0.8
async function setSmoothingAlgorithmExponentialMovingAverage08() {
    await handleUserEventCommandSimple(UserEventProtocolCommand.CMD_SET_SMOOTHING_ALGORITHM_EXPONENTIAL_MOVING_AVERAGE_0_8);
}

// Function to start a new session
async function startSession() {
    await handleUserEventCommandSimple(UserEventProtocolCommand.CMD_START_SESSION);
}

// Function to stop the current session
async function stopSession() {
    await handleUserEventCommandSimple(UserEventProtocolCommand.CMD_STOP_SESSION);
}

// Function to set the lower limit for pressure data
async function setLowerLimit() {
    await handleUserEventCommandSimple(UserEventProtocolCommand.CMD_SET_LOWER_LIMIT);
}

// Function to set the upper limit for pressure data
async function setUpperLimit() {
    await handleUserEventCommandSimple(UserEventProtocolCommand.CMD_SET_UPPER_LIMIT);
}

// Function to reset the lower and upper limits for pressure data
async function resetLimits() {
    await handleUserEventCommandSimple(UserEventProtocolCommand.CMD_RESET_LIMITS);
}

async function connectPeripheral() {
    await handleUserEventCommandSimple(UserEventProtocolCommand.CMD_CONNECT_PERIPHERAL);
}

async function disconnectPeripheral() {
    await handleUserEventCommandSimple(UserEventProtocolCommand.CMD_DISCONNECT_PERIPHERAL);
}

async function saveUserSetting(domId, userSettingKey) {
    const value = new TextEncoder("utf-8").encode(
        document.getElementById(domId).value
    );

    const command = new Uint8Array([
        UserEventProtocolCommand.CMD_SETTINGS_SAVE,
        userSettingKey,
        ...value
    ])

    await handleUserEventCommand(command);
}

async function setWifiSSID() {
    await saveUserSetting("wifi_ssid", UserSettingsKey.WIFI_SSID);
}

async function setWifiPassword() {
    await saveUserSetting("wifi_password", UserSettingsKey.WIFI_PASSWORD);
}

async function setGitPusherServer() {
    await saveUserSetting("git_pusher_server", UserSettingsKey.GIT_PUSHER_SERVER);
}

async function setGitPusherRepository() {
    await saveUserSetting("git_pusher_repository", UserSettingsKey.GIT_PUSHER_REPOSITORY);
}

async function setGitPusherHttpPassword() {
    await saveUserSetting("git_pusher_http_password", UserSettingsKey.GIT_PUSHER_HTTP_PASSWORD);
}

async function setGitPusherHttpUsername() {
    await saveUserSetting("git_pusher_http_username", UserSettingsKey.GIT_PUSHER_HTTP_USERNAME);
}

async function setGitPusherAuthorName() {
    await saveUserSetting("git_pusher_author_name", UserSettingsKey.GIT_PUSHER_AUTHOR_NAME);
}

async function setGitPusherAuthorEmail() {
    await saveUserSetting("git_pusher_author_email", UserSettingsKey.GIT_PUSHER_AUTHOR_EMAIL);
}

async function setGitPusherCommitMessage() {
    await saveUserSetting("git_pusher_commit_message", UserSettingsKey.GIT_PUSHER_COMMIT_MESSAGE);
}
