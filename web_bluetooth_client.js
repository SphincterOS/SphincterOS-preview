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

// Function to start scanning for Bluetooth devices
async function startScan() {
    device = await navigator.bluetooth.requestDevice({
        filters: [{
            services: [PRESSURE_SERVICE_UUID],
        }],
        optionalServices: [USER_EVENTS_SERVICE_UUID],
    });
    console.log('Found device: ', device);
    connectToDevice(device);
}

async function connectToDevice(device) {
    const container = document.querySelector('.container');

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
    userEventsCharacteristic = await userEventsService.getCharacteristic(USER_EVENTS_CHARACTERISTIC_UUID);
    userEventsCharacteristic.addEventListener('characteristicvaluechanged', async (event) => {
        console.log("valuechanged!", event);
        console.log("value!", event.target.value);
        console.log("string!", new TextDecoder().decode(event.target.value));
        console.log("string!", new TextDecoder().decode(event.target.value));

        handle_user_events_response(new TextDecoder().decode(event.target.value));
    });
    await userEventsCharacteristic.startNotifications();

    // Load all user settings after successful connection
    await loadAllUserSettings();

    // Subscribe to battery level notifications
    // batteryLevelCharacteristic.addEventListener('characteristicvaluechanged', handleBatteryLevel);
    // await batteryLevelCharacteristic.startNotifications();
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
        }, {
            label: 'Raw Pressure',
            data: [],
            borderWidth: 1,
            pointRadius: 0
        }, {
            label: 'Range',
            data: [],
            borderWidth: 1,
            pointRadius: 0
        }, {
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
    }

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
async function handleUserEventCommand(command) {
    try {

        const commandArrayBuffer = new TextEncoder("utf-8").encode(command);
        console.log('Sending user event command: ' + command);
        await userEventsCharacteristic.writeValue(commandArrayBuffer);
    } catch (error) {
        console.log('Error sending user event command: ' + error);
    }
}

// Function to set the smoothing algorithm to none
async function setSmoothingAlgorithmNone() {
    await handleUserEventCommand('POST /smoothing_algorithm none');
}

// Function to set the smoothing algorithm to moving average 5
async function setSmoothingAlgorithmMovingAverage5() {
    await handleUserEventCommand('POST /smoothing_algorithm moving_average 5');
}

// Function to set the smoothing algorithm to moving average 10
async function setSmoothingAlgorithmMovingAverage10() {
    await handleUserEventCommand('POST /smoothing_algorithm moving_average 10');
}

// Function to set the smoothing algorithm to moving average 20
async function setSmoothingAlgorithmMovingAverage20() {
    await handleUserEventCommand('POST /smoothing_algorithm moving_average 20');
}

// Function to set the smoothing algorithm to moving average 50
async function setSmoothingAlgorithmMovingAverage50() {
    await handleUserEventCommand('POST /smoothing_algorithm moving_average 50');
}

// Function to set the smoothing algorithm to exponential moving average 0.1
async function setSmoothingAlgorithmExponentialMovingAverage01() {
    await handleUserEventCommand('POST /smoothing_algorithm exponential_moving_average 10');
}

// Function to set the smoothing algorithm to exponential moving average 0.2
async function setSmoothingAlgorithmExponentialMovingAverage02() {
    await handleUserEventCommand('POST /smoothing_algorithm exponential_moving_average 20');
}

// Function to set the smoothing algorithm to exponential moving average 0.5
async function setSmoothingAlgorithmExponentialMovingAverage05() {
    await handleUserEventCommand('POST /smoothing_algorithm exponential_moving_average 50');
}

// Function to set the smoothing algorithm to exponential moving average 0.8
async function setSmoothingAlgorithmExponentialMovingAverage08() {
    await handleUserEventCommand('POST /smoothing_algorithm exponential_moving_average 80');
}

// Function to start a new session
async function startSession() {
    await handleUserEventCommand('POST /start_session');
}

// Function to stop the current session
async function stopSession() {
    await handleUserEventCommand('POST /stop_session');
}

// Function to set the lower limit for pressure data
async function setLowerLimit() {
    await handleUserEventCommand('POST /lower_limit');
}

// Function to set the upper limit for pressure data
async function setUpperLimit() {
    await handleUserEventCommand('POST /upper_limit');
}

// Function to reset the lower and upper limits for pressure data
async function resetLimits() {
    await handleUserEventCommand('POST /reset_limits');
}

// Function to connect to a peripheral
async function connectPeripheral() {
    await handleUserEventCommand('POST /connect_peripheral');
}

// Function to disconnect from a peripheral
async function disconnectPeripheral() {
    await handleUserEventCommand('POST /disconnect_peripheral');
}

async function saveUserSetting(userSettingKey) {
    const value = document.getElementById(userSettingKey).value

    const command = `POST /settings ${userSettingKey} ${value}`;

    await handleUserEventCommand(command);
}

async function loadUserSetting(userSettingKey) {
    const command = `GET /settings ${userSettingKey}`;

    return await handleUserEventCommand(command);
}

async function setWifiSSID() {
    await saveUserSetting("wifi_ssid");
}
async function getWifiPassword() {
    await loadUserSetting("wifi_password");
}

async function getGitPusherServer() {
    await loadUserSetting("git_pusher_server");
}

async function getGitPusherRepository() {
    await loadUserSetting("git_pusher_repository");
}

async function getGitPusherHttpPassword() {
    await loadUserSetting("git_pusher_http_password");
}

async function getGitPusherHttpUsername() {
    await loadUserSetting("git_pusher_http_username");
}

async function getGitPusherAuthorName() {
    await loadUserSetting("git_pusher_author_name");
}

async function getGitPusherAuthorEmail() {
    await loadUserSetting("git_pusher_author_email");
}

async function getGitPusherCommitMessage() {
    await loadUserSetting("git_pusher_commit_message");
}

async function loadAllUserSettings() {
    await getWifiSSID();
    await getWifiPassword();
    await getGitPusherServer();
    await getGitPusherRepository();
    await getGitPusherHttpPassword();
    await getGitPusherHttpUsername();
    await getGitPusherAuthorName();
    await getGitPusherAuthorEmail();
    await getGitPusherCommitMessage();
}


async function getWifiSSID() {
    await loadUserSetting("wifi_ssid");
}

async function setWifiPassword() {
    await saveUserSetting("wifi_password");
}

async function setGitPusherServer() {
    await saveUserSetting("git_pusher_server");
}

async function setGitPusherRepository() {
    await saveUserSetting("git_pusher_repository");
}

async function setGitPusherHttpPassword() {
    await saveUserSetting("git_pusher_http_password");
}

async function setGitPusherHttpUsername() {
    await saveUserSetting("git_pusher_http_username");
}

async function setGitPusherAuthorName() {
    await saveUserSetting("git_pusher_author_name");
}

async function setGitPusherAuthorEmail() {
    await saveUserSetting("git_pusher_author_email");
}

async function setGitPusherCommitMessage() {
    await saveUserSetting("git_pusher_commit_message");
}


function handle_user_events_response(response) {
    const [statusCode, commandName, ...params] = response.split(' ');


    switch (statusCode) {
        case '200':
            handleSuccessResponse(commandName, params);
            break;
        case '400':
            handleErrorResponse(commandName, 'Bad Request', params);
            break;
        case '405':
            handleErrorResponse(commandName, 'Method Not Allowed', params);
            break;
        // Handle other status codes if needed
        default:
            console.log('Unknown status code:', statusCode);
            break;
    }
}

function handleSuccessResponse(commandName, params) {
    switch (commandName) {
        case '/start_session':
            handleStartSessionResponse(params);
            break;
        case '/smoothing_algorithm':
            handleSmoothingAlgorithmResponse(params);
            break;
        case '/stop_session':
            handleStopSessionResponse(params);
            break;
        case '/lower_limit':
            handleLowerLimitResponse(params);
            break;
        case '/upper_limit':
            handleUpperLimitResponse(params);
            break;
        case '/reset_limits':
            handleResetLimitsResponse(params);
            break;
        case '/connect_peripherals':
            handleConnectPeripheralsResponse(params);
            break;
        case '/disconnect_peripherals':
            handleDisconnectPeripheralsResponse(params);
            break;
        case '/settings':
            handleSettingsResponse(params);
            break;
        default:
            console.log('Unhandled success response for command:', commandName);
            break;
    }
}

// Implement handler functions for other commands
function handleStartSessionResponse(params) {
    console.log('Start session response:', params);
    // Implement your logic for handling the start session response
}

function handleSmoothingAlgorithmResponse(params) {
    const [algorithmType, parameter] = params;
    console.log('Smoothing algorithm response:', algorithmType, parameter);
    // Implement your logic for handling the smoothing algorithm response
}

// Implement handler functions for other commands

function handleStopSessionResponse(params) {
    console.log('Stop session response:', params);
    // Implement your logic for handling the stop session response
}

function handleLowerLimitResponse(params) {
    console.log('Lower limit response:', params);
    // Implement your logic for handling the lower limit response
}

function handleUpperLimitResponse(params) {
    console.log('Upper limit response:', params);
    // Implement your logic for handling the upper limit response
}

function handleResetLimitsResponse(params) {
    console.log('Reset limits response:', params);
    // Implement your logic for handling the reset limits response
}

function handleConnectPeripheralsResponse(params) {
    console.log('Connect peripherals response:', params);
    // Implement your logic for handling the connect peripherals response
}

function handleDisconnectPeripheralsResponse(params) {
    console.log('Disconnect peripherals response:', params);
    // Implement your logic for handling the disconnect peripherals response
}

function handleSettingsResponse(params) {
    const [key, value] = params;
    console.log('Settings response:', key, value);

    document.getElementById(key).value = value;
}

// Implement error handler function
function handleErrorResponse(commandName, errorMessage, params) {
    console.log('Error response for command:', commandName);
    console.log('Error message:', errorMessage);
    console.log('Response parameters:', params);
    // Implement your error handling logic
}
